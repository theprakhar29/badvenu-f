import { Resend } from "resend";

/**
 * Email notifications via Resend (https://resend.com).
 *
 * ONE env var needed on Render:
 *   RESEND_API_KEY  — from resend.com/api-keys (free tier: 3k/month)
 *
 * Optional:
 *   MAIL_FROM_EMAIL — e.g. tickets@yourdomain.com (domain must be verified
 *                     in Resend dashboard). If unset, sends from
 *                     onboarding@resend.dev (Resend's shared address —
 *                     fine for testing, use your own domain for production).
 *   MAIL_FROM_NAME  — display name, defaults to "Marquee"
 *
 * SMS is removed for now — will be added back later.
 */

// Lazy so the module loads cleanly even when RESEND_API_KEY isn't set
// (local dev without a key uses the mock path in sendEmail below).
let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function fromAddress() {
  const name = process.env.MAIL_FROM_NAME;
  const email = process.env.MAIL_FROM_EMAIL;
  return `${name} <${email}>`;
}

function confirmationUrl(booking) {
  const origin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  return `${origin}/booking-confirmation/${booking._id}`;
}

async function sendEmail({ to, subject, html, attachments }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mock email] To: ${to} | Subject: ${subject}`);
    return;
  }
  const { error } = await getResend().emails.send({
    from: fromAddress(),
    to: [to],
    subject,
    html,
    attachments,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Ticket delivery — called after payment confirmed
// ---------------------------------------------------------------------------

export async function deliverTickets(booking, tickets) {
  if (!booking.guestEmail) return [];

  try {
    const attachments = tickets.map((ticket, i) => ({
      filename: `ticket-${i + 1}.png`,
      content: ticket.qrDataUrl.split(",")[1], // base64 PNG
    }));

    const ticketRows = tickets
      .map(
        (t, i) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #eee;">
            <strong>${t.tierName}</strong> — Ticket ${i + 1} of ${tickets.length}
          </td>
          <td style="padding:12px;border-bottom:1px solid #eee;color:#888;font-size:13px;">
            QR code attached as ticket-${i + 1}.png
          </td>
        </tr>`
      )
      .join("");

    const html = `<div style="font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; max-width: 520px; margin: 0 auto; color: #E8DCC4; background-color: #120A1F; border: 2px solid #D4AF37; border-radius: 12px; overflow: hidden; box-shadow: 0 0 20px rgba(212,175,55,0.15);">
        
        <!-- Header -->
        <div style="background: #1E112A; padding: 32px; text-align: center; border-bottom: 2px solid #D4AF37;">
          <h1 style="margin: 0; color: #D4AF37; font-size: 32px; letter-spacing: 4px; text-transform: uppercase; font-weight: normal; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">✦ Badvenue ✦</h1>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px; background-color: #120A1F;">
          <h2 style="margin: 0 0 16px; color: #D4AF37; font-size: 24px; font-weight: normal; font-style: italic;">Your passage is secured, ${booking.guestName.split(" ")[0]}! 🗝️</h2>
          
          <p style="color: #C5B8A5; margin: 0 0 24px; line-height: 1.6; font-size: 15px;">
            Your legendary booking is confirmed. The magical seals (QR codes) for your entry are attached to this scroll — present them at the gates, one per traveler.
          </p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; border: 1px solid #3A2652;">
            <thead>
              <tr style="background: #1E112A; border-bottom: 1px solid #3A2652;">
                <th style="padding: 14px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #D4AF37;">Scroll / Ticket</th>
                <th style="padding: 14px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #D4AF37;">Attachment</th>
              </tr>
            </thead>
            <tbody style="color: #E8DCC4;">
              ${ticketRows}
            </tbody>
          </table>
          
          <div style="background: rgba(212, 175, 55, 0.05); border: 1px solid #D4AF37; border-radius: 6px; padding: 16px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0; font-size: 15px; color: #D4AF37; letter-spacing: 1px;">
              <strong>Tribute Paid:</strong> ₹${booking.totalAmount}
            </p>
          </div>
          
          <div style="text-align: center; border-top: 1px dashed #3A2652; padding-top: 24px;">
            <p style="margin: 0; font-size: 13px; color: #8C7B9E; font-style: italic;">
              Gaze upon your booking anytime at<br>
              <a href="${confirmationUrl(booking)}" style="color: #D4AF37; text-decoration: none; border-bottom: 1px dotted #D4AF37; display: inline-block; margin-top: 8px;">${confirmationUrl(booking)}</a>
            </p>
          </div>
          
        </div>
      </div>`;

    await sendEmail({
      to: booking.guestEmail,
      subject: `Your tickets are confirmed — ${tickets.length} ticket${tickets.length > 1 ? "s" : ""} attached`,
      html,
      attachments,
    });

    console.log(`[email] Ticket delivery sent to ${booking.guestEmail} — booking ${booking._id}`);
    return [{ channel: "EMAIL", purpose: "TICKET_DELIVERY", to: booking.guestEmail, status: "SENT", sentAt: new Date() }];
  } catch (err) {
    console.error(`[email] Failed to deliver tickets to ${booking.guestEmail}:`, err.message);
    return [{ channel: "EMAIL", purpose: "TICKET_DELIVERY", to: booking.guestEmail, status: "FAILED", error: err.message, sentAt: new Date() }];
  }
}

// ---------------------------------------------------------------------------
// Payment failure notice
// ---------------------------------------------------------------------------

export async function deliverFailureNotice(booking, reason) {
  if (!booking.guestEmail) return [];

  try {
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#142238;">
        <div style="background:#0F1B33;padding:24px 32px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#F5A623;font-size:28px;letter-spacing:2px;">MARQUEE</h1>
        </div>
        <div style="background:#ffffff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
          <h2 style="margin:0 0 8px;">Payment unsuccessful</h2>
          <p style="color:#666;margin:0 0 16px;">
            Hi ${booking.guestName.split(" ")[0]}, your payment for this booking
            could not be processed, so your tickets were not reserved.
          </p>
          <div style="background:#fff0f0;border-left:4px solid #E1473C;padding:12px 16px;border-radius:4px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#c13930;">
              <strong>Reason:</strong> ${reason}
            </p>
          </div>
          <p style="color:#666;margin:0 0 24px;">
            No charge was made to your account. Please try booking again if
            you'd still like to attend.
          </p>
          <p style="margin:0;font-size:13px;color:#999;">
            If you believe this is an error, please contact the event organizer.
          </p>
        </div>
      </div>`;

    await sendEmail({
      to: booking.guestEmail,
      subject: "Payment unsuccessful — please try again",
      html,
    });

    console.log(`[email] Failure notice sent to ${booking.guestEmail} — booking ${booking._id}`);
    return [{ channel: "EMAIL", purpose: "PAYMENT_FAILED", to: booking.guestEmail, status: "SENT", sentAt: new Date() }];
  } catch (err) {
    console.error(`[email] Failed to send failure notice to ${booking.guestEmail}:`, err.message);
    return [{ channel: "EMAIL", purpose: "PAYMENT_FAILED", to: booking.guestEmail, status: "FAILED", error: err.message, sentAt: new Date() }];
  }
}
