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

  // Default to port 587 (STARTTLS) for Gmail if port isn't explicitly set,
  // as port 587 is less likely to be blocked/time out in cloud hosting environments like Render.
  const host = SMTP_HOST || (SMTP_SERVICE === "gmail" ? "smtp.gmail.com" : null);
  const port = SMTP_PORT ? Number(SMTP_PORT) : 587;
  const secure = SMTP_PORT ? Number(SMTP_PORT) === 465 : false;

  const transportConfig = host 
    ? { host, port, secure }
    : { service: SMTP_SERVICE || "gmail" };

  const dns = require("dns");
  const transporter = nodemailer.createTransport({
    ...transportConfig,
    auth: { user: SMTP_MAIL, pass: SMTP_PASSWORD },
    lookup: (hostname, options, callback) => {
      return dns.lookup(hostname, { ...options, family: 4 }, callback);
    }
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
