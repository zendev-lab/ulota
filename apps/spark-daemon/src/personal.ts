import { readFileSync, existsSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  resolveSparkPaths,
  writePrivateFile,
  type SparkPaths,
} from "@zendev-lab/spark-platform-node";
import {
  personalStoredCredentialSchema,
  personalServerUrlSchema,
  personalBoundCredentialSchema,
  personalDeviceAccessSchema,
  personalOperationResultSchema,
  type PersonalCapability,
} from "@zendev-lab/spark-protocol";
import { readSparkDaemonConfig } from "./config.ts";
import { getSparkDaemonServerProfile } from "./server-profiles.ts";
import { SparkDaemonControlError } from "./control-error.ts";

const bindingFile = (paths: SparkPaths) => join(paths.dataDir, "personal-binding.json");
export function readPersonalCredential(paths: SparkPaths) {
  if (!existsSync(bindingFile(paths))) return undefined;
  return personalStoredCredentialSchema.parse(JSON.parse(readFileSync(bindingFile(paths), "utf8")));
}
export async function bindPersonalHub(
  paths: SparkPaths,
  serverUrl: string,
  token: string,
  fetchFn = fetch,
) {
  serverUrl = personalServerUrlSchema.parse(serverUrl);
  const config = readSparkDaemonConfig(paths);
  const profile = getSparkDaemonServerProfile(paths, serverUrl);
  if (!profile?.runtimeId || !profile.runtimeToken)
    throw new SparkDaemonControlError(
      "personal_unbound",
      "Register this daemon with the Hub before personal pairing.",
    );
  if (readPersonalCredential(paths))
    throw new SparkDaemonControlError(
      "personal_binding_exists",
      "Unbind the previous personal account first.",
    );
  const response = await fetchFn(new URL("/api/v1/personal/bindings/redeem", serverUrl), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      localOwnerId: config.localOwnerId,
      runtimeId: profile.runtimeId,
      runtimeToken: profile.runtimeToken,
    }),
  });
  if (!response.ok)
    throw new SparkDaemonControlError(
      "personal_pairing_failed",
      `Personal pairing failed: HTTP ${response.status}.`,
    );
  const bound = personalBoundCredentialSchema.parse(await response.json());
  if (bound.runtimeId !== profile.runtimeId || bound.localOwnerId !== config.localOwnerId)
    throw new Error("Personal binding identity mismatch.");
  const temporary = `${bindingFile(paths)}.${globalThis.crypto.randomUUID()}.tmp`;
  try {
    writePrivateFile(temporary, JSON.stringify({ ...bound, serverUrl }));
    renameSync(temporary, bindingFile(paths));
  } finally {
    rmSync(temporary, { force: true });
  }
  return { id: bound.id, hubInstanceId: bound.hubInstanceId, userId: bound.userId, serverUrl };
}

export async function unbindPersonalHub(paths: SparkPaths, fetchFn = fetch) {
  const binding = readPersonalCredential(paths);
  if (!binding) return { unbound: true };
  const response = await fetchFn(new URL("/api/v1/personal/device/unbind", binding.serverUrl), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
    headers: { authorization: `Bearer ${binding.token}` },
  });
  if (!response.ok)
    throw new SparkDaemonControlError(
      "personal_unbind_failed",
      "Hub could not revoke the personal binding; retry when it is available.",
    );
  rmSync(bindingFile(paths), { force: true });
  return { unbound: true };
}

export async function requestPersonalHub(
  paths: SparkPaths,
  sessionId: string,
  capability: PersonalCapability | undefined,
  action: string,
  input: Record<string, unknown> = {},
  signal?: AbortSignal,
  fetchFn = fetch,
) {
  const binding = readPersonalCredential(paths);
  if (!binding)
    throw new SparkDaemonControlError("personal_unbound", "Bind a personal Hub account first.");
  const url = new URL(
    capability ? "/api/v1/personal/device/execute" : "/api/v1/personal/device/access",
    binding.serverUrl,
  );
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      redirect: "error",
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${binding.token}` },
      body: JSON.stringify(capability ? { sessionId, capability, action, input } : { sessionId }),
    });
  } catch {
    throw new SparkDaemonControlError(
      "personal_unavailable",
      "Personal Hub is unavailable. No offline write was queued.",
    );
  }
  if (!response.ok)
    throw new SparkDaemonControlError(
      "personal_request_failed",
      `Personal Hub rejected this request: HTTP ${response.status}.`,
    );
  const result: unknown = await response.json();
  return capability
    ? personalOperationResultSchema.parse(result).result
    : personalDeviceAccessSchema.parse(result);
}

export function personalDaemonPaths(sparkHome?: string) {
  return resolveSparkPaths({ app: "daemon", sparkHome });
}
