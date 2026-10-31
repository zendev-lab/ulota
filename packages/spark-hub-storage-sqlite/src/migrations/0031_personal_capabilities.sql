CREATE TABLE personal_capability_settings (
  user_id TEXT NOT NULL REFERENCES users(id),
  capability TEXT NOT NULL CHECK (capability IN ('inventory', 'todos', 'subscriptions')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  PRIMARY KEY(user_id, capability)
);
CREATE TABLE personal_session_grants (
  user_id TEXT NOT NULL REFERENCES users(id),
  binding_id TEXT NOT NULL REFERENCES personal_bindings(id),
  session_id TEXT NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN ('inventory', 'todos', 'subscriptions')),
  can_write INTEGER NOT NULL CHECK (can_write IN (0, 1)),
  PRIMARY KEY(binding_id, session_id, capability)
);
CREATE TABLE personal_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  binding_id TEXT NOT NULL REFERENCES personal_bindings(id),
  runtime_id TEXT NOT NULL REFERENCES runtime_connections(id),
  created_at TEXT NOT NULL
);
