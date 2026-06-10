# Refund Support Agent

An e-commerce refund agent where the model never gets the final say. A customer chats; an LLM reasons over their order and the written refund policy and proposes a decision with the policy clauses that justify it; a deterministic engine in code re-checks every verdict and overrides the model when they disagree. You can plead, threaten a chargeback, or claim to be the CEO. The engine doesn't care.

Two surfaces: a customer chat, and a password-gated admin backend with aggregate metrics, a waterfall trace of every run, a red-team playground (canned captures or live), the policy document with live editing, a CRM records explorer (add, edit, delete, reset to seed), and a model face-off that runs one request across every configured provider.

**Live demo:** [refund-support-agent.vercel.app](https://refund-support-agent.vercel.app) — the chat is open, the admin is password-gated. It runs serverless there, so trace history resets on cold starts; clone and run locally for the full persistent dashboard.

## Run it

```bash
npm install
cp .env.example .env        # add one provider key (Anthropic, OpenAI, or OpenRouter)
npm run dev
```

http://localhost:3000/chat is the customer chat. http://localhost:3000/admin is the backend (local default password: `admin`). The database creates and seeds itself from `seed/` on first run; one model API key is the only required configuration.

## How a turn runs

```
pick model -> screen -> agent (tool loop) -> propose decision -> policy guard -> respond
```

Three layers with hard boundaries: UI (`src/app`, `src/components`), API (`src/app/api`), and orchestration (`src/agent`, `src/policy`), a LangGraph state machine plus the policy engine.

The agent gathers facts through read-only tools: `lookup_customer` returns the customer with their orders on file (so it can identify the order a customer means without demanding an id), `get_order` and `check_eligibility` cover the rest, and `get_policy` fetches the policy text, whole document or a single clause. The policy is never pasted into every prompt; the model reads it when it needs it, and every read is a traced event.

`propose decision` returns one of four states as schema-validated JSON: `approve`, `deny`, `escalate`, or `needs_info` when the agent is still gathering information. `reasoning` and `citations` are required fields, so the rationale and clause references are structured output, never text scraped from prose. Output that fails validation triggers a re-prompt.

`policy guard` re-runs the deterministic engine and overrides the model when they disagree. A `needs_info` turn grants nothing, and resolves to a refusal when the input screen flagged a manipulation attempt. Full diagrams in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Holding the policy line

The policy lives in two places that stay in sync: a readable document (`seed/refund-policy.md`) the model cites, and code rules (`src/policy`) that decide. The model proposes; the engine disposes. Final-sale items are never refundable. Refunds over $500 always route to a human. Three or more prior refunds, same. Those are checks in code, not lines in a prompt, which is why pleading, fake authority, and prompt injection move the tone of the reply but never the verdict.

## Break it on purpose

Failures are classified, not just caught. Rate limits, overloads, server errors, and billing exhaustion (an out-of-credits 400) all count as provider failures: the run retries, fails over to the next configured provider mid-turn, and records the swap in the trace with its reason. Malformed structured output re-prompts instead. `FAULT_INJECT` arms any of these on demand, chaos-testing style, so every recovery path gets watched firing rather than assumed. [docs/DEBUGGING.md](docs/DEBUGGING.md) has the fault list and two worked debugging examples; one of them is a real provider outage that exposed a real classification bug.

## What gets recorded

Every run lands in a local SQLite trace store and renders at `/admin/traces` as a waterfall: per-step latency, each tool's input and output, retries with reasons, the model and routing reason, screen flags, and the guard's model-vs-engine verdict, plus tokens and cost per run (a typical turn is a few seconds and about a penny). The chat streams the same events live while a turn runs, and `/admin` aggregates everything into run counts, the red-team pass rate, decision mix, latency, and cost. A LangSmith key adds hosted traces; without one the local dashboard stands alone.

## Test it

- `npm test`: 25 unit tests across the policy engine, AUTO router, model factory, output guard, fault classification, and history conversion. No API key needed.
- `npm run stress`: runs the agent against `tests/adversarial/cases.json`, 15 red-team cases (pleading, fake authority, prompt injection, forged orders, limit coaxing). Set `FAULT_INJECT` to exercise a failure path at the same time.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: the static gates. CI runs all of it plus Playwright end-to-end on every push.

## Score it

With a LangSmith key, `npm run eval` pushes the adversarial cases as a LangSmith dataset and scores four metrics with run-over-run history: `correct_verdict`, `held_the_line`, `cited_policy`, `no_prompt_leak`. Without a key it exits cleanly; `npm run stress` is the same suite scored locally.

## Configuration and secrets

One model API key is the only required secret. `.env.example` is the tracked template; `.env` (gitignored) holds real values.

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | one of them | model provider, chosen by which key is present |
| `AGENT_MODEL` | no | force a model, overriding the selector and the AUTO router |
| `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` | no | hosted tracing and `npm run eval` |
| `FAULT_INJECT` | no | arm fault injection |
| `ADMIN_PASSWORD`, `SESSION_SECRET` | production | admin login and session signing |
| `PORT` | no | server port (default 3000) |

Local runs, scripts, and Docker read `.env` (Compose loads it via `env_file`). Vercel takes them in Project Settings → Environment Variables. CI needs no secrets; if a workflow step ever calls a model, it gets a repository secret referenced as `${{ secrets.ANTHROPIC_API_KEY }}`, never a value in the repo.

## Ship it

```bash
docker compose up --build        # builds, reads .env, persists the db in a named volume
```

Or without Compose: `docker build -t refund-support-agent . && docker run -p 3000:3000 --env-file .env refund-support-agent`. It also runs as a plain Node server (`npm run build && npm start`) on any host, and deploys to Vercel as serverless functions, where the database lives in `/tmp` and trace history resets on cold starts.

## Docs

- [Architecture](docs/ARCHITECTURE.md): the layers, the graph, routing, guardrails, and the admin gate, with diagrams.
- [Debugging a run](docs/DEBUGGING.md): tracing a wrong decision to its root cause, twice.
- [Why TypeScript](docs/STACK.md): the stack decision, and when Python would earn a place.

## Where things live

```
seed/              synthetic CRM data, the refund policy, captured demo scenarios
src/policy/        deterministic policy engine and rules
src/agent/         LangGraph graph, nodes, tools, router, model factory
src/db/            SQLite wrapper, schema, trace store
src/obs/           trace sink, pricing, logging
src/faults/        fault injection and the error taxonomy
src/app/           Next.js routes and API handlers
src/components/    React components
tests/             adversarial fixtures used by stress and eval
```
