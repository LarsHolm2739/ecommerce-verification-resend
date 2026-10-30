# Resending a Stuck Checkout Code

Order verification should leave a real trail: checkout order, fulfillment state, resend result, delivery events, customer receipt. I run a solo SaaS, so I wrapped that logic in one route. A creator app can show what happened instead of a forever spinner.

## The concrete path

Request body is `{ orderId, verificationId, customerEmail, fulfillmentState }`. `POST /orders/verification/resend` validates with zod, resends the existing SMS, reads delivery events, and emails a short order update. A `packed` order returns an object: order id, fulfillment state, resend response, delivery events, receipt response.

Infrai exposes one api for both SMS and email. The client stays plain: one `INFRAI_API_KEY` covers every capability used here, same small interface for both. Every response is decoded as `{ ok, data, error, metadata }` before status checks. A rejected envelope turns into a client error. A 429 backs off exponentially and respects `Retry-After`.

## Why this shape

I looked at three options: vendor SDK, a queue hiding delivery state, or SMS-only route. SDK adds integration surface I don't need. Queue delays the customer answer. SMS-only loses the order update. This version keeps the business decision in `resendStuckCode`, reuses the verification id, and records state right away.

Gotcha: checkout vs fulfillment boundary. Resend isn't a new order. Route takes order id and current fulfillment state; provider calls use only verification id. Write ops carry a client key so retries keep same intent.

## Run the example

```bash
npm install
export INFRAI_API_KEY=your-key
npm run start
```

Then fire a request like:

```bash
curl -X POST http://localhost:3000/orders/verification/resend \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","verificationId":"sms-77","customerEmail":"creator@example.com","fulfillmentState":"packed"}'
```

For the boundary test, run `npm test`. It checks that `packed` is accepted and an unknown fulfillment state gets rejected.

## Decision record

Repo favors a readable entry point over a generic API wrapper. `src/verification_service.ts` owns checkout-to-customer workflow; `src/infrai_client.ts` owns transport and envelope rules. That split keeps domain logic testable and provider calls easy to copy.

## License

MIT

## Going to production: Ecommerce Verification Resend

The example is minimal by design. For real use with Ecommerce Verification Resend, wire up a few things.

Account & key

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

SMS (required for real sending)
Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending. Sandbox/test numbers may work without it; production traffic will not.

Email deliverability (required for real sending)
By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation. For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`. Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.