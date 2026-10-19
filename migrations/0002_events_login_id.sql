-- Failed codes are counted per login id (lockout) and per email (ceiling). Additive.
ALTER TABLE events ADD COLUMN login_id TEXT;
CREATE INDEX events_kind_login ON events (kind, login_id, at);
