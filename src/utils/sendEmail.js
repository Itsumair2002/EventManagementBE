const nodemailer = require("nodemailer");
const https = require("https");

/**
 * Helper to send email via Resend's REST API.
 * This runs over standard HTTPS (port 443) which is never blocked by cloud firewalls.
 */
const sendResendEmail = (options) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: "VibeCheck <onboarding@resend.dev>",
      to: options.email,
      subject: options.subject,
      html: options.message,
      attachments: options.attachmentBuffer
        ? [
            {
              content: options.attachmentBuffer.toString("base64"),
              filename: options.attachmentName || "ticket.pdf"
            }
          ]
        : []
    });

    const reqOptions = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`Resend API returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Sends an email with an optional PDF attachment.
 * Uses Resend API if RESEND_API_KEY is configured (ideal for Render),
 * otherwise falls back to standard SMTP (ideal for local development).
 */
const sendEmail = async (options) => {
  if (process.env.RESEND_API_KEY) {
    console.log("Sending email via Resend HTTPS API...");
    return sendResendEmail(options);
  }

  const { SMTP_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_MAIL, SMTP_PASSWORD } = process.env;

  if (!SMTP_MAIL || !SMTP_PASSWORD) {
    throw new Error(
      "Email not configured: set SMTP_MAIL and SMTP_PASSWORD in .env (or configure RESEND_API_KEY)"
    );
  }

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
