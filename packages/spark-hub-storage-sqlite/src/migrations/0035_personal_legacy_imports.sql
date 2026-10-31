CREATE TABLE personal_legacy_imports (
 user_id TEXT NOT NULL REFERENCES users(id), capability TEXT NOT NULL CHECK(capability IN ('inventory','todos','subscriptions')),
 legacy_id TEXT NOT NULL, record_id TEXT NOT NULL, source_hash TEXT NOT NULL, imported_at TEXT NOT NULL,
 PRIMARY KEY(user_id,capability,legacy_id), UNIQUE(user_id,capability,record_id)
);
