// ============================================================================
// A PAUSED CLIENT'S NEXT INVOICE ARRIVES PAUSED.
//
// Dustin, 10 Sep 2026: "update Stacie current invoice to $480 then pause her
// after that billing cycle. ill resume hers when she's back."
//
// The client's "Payment reminders" toggle stops the daily generator. It does
// not stop the roll-forward: marking the current invoice paid inserts the next
// cycle as 'pending' from two places (markClientPaid, ReminderEditor), and
// neither reads the toggle. Red proof, rolled back against production: toggle
// off, roll-forward row -> 'pending'. The migration turns that row 'paused'.
//
// Asserted against the migration that is the record of what is deployed.
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "supabase/migrations");
const FILE = "20260910e_a_paused_clients_next_invoice_arrives_paused.sql";
const code = fs.readFileSync(path.join(DIR, FILE), "utf8").replace(/^\s*--.*$/gm, "");

describe("a paused client's next invoice arrives paused", () => {
  it("fires before the row lands, on every insert", () => {
    assert.match(code, /create trigger trg_pr_new_reminder_respects_pause\s+before insert on public\.payment_reminders\s+for each row execute function public\.pr_new_reminder_respects_pause\(\)/,
      "an AFTER trigger cannot change the status the row is written with");
  });

  it("only a pending row for a switched-off client is turned paused", () => {
    assert.match(code, /if new\.notification_status = 'pending' and new\.client_id is not null then/,
      "sent, paid and backfilled rows are not this rule's business");
    assert.match(code, /select c\.payment_reminders_enabled into v_enabled from clients c where c\.id = new\.client_id/,
      "the toggle is read from the client row, not guessed");
    assert.match(code, /if v_enabled is false then\s+new\.notification_status := 'paused';/,
      "null (no client row, or a client without the flag) leaves the row alone");
  });

  it("no later migration re-creates the trigger without the check", () => {
    const later = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > FILE);
    for (const f of later) {
      const s = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^\s*--.*$/gm, "");
      if (/drop trigger if exists trg_pr_new_reminder_respects_pause/.test(s)) {
        assert.match(s, /create trigger trg_pr_new_reminder_respects_pause\s+before insert on public\.payment_reminders/, `${f} drops the pause rule and does not put it back`);
      }
    }
  });
});
