// Shared invite-email builder — used by BOTH /api/create-client (new client with
// invite) and /api/invite-client (invite/re-invite existing client) so the two
// can never drift again. Sends the Android APK download + login steps.

export function buildInviteEmailHtml(opts: {
  firstName: string;
  email: string;
  tempPassword: string;
  apkUrl: string;
}): string {
  const { firstName, email, tempPassword, apkUrl } = opts;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #E53935, #b71c1c); padding: 32px 32px 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">SYMMETRY</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Corrective</p>
    </div>
    <!-- Body -->
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px; margin: 0 0 8px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px; line-height: 1.5;">
        Dustin has set up your Symmetry Training App account. Your training, nutrition, and progress — all in one place.
      </p>

      <!-- Download app -->
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="${apkUrl}" style="display: inline-block; background: #E53935; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">
          📲 Download the App (Android)
        </a>
      </div>

      <!-- Credentials box -->
      <div style="background: #f8f8f8; border-radius: 10px; padding: 20px; margin: 0 0 24px; border: 1px solid #eee;">
        <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px;">Login Credentials</p>
        <p style="margin: 0 0 8px; font-size: 15px; color: #333;">
          <strong>Email:</strong> ${email}
        </p>
        <p style="margin: 0; font-size: 15px; color: #333;">
          <strong>Temporary Password:</strong>
          <span style="font-family: monospace; background: #E5393515; color: #E53935; padding: 2px 8px; border-radius: 4px; font-size: 16px; font-weight: 700;">${tempPassword}</span>
        </p>
      </div>

      <!-- Install + login steps -->
      <div style="background: #f0f7ff; border-radius: 10px; padding: 16px; margin: 24px 0; border: 1px solid #ddeeff;">
        <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #0066cc;">📱 How to install &amp; log in (Android)</p>
        <p style="margin: 0 0 6px; font-size: 13px; color: #555;"><strong>1.</strong> Tap <strong>Download the App</strong> above to download the file.</p>
        <p style="margin: 0 0 6px; font-size: 13px; color: #555;"><strong>2.</strong> Open the downloaded file and tap <strong>Install</strong>. If your phone warns about &quot;unknown sources,&quot; tap the prompt to allow it, then Install.</p>
        <p style="margin: 0 0 6px; font-size: 13px; color: #555;"><strong>3.</strong> Open the app and sign in with the <strong>email and temporary password above</strong>.</p>
        <p style="margin: 0; font-size: 13px; color: #555;"><strong>4.</strong> You'll be prompted to <strong>set your own password</strong> right away — pick one you'll remember, and you're in.</p>
      </div>

      <p style="color: #999; font-size: 13px; margin: 0; text-align: center;">
        Questions? Reply to this email or contact Dustin directly.
      </p>
    </div>
    <!-- Footer -->
    <div style="background: #f8f8f8; padding: 16px 32px; text-align: center; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 12px; color: #999;">Symmetry Corrective · Sevens Gym</p>
    </div>
  </div>
</body>
</html>
      `.trim();
}
