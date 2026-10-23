import ContactMessage from "../models/ContactMessage.js";
import { sendContactEnquiryNotification } from "../utils/notifications.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createContactMessage(req, res, next) {
  try {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const subject =
      typeof req.body?.subject === "string"
        ? req.body.subject.trim()
        : "";
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (
      !name ||
      name.length > 100 ||
      !EMAIL_REGEX.test(email) ||
      email.length > 254 ||
      !subject ||
      subject.length > 150 ||
      !message ||
      message.length > 5000
    ) {
      return res.status(400).json({
        error: {
          code: "INVALID_CONTACT_INPUT",
          message:
            "Please provide a valid name, email, subject and message within the allowed length limits.",
        },
      });
    }

    // Save the enquiry first. It remains saved even if email fails.
    const contactMessage = await ContactMessage.create({
      name,
      email,
      subject,
      message,
      emailStatus: "PENDING",
    });

    try {
      await sendContactEnquiryNotification(contactMessage);

      contactMessage.emailStatus = "SENT";
      contactMessage.emailError = "";
      await contactMessage.save();
    } catch (emailError) {
      console.error(
        `[contact] Email notification failed for ${contactMessage._id}:`,
        emailError.message
      );

      contactMessage.emailStatus = process.env.CONTACT_SUPPORT_EMAIL?.trim()
        ? "FAILED"
        : "NOT_CONFIGURED";

      contactMessage.emailError = String(emailError.message || "Email failed")
        .slice(0, 500);

      await contactMessage.save();
    }

    return res.status(201).json({
      success: true,
      message:
        "Your enquiry has been saved. Thank you for contacting Badvenu.",
      referenceId: contactMessage._id,
    });
  } catch (err) {
    next(err);
  }
}