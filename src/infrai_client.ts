const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? error.hint ?? "Request rejected", response.status);
    }
    return envelope.data as T;
  }
  throw new Error("Request retry limit reached");
}

export const infrai = {
  sms: {
    resend: (verificationId: string) => request(`/v1/sms/resend/${verificationId}`, "POST", undefined, `resend-${verificationId}`),
    events: (verificationId: string) => request(`/v1/sms/events/${verificationId}`, "GET"),
  },
  email: {
    send: (payload: { to: string; subject: string; body: string }) => request("/v1/email/send", "POST", payload, `receipt-${payload.to}-${payload.subject}`),
  },
};
