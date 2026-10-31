import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  createId,
  type PersonalCapability,
  type PersonalBinding,
} from "@zendev-lab/spark-protocol";
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
    .all(userId) as {
    id: string;
    runtimeId: string;
    localOwnerId: string | null;
    createdAt: string;
    revokedAt: string | null;
  }[];
}

export function requireActiveUser(db: DatabaseSync, userId: string) {
  if (!db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(userId)) {
    throw new PersonalAccessError("unauthorized", "An active personal user is required.");
  }
}

export function setPersonalCapability(
  db: DatabaseSync,
  userId: string,
  capability: PersonalCapability,
  enabled: boolean,
) {
  requireActiveUser(db, userId);
  db.prepare(`INSERT INTO personal_capability_settings (user_id, capability, enabled) VALUES (?, ?, ?)
    ON CONFLICT(user_id, capability) DO UPDATE SET enabled = excluded.enabled`).run(
    userId,
    capability,
    Number(enabled),
  );
}

export function listPersonalCapabilities(db: DatabaseSync, userId: string): PersonalCapability[] {
  requireActiveUser(db, userId);
  return (
    db
      .prepare(
        "SELECT capability FROM personal_capability_settings WHERE user_id = ? AND enabled = 1 ORDER BY capability",
      )
      .all(userId) as { capability: PersonalCapability }[]
  ).map((row) => row.capability);
}

export function requirePersonalCapability(
  db: DatabaseSync,
  userId: string,
  capability: PersonalCapability,
) {
  if (!listPersonalCapabilities(db, userId).includes(capability))
    throw new PersonalAccessError("disabled", "Personal capability is disabled.");
}

export function grantPersonalSession(
  db: DatabaseSync,
  userId: string,
  input: {
    bindingId: string;
    sessionId: string;
    capability: PersonalCapability;
    canWrite: boolean;
  },
) {
  requireActiveUser(db, userId);
  const binding = db
    .prepare(
      "SELECT runtime_id AS runtimeId FROM personal_bindings WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND credential_hash IS NOT NULL",
    )
    .get(input.bindingId, userId) as { runtimeId: string } | undefined;
  if (!binding)
    throw new PersonalAccessError("forbidden", "An active personal binding is required.");
  const projection = db
    .prepare(
      "SELECT record_json AS payload FROM runtime_session_projections WHERE runtime_id = ? AND session_id = ?",
    )
    .get(binding.runtimeId, input.sessionId) as { payload: string } | undefined;
  if (!projection)
    throw new PersonalAccessError("forbidden", "Session must be present on the bound daemon.");
  const session = JSON.parse(projection.payload);
  if (
    session.scope?.kind !== "workspace" ||
    session.purpose === "channel" ||
    session.bindings?.some((entry: { kind: string }) => entry.kind === "channel")
  ) {
    throw new PersonalAccessError("forbidden", "Channel sessions cannot access personal data.");
  }
  db.prepare(`INSERT INTO personal_session_grants (user_id, binding_id, session_id, capability, can_write) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(binding_id, session_id, capability) DO UPDATE SET can_write = excluded.can_write`).run(
    userId,
    input.bindingId,
    input.sessionId,
    input.capability,
    Number(input.canWrite),
  );
}

export function revokePersonalSession(
  db: DatabaseSync,
  userId: string,
  bindingId: string,
  sessionId: string,
  capability: PersonalCapability,
) {
  requireActiveUser(db, userId);
  db.prepare(
    "DELETE FROM personal_session_grants WHERE user_id = ? AND binding_id = ? AND session_id = ? AND capability = ?",
  ).run(userId, bindingId, sessionId, capability);
}

export function authorizePersonalSession(
  db: DatabaseSync,
  binding: PersonalBinding,
  sessionId: string,
  capability: PersonalCapability,
  write: boolean,
) {
  if (
    !db
      .prepare(
        "SELECT id FROM personal_bindings WHERE id = ? AND user_id = ? AND runtime_id = ? AND revoked_at IS NULL AND credential_hash IS NOT NULL",
      )
      .get(binding.id, binding.userId, binding.runtimeId) ||
    !userHasDaemonGrant(db, { userId: binding.userId, runtimeId: binding.runtimeId })
  ) {
    throw new PersonalAccessError("forbidden", "Personal binding is no longer active.");
  }
  requirePersonalCapability(db, binding.userId, capability);
  if (
    db
      .prepare(
        "SELECT session_id FROM personal_sessions WHERE user_id = ? AND binding_id = ? AND session_id = ?",
      )
      .get(binding.userId, binding.id, sessionId)
  )
    return;
  const grant = db
    .prepare(`SELECT can_write AS canWrite FROM personal_session_grants
    WHERE binding_id = ? AND user_id = ? AND session_id = ? AND capability = ?`)
    .get(binding.id, binding.userId, sessionId, capability) as { canWrite: number } | undefined;
  if (!grant || (write && !grant.canWrite))
    throw new PersonalAccessError(
      "forbidden",
      "This session does not have the required personal capability permission.",
    );
}

export function listPersonalSessionGrants(db: DatabaseSync, userId: string) {
  return db
    .prepare(`SELECT binding_id AS bindingId, session_id AS sessionId, capability, can_write AS canWrite
    FROM personal_session_grants WHERE user_id = ? ORDER BY session_id, capability`)
    .all(userId) as {
    bindingId: string;
    sessionId: string;
    capability: PersonalCapability;
    canWrite: number;
  }[];
}

export { personalSessionOwner } from "./personal-session-ownership.ts";

export function revokePersonalBindingCredential(db: DatabaseSync, token: string) {
  const row = db
    .prepare("SELECT id FROM personal_bindings WHERE credential_hash = ?")
    .get(hashSecret(token)) as { id: string } | undefined;
  if (!row) throw new PersonalAccessError("unauthorized", "Personal credential is invalid.");
  db.prepare("UPDATE personal_bindings SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(
    new Date().toISOString(),
    row.id,
  );
  return { revoked: true };
}
