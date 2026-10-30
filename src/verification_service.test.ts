import assert from "node:assert/strict";
import { resendRequest } from "./verification_service.ts";

const valid = resendRequest.safeParse({
  orderId: "order-1042",
  verificationId: "sms-77",
  customerEmail: "creator@example.com",
  fulfillmentState: "packed",
});
assert.equal(valid.success, true);
assert.equal(resendRequest.safeParse({ ...valid.data, fulfillmentState: "cancelled" }).success, false);
console.log("packed orders accept a resend request; cancelled orders do not");
