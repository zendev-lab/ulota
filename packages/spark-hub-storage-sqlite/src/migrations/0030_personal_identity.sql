CREATE TABLE personal_bindings (
  id TEXT PRIMARY KEY,
  hub_instance_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  runtime_id TEXT NOT NULL REFERENCES runtime_connections(id),
  local_owner_id TEXT,
  pairing_hash TEXT UNIQUE,
  pairing_expires_at TEXT NOT NULL,
  credential_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX personal_binding_active_runtime ON personal_bindings(runtime_id)
  WHERE revoked_at IS NULL;
