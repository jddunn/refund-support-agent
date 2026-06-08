# Refund Support Agent

A customer-support agent that handles e-commerce refund requests. It reads a written refund policy, looks up the customer and order, and decides to approve, deny, or escalate. The decision is enforced by a deterministic policy engine, so the model can explain and reason but cannot be talked into breaking a rule.

The app has two surfaces: a customer chat to test the agent, and an admin dashboard that shows every run's reasoning, tool calls, retries, token cost, and latency.

## Quickstart

```bash
npm install
cp .env.example .env        # add one provider key (Anthropic or OpenAI)
npm run dev
```

Open http://localhost:3000/chat to talk to the agent, and http://localhost:3000/admin/traces to watch what it did.

The database seeds itself from `seed/` on first run. The only configuration is one API key.

## How it works

The request flows through three layers with hard boundaries:

- **UI** (`src/app`, `src/components`): the chat and the admin pages.
- **API** (`src/app/api`): route handlers that run the agent and serve trace data.
- **Orchestration** (`src/agent`, `src/policy`): a LangGraph state machine plus the policy engine.

A single turn runs:

```
screen -> classify -> gather (tool calls) -> propose decision -> policy guard -> respond
```

`gather` calls read-only tools to fetch the customer, the order, and the policy. `propose decision` asks the model for a structured decision. `policy guard` re-checks that decision against the deterministic engine and overrides it if they disagree.

## Holding the policy line

The policy lives in two places that stay in sync: a readable document (`seed/refund-policy.md`) and a set of code rules (`src/policy`). The rules are the source of truth.

The model proposes; the engine disposes. If a customer pleads, claims to be the CEO, or tells the agent to ignore its instructions, the model still cannot produce an approval the engine forbids, because the guard rebuilds the decision from the engine's verdict. Final-sale items are never refundable. Refunds over the escalation limit always route to a human. Those are checks in code, not lines in a prompt.

## Observability

Every run records to a local trace store and renders at `/admin/traces`: the node timeline, each tool's input and output, retries, tokens, cost, and latency. If a LangSmith key is set, the same runs also stream to LangSmith for the full hosted trace and dataset evals. Without a key, the local dashboard works on its own.

## Testing

- `npm test` runs the unit suite. The policy engine and the guard are pure and need no API key.
- `tests/adversarial/cases.json` holds the red-team cases (pleading, fake authority, prompt injection, forged orders).
- `npm run stress` runs the agent against those cases crossed with injected faults.

## Evals

With a LangSmith key, `npm run eval` pushes the adversarial cases as a LangSmith dataset and scores the agent on `correct_verdict`, `held_the_line`, `cited_policy`, and `no_prompt_leak`, with run-over-run history. Without a key it exits cleanly, and `npm run stress` runs the same cases locally.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | yes (one) | model provider |
| `AGENT_MODEL` | no | override the decision-loop model |
| `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` | no | hosted tracing and evals |
| `FAULT_INJECT` | no | inject faults to exercise recovery |

## Docs

- [Architecture](docs/ARCHITECTURE.md) covers the layers, the graph, and the guard.
- [Debugging a run](docs/DEBUGGING.md) covers tracing a wrong decision to its root cause.

## Project layout

```
seed/              synthetic CRM data + the refund policy
src/policy/        deterministic policy engine and rules
src/agent/         LangGraph graph, nodes, tools, model factory
src/db/            SQLite wrapper, schema, trace store
src/obs/           trace sink, pricing, logging
src/faults/        fault injection and the error taxonomy
src/app/           Next.js routes and API handlers
src/components/     React components
tests/             unit, adversarial, and end-to-end tests
```
