# Refund Support Agent

A customer-support agent that handles e-commerce refund requests. It reads a written refund policy, looks up the customer and their orders, and decides to approve, deny, or escalate, or asks for what it still needs. Refund decisions are enforced by a deterministic policy engine, so the model can explain and reason but cannot be talked into breaking a rule.

The app has two surfaces: a customer chat to test the agent, and an admin dashboard with aggregate metrics, a waterfall trace of every run's reasoning and tool calls, a scenario playground that replays the red-team suite, a live-editable view of the CRM records the agent reads, and a model face-off that runs one request across every configured provider.

## Quickstart

```bash
npm install
cp .env.example .env        # add one provider key (Anthropic, OpenAI, or OpenRouter)
npm run dev
```

Open http://localhost:3000/chat for the customer chat. The admin backend (overview metrics, the playground and scenario runner, traces, policy, records, and the model face-off) is at http://localhost:3000/admin and is password-protected; the local default password is `admin`.

The database seeds itself from `seed/` on first run. The only required configuration is one model API key.

## How it works

The request flows through three layers with hard boundaries:

- **UI** (`src/app`, `src/components`): the chat and the admin pages.
- **API** (`src/app/api`): route handlers that run the agent and serve trace data.
- **Orchestration** (`src/agent`, `src/policy`): a LangGraph state machine plus the policy engine.

A single turn runs:

```
pick model -> screen -> agent (tool loop) -> propose decision -> policy guard -> respond
```

The agent calls read-only tools to fetch the customer (with their orders on file), the order, and the policy, so it can identify the order a customer means without demanding an id. `propose decision` asks the model for a structured decision: `approve`, `deny`, `escalate`, or `needs_info` when it is still gathering information. `policy guard` re-checks refund decisions against the deterministic engine and overrides the model if they disagree; a `needs_info` turn grants nothing and resolves to a refusal when the input screen flagged a manipulation attempt. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full diagram.

The app has two surfaces: a clean customer chat (`/chat`, AUTO model, with the acting customer's CRM card and a live reasoning strip) and a password-protected admin backend (`/admin`: overview, playground, traces, policy, records, face-off).

## Holding the policy line

The policy lives in two places that stay in sync: a readable document (`seed/refund-policy.md`) and a set of code rules (`src/policy`). The rules are the source of truth.

The model proposes; the engine disposes. If a customer pleads, claims to be the CEO, or tells the agent to ignore its instructions, the model still cannot produce an approval the engine forbids, because the guard rebuilds the decision from the engine's verdict. Final-sale items are never refundable. Refunds over the escalation limit always route to a human. Those are checks in code, not lines in a prompt.

## Observability

Every run records to a local trace store and renders at `/admin/traces` as a waterfall: per-step latency, each tool's input and output, retries, the model routing reason, screen flags, and the guard's model-vs-engine verdict. The chat streams the same events live while a turn runs, and `/admin` aggregates them into run counts, the red-team pass rate, decision mix, latency, and cost. If a LangSmith key is set, the same runs also stream to LangSmith for the full hosted trace and dataset evals. Without a key, the local dashboard works on its own.

## Testing

- `npm test` runs the unit suite. The policy engine, AUTO router, model factory, output guard, fault classification, and chat-history conversion need no API key.
- `tests/adversarial/cases.json` holds the red-team cases (pleading, fake authority, prompt injection, forged orders).
- `npm run stress` runs the agent against those cases. Set `FAULT_INJECT` to exercise a specific failure path.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` are the static gates (also run in CI).

## Evals

With a LangSmith key, `npm run eval` pushes the adversarial cases as a LangSmith dataset and scores the agent on `correct_verdict`, `held_the_line`, `cited_policy`, and `no_prompt_leak`, with run-over-run history. Without a key it exits cleanly, and `npm run stress` runs the same cases locally.

## Configuration and secrets

The only required secret is one model API key. Real keys are never committed: `.env.example` is the tracked template, and `.env` (gitignored) holds the real values.

```bash
cp .env.example .env   # then fill in ANTHROPIC_API_KEY (or OPENAI_API_KEY / OPENROUTER_API_KEY)
```

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | yes (one) | model provider, chosen by which key is present |
| `AGENT_MODEL` | no | force a model, overriding the selector and the AUTO router |
| `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` | no | hosted tracing and `npm run eval` |
| `FAULT_INJECT` | no | inject faults to exercise recovery |
| `PORT` | no | server port (default 3000) |

Where each environment reads its secrets:

- **Local app, local scripts, and Docker** read `.env`. Docker Compose loads it through `env_file`.
- **Vercel:** Project Settings → Environment Variables, or `vercel env add ANTHROPIC_API_KEY`. Never put keys in the repo.
- **GitHub Actions:** the CI here runs typecheck, lint, format, and the pure engine tests, so it needs no secrets. If you add a step that calls a model, store the key as a repository secret (Settings → Secrets and variables → Actions → New repository secret) and reference it as `${{ secrets.ANTHROPIC_API_KEY }}`. The app never reads secrets from the repo; the runtime injects them.

## Docker

```bash
cp .env.example .env   # fill in one provider key before running Compose
docker compose up --build
```

Builds the image, reads `.env`, and persists the database in a named volume. Then open http://localhost:3000/chat. Without Compose:

```bash
docker build -t refund-support-agent .
docker run -p 3000:3000 --env-file .env refund-support-agent
```

## Deploy

Runs as a normal Node server (`npm run build && npm start`) on any container host with no code changes, and ships a Dockerfile for container platforms. On Vercel it runs as serverless functions: the database uses `/tmp`, so trace history resets on cold starts. Set `ANTHROPIC_API_KEY` (or another provider key) as an environment variable in the deploy.

## Docs

- [Architecture](docs/ARCHITECTURE.md): the layers, the graph, model routing, guardrails, and the admin gate, with diagrams.
- [Debugging a run](docs/DEBUGGING.md): tracing a wrong decision to its root cause.
- [Why TypeScript](docs/STACK.md): the stack decision, and when Python would earn a place.

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
tests/             adversarial fixtures used by stress and eval scripts
```
