// Quick email smoke test: node scripts/test-email.js [recipient]
// Sends a test message using the SMTP_* settings in .env.
require("dotenv").config();
const sendEmail = require("../src/utils/sendEmail");

const to = process.argv[2] || process.env.SMTP_MAIL;

(async () => {
  console.log(`Sending test email to ${to} via ${process.env.SMTP_SERVICE || process.env.SMTP_HOST}...`);
  try {
    await sendEmail({
      email: to,
      subject: "VibeCheck — email test ✅",
      message: "<h2>It works!</h2><p>Your booking-confirmation emails are configured correctly.</p>",
    });
    console.log("SUCCESS: test email sent. Check the inbox (and spam folder).");
  } catch (err) {
    console.error("FAILED:", err.message);
    process.exit(1);
  }
})();
