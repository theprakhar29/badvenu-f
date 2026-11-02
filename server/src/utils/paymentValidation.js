export class PaymentError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}
export const denyPaymentAccess = () => new PaymentError("BOOKING_ACCESS_DENIED", 403, "Booking not found or access unavailable.");
export function expectedPaymentAmount(booking) {
  const amount = Math.round(booking.totalAmount * 100);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new PaymentError("INVALID_AMOUNT", 409, "Invalid booking amount.");
  return amount;
}
export function validateProviderOrder(booking, order, { checkout = false } = {}) {
  const amount = expectedPaymentAmount(booking);
  if (!order || typeof order.id !== "string" || order.receipt !== String(booking._id)
    || order.notes?.bookingId !== String(booking._id) || order.amount !== amount || order.currency !== "INR"
    || (booking.payment?.orderId && booking.payment.orderId !== order.id)) {
    throw new PaymentError("ORDER_MISMATCH", 409, "Payment order does not match this booking.");
  }
  if (checkout && (!["created", "attempted"].includes(order.status)
    || order.amount_paid !== 0 || order.amount_due !== amount)) {
    throw new PaymentError("ORDER_NOT_PAYABLE", 409, "This order cannot accept another payment.");
  }
  return order;
}
export function validateCapturedPayment(booking, order, payment) {
  validateProviderOrder(booking, order);
  const amount = expectedPaymentAmount(booking);
  if (!payment || typeof payment.id !== "string" || payment.order_id !== order.id
    || payment.amount !== amount || payment.currency !== "INR"
    || payment.status !== "captured" || payment.captured !== true
    || payment.amount_refunded !== 0 || order.status !== "paid"
    || order.amount_paid !== amount || order.amount_due !== 0) {
    throw new PaymentError("PAYMENT_NOT_VERIFIED", 409, "Payment is not captured and verified for this booking.");
  }
}