# Architecture

The app is three layers with hard directory boundaries. The boundary is the design: the UI never imports the agent, the API is the only caller of the orchestration layer, and the policy engine has no knowledge of the model or the framework.

```
UI            src/app (pages), src/components        chat + admin pages
API           src/app/api                            route handlers
Orchestration src/agent, src/policy                  LangGraph graph + policy engine
Data          src/db                                 SQLite wrapper, schema, trace store
```

## A single turn

```mermaid
flowchart LR
  A[POST /api/chat] --> M[pick model]
  M --> S[screen]
  S --> AG[agent]
  AG -->|tool calls| T[tools]
  T --> AG
  AG -->|done| P[propose decision]
  P --> G[POLICY GUARD]
  G --> R[respond + output guard]
  R --> O[decision, message, citations]
```

`pick model` chooses from the admin selector or the AUTO router. `agent` and `tools` loop until the model stops requesting tools. `propose` asks for a decision that matches a fixed schema, retrying on invalid output. `guard` re-runs the deterministic engine and overrides the model when they disagree. `respond` applies the output guardrail and returns the final, guard-approved message.

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

## Models and routing

The model layer spans three providers and an AUTO router.

- `src/agent/models.ts` is the catalog: the selectable options and which providers have a key.
- `src/agent/model-factory.ts` builds a model for a turn. Provider is chosen by which key is present (Anthropic, then OpenAI, then OpenRouter); OpenRouter is reached through the OpenAI client pointed at its endpoint, so one key covers many models.
- `src/agent/router.ts` is the AUTO router. The deterministic guard enforces policy regardless of model, so AUTO is a cost-and-quality optimization, not a safety mechanism: it spends a stronger model only on requests that look harder or adversarial, and records the reason in the trace.

```mermaid
flowchart TD
  C{model choice} -->|a model id| D[build that model]
  C -->|openrouter/auto| E[OpenRouter picks]
  C -->|auto| R[difficulty router]
  R -->|injection / long / multi-turn| ST[strong: Opus 4.8]
  R -->|otherwise| FA[fast: Sonnet 4.6]
```

`AGENT_MODEL` overrides everything. The model selector lives only in the admin playground; consumers always run AUTO. Cost is computed from each call's token usage against `src/obs/pricing.ts`, and the chosen model plus the routing reason are recorded as a trace event.

## Guardrails

Three layers, in order of strength:

1. **Input screen** (`src/agent/screen.ts`): cheap heuristics flag manipulation (instruction override, role injection, prompt exfiltration, fake authority). Non-blocking; it annotates the trace and feeds the router.
2. **Policy guard** (the deterministic engine): the real protection. The model cannot emit an approval the engine forbids, so policy violations are stopped structurally, not by prompt wording.
3. **Output guard** (`src/agent/guardrails.ts`): a final check that the reply does not echo the system prompt, replacing it with a safe message if it does.

This is deliberately not a general guardrails framework. For a narrow policy domain a deterministic engine is stronger and more auditable than a model-based guard that can itself be prompted around. A heavier framework (content moderation, PII redaction) would be added only if the surface widened beyond refunds.

## Admin and access

Two route groups:

- **Consumer** (`/`, `/chat`): the customer chat. AUTO model, no operator controls.
- **Admin** (`/admin/*`): traces, the policy and red-team view, and the model playground.

```mermaid
flowchart LR
  U[request] --> MW{admin path?}
  MW -->|no| PG[serve]
  MW -->|yes| SE{valid session?}
  SE -->|yes| PG
  SE -->|no| LO[redirect to /login]
```

`src/middleware.ts` gates every `/admin` path. Login posts the password to `/api/admin/login`, which compares it in constant time (`src/server/password.ts`) and sets a short-lived signed session cookie (`src/server/session.ts`: an HS256 JWT via jose, HttpOnly and Secure in production). The password lives in `ADMIN_PASSWORD`; for a multi-user system you would store a per-user salted hash instead.

## Observability

Every node and tool writes a trace event through `src/obs/trace.ts` into `agent_runs` and `agent_trace_events`. The admin dashboard reads exactly what the trace writes. When a LangSmith key is present, the same runs also stream to LangSmith. Logs are structured pino with a `module` field per subsystem.

## Failure handling

`src/faults` holds the error taxonomy (recoverable, validation, provider, policy-violation, fatal) and a fault-injection switch (`FAULT_INJECT`) that is off by default. Nodes are wrapped so failures are classified and recorded rather than swallowed: validation failures re-prompt, provider errors can fail over, and the customer always receives a safe message.

## Data

`src/db/index.ts` exposes a small async query surface (`get`, `all`, `run`, `exec`) over SQLite and seeds the CRM tables from `seed/customers.json` on first run, so a fresh clone needs no migration step. The same surface would back a networked database without changing any call site.
