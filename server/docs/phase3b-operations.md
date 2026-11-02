# Phase 3B ticket email operations

Confirmed bookings create durable `ticketDelivery.state=PENDING` work. A trusted
worker invokes `reconcileTicketDelivery()` periodically; concurrent workers are
safe because dispatch atomically claims PENDING work. It must alert on CLAIMED
or FAILED records. CLAIMED is an uncertain provider outcome and is never retried
automatically; support must verify delivery and, after verified customer/email
control, request a new delivery grant. This is at-most-once dispatch, not
exactly-once email delivery.

Phone-only bookings cannot use email recovery. Support must verify the original
phone plus payment/event details through the approved support process, then
issue a fresh ticket grant; it must never authorize a bare booking ID.
