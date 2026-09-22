CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY NOT NULL,
  visited_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  path TEXT NOT NULL,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device_type TEXT,
  language TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS visits_visited_at_idx ON visits (visited_at);
