CREATE TABLE personal_todos (
user_id TEXT NOT NULL REFERENCES users(id), record_id TEXT NOT NULL,
revision INTEGER NOT NULL CHECK(revision > 0), updated_at TEXT NOT NULL, record_json TEXT NOT NULL,
PRIMARY KEY(user_id, record_id)
);
CREATE INDEX personal_todos_order ON personal_todos(user_id, updated_at DESC, record_id ASC);
