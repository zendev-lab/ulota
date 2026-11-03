CREATE TABLE personal_inventory (
  user_id TEXT NOT NULL REFERENCES users(id),
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY(user_id, record_id)
);
CREATE INDEX personal_inventory_order ON personal_inventory(user_id, updated_at DESC, record_id ASC);
CREATE TABLE personal_operation_receipts (
  user_id TEXT NOT NULL REFERENCES users(id),
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, operation_id)
);
