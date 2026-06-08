# Architecture

The app is three layers with hard directory boundaries. The boundary is the design: the UI never imports the agent, the API is the only caller of the orchestration layer, and the policy engine has no knowledge of the model or the framework.

```
UI            src/app (pages), src/components        chat + admin pages
API           src/app/api                            route handlers
Orchestration src/agent, src/policy                  LangGraph graph + policy engine
Data          src/db                                 SQLite wrapper, schema, trace store
```

## A single turn

```
POST /api/chat
  -> runAgent()
       screen      flag manipulation patterns (heuristic, non-blocking)
       agent       call tools to gather the customer, order, and policy
       tools       lookup_customer | get_order | get_policy | check_eligibility
       propose     structured decision from the model (retry on invalid output)
       guard       re-check the decision against the deterministic engine
       respond     return the final, guard-approved message
  -> { runId, decision, message, amount, citations }
```

`agent` and `tools` loop until the model stops requesting tools. `propose` then asks for a decision that matches a fixed schema. `guard` re-runs the engine and overrides the model when they disagree.

## The policy engine is the source of truth

`src/policy/engine.ts` is pure and deterministic. It takes an order, a customer, a request, and a clock, runs every rule, and resolves an outcome by precedence: a denial outranks an escalation, which outranks an approval. It does no I/O and calls no model, so it is fully unit tested on its own.

The rules (`src/policy/rules.ts`) each cite the policy clause they enforce:

- §2.1 final-sale items are never refundable (deny)
- §2.2 the order must be within the 30-day return window (deny)
- §2.3 the order must exist and belong to the customer (deny)
- §3.1 refunds over $500 require human escalation (escalate)
- §3.2 customers with three or more prior refunds are escalated (escalate)
- §3.3 the refund is capped at the amount paid (enforced as a cap, not a denial)

## The guard

The model proposes a decision and explains it. The guard (`policyGuard` in `src/agent/graph.ts`) re-runs the engine against the order actually resolved during the run and the customer id the request was made for, never the model's restatement of either. If the engine disagrees with the model, the engine wins and the response is rebuilt from the engine's verdict. The model cannot produce an approval the engine forbids, so pleading and prompt injection cannot move the outcome.

## Provider-agnostic models

`src/agent/model-factory.ts` picks Anthropic or OpenAI by whichever key is present and builds a model per role: a capable model for the decision loop, a cheap one for the input screen. The decision model is overridable with `AGENT_MODEL`. Cost is computed from each call's token usage against `src/obs/pricing.ts`.

## Observability

Every node and tool writes a trace event through `src/obs/trace.ts` into `agent_runs` and `agent_trace_events`. The admin dashboard reads exactly what the trace writes. When a LangSmith key is present, the same runs also stream to LangSmith. Logs are structured pino with a `module` field per subsystem.

## Failure handling

`src/faults` holds the error taxonomy (recoverable, validation, provider, policy-violation, fatal) and a fault-injection switch (`FAULT_INJECT`) that is off by default. Nodes are wrapped so failures are classified and recorded rather than swallowed: validation failures re-prompt, provider errors can fail over, and the customer always receives a safe message.

## Data

`src/db/index.ts` exposes a small async query surface (`get`, `all`, `run`, `exec`) over SQLite and seeds the CRM tables from `seed/customers.json` on first run, so a fresh clone needs no migration step. The same surface would back a networked database without changing any call site.
