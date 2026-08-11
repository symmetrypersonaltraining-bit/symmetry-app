import { TRAINER_EMAIL } from "./trainer";
// Trainer alert email for client→trainer messages. Pure builder (no server/DOM
// imports) so it's unit-testable and reused by the server action. The actual
// send uses the same Resend REST setup + verified sender the reminders/invites
// use.

export const TRAINER_ALERT_EMAIL = TRAINER_EMAIL;
export const RESEND_FROM = 'Symmetry Corrective <noreply@symmetrypersonaltraining.com>';

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

// Builds the Resend payload for a "new client message" alert to the trainer.
export function buildTrainerMessageEmail(
  clientName: string,
  body: string,
  hasImage: boolean,
  appUrl: string,
): ResendPayload {
  const name = (clientName || 'A client').trim() || 'A client';
  const raw = body || '';
  const truncated = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
  const safe = escapeHtml(truncated).replace(/\n/g, '<br>') || '<em>(no text)</em>';
  const imgLine = hasImage
    ? '<p style="color:#4E6080;font-size:14px;margin:12px 0 0">📷 A photo was attached — open the app to view it.</p>'
    : '';
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0F4C81;border-radius:12px 12px 0 0;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">Symmetry Corrective</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px">New client message</p>
  </div>
  <div style="background:#fff;border:1px solid #C8D8EC;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="color:#0D1B2E;font-size:16px;margin:0 0 16px"><strong>${escapeHtml(name)}</strong> sent you a message:</p>
    <div style="background:#EDF2F7;border-radius:8px;padding:16px;margin:0 0 20px;color:#0D1B2E;font-size:15px;line-height:1.5">${safe}</div>
    ${imgLine}
    <div style="text-align:center;margin:8px 0 0">
      <a href="${appUrl}/messages" style="display:inline-block;background:#E53935;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:15px">Open the app to reply</a>
    </div>
    <p style="color:#8A97AB;font-size:12px;margin:16px 0 0;text-align:center">Or go to ${appUrl}/messages</p>
  </div>
</div>`;
  return {
    from: RESEND_FROM,
    to: [TRAINER_ALERT_EMAIL],
    subject: `New message from ${name}`,
    html,
  };
}
