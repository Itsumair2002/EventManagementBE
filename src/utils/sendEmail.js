const nodemailer = require("nodemailer");

/**
 * Sends an email with an optional attachment
 * @param {Object} options - { email, subject, message, attachmentBuffer, attachmentName }
 */
const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    service: process.env.SMTP_SERVICE, // e.g. 'gmail'
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"VibeCheck" <${process.env.SMTP_MAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
    attachments: options.attachmentBuffer ? [
      {
        filename: options.attachmentName || "ticket.pdf",
        content: options.attachmentBuffer,
        contentType: "application/pdf"
      }
    ] : []
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
