import 'server-only'
import { mailConfigured, transporter } from './mailer'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export async function sendPasswordResetEmail({ to, name, username, url, minutes }: {
  to:       string
  name:     string
  username: string
  url:      string
  minutes:  number
}): Promise<void> {
  if (!mailConfigured) {
    if (process.env.NODE_ENV !== 'production') {
      // lets the flow be tried locally without Gmail credentials
      console.warn(`[mail] GMAIL_USER / GMAIL_APP_PASSWORD not set — dev-only reset link for @${username}: ${url}`)
    } else {
      console.error('[mail] GMAIL_USER / GMAIL_APP_PASSWORD not set — password reset email not sent')
    }
    return
  }

  const text = [
    `Hi ${name},`,
    '',
    `Someone (hopefully you) asked to reset the password for your Bridge WMS account (@${username}).`,
    `Open this link to choose a new one. It expires in ${minutes} minutes and works once:`,
    url,
    '',
    "If you didn't ask for this, ignore this email — your password stays the same.",
  ].join('\n')

  const safeUrl = escapeHtml(url)
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #f3f4f6">
    <tr><td style="padding:28px">
      <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#ef4444">Bridge WMS</p>
      <p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#4b5563">
        Someone (hopefully you) asked to reset the password for your account <b>@${escapeHtml(username)}</b>.
        Use the button below to choose a new one.
      </p>
      <p style="margin:0 0 20px">
        <a href="${safeUrl}" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Reset password</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280">
        This link expires in ${minutes} minutes and works once. If the button doesn't work, paste this address into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="${safeUrl}" style="color:#ef4444">${safeUrl}</a></p>
      <p style="margin:0;font-size:12px;color:#9ca3af">If you didn't ask for this, ignore this email — your password stays the same.</p>
    </td></tr>
  </table>
</body></html>`

  await transporter.sendMail({
    from:    `"Bridge WMS" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your Bridge WMS password',
    text,
    html,
  })
}
