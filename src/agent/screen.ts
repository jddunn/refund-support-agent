/**
 * A cheap heuristic screen for common manipulation patterns. It does not block
 * the conversation; it only annotates the trace so attempts are visible in the
 * admin dashboard. The real defense against breaking policy is the deterministic
 * guard, not this screen.
 */
const PATTERNS: Array<{ flag: string; re: RegExp }> = [
  {
    flag: 'instruction_override',
    re: /\b(ignore|disregard|forget)\b.*\b(instruction|rule|policy|prompt)/i,
  },
  { flag: 'role_injection', re: /\byou are now\b|\bact as\b|\bnew (persona|role)\b/i },
  {
    flag: 'prompt_exfiltration',
    re: /\b(system prompt|your instructions|reveal your|repeat your)\b/i,
  },
  {
    flag: 'fake_authority',
    re: /\b(i am|i'm|this is)\s+(the\s+)?(ceo|manager|owner|admin|supervisor|founder)\b/i,
  },
  { flag: 'urgency_pressure', re: /\b(right now|immediately|emergency|urgent|asap)\b/i },
];

/** Return the flags raised for a message (empty when nothing matches). */
export function screenInput(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.flag);
}
