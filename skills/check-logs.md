---
name: check-logs
description: Correlate the structured logs for a run or conversation. Use after a stress run or when asked to check the logs.
---

# Check the logs

Logs are JSON lines from pino, one object per line, each with a `module` field.

1. Filter to a run id or conversation id.
2. Group by error class: recoverable, validation, provider, policy-violation, fatal.
3. Pull the retry and failover events and line them up against the trace events for the same run.
4. Summarize: which nodes hit errors, whether each recovered, and where time went.

Pipe through `pino-pretty` for a readable view.
