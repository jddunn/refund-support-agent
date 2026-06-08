---
name: inspect-run
description: Render one run's full trace as a readable report. Use when asked to inspect a run or show what the agent did.
---

# Inspect a run

1. Fetch the run: `GET /api/runs/<id>` returns the run summary and its ordered events.
2. Render the timeline: each event's node, kind, input, output, retries, and latency.
3. Highlight the decision, the guard outcome (overridden or not), and the token and cost totals.
4. Flag the first failed or retried node, if any.
