-- CRM tables. Seeded from seed/customers.json the first time the database is empty.
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  since         TEXT NOT NULL,
  prior_refunds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  item         TEXT NOT NULL,
  category     TEXT NOT NULL,
  price        REAL NOT NULL,
  final_sale   INTEGER NOT NULL DEFAULT 0,
  purchased_at TEXT NOT NULL,
  status       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- Trace tables. Written by the trace sink, read by the admin dashboard.
CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  customer_id     TEXT,
  decision        TEXT,
  status          TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL NOT NULL DEFAULT 0,
  latency_ms      INTEGER NOT NULL DEFAULT 0,
  started_at_ms   INTEGER NOT NULL,
  ended_at_ms     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON agent_runs(started_at_ms DESC);

CREATE TABLE IF NOT EXISTS agent_trace_events (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id),
  seq         INTEGER NOT NULL,
  node        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  input_json  TEXT,
  output_json TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  at_ms       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_run ON agent_trace_events(run_id, seq);
