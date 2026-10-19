-- Site D1 `site`: customer preview sign-up, email-OTP login, sessions.
-- Times are unix seconds. Emails are stored trimmed + lowercased.

CREATE TABLE users (
  id TEXT PRIMARY KEY,                -- usr_<hex>, the userId passed to EdgeCustomerRPC
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- Owner-approved emails. Login codes are only ever sent to these.
CREATE TABLE preview_allowlist (
  email TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',  -- plan new projects start on
  approved_at INTEGER NOT NULL,
  request_id TEXT
);

CREATE TABLE signup_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,                 -- requested: free | starter | pro
  company TEXT,
  note TEXT,
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX signup_requests_status ON signup_requests (status, created_at);
CREATE INDEX signup_requests_email ON signup_requests (email);

-- One live code per email. code_hash = HMAC-SHA256(OTP_PEPPER, login_id:code).
CREATE TABLE otp_codes (
  login_id TEXT PRIMARY KEY,          -- nonce in the HttpOnly login_id cookie
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX otp_codes_email ON otp_codes (email);

-- token_hash = SHA-256 of the 32-byte cookie token; the token itself is never stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Throttle + audit counters: otp_sent, otp_fail, login_req, signup_req, mail.
-- `subject` is an email (or lid:<login_id> for unknown login ids).
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  subject TEXT,
  ip TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX events_kind_subject ON events (kind, subject, at);
CREATE INDEX events_kind_ip ON events (kind, ip, at);
CREATE INDEX events_kind_at ON events (kind, at);
