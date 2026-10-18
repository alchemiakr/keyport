CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  expected_owner TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tailnet TEXT NOT NULL,
  name TEXT NOT NULL,
  token_cipher TEXT NOT NULL,
  token_saved_at TEXT NOT NULL,
  token_expires_on TEXT,
  verified_at TEXT NOT NULL,
  verification_result TEXT NOT NULL,
  UNIQUE(profile_id, tailnet)
);
CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  key_id TEXT,
  expires_at TEXT,
  outcome TEXT NOT NULL
);
CREATE INDEX audit_requested_at ON audit(requested_at);
CREATE TABLE rate_limits (
  id TEXT PRIMARY KEY,
  next_at INTEGER NOT NULL
);
