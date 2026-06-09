/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS gen script run via node */
/*
 * Build seed/demo-scenarios.json: the adversarial cases plus a pre-canned agent
 * response captured from the most recent real run of each case. The demo runner
 * replays these without an API call (deterministic, key-free), or you can switch
 * a turn to the live agent. Re-run after `npm run stress` to refresh the canned
 * responses.
 *
 *   node scripts/build-demo-scenarios.cjs
 */
const Database = require('better-sqlite3');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();
const db = new Database(join(root, 'data', 'refund-agent.sqlite'), { readonly: true });
const cases = JSON.parse(
  readFileSync(join(root, 'tests', 'adversarial', 'cases.json'), 'utf8'),
).cases;

function parse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const scenarios = cases.map((c) => {
  const conversationId = `stress-${c.id}`;
  const run = db
    .prepare(
      `SELECT id, decision FROM agent_runs
        WHERE conversation_id = ? ORDER BY started_at_ms DESC LIMIT 1`,
    )
    .get(conversationId);

  let message = '';
  let citations = [];
  if (run) {
    const respond = db
      .prepare(
        `SELECT output_json FROM agent_trace_events
          WHERE run_id = ? AND node = 'respond' ORDER BY seq DESC LIMIT 1`,
      )
      .get(run.id);
    const respondOut = respond && parse(respond.output_json);
    if (respondOut && typeof respondOut.message === 'string') message = respondOut.message;

    // Citations: the proposed decision carries policyCitations; if the guard
    // overrode the decision it carries the authoritative citations, so prefer those.
    const propose = db
      .prepare(
        `SELECT output_json FROM agent_trace_events
          WHERE run_id = ? AND node = 'propose' AND kind = 'node' ORDER BY seq DESC LIMIT 1`,
      )
      .get(run.id);
    const proposeOut = propose && parse(propose.output_json);
    if (proposeOut && Array.isArray(proposeOut.policyCitations))
      citations = proposeOut.policyCitations;

    const guard = db
      .prepare(
        `SELECT output_json FROM agent_trace_events
          WHERE run_id = ? AND kind = 'guard' ORDER BY seq DESC LIMIT 1`,
      )
      .get(run.id);
    const guardOut = guard && parse(guard.output_json);
    if (guardOut && Array.isArray(guardOut.citations) && guardOut.citations.length) {
      citations = guardOut.citations;
    }
  }

  return {
    id: c.id,
    persona: c.persona,
    customerId: c.customerId,
    customerMessage: c.message,
    expected: c.expect,
    note: c.note,
    canned: {
      decision: run?.decision ?? c.expect,
      message: message || 'No pre-canned response captured yet. Run npm run stress.',
      citations,
    },
  };
});

writeFileSync(
  join(root, 'seed', 'demo-scenarios.json'),
  JSON.stringify(
    {
      generatedNote: 'Pre-canned demo responses captured from real agent runs (npm run stress).',
      scenarios,
    },
    null,
    2,
  ) + '\n',
);

console.log(`wrote ${scenarios.length} scenarios to seed/demo-scenarios.json`);
const withCanned = scenarios.filter(
  (s) => s.canned.citations.length || s.canned.message.length > 60,
);
console.log(`  ${withCanned.length} have a captured canned response`);
