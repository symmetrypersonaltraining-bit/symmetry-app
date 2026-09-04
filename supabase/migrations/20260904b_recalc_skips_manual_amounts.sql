-- ONE LINE OF SUBSTANCE: the recalc leaves a hand-set amount alone.
--
-- Hassan's back-charge was written as $385 (five extra sessions at $77, the
-- dates listed in the note) and this function replaced it with $1,155 — the
-- standard monthly_adjusted answer, 1540 - 385 — while the note went on
-- describing a back-charge. Nothing in the row said a person had decided the
-- number, so it had no way to tell a computed amount from a decided one.
--
-- The added predicate is `and r.manual_amount is not true`, in the target CTE.
--
-- The whole body is reproduced here rather than pointed at, because pointing at
-- it is how supabase/schema/baseline.sql ended up holding the superseded 31-July
-- rule for this same function while production ran the 20-Aug one. A reader
-- comparing the two had no way to know which was live.
CREATE OR REPLACE FUNCTION public.recalc_pending_payment_reminders()
 RETURNS TABLE(reminder_id uuid, client_name text, billing_type text, old_amount numeric, new_amount numeric, sessions_trained integer, sessions_cancelled integer, changed boolean, blocked_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today_ct date := (now() at time zone 'America/Chicago')::date;
begin
  return query
  with target as (
    select r.id, r.client_id, r.due_date, r.amount_due,
           c.name as client_nm, c.billing_type as btype, c.billing_cadence,
           c.session_rate, c.current_fees, c.expected_sessions_per_cycle as plan_n
    from payment_reminders r
    join clients c on c.id = r.client_id
    where r.notification_status = 'pending'
      and r.approved_at   is null
      and r.email_sent_at is null
      and r.sms_sent_at   is null
      -- A number a person set on purpose is not a number to recompute.
      and r.manual_amount is not true
      and coalesce(c.billing_type, 'none') not in ('none', 'paid_by_other')
  ),
  windowed as (
    select t.*,
           (t.due_date - 7) as cycle_end,
           (case coalesce(t.billing_cadence, 'monthly')
              when 'weekly'      then (t.due_date - interval '7 days')::date
              when 'biweekly'    then (t.due_date - interval '14 days')::date
              when 'quarterly'   then (t.due_date - interval '3 months')::date
              when 'semimonthly' then
                case when extract(day from t.due_date) > 16
                     then (t.due_date - interval '16 days')::date
                     else (t.due_date - interval '1 month' + interval '16 days')::date
                end
              else (t.due_date - interval '1 month')::date
            end - 7) as cycle_start,
           (select max(pr2.due_date) from payment_reminders pr2
             where pr2.client_id = t.client_id and pr2.due_date < t.due_date) as prev_due_actual
    from target t
  ),
  counted as (
    select w.*,
           coalesce(a.n_tr, 0)              as n_tr,
           coalesce(a.n_ca, 0)              as n_ca,
           coalesce(a.tr_dates, '{}')       as tr_dates,
           coalesce(a.ca_dates, '{}')       as ca_dates
    from windowed w
    left join lateral (
      select
        count(*) filter (where ap.status = 'scheduled')::int as n_tr,
        count(*) filter (where ap.status like 'cancelled%')::int as n_ca,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status = 'scheduled') as tr_dates,
        array_agg(((ap.scheduled_at at time zone 'America/Chicago')::date)::text
                  order by ap.scheduled_at) filter (where ap.status like 'cancelled%') as ca_dates
      from appointments ap
      where ap.client_id = w.client_id
        and (ap.scheduled_at at time zone 'America/Chicago')::date >  coalesce(w.prev_due_actual - 7, w.cycle_start)
        and (ap.scheduled_at at time zone 'America/Chicago')::date <= w.cycle_end
    ) a on true
  ),
  computed as (
    select c.*,
           least(c.n_ca, greatest(0, coalesce(c.plan_n, 0) - c.n_tr)) as n_credited,
           greatest(0, c.n_tr - coalesce(c.plan_n, 0))                as n_extra
    from counted c
  ),
  priced as (
    select cp.*,
           round(cp.n_credited * coalesce(cp.session_rate, 0), 2) as cancel_ded,
           case
             when cp.btype = 'flat' then round(coalesce(cp.current_fees, 0), 2)
             when cp.btype = 'monthly_adjusted' then
               greatest(0, round(coalesce(cp.current_fees, 0)
                                 - cp.n_credited * coalesce(cp.session_rate, 0), 2))
             else round(cp.n_tr * coalesce(cp.session_rate, 0), 2)
           end as calc_amount,
           case
             when cp.btype = 'flat' and cp.current_fees is null
               then 'Flat billing but no rate on file'
             when cp.btype = 'monthly_adjusted' and cp.current_fees is null
               then 'Monthly rate billing but no rate on file'
             when cp.btype = 'monthly_adjusted' and cp.session_rate is null
               then 'Monthly rate billing but no session rate - the cancellation credit cannot be worked out'
             when cp.btype = 'monthly_adjusted' and cp.plan_n is null
               then 'Monthly rate billing but no session count on file - set how many sessions the rate covers'
             when coalesce(cp.btype,'per_session') = 'per_session' and cp.session_rate is null
               then 'Per-session billing but no session rate on file'
             else null
           end as blocked
    from computed cp
  ),
  upd as (
    update payment_reminders r
    set amount_due = case when p.blocked is null then p.calc_amount else r.amount_due end,
        billing_credits = 0,
        half_price_sessions = 0,
        credit_details = jsonb_build_object(
          'basis',              case p.btype
                                  when 'flat' then 'flat'
                                  when 'monthly_adjusted' then 'monthly_less_missed'
                                  else 'sessions_trained' end,
          'billing_type',       coalesce(p.btype, 'per_session'),
          'cycle',              coalesce(p.prev_due_actual - 7, p.cycle_start)::text || ' to ' || p.cycle_end::text,
          'rate',               case when p.session_rate is null then null else p.session_rate::text end,
          'monthly_rate',       case when p.current_fees is null then null else p.current_fees::text end,
          'expected_sessions',  p.plan_n,
          'sessions_trained',   p.n_tr,
          'dates_trained',      to_jsonb(p.tr_dates),
          'sessions_cancelled', p.n_ca,
          'dates_cancelled',    to_jsonb(p.ca_dates),
          'sessions_credited',  p.n_credited,
          'sessions_extra',     plan_extra(p.btype, p.n_tr, p.plan_n),
          'cancel_deduction',   p.cancel_ded,
          'provisional',        (p.cycle_end > v_today_ct),
          'needs_rate',         (p.blocked is not null),
          'recalculated_at',    to_char(now() at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI')
        )
    from priced p
    where r.id = p.id
    returning r.id as rid, p.client_nm as cnm, p.btype as bt,
              p.amount_due as prev_amt, r.amount_due as now_amt,
              p.n_tr as tr, p.n_ca as ca, p.blocked as blk
  )
  select u.rid, u.cnm, u.bt, u.prev_amt, u.now_amt, u.tr, u.ca,
         (u.prev_amt is distinct from u.now_amt), u.blk
  from upd u
  order by u.cnm;
end;
$function$;
