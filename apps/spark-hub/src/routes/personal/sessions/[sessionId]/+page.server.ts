import { sparkLocalRpcProcedureSchemas } from "@zendev-lab/spark-protocol/local-rpc-orpc-contract";
import { fail } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { requirePersonalUser } from "$lib/server/personal-auth";
import {
  personalConversationSnapshot,
  personalConversationInteractions,
  respondPersonalConversationInteraction,
  requirePersonalConversation,
  submitPersonalConversation,
} from "$lib/server/personal-sessions";
import type { Actions, PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({ locals, params }) => {
  const userId = requirePersonalUser(locals.sessionToken);
  requirePersonalConversation(userId, params.sessionId);
  const [snapshot, interactions] = await Promise.all([
    personalConversationSnapshot(userId, params.sessionId).catch(() => null),
    personalConversationInteractions(userId, params.sessionId).catch(() => null),
  ]);
  return { snapshot, interactions, submissionId: randomUUID() };
};
export const actions: Actions = {
  respond: async ({ locals, params, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    requirePersonalConversation(userId, params.sessionId);
    const form = await request.formData();
    let answers: unknown;
    try {
      answers = JSON.parse(String(form.get("answers") ?? "{}"));
    } catch {
      return fail(400, { failed: true });
    }
    const parsed = sparkLocalRpcProcedureSchemas["human.interaction.respond"].input.safeParse({
      humanRequestId: form.get("humanRequestId"),
      humanResponseId: form.get("humanResponseId"),
      status: form.get("status"),
      answers,
    });
    if (!parsed.success || !parsed.data.humanResponseId) return fail(400, { failed: true });
    await respondPersonalConversationInteraction(userId, params.sessionId, parsed.data);
    return { answered: true };
  },
  send: async ({ locals, params, request }) => {
    const userId = requirePersonalUser(locals.sessionToken);
    const form = await request.formData();
    const prompt = String(form.get("prompt") ?? "").trim();
    const submissionId = String(form.get("submissionId") ?? "");
    if (!prompt || prompt.length > 32_000 || !/^[a-f0-9-]{36}$/u.test(submissionId))
      return fail(400, { failed: true });
    try {
      await submitPersonalConversation(userId, params.sessionId, prompt, submissionId);
      return { sent: true };
    } catch {
      return fail(503, { failed: true });
    }
  },
};
