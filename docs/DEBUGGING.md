# Debugging a run

Every customer turn is recorded as a run you can inspect. This is how to go from "the agent gave the wrong answer" to a root cause and a fix.

## Where the signal is

- **Admin dashboard** (`/admin/traces`): the run list, and per run a timeline of every node and tool with its input, output, retries, tokens, cost, and latency. Start here.
- **Trace store** (SQLite, `data/refund-agent.sqlite`): the same data, queryable. `agent_runs` is one row per turn; `agent_trace_events` is the ordered timeline.
- **Logs** (pino, JSON lines on stdout): structured, filterable by `module`. Pipe through `pino-pretty` for a readable view.
- **LangSmith** (optional): if `LANGSMITH_API_KEY` is set, the full hosted trace, with the model waterfall and token counts per call.

## The method

1. Find the run. In `/admin/traces` it is the most recent entry, or filter by decision. From the chat, each agent reply links to its own run.
2. Read the timeline top to bottom. The nodes run `screen → agent → tools → propose → guard → respond`. The `propose` event holds the model's structured decision; the `guard` event shows whether the engine overrode it.
3. Compare the proposal to the guard. If the engine and the model disagreed, the guard event says `overridden: true` with the clauses that applied. If they agreed, the model's decision already matched policy.
4. Inspect the tool I/O. Expand `get_order`, `lookup_customer`, and `check_eligibility` to see exactly what the agent looked at. A wrong decision usually traces to a tool that returned something unexpected, or a step the agent skipped.
5. Reproduce. Re-run the same message and customer through `npm run smoke` or a direct call, or arm a fault with `FAULT_INJECT` to force a specific failure path.

## Querying the trace store directly

```bash
sqlite3 data/refund-agent.sqlite \
  "SELECT e.seq, e.node, e.kind, substr(e.output_json,1,200)
     FROM agent_trace_events e JOIN agent_runs r ON e.run_id = r.id
    WHERE r.conversation_id = 'stress-serial-refunder'
    ORDER BY e.seq;"
```

## Worked example: a wrong escalation

The adversarial suite caught a real one. The `serial-refunder` case (a customer with four prior refunds) returned `deny`, but policy says escalate (§3.2).

The trace showed the cause in two events:

```
propose | {"decision":"deny","orderId":null,"reasoning":"The customer has not provided their account information..."}
guard   | {"overridden":false}
```

Two problems were visible at once:

1. The model said the customer had not identified themselves. The customer id lived in the run's state but was never put in front of the model, so it could not look up the customer's prior-refund count and defaulted to a denial.
2. The guard only re-validated when the model included an `orderId`. The model left it null, so the deterministic check was skipped and the wrong denial passed through.

The fix addressed both: the customer id is now stated to the model in the system prompt (the guard still trusts only the run's customer id, never the model's restatement), and the guard re-validates against the order actually resolved by the tools during the run, independent of what the model reported. After the fix the case escalates, and the full suite passes.

This is the loop in miniature: a failing case, a trace that named the failed step, a root cause, a fix, and a re-run to confirm.

## Forcing failures

`FAULT_INJECT` arms specific faults so you can exercise the recovery paths on demand. Each armed fault fires once per process, which lets the follow-up retry or failover recover instead of hitting the same injected error forever:

```bash
FAULT_INJECT=llm_malformed npm run stress   # force a malformed decision -> retry
FAULT_INJECT=provider_500 npm run stress     # force a provider error -> failover if another provider key is set
FAULT_INJECT=rate_limit npm run stress       # force a rate limit -> failover if another provider key is set
FAULT_INJECT=tool_timeout npm run stress     # force tool calls to fail
FAULT_INJECT=db_locked npm run stress        # force CRM reads to fail while trace writes still work
```

Each armed fault shows up in the trace as a `retry` or `error` event on the node that hit it, so you can confirm the recovery behaved as intended.
