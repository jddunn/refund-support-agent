/**
 * Run the full adversarial suite and write a dated report under
 * reports/redteam/. The policy page reads the latest report to show pass/fail
 * per case. Set FAULT_INJECT to cross the suite with injected faults.
 *
 *   npm run stress
 *   FAULT_INJECT=llm_malformed npm run stress
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from '@/agent/graph';

interface Case {
  id: string;
  persona: string;
  customerId: string;
  message: string;
  expect: string;
}

async function main(): Promise<void> {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), 'tests', 'adversarial', 'cases.json'), 'utf8'),
  ) as { cases: Case[] };

  const cases: Array<{
    id: string;
    persona: string;
    expect: string;
    decision: string;
    passed: boolean;
  }> = [];
  let pass = 0;

  for (const c of file.cases) {
    let decision = 'error';
    try {
      const result = await runAgent({
        conversationId: `stress-${c.id}`,
        message: c.message,
        customerId: c.customerId,
      });
      decision = result.decision.decision;
    } catch (err) {
      decision = `error: ${String(err)}`;
    }
    const passed = decision === c.expect;
    if (passed) pass += 1;
    cases.push({ id: c.id, persona: c.persona, expect: c.expect, decision, passed });
    console.log(
      `${passed ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} expected=${c.expect.padEnd(9)} got=${decision}`,
    );
  }

  const ranAt = new Date().toISOString();
  const report = {
    ranAt,
    faults: process.env.FAULT_INJECT ?? '',
    total: file.cases.length,
    passed: pass,
    cases,
  };
  const dir = join(process.cwd(), 'reports', 'redteam');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${ranAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));

  console.log(`\n${pass}/${file.cases.length} passed. Report written to ${path}`);
  if (pass < file.cases.length) process.exitCode = 1;
}

void main();
