import { apiFetch } from "../lib/api";

export async function createBooking(slug, bookingData) {
  return apiFetch(`/api/public/events/${slug}/bookings`, {
    method: "POST",
    body: JSON.stringify(bookingData),
  });
}

export async function getBooking(bookingId) {
  return apiFetch(`/api/public/bookings/${bookingId}`);
}

export async function createPaymentOrder(bookingId) {
  return apiFetch(
    `/api/public/bookings/${bookingId}/payment-order`,
    {
      method: "POST",
    }
  );
}

export async function confirmBooking(bookingId, paymentData) {
  return apiFetch(
    `/api/public/bookings/${bookingId}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(paymentData),
    }
  );
}

export async function verifyEventTicket(eventId, qrToken) {
  return apiFetch(`/api/events/${eventId}/verify`, {
    method: "POST",
    body: JSON.stringify({
      qrToken: qrToken.trim(),
      clientScanId: crypto.randomUUID(),
      scannedAt: new Date().toISOString(),
    }),
  });
}