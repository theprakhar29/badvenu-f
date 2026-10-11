import mongoose from "mongoose";

const { Schema } = mongoose;

// Pricing tiers live as an embedded subdocument array on Event.
// MongoDB favors this denormalized shape over a joined table — a tier
// only ever makes sense in the context of its one event, and we always
// read/write them together with the event.
const pricingTierSchema = new Schema({
  name: { type: String, required: true, trim: true }, // e.g. "General", "VIP"
  price: { type: Number, required: true, min: 0 },
  totalQty: { type: Number, required: true, min: 1 },
  reservedQty: { type: Number, default: 0, min: 0 },
  soldQty: { type: Number, default: 0, min: 0 },
});

// Preset checkout form fields an organizer can toggle on/off, per the PRD's
// "Form & Ticket Builder" spec. PHONE and AGE are fixed presets; CUSTOM_QUESTION
// lets the organizer supply their own label (e.g. "T-shirt size?").
const formFieldSchema = new Schema({
  key: {
    type: String,
    enum: ["PHONE", "AGE", "CUSTOM_QUESTION"],
    required: true,
  },
  label: { type: String, trim: true }, // organizer-editable label, mainly for CUSTOM_QUESTION
  enabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
});

const DEFAULT_FORM_FIELDS = [
  { key: "PHONE", label: "Phone number", enabled: false, required: false },
  { key: "AGE", label: "Age", enabled: false, required: false },
  { key: "CUSTOM_QUESTION", label: "", enabled: false, required: false },
];

const eventSchema = new Schema(
  {
    organizer: {
      type: Schema.Types.ObjectId,
      ref: "Organizer",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, trim: true },
    venueName: { type: String, trim: true },
    venueAddress: { type: String, trim: true },
    city: { type: String, trim: true, index: true },
    startAt: { type: Date },
    endAt: { type: Date },
    capacity: { type: Number, min: 1 },
    bannerUrl: { type: String },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "PAUSED", "CLOSED"],
      default: "DRAFT",
      index: true,
    },
    pricingTiers: [pricingTierSchema],
    formFields: {
      type: [formFieldSchema],
      default: () => DEFAULT_FORM_FIELDS.map((f) => ({ ...f })),
    },
  },
  { timestamps: true }
);

// Fast path for the public listing: published events sorted by date.
eventSchema.index({ status: 1, startAt: 1 });

export default mongoose.model("Event", eventSchema);
