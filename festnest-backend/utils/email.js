// utils/email.js  –  Email sending via Resend (production) or Nodemailer (local dev)
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const PLACEHOLDER_VALUES = ['your@gmail.com', 'your_16_char_app_password', '', undefined, null];

function isResendConfigured() {
  const key = process.env.RESEND_API_KEY;
  return key && !PLACEHOLDER_VALUES.includes(key) && key.startsWith('re_');
}

function isSmtpConfigured() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return !PLACEHOLDER_VALUES.includes(user) && !PLACEHOLDER_VALUES.includes(pass);
}

let _resend     = null;
let _transporter = null;

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

/* ── Generic send helper ── */
export async function sendMail({ to, subject, html }) {
  // 1. Resend API (works on Render — uses HTTPS, not SMTP)
  if (isResendConfigured()) {
    try {
      const from = process.env.MAIL_FROM || 'FestNest <onboarding@resend.dev>';
      const result = await getResend().emails.send({ from, to, subject, html });
      if (result.error) throw new Error(result.error.message);
      console.log(`[EMAIL] Sent via Resend to ${to} — id: ${result.data?.id}`);
      return result;
    } catch (err) {
      console.error(`[EMAIL ERROR] Resend failed: ${err.message}`);
      return { error: err.message };
    }
  }

  // 2. Nodemailer SMTP (local dev only — blocked by most cloud hosts)
  if (isSmtpConfigured()) {
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM || '"FestNest" <noreply@festnest.in>',
        to, subject, html,
      });
      console.log(`[EMAIL] Sent via SMTP to ${to}`);
      return info;
    } catch (err) {
      console.error(`[EMAIL ERROR] SMTP failed: ${err.message}`);
      return { error: err.message };
    }
  }

  // 3. Dev fallback — no credentials configured
  console.log(`\n📧  [DEV EMAIL — no mailer configured]`);
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}\n`);
  return { messageId: 'dev-no-mailer' };
}

/* ── OTP Email Template ── */
export async function sendOTPEmail(email, otp, purpose = 'verify_email') {
  const subjects = {
    verify_email:   'Verify your FestNest account',
    login:          'Your FestNest login OTP',
    reset_password: 'Reset your FestNest password',
  };
  const actions = {
    verify_email:   'verify your email address',
    login:          'log in to your account',
    reset_password: 'reset your password',
  };

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:32px;text-align:center;">
            <div style="font-size:36px;margin-bottom:8px;">🪺</div>
            <div style="color:#ffffff;font-size:22px;font-weight:700;">FestNest</div>
            <div style="color:#C7D2FE;font-size:13px;margin-top:4px;">Discover. Register. Participate.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 36px;">
            <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi there 👋</p>
            <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
              Use the one-time password below to <strong>${actions[purpose]}</strong>.
              This OTP expires in <strong>10 minutes</strong>.
            </p>
            <div style="background:#F0F0FF;border:2px dashed #4F46E5;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#4F46E5;font-family:monospace;">${otp}</div>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">
              ⚠️ Never share this OTP. FestNest will never ask for it.
            </p>
            <p style="margin:0;font-size:13px;color:#6B7280;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:20px 36px;border-top:1px solid #E5E7EB;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} FestNest · Built for college students across India</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendMail({ to: email, subject: subjects[purpose] || 'FestNest OTP', html });
}

/* ── Registration confirmation email ── */
export async function sendRegistrationConfirmEmail(email, userName, eventName, eventCollege) {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:32px;text-align:center;">
            <div style="font-size:36px;">✅</div>
            <div style="color:#fff;font-size:20px;font-weight:700;margin-top:8px;">Registration Confirmed!</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px;">
            <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hey ${userName} 🎉</p>
            <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">
              You're officially registered for <strong>${eventName}</strong> at ${eventCollege}.
            </p>
            <div style="background:#EEF2FF;border-radius:10px;padding:16px;font-size:13px;color:#4338CA;">
              💡 You've earned <strong>+50 FestNest Points</strong> for registering!
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:16px 36px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} FestNest</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return sendMail({ to: email, subject: `Registered for ${eventName} 🎉`, html });
}
