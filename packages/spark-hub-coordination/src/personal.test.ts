import { describe, expect, it } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { hashSecret } from "./security.ts";
import {
  authenticatePersonalBinding,
  createPersonalBinding,
  redeemPersonalBinding,
  revokePersonalBinding,
} from "./personal.ts";

function fixture() {
  const db = openMemoryDatabase();
  migrate(db);
  const now = new Date().toISOString();
  for (const id of ["alice", "bob"])
    db.prepare(`INSERT INTO users (id, display_name, role, status, created_at, updated_at)
    VALUES (?, ?, 'owner', 'active', ?, ?)`).run(id, id, now, now);
  for (const id of ["device-a", "device-b"]) {
    db.prepare(
      `INSERT INTO runtime_connections (id, name, status, created_at, updated_at) VALUES (?, ?, 'online', ?, ?)`,
    ).run(id, id, now, now);
    db.prepare(`INSERT INTO daemon_credentials (id, runtime_id, kind, token_hash, scopes_json, created_at)
      VALUES (?, ?, 'access', ?, '["runtime:connect"]', ?)`).run(
      id,
      id,
      hashSecret(id + "-runtime"),
      now,
    );
    db.prepare(
      `INSERT INTO user_daemon_grants (user_id, runtime_id, granted_by_user_id, created_at) VALUES ('alice', ?, 'alice', ?)`,
    ).run(id, now);
  }
  return db;
}

describe("personal device binding", () => {
  it("binds two devices to one user without exposing secrets or allowing replay", () => {
    const db = fixture();
    try {
      for (const runtimeId of ["device-a", "device-b"]) {
        const pairing = createPersonalBinding(db, {
          userId: "alice",
          runtimeId,
          hubInstanceId: "hub-one",
        });
        expect(() =>
          redeemPersonalBinding(db, pairing.token, "local", runtimeId, "wrong"),
        ).toThrow();
        const bound = redeemPersonalBinding(
          db,
          pairing.token,
          "local",
          runtimeId,
          runtimeId + "-runtime",
        );
        expect(authenticatePersonalBinding(db, bound.token)).toMatchObject({
          userId: "alice",
          runtimeId,
          localOwnerId: "local",
          hubInstanceId: "hub-one",
        });
        expect(() =>
          redeemPersonalBinding(db, pairing.token, "local", runtimeId, runtimeId + "-runtime"),
        ).toThrow();
        const stored = JSON.stringify(
          db.prepare("SELECT * FROM personal_bindings WHERE id = ?").get(bound.id),
        );
        expect(stored).not.toContain(bound.token);
        expect(stored).not.toContain(pairing.token);
        expect(revokePersonalBinding(db, "bob", bound.id)).toBe(false);
        expect(revokePersonalBinding(db, "alice", bound.id)).toBe(true);
        expect(() => authenticatePersonalBinding(db, bound.token)).toThrow();
      }
    } finally {
      db.close();
    }
  });
  it("rejects missing device grants, cross-device pairing, expiry and disabled users", () => {
    const db = fixture();
    try {
      expect(() =>
        createPersonalBinding(db, {
          userId: "bob",
          runtimeId: "device-a",
          hubInstanceId: "hub-one",
        }),
      ).toThrow();
      const pairing = createPersonalBinding(db, {
        userId: "alice",
        runtimeId: "device-a",
        hubInstanceId: "hub-one",
      });
      expect(() =>
        redeemPersonalBinding(db, pairing.token, "local", "device-b", "device-b-runtime"),
      ).toThrow();
      expect(() =>
        redeemPersonalBinding(
          db,
          pairing.token,
          "local",
          "device-a",
          "device-a-runtime",
          new Date(Date.now() + 700_000),
        ),
      ).toThrow();
      const bound = redeemPersonalBinding(
        db,
        pairing.token,
        "local",
        "device-a",
        "device-a-runtime",
      );
      db.prepare("UPDATE users SET status = 'disabled' WHERE id = 'alice'").run();
      expect(() => authenticatePersonalBinding(db, bound.token)).toThrow();
    } finally {
      db.close();
    }
  });
  it("requires revocation before rebinding, without transferring the previous owner", () => {
    const db = fixture();
    try {
      const pairing = createPersonalBinding(db, {
        userId: "alice",
        runtimeId: "device-a",
        hubInstanceId: "hub-one",
      });
      expect(() =>
        createPersonalBinding(db, {
          userId: "alice",
          runtimeId: "device-a",
          hubInstanceId: "hub-one",
        }),
      ).toThrow();
      revokePersonalBinding(db, "alice", pairing.id);
      const next = createPersonalBinding(db, {
        userId: "alice",
        runtimeId: "device-a",
        hubInstanceId: "hub-one",
      });
      expect(next.id).not.toBe(pairing.id);
    } finally {
      db.close();
    }
  });
});

it("revoking a device grant invalidates pairing and existing personal credentials", () => {
  const db = fixture();
  try {
    const pairing = createPersonalBinding(db, {
      userId: "alice",
      runtimeId: "device-a",
      hubInstanceId: "hub-one",
    });
    const bound = redeemPersonalBinding(db, pairing.token, "local", "device-a", "device-a-runtime");
    const pending = createPersonalBinding(db, {
      userId: "alice",
      runtimeId: "device-b",
      hubInstanceId: "hub-one",
    });
    db.prepare("UPDATE user_daemon_grants SET revoked_at = ? WHERE user_id = 'alice'").run(
      new Date().toISOString(),
    );
    expect(() => authenticatePersonalBinding(db, bound.token)).toThrow();
    expect(() =>
      redeemPersonalBinding(db, pending.token, "local", "device-b", "device-b-runtime"),
    ).toThrow();
  } finally {
    db.close();
  }
});
