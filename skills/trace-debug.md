---
name: trace-debug
description: Debug a wrong or failed agent decision from its trace. Use when asked why the agent denied, approved, or escalated, or to debug a specific run.
---

# Debug a run

Follow `docs/DEBUGGING.md`. In short:

1. Get the run id, from `/admin/traces` or the link on the chat reply.
2. Pull the timeline: `GET /api/runs/<id>`, or query `agent_trace_events` directly.
3. Read the `propose` event (the model's decision) and the `guard` event (whether the engine overrode it).
4. Expand the tool I/O to see what the agent actually looked at.
5. Reproduce with `npm run smoke` or by arming a `FAULT_INJECT` fault, fix, and re-run.
