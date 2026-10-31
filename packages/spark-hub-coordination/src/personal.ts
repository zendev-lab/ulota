import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createId, type PersonalBinding } from "@zendev-lab/spark-protocol";
import { authenticateRuntimeAccessToken } from "./runtime-registration.ts";
import { hashSecret } from "./security.ts";
import { userHasDaemonGrant } from "./hub-access.ts";

export class PersonalAccessError extends Error {
  readonly code: "unauthorized" | "forbidden" | "disabled" | "conflict";
  constructor(code: PersonalAccessError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function createPersonalBinding(
  db: DatabaseSync,
  input: {
    userId: string;
    runtimeId: string;
    hubInstanceId: string;
  },
  now = new Date(),
) {
  requireActiveUser(db, input.userId);
  if (!userHasDaemonGrant(db, { userId: input.userId, runtimeId: input.runtimeId })) {
    throw new PersonalAccessError("forbidden", "Daemon access is required to bind personal data.");
  }
  const active = db
    .prepare("SELECT id FROM personal_bindings WHERE runtime_id = ? AND revoked_at IS NULL")
    .get(input.runtimeId);
  if (active)
    throw new PersonalAccessError("conflict", "Revoke the previous personal binding first.");
  const id = createId("pb");
  const token = `ulota_pair_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  db.prepare(`INSERT INTO personal_bindings
    (id, hub_instance_id, user_id, runtime_id, pairing_hash, pairing_expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    input.hubInstanceId,
    input.userId,
    input.runtimeId,
    hashSecret(token),
    expiresAt,
    now.toISOString(),
  );
  return { id, token, expiresAt };
}

export function redeemPersonalBinding(
  db: DatabaseSync,
  token: string,
  localOwnerId: string,
  runtimeId: string,
  runtimeToken: string,
  now = new Date(),
) {
  authenticateRuntimeAccessToken(db, runtimeId, runtimeToken, now.toISOString());
  const row = db
    .prepare(`SELECT id, hub_instance_id AS hubInstanceId, user_id AS userId,
    runtime_id AS runtimeId FROM personal_bindings WHERE runtime_id = ? AND pairing_hash = ?
    AND pairing_expires_at > ? AND revoked_at IS NULL AND credential_hash IS NULL`)
    .get(runtimeId, hashSecret(token), now.toISOString()) as
    | Omit<PersonalBinding, "localOwnerId">
    | undefined;
  if (!row)
    throw new PersonalAccessError("unauthorized", "Personal pairing code is invalid or expired.");
  requireActiveUser(db, row.userId);
  if (!userHasDaemonGrant(db, { userId: row.userId, runtimeId: row.runtimeId })) {
    throw new PersonalAccessError("forbidden", "Personal binding no longer has daemon access.");
  }
  const credential = `ulota_personal_${randomBytes(32).toString("base64url")}`;
  const changed = db
    .prepare(`UPDATE personal_bindings SET local_owner_id = ?, credential_hash = ?, pairing_hash = NULL
    WHERE id = ? AND credential_hash IS NULL AND revoked_at IS NULL`)
    .run(localOwnerId, hashSecret(credential), row.id);
  if (changed.changes !== 1)
    throw new PersonalAccessError("conflict", "Pairing code has already been used.");
  return { ...row, localOwnerId, token: credential };
}

export function authenticatePersonalBinding(db: DatabaseSync, token: string): PersonalBinding {
  const row = db
    .prepare(`SELECT id, hub_instance_id AS hubInstanceId, user_id AS userId,
    runtime_id AS runtimeId, local_owner_id AS localOwnerId FROM personal_bindings
    WHERE credential_hash = ? AND revoked_at IS NULL`)
    .get(hashSecret(token)) as PersonalBinding | undefined;
  if (!row)
    throw new PersonalAccessError("unauthorized", "Personal binding is invalid or revoked.");
  requireActiveUser(db, row.userId);
  if (!userHasDaemonGrant(db, { userId: row.userId, runtimeId: row.runtimeId })) {
    throw new PersonalAccessError("forbidden", "Personal binding no longer has daemon access.");
  }
  return row;
}

export function revokePersonalBinding(db: DatabaseSync, userId: string, id: string) {
  requireActiveUser(db, userId);
  return (
    db
      .prepare(
        `UPDATE personal_bindings SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .run(new Date().toISOString(), id, userId).changes === 1
  );
}

export function listPersonalBindings(db: DatabaseSync, userId: string) {
  requireActiveUser(db, userId);
  return db
    .prepare(`SELECT id, runtime_id AS runtimeId, local_owner_id AS localOwnerId,
    created_at AS createdAt, revoked_at AS revokedAt FROM personal_bindings WHERE user_id = ? ORDER BY created_at, id`)
    .all(userId);
}

export function requireActiveUser(db: DatabaseSync, userId: string) {
  if (!db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(userId)) {
    throw new PersonalAccessError("unauthorized", "An active personal user is required.");
  }
}
