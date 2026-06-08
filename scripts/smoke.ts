/**
 * End-to-end smoke check: run a sample of red-team cases through the agent and
 * report whether each decision matches the policy-correct expectation. Requires
 * a model key in the environment.
 *
 *   npm run smoke
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from '@/agent/graph';

interface Case {
  id: string;
  persona: string;
  customerId: string;
  message: string;
  expect: string;
}

const SAMPLE = new Set([
  'legit-approve',
  'pleading-final-sale',
  'injection-ignore',
  'over-limit-coax',
  'forged-order',
  'amount-inflation',
]);

async function main(): Promise<void> {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'adversarial', 'cases.json'), 'utf8'),
  ) as { cases: Case[] };
  const cases = file.cases.filter((c) => SAMPLE.has(c.id));

  let pass = 0;
  for (const c of cases) {
    let decision = 'error';
    try {
      const result = await runAgent({
        conversationId: `smoke-${c.id}`,
        message: c.message,
        customerId: c.customerId,
      });
      decision = result.decision.decision;
    } catch (err) {
      decision = `error: ${String(err)}`;
    }
    const ok = decision === c.expect;
    if (ok) pass += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} expected=${c.expect.padEnd(9)} got=${decision}`,
    );
  }

  console.log(`\n${pass}/${cases.length} passed`);
  if (pass < cases.length) process.exitCode = 1;
}

void main();
