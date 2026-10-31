import { describe, expect, it } from "vitest";
import { migrate, openMemoryDatabase } from "@zendev-lab/spark-hub-storage-sqlite";
import { hashSecret } from "./security.ts";
import {
  authenticatePersonalBinding,
  createPersonalBinding,
  redeemPersonalBinding,
  revokePersonalBinding,
  revokePersonalBindingCredential,
  setPersonalCapability,
  listPersonalCapabilities,
  grantPersonalSession,
  authorizePersonalSession,
  revokePersonalSession,
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

it("keeps personal capabilities disabled by default and gates workspace access independently", () => {
  const db = fixture();
  try {
    const pairing = createPersonalBinding(db, {
      userId: "alice",
      runtimeId: "device-a",
      hubInstanceId: "hub-one",
    });
    const bound = redeemPersonalBinding(db, pairing.token, "local", "device-a", "device-a-runtime");
    expect(listPersonalCapabilities(db, "alice")).toEqual([]);
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", false)).toThrow();
    setPersonalCapability(db, "alice", "inventory", true);
    db.prepare(`INSERT INTO runtime_session_projections (runtime_id, session_id, scope, lifecycle, placement, activity, lifetime, lineage_origin_kind, record_json, projected_at)
      VALUES ('device-a', 'work', 'daemon', 'open', 'active', 'idle', 'persistent', 'root', ?, ?)`).run(
      JSON.stringify({
        scope: { kind: "workspace", workspaceId: "project" },
        purpose: "interactive",
        bindings: [],
      }),
      new Date().toISOString(),
    );
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", false)).toThrow();
    grantPersonalSession(db, "alice", {
      bindingId: bound.id,
      sessionId: "work",
      capability: "inventory",
      canWrite: false,
    });
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", false)).not.toThrow();
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", true)).toThrow();
    expect(() =>
      grantPersonalSession(db, "bob", {
        bindingId: bound.id,
        sessionId: "work",
        capability: "inventory",
        canWrite: true,
      }),
    ).toThrow();
    grantPersonalSession(db, "alice", {
      bindingId: bound.id,
      sessionId: "work",
      capability: "inventory",
      canWrite: true,
    });
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", true)).not.toThrow();
    revokePersonalSession(db, "alice", bound.id, "work", "inventory");
    expect(() => authorizePersonalSession(db, bound, "work", "inventory", false)).toThrow();
    db.prepare(
      "UPDATE runtime_session_projections SET record_json = ? WHERE session_id = 'work'",
    ).run(JSON.stringify({ purpose: "channel", bindings: [] }));
    expect(() =>
      grantPersonalSession(db, "alice", {
        bindingId: bound.id,
        sessionId: "work",
        capability: "inventory",
        canWrite: true,
      }),
    ).toThrow();
    db.prepare(
      "INSERT INTO personal_sessions (session_id, user_id, binding_id, runtime_id, created_at) VALUES ('private', 'alice', ?, 'device-a', ?)",
    ).run(bound.id, new Date().toISOString());
    expect(() => authorizePersonalSession(db, bound, "private", "inventory", true)).not.toThrow();
    setPersonalCapability(db, "alice", "inventory", false);
    expect(() => authorizePersonalSession(db, bound, "private", "inventory", false)).toThrow();
  } finally {
    db.close();
  }
});

it("can confirm revocation while an account is disabled, without restoring old credentials", () => {
  const db = fixture();
  try {
    const pairing = createPersonalBinding(db, {
      userId: "alice",
      runtimeId: "device-a",
      hubInstanceId: "hub-one",
    });
    const bound = redeemPersonalBinding(db, pairing.token, "local", "device-a", "device-a-runtime");
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = 'alice'").run();
    expect(revokePersonalBindingCredential(db, bound.token)).toEqual({ revoked: true });
    expect(revokePersonalBindingCredential(db, bound.token)).toEqual({ revoked: true });
    db.prepare("UPDATE users SET status = 'active' WHERE id = 'alice'").run();
    expect(() => authenticatePersonalBinding(db, bound.token)).toThrow();
    expect(() => revokePersonalBindingCredential(db, "wrong")).toThrow();
  } finally {
    db.close();
  }
});
