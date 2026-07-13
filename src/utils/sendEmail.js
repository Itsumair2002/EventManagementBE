const nodemailer = require("nodemailer");

/**
 * Sends an email with an optional PDF attachment.
 * @param {Object} options - { email, subject, message, attachmentBuffer, attachmentName }
 *
 * Required env vars:
 *   SMTP_MAIL      - sender address (e.g. yourname@gmail.com)
 *   SMTP_PASSWORD  - app password (NOT your normal login password for Gmail)
 * Optional:
 *   SMTP_SERVICE   - well-known provider, e.g. "gmail" (recommended)
 *   SMTP_HOST/PORT - explicit server if not using SMTP_SERVICE
 */
const sendEmail = async (options) => {
  const { SMTP_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_MAIL, SMTP_PASSWORD } = process.env;

  if (!SMTP_MAIL || !SMTP_PASSWORD) {
    throw new Error(
      "Email not configured: set SMTP_MAIL and SMTP_PASSWORD in .env " +
      "(for Gmail, SMTP_PASSWORD must be an App Password — see https://myaccount.google.com/apppasswords)"
    );
  }

  // Prefer explicit host/port config for Gmail/SMTP instead of service presets
  // to ensure 'family: 4' (IPv4 only) is strictly passed to the net socket.
  const host = SMTP_HOST || (SMTP_SERVICE === "gmail" ? "smtp.gmail.com" : null);
  const port = SMTP_PORT ? Number(SMTP_PORT) : 465;
  const secure = SMTP_PORT ? Number(SMTP_PORT) === 465 : true;

  const transportConfig = host 
    ? { host, port, secure }
    : { service: SMTP_SERVICE || "gmail" };

  const transporter = nodemailer.createTransport({
    ...transportConfig,
    auth: { user: SMTP_MAIL, pass: SMTP_PASSWORD },
    family: 4, // Force IPv4 to prevent ENETUNREACH errors on Render
  });

  const mailOptions = {
    from: `"VibeCheck" <${SMTP_MAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
    attachments: options.attachmentBuffer
      ? [
          {
            filename: options.attachmentName || "ticket.pdf",
            content: options.attachmentBuffer,
            contentType: "application/pdf",
          },
        ]
      : [],
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
