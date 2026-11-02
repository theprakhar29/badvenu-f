# Booking access Phase 2A: staged backend changes only

Do not deploy, start, restart, or hot-reload this branch into a user-facing environment
until the matching frontend token support and payment/ticket handoff are ready and
approved. Phase 2A does not activate a running environment. There is no rollout flag
and no insecure legacy ID-only fallback: these handlers enforce authorization whenever
this code is deliberately run. Test servers are isolated ephemeral localhost listeners.

## Creation contract

POST /api/public/events/:slug/bookings returns an explicit flat booking allowlist plus
checkoutAccessToken and checkoutAccessExpiresAt, once, in the committed 201 response.
The token has 256 random bits. Only its SHA-256 hash is persisted in a CHECKOUT grant.
No subsequent read returns or recovers that plaintext token.

Inventory reservation, the new booking, and its grant share a MongoDB transaction and
session. A replica set or sharded cluster is REQUIRED. Failure returns a generic 503;
there is no partial-write/standalone fallback. A committed booking whose HTTP response
is lost is still internally consistent, but its guest will need verified recovery or
reservation expiry; creation idempotency and recovery are not implemented here.

Customer linkage uses only an independently verified signed customer cookie and a live
email-verified customer record. Submitted customer/customerId fields and matching an
unverified guest email do not establish ownership. Guest checkout needs no account.

## Read contract

GET /api/public/bookings/:id accepts x-booking-access-token or a valid linked verified
customer session. Tokens in URLs or request bodies never establish access. Pending
bookings require an unexpired CHECKOUT grant and reservation. Confirmed bookings
require a separate TICKET grant; CHECKOUT grants can NEVER read confirmed QR images.
Verified linked owners can read their own historical booking states without guest
grants. New and legacy bare booking IDs always fail.

Missing, malformed, nonexistent, expired, revoked, wrong-purpose, wrong-owner and
cross-booking requests use the same 403 BOOKING_ACCESS_DENIED error. Responses use
Cache-Control: no-store and Referrer-Policy: no-referrer. Confirmed ticket lookup
happens only after authorization and includes the booking ref for the explicit ticket
serializer's ownership filter. Hashes, accessVersion, form responses, delivery logs,
payment internals, and raw qrToken fields are excluded. QR images are intentionally
included for authorized ticket downloads. Voided tickets have no QR image.

HTTP access logs omit URLs, bodies, headers, cookies and responses. Generic error logs
contain status only; read/create database errors are normalized before logging or
returning them. External proxy/APM logs still require a separate deployment review.

## Next implementation (not done in Phase 2A)

- Frontend: save the creation response's checkoutAccessToken in booking-keyed
  sessionStorage BEFORE navigating; send it via x-booking-access-token for reads and
  future payment operations. Preserve it on same-tab reloads. Never log creation,
  payment, ticket or token payloads; never put tokens in query strings.
- Protect payment-order and confirm operations with booking-bound checkout access or
  verified ownership. Preserve Razorpay signature checks, webhook signature checks
  and explicit nonproduction mock gating. Use safe response allowlists.
- Implement transaction/idempotency protection for concurrent browser/webhook payment
  finalization, plus a restricted confirmed-booking handoff. An unexpired/unrevoked
  checkout grant may authorize ONLY that exchange after confirmation, never payment
  mutation or direct confirmed QR reads. Handle webhook-first confirmation and lost
  browser responses without recovering stored plaintext tokens.
- Issue independent browser and email TICKET grants with server-selected event-based
  expiry. Email delivery/retries use separately generated grants and fragment links;
  token retention/fragment removal and secure verified recovery require frontend work.
- Existing bare-ID emails must lead to verified recovery, not an authorization bypass.
  Existing QR attachments remain valid; this phase does not rotate ticket identities.

Payment endpoints, webhooks, email and scanner behavior remain unchanged and retain
the previously documented risks. This is not a complete booking/payment security fix.

## Tests

Run from server:

    node --test test/bookingAccess.test.js test/bookingResponse.test.js test/bookingAccess.middleware.test.js test/bookingSerialization.test.js test/bookingAccess.http.test.js test/bookingCreation.mongo.test.js

HTTP tests exercise the real router/controller/middleware over localhost with isolated
in-memory repositories and simulated transaction rollback. They are not evidence of
MongoDB transaction guarantees. The MongoDB tests attempt ONLY credential-free
127.0.0.1:27017 and creates a fresh random badvenu_phase2a_test_<hex> database. It never
loads environment files or configured application credentials. Persistence and HTTP authorization are tested even on standalone MongoDB; the
separate atomic commit/rollback test requires a replica set and explicitly skips
otherwise. Each test removes only its isolated database. Both skip if no local
MongoDB is available. No test invokes
Razorpay, sends email, starts the application entrypoint, or accesses production data.
