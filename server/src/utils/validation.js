import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const pricingTierSchema = z.object({
  name: z.string().min(1, "Tier name is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  totalQty: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

export const eventDraftSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  city: z.string().optional(),
  startAt: z.string().min(1, "Start date/time is required"),
  endAt: z.string().optional(),
  capacity: z.coerce.number().int().min(1).optional(),
  description: z.string().optional(),
  pricingTiers: z.array(pricingTierSchema).min(1, "Add at least one pricing tier"),
});

export const statusSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "CLOSED"]),
});

export const bookingInputSchema = z
  .object({
    guestName: z.string().min(2, "Name is required"),
    guestEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
    guestPhone: z.string().min(6, "Enter a valid phone number").optional().or(z.literal("")),
    items: z
      .array(
        z.object({
          pricingTierId: z.string(),
          quantity: z.coerce.number().int().min(1),
        })
      )
      .min(1, "Select at least one ticket"),
    formResponses: z
      .array(
        z.object({
          fieldKey: z.enum(["PHONE", "AGE", "CUSTOM_QUESTION"]),
          value: z.string(),
        })
      )
      .optional()
      .default([]),
  })
  .refine((data) => data.guestEmail || data.guestPhone, {
    message: "Provide an email or phone number so we can send your ticket.",
    path: ["guestEmail"],
  });

export const formFieldsSchema = z.object({
  formFields: z
    .array(
      z.object({
        key: z.enum(["PHONE", "AGE", "CUSTOM_QUESTION"]),
        label: z.string().max(120).optional().default(""),
        enabled: z.boolean().default(false),
        required: z.boolean().default(false),
      })
    )
    .refine(
      (fields) => {
        const custom = fields.find((f) => f.key === "CUSTOM_QUESTION");
        // If the custom question is turned on, it needs organizer-written text.
        return !custom?.enabled || (custom.label && custom.label.trim().length > 0);
      },
      { message: "Add the question text before enabling the custom question." }
    ),
});
