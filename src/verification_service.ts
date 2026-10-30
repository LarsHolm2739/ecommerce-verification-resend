import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai_client.ts";

export const resendRequest = z.object({
  orderId: z.string().min(1),
  verificationId: z.string().min(1),
  customerEmail: z.string().email(),
  fulfillmentState: z.enum(["paid", "packed", "shipped"]),
});

export type ResendRequest = z.infer<typeof resendRequest>;

export async function resendStuckCode(input: ResendRequest) {
  const parsed = resendRequest.parse(input);
  const resend = await infrai.sms.resend(parsed.verificationId);
  const events = await infrai.sms.events(parsed.verificationId);
  const receipt = await infrai.email.send({
    to: parsed.customerEmail,
    subject: `Order ${parsed.orderId} verification update`,
    body: `Your order is ${parsed.fulfillmentState}. Verification delivery state: ${JSON.stringify(events)}.`,
  });
  return { orderId: parsed.orderId, fulfillmentState: parsed.fulfillmentState, resend, delivery: events, receipt };
}

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/orders/verification/resend") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "route not found" }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const result = await resendStuckCode(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error instanceof InfraiError ? Math.max(400, error.status) : 500;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "request failed" }));
    }
  });
  server.listen(port, () => console.log(`verification service listening on ${port}`));
  return server;
}

if (process.argv[1]?.endsWith("verification_service.ts")) startServer();
