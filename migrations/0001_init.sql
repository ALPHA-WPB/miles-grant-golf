PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One row per linked sign-in method (Google 'sub', Apple 'sub').
CREATE TABLE identities (
  provider     TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider, provider_id)
);
CREATE INDEX identities_user ON identities(user_id);

-- id is the SHA-256 of the cookie token, so a leaked table can't be replayed.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE rounds (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'in_progress',
  round_type  TEXT NOT NULL DEFAULT 'all18',
  join_code   TEXT UNIQUE,
  start_time  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  end_time    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX rounds_status ON rounds(status);

CREATE TABLE round_players (
  id             TEXT PRIMARY KEY,
  round_id       TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id),
  tee_selection  TEXT DEFAULT 'White',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (round_id, user_id)
);
CREATE INDEX round_players_user ON round_players(user_id);

CREATE TABLE scores (
  id               TEXT PRIMARY KEY,
  round_player_id  TEXT NOT NULL REFERENCES round_players(id) ON DELETE CASCADE,
  hole_number      INTEGER NOT NULL,
  strokes          INTEGER,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (round_player_id, hole_number)
);

CREATE TABLE friends (
  id            TEXT PRIMARY KEY,
  requester_id  TEXT NOT NULL REFERENCES users(id),
  receiver_id   TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (requester_id, receiver_id)
);

CREATE TABLE round_invites (
  id               TEXT PRIMARY KEY,
  round_id         TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  invited_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by       TEXT REFERENCES users(id),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX round_invites_user ON round_invites(invited_user_id, status);
