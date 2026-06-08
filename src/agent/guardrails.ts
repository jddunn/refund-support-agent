/**
 * Output guardrails. These are defense-in-depth on top of the deterministic
 * policy guard, which is the real protection against policy violations. They
 * keep the reply on topic and stop it from echoing the system prompt, even if a
 * model is coaxed into trying.
 */

const LEAK_MARKERS = [
  'you are a customer support agent',
  'follow the written refund policy',
  'system prompt',
  'these instructions',
  'hold the line',
];

const SAFE_REPLY =
  "I can only help with refund requests for your orders, and I can't share anything else. How can I help with a refund?";

/** Replace the reply with a safe one if it appears to leak the prompt. */
export function guardOutput(message: string): { message: string; blocked: boolean } {
  const lower = message.toLowerCase();
  const leaked = LEAK_MARKERS.some((marker) => lower.includes(marker));
  return leaked ? { message: SAFE_REPLY, blocked: true } : { message, blocked: false };
}
