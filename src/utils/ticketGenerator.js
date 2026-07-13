const PDFDocument = require("pdfkit");
const https = require("https");

const generateTicketPDF = async (item, event) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      let chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      // Dynamic checks for Ticket vs Booking
      const isTicket = !!item.ticketCode;
      const holderName = isTicket ? (item.ownerEmail) : (item.userId?.fullName || "N/A");
      const idLabel = isTicket ? "Ticket Code:" : "Booking ID:";
      const idValue = isTicket ? item.ticketCode : item._id.toString();
      const seatsCount = isTicket ? "1 Seat (Individual)" : `${item.numberOfTickets} Seat(s)`;
      const priceLabel = isTicket ? "Price:" : "Total Paid:";
      const priceValue = isTicket ? `Rs. ${event.price}` : `Rs. ${item.totalAmount}`;

      // Color Palette
      const primaryColor = "#1a237e"; // Deep Indigo
      const textColor = "#333333";
      const headerColor = "#ffffff";

      // Header Background
      doc.rect(0, 0, doc.page.width, 150).fill(primaryColor);

      // Header Text
      doc.fillColor(headerColor)
         .font("Helvetica-Bold")
         .fontSize(32)
         .text("EVENT TICKET", 40, 50, { characterSpacing: 2 });
      
      doc.fontSize(12).font("Helvetica")
         .text(isTicket ? "Individual Admission Pass" : "Booking Confirmation", 40, 95, { characterSpacing: 1 });

      // Event Title
      doc.fontSize(20).font("Helvetica-Bold")
         .text(event?.eventName?.toUpperCase() || "EVENT", 0, 60, { align: "right", width: doc.page.width - 40 });

      doc.moveDown(5); // Move below header

      // Main Ticket Section
      const ticketTop = 170;
      const ticketHeight = 350;
      const ticketWidth = doc.page.width - 80;

      // Ticket Container Box
      doc.rect(40, ticketTop, ticketWidth, ticketHeight)
         .strokeColor("#cccccc")
         .lineWidth(1)
         .stroke();

      // Event Information (Left Column)
      const col1X = 60;
      const col2X = 350;

      // Fetch QR Code Image
      let qrBuffer = null;
      try {
        qrBuffer = await new Promise((res, rej) => {
          https.get(item.qrCodeUrl, (response) => {
            const data = [];
            response.on("data", (chunk) => data.push(chunk));
            response.on("end", () => res(Buffer.concat(data)));
            response.on("error", (err) => rej(err));
          }).on("error", (err) => rej(err));
        });
      } catch (err) {
        console.error("Error fetching QR code:", err);
      }

      doc.fillColor(textColor).font("Helvetica-Bold").fontSize(14).text("EVENT DETAILS", col1X, ticketTop + 20);
      doc.moveTo(60, ticketTop + 40).lineTo(330, ticketTop + 40).stroke();

      doc.fontSize(11).font("Helvetica-Bold").text("Venue:", col1X, ticketTop + 55);
      doc.font("Helvetica").text(event?.venue || "N/A", col1X + 50, ticketTop + 55);

      doc.fontSize(11).font("Helvetica-Bold").text("Location:", col1X, ticketTop + 80);
      doc.font("Helvetica").text(event?.location || "N/A", col1X + 60, ticketTop + 80);

      doc.fontSize(11).font("Helvetica-Bold").text("Date:", col1X, ticketTop + 105);
      doc.font("Helvetica").text(event?.eventDate ? new Date(event.eventDate).toLocaleDateString() : "N/A", col1X + 50, ticketTop + 105);

      doc.fontSize(11).font("Helvetica-Bold").text("Time:", col1X, ticketTop + 130);
      doc.font("Helvetica").text(event?.eventDate ? new Date(event.eventDate).toLocaleTimeString() : "N/A", col1X + 50, ticketTop + 130);

      // Booking Information (Right Column)
      doc.fillColor(textColor).font("Helvetica-Bold").fontSize(14).text(isTicket ? "TICKET DETAILS" : "BOOKING DETAILS", col2X, ticketTop + 20);
      doc.moveTo(col2X, ticketTop + 40).lineTo(doc.page.width - 60, ticketTop + 40).stroke();

      doc.fontSize(10).font("Helvetica-Bold").text("Ticket Holder:", col2X, ticketTop + 55);
      doc.font("Helvetica").fontSize(9).text(holderName, col2X + 80, ticketTop + 55);

      doc.fontSize(10).font("Helvetica-Bold").text(idLabel, col2X, ticketTop + 75);
      doc.font("Helvetica").fontSize(8).text(idValue, col2X + 80, ticketTop + 75);

      doc.fontSize(10).font("Helvetica-Bold").text("Tickets:", col2X, ticketTop + 95);
      doc.font("Helvetica").fontSize(10).text(seatsCount, col2X + 80, ticketTop + 95);

      doc.fontSize(10).font("Helvetica-Bold").text(priceLabel, col2X, ticketTop + 115);
      doc.font("Helvetica-Bold").fontSize(12).fillColor(primaryColor).text(priceValue, col2X + 80, ticketTop + 115);

      // QR Code Section
      doc.fillColor(textColor).font("Helvetica-Bold").fontSize(12).text("SCAN TO VERIFY", col2X, ticketTop + 160);
      
      if (qrBuffer) {
        doc.image(qrBuffer, col2X, ticketTop + 180, { width: 120 });
      }

      // Watermark
      doc.save()
         .fillColor("#e0e0e0")
         .font("Helvetica-Bold")
         .fontSize(50)
         .opacity(0.15)
         .translate(doc.page.width / 2, doc.page.height - 150)
         .rotate(-30)
         .text("TICKET CONFIRMED", -250, 0, { align: "center", width: 500 })
         .restore();

      // Divider Line
      doc.moveTo(40, doc.page.height - 100).lineTo(doc.page.width - 40, doc.page.height - 100).strokeColor("#eee").stroke();

      // Footer
      doc.fillColor("#999999").fontSize(9)
         .text("This is an electronically generated ticket. Please carry a valid photo ID for verification at the entrance.", 40, doc.page.height - 80, { align: "center" });
      doc.text("For any queries, contact support@vibecheck.com", 40, doc.page.height - 60, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateTicketPDF };
