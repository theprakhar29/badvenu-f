// Call only after authorization. Explicit nested allowlists work with documents or
// lean objects; never spread a booking, payment, event, item, or ticket document.
export function bookingResponse(booking) {
  const event = booking.event;
  return {
    _id: booking._id,
    event: event?.title !== undefined ? {
      _id: event._id, title: event.title, slug: event.slug,
      startAt: event.startAt, venueName: event.venueName, city: event.city,
    } : event?._id ?? (typeof event === "string" ? event : null),
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    items: (booking.items || []).map((item) => ({
      pricingTierId: item.pricingTierId, tierName: item.tierName,
      quantity: item.quantity, unitPrice: item.unitPrice,
    })),
    totalAmount: booking.totalAmount,
    status: booking.status,
    createdAt: booking.createdAt,
    confirmedAt: booking.confirmedAt,
  };
}

export function checkoutBookingResponse(booking) {
  return {
    ...bookingResponse(booking),
    guestPhone: booking.guestPhone,
    holdExpiresAt: booking.holdExpiresAt,
  };
}

export function ticketResponse(ticket) {
  return {
    _id: ticket._id, tierName: ticket.tierName, status: ticket.status,
    usedAt: ticket.usedAt, createdAt: ticket.createdAt,
    // Voided tickets have no downloadable/scannable representation.
    ...(ticket.status === "UNUSED" || ticket.status === "USED"
      ? { qrDataUrl: ticket.qrDataUrl } : {}),
  };
}

export function confirmedBookingResponse(booking, tickets = []) {
  return {
    ...bookingResponse(booking),
    tickets: booking.status === "CONFIRMED"
      ? tickets.filter((ticket) => String(ticket.booking) === String(booking._id)).map(ticketResponse)
      : [],
  };
}