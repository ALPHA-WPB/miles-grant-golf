-- Today's pin (cup) position per hole, set by an admin standing at the cup. Everyone's yardages and
-- the flag use it until it's set again or reset (no row = middle of the green).
CREATE TABLE IF NOT EXISTS pins (
  hole        INTEGER PRIMARY KEY CHECK (hole BETWEEN 1 AND 18),
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  accuracy_m  REAL,
  set_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  set_by      TEXT
);
