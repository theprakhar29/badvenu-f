import mongoose from "mongoose";

const { Schema } = mongoose;

const ticketSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    pricingTierId: { type: Schema.Types.ObjectId, required: true },
    tierName: { type: String, required: true },

    // Opaque, unguessable token — this IS the ticket's identity for scanning
    // (v1.4). It's a random 192-bit value, not a signed/derivable JWT: since
    // validation will always be a DB lookup by this token anyway, a random
    // token is exactly as secure as a signed one here, with less moving
    // parts (no shared secret to manage yet).
    qrToken: { type: String, required: true, unique: true, index: true },

    // Generated once at issuance and stored, rather than regenerated on
    // every read — cheap to store, avoids re-running QR encoding per view.
    qrDataUrl: { type: String, required: true },

    status: {
      type: String,
      enum: ["UNUSED", "USED", "VOID"],
      default: "UNUSED",
      index: true,
    },
    usedAt: { type: Date },
    // Who performed the scan that marked this ticket used — exactly one
    // of these is set, depending on whether the host or a team member
    // scanned it. Kept as separate nullable refs rather than a generic
    // (type, id) pair so Mongoose can still validate/populate them properly.
    usedByOrganizer: { type: Schema.Types.ObjectId, ref: "Organizer" },
    usedByScannerLink: { type: Schema.Types.ObjectId, ref: "ScannerLink" },
  },
  { timestamps: true }
);

export default mongoose.model("Ticket", ticketSchema);
