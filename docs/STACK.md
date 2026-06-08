# Why TypeScript

The app is TypeScript end to end: the UI, the API, and the agent orchestration all live in one Next.js codebase. This was a deliberate choice over the more common Python agent stack. Here is the reasoning, honestly, including where Python would win.

## What drove the decision

1. **One language across the whole stack.** The customer chat, the admin dashboard, the API routes, and the LangGraph agent are the same codebase, the same types, and one deploy artifact. A Python agent would mean a second service to build, deploy, and keep in sync with the TypeScript frontend, plus a network hop between them. For a single product slice, that overhead buys nothing.

2. **The type system catches agent-wiring bugs at compile time.** Tool input schemas, the structured-output decision shape, and the graph state are all typed. A mismatch between what a tool returns and what a node expects is a compile error, not a runtime surprise three tool calls deep. For agent code, where the failure modes are subtle, that is worth a lot.

3. **LangGraph.js and the LangChain ecosystem are first-class in TypeScript.** `StateGraph`, `ToolNode`, `withStructuredOutput`, and the provider clients (`@langchain/anthropic`, `@langchain/openai`) are all native. Nothing about the agent needed Python.

4. **It ships as one Node artifact.** Standalone Next output runs in a single container or on Vercel with no second runtime, no Python version pinning, and no polyglot dependency story.

## Pros and cons, honestly

| | TypeScript | Python |
|---|---|---|
| Full-stack in one language | yes | no (needs a JS frontend) |
| Compile-time types across the agent | strong | gradual (mypy/pydantic, opt-in) |
| Agent frameworks | LangGraph.js, LangChain | LangGraph, LangChain, plus more |
| Eval / experimentation tooling | thinner | much richer (see below) |
| Data and ML libraries | thin | the whole ecosystem (pandas, numpy, sklearn) |
| Deploy shape | one Node artifact | a service, often a second one |

The single honest weakness is the **experimentation and eval ecosystem**: Python has more of it.

## Where Python would earn its place

The right pattern is to keep the serving app in TypeScript and add Python only as an **offline or sidecar tool**, never in the request path:

- **Automatic prompt optimization.** DSPy (compiling and optimizing prompts and few-shot examples against a metric) is Python-only and has no real TypeScript equivalent. If we wanted to optimize the agent's prompts against the adversarial suite rather than hand-tune them, a Python DSPy job run offline against the same cases is the clean way to do it.
- **Heavier eval harnesses.** LangSmith (used here for the hosted eval) works from TypeScript. But DeepEval and RAGAS, and richer statistical eval tooling, are Python. A Python eval sidecar that reads the same `tests/adversarial/cases.json` and writes a report would fit without touching the app.
- **Data and ML work.** Anything involving pandas/numpy analysis of traces, training a small classifier (for example, to replace the heuristic input screen or the AUTO router with a learned model), or embeddings pipelines is far easier in Python.

In each case Python would be a **separate process** that talks to this app through files or a small API, and runs asynchronously. The serving app stays TypeScript so the product remains one deployable, type-checked codebase.
