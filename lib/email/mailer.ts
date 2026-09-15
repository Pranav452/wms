import 'server-only'
import nodemailer from 'nodemailer'

// Gmail SMTP, set up the same way as the sales-enquiry app.
// Needs two env vars (in .env locally and in Vercel):
//   GMAIL_USER         — the sending Gmail address
//   GMAIL_APP_PASSWORD — 16-char App Password from Google Account → Security
export const mailConfigured = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)

export const transporter = nodemailer.createTransport({
  host:   'smtp.gmail.com',
  port:   587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})
