# Security Phase 2B: staged payment authorization and ticket handoff

DO NOT DEPLOY or start/restart/hot-reload into a user-facing environment yet. The
frontend still does not retain/send booking tokens, handle the handoff, or remove
sensitive payload logging. No feature flag or ID-only bypass exists. Existing Phase
2A contracts remain protected. This document supersedes Phase 2A's payment limitations.

## Browser API and authority

- POST /api/public/bookings/:id/payment-order: pending checkout authority only.
- POST /api/public/bookings/:id/confirm: checkout authority; after confirmation it
  may only perform a ticket-access exchange, never another payment mutation.
- POST /api/public/bookings/:id/ticket-access: narrow confirmed-booking exchange.

All accept a valid booking-bound CHECKOUT grant in x-booking-access-token, or a
signed, verified linked customer session. Request bodies/query strings, matching
emails, amounts, payment IDs and submitted customer IDs never prove ownership.
TICKET grants cannot authorize these operations. Cookie-authorized requests require
an exact configured CLIENT_ORIGIN Origin; absent/null/unlisted origins are denied.
A valid header grant takes priority over incidental cookies and remains independently
authorized. Origin checks supplement CORS; they are not inferred from Host headers.
The gateway webhook remains independent of browser tokens and CSRF.

Middleware is only a first check. Every database mutation re-reads booking state,
checkout grant expiry/revocation/version or customer verification/linkage inside its
transaction. Grant/customer use-counter writes fence concurrent revocation or
verification changes; the booking revision write fences expiry and version changes.
Missing/invalid/revoked/expired/cross-booking access returns generic 403. API responses
are allowlisted, no-store, and no-referrer; no raw scan tokens, signatures, grants,
security counters, delivery state or provider error payloads are returned or logged.
Required public checkout data (order ID, amount, currency, publishable key ID and
prefill contact) is returned only to an authorized requester.

## Razorpay verification and order claims

Captured-only fulfillment requires Razorpay auto-capture or a separately approved
capture workflow. Temporarily authorized/unsettled payments must retry confirmation
or await the captured webhook; never create a replacement order for them.

The browser HMAC is necessary but insufficient: fetch both order and payment from
Razorpay, then verify stored order ID, booking receipt/note association, amount in
paise, INR currency, matching payment/order IDs, fully paid order and captured payment
with no refund. Only then finalize. Invalid signatures never mark a booking FAILED,
release inventory or send failure email. Nonproduction mock mode remains explicit;
production never enables mock issuance. Production mock requests fail closed.

A transaction commits a CREATING order claim before the single external create call.
The provider call is outside the retried transaction. Existing valid unpaid orders
are fetched, checked and reused; a paid order never gets replaced automatically.
An ambiguous provider/create/persistence failure leaves CREATING/UNCERTAIN state for
verified reconciliation, without automatic lease takeover or replacement order
creation. Crash recovery must reconcile provider receipts before allowing a new
order. This prioritizes preventing conflicting payment orders over automatic retry.
Known successful results are durably bound even if the caller is revoked during the
network call; fresh authorization is required before returning them. There is no
atomic transaction spanning MongoDB and the external provider.

## Commit, idempotency and late capture

Browser and authenticated webhook completion share one transactional settle path.
The booking is claimed before inventory/ticket writes. Booking payment/status,
reserved-to-sold inventory, QR tickets and PENDING notification state commit together.
Concurrent requests contend on booking/grant documents; retried transactions see the
committed state and do not issue another ticket set. Revenue is computed from each
CONFIRMED booking once; there is no additional revenue increment side effect.

Expiry cleanup now also re-reads and updates the booking inside a transaction before
releasing inventory. Captures arriving after reservation expiry cannot issue tickets
against released stock: record payment reconciliationRequired, atomically expire and
release a still-pending hold once, and require operator refund/reconciliation.
Already expired/cancelled bookings never release their inventory a second time.
A signed payment.failed event describes an attempt, not necessarily the final order
outcome: acknowledge it without failing/releasing the booking; another attempt may
succeed until normal reservation expiry. Refund/chargeback lifecycle automation is
outside this phase.

