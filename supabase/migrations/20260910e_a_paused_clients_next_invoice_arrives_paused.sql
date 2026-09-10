-- A PAUSED CLIENT'S NEXT INVOICE ARRIVES PAUSED.
--
-- Dustin, 10 Sep 2026: "update Stacie current invoice to $480 then pause her
-- after that billing cycle. ill resume hers when she's back."
--
-- The app has two pause switches and they did not meet. The client's
-- "Payment reminders" toggle (clients.payment_reminders_enabled) stops the
-- daily generator from creating invoices. The Payments screen's Pause button
-- sets one existing reminder to 'paused'. But the next cycle is not created by
-- the generator -- it is created the moment he marks the current one paid
-- (markClientPaid and the ReminderEditor both insert the roll-forward row as
-- 'pending', and neither looks at the toggle). So switching Stacie off and
-- collecting her $480 would still put a 9 October invoice on his Payments
-- screen as Pending, $0, exactly as if nothing had been paused.
--
-- Red proof, rolled back: toggle off, insert the roll-forward row -> 'pending'.
--
-- THE RULE. A new reminder for a client whose reminders are switched off
-- arrives as 'paused', not 'pending'. Nothing is lost: the row is there, the
-- cycle date is kept, and when she is back he switches the toggle on and
-- presses Resume on that row. Rows inserted with any other status ('sent',
-- 'paid', a migration's backfill) are not touched, and neither is a client
-- whose toggle is on.

create or replace function public.pr_new_reminder_respects_pause()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_enabled boolean;
begin
  if new.notification_status = 'pending' and new.client_id is not null then
    select c.payment_reminders_enabled into v_enabled from clients c where c.id = new.client_id;
    if v_enabled is false then
      new.notification_status := 'paused';
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.pr_new_reminder_respects_pause() is
  'A reminder inserted as pending for a client whose payment_reminders_enabled is false lands as paused. The roll-forward on mark-paid never looked at the toggle. Dustin, 10 Sep 2026.';

drop trigger if exists trg_pr_new_reminder_respects_pause on public.payment_reminders;
create trigger trg_pr_new_reminder_respects_pause
  before insert on public.payment_reminders
  for each row execute function public.pr_new_reminder_respects_pause();