Unique partial indexes bind each real order/payment ID to at most one booking.
BEFORE deployment, audit historical duplicates and plan index creation. Do not run
an automatic production migration. A replica set or sharded cluster is REQUIRED;
there is no standalone/nontransactional fallback for financial mutations.

## Browser ticket handoff, retries and legacy bookings

After confirmation commits, a separate transaction checks live authority again and
persists a fresh independent TICKET grant hash. Only that authenticated response
returns ticketAccessToken and ticketAccessExpiresAt alongside allowlisted booking and
ticket data. Expiry is event end/start plus seven days; undated events use 24 hours.
Expired event access returns 410 rather than creating an eternal guest token.

Webhook-first completion sends no bearer token in the webhook response. The browser
uses /ticket-access with its original still-valid checkout header. Confirm retries on
an already-confirmed booking follow the same exchange path. Same-tab reloads must
retain the checkout or ticket token. A lost response can be retried for a NEW grant;
previous plaintext tokens are never recovered or exposed, and prior successful
browser/email grants are not revoked. Guest exchanges are bounded to 20 per checkout
grant and its original expiry. Expired/revoked/version-invalid checkout grants are
never revived. GET confirmed QR data still requires a TICKET grant or verified owner;
checkout authority works only for the narrow exchange.

Legacy bare-ID requests stay denied. Verified already-linked owners can exchange
without possessing an old guest token; unlinked guests need the separate verified
recovery/email phase. Existing OTP claiming behavior is unchanged. No production
bookings, historical payments or QR identities were migrated or rotated.

## Post-commit notifications: explicit at-most-once boundary

No email/network side effects run inside a retried financial transaction. After
commit, an atomic PENDING -> CLAIMED booking notification transition allows one send
attempt through the existing, unchanged email implementation. Duplicate callbacks,
webhooks and exchanges cannot claim it twice. Successful sends become SENT; failures
become FAILED. Interrupted/uncertain CLAIMED/FAILED attempts are NOT retried
automatically: exactly-once external delivery cannot be guaranteed without provider
idempotency. A crash after claim may therefore leave an undelivered email requiring
reconciliation. Pending jobs can be claimed on a later authenticated retry/webhook.

A future email phase must add durable worker scheduling, safe retry/provider
idempotency, independent email TICKET grants and fragment-link delivery. Existing
QR attachments are preserved, but old ID-only email links remain unauthorized. The
frontend phase must persist/send checkout tokens, store returned ticket tokens,
implement /ticket-access retries, attach cookies with allowed Origin for owner
mutations, and remove booking/payment/token/QR payload logs. Scanner code is unchanged.

## Verification

Run from server:

    node --test test/bookingAccess.test.js test/bookingResponse.test.js test/bookingAccess.middleware.test.js test/bookingSerialization.test.js test/bookingAccess.http.test.js test/bookingCreation.mongo.test.js test/paymentSecurity.http.test.js test/paymentSecurity.unit.test.js test/paymentSecurity.mongo.test.js

HTTP tests use real Express routing/auth/CSRF/controllers/service/fulfillment with a
fake provider, ephemeral signing material and a serialized transactional test store.
They cover signatures, provider amount/currency/status/association checks, concurrent
order creation and confirmation, browser-first/webhook-first handoff, transaction
retries/rollback, revocation during provider calls, ownership/CSRF, notification claims,
late captures and safe serializers. They do not prove MongoDB transaction semantics.
The optional MongoDB concurrency test uses only credential-free localhost:27017 and a
fresh random badvenu_phase2b_test_<hex> database, verifies real transactions when a
replica set is available, and removes only that isolated database. It explicitly skips
on standalone/unavailable MongoDB. A separate database test verifies concurrent
notification claiming even on standalone MongoDB. No test loads .env files, uses configured gateway
credentials, calls Razorpay, sends email or accesses application/production records.

Provider field references:
- https://github.com/razorpay/razorpay-node/blob/master/documents/order.md
- https://github.com/razorpay/razorpay-node/blob/master/documents/payment.md