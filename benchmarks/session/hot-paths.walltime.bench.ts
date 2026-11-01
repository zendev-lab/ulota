import { rm } from "node:fs/promises";
import { test } from "vitest";

import {
  TAIL_MESSAGE_LIMIT,
  TRANSCRIPT_ENTRY_COUNT,
  createIndexedTranscript,
  runLoadSparkSessionSnapshotTail,
  runRefreshSparkSessionSnapshotIndex,
} from "./hot-paths-cases.ts";

test("Spark session snapshot production paths", async ({ bench }) => {
  let refreshFixture: Awaited<ReturnType<typeof createIndexedTranscript>> | undefined;
  let loadFixture: Awaited<ReturnType<typeof createIndexedTranscript>> | undefined;

  await bench(`refreshSparkSessionSnapshotIndex: ${TRANSCRIPT_ENTRY_COUNT} entries`, async () => {
    await runRefreshSparkSessionSnapshotIndex({
      sessionPath: refreshFixture!.transcriptPath,
      sessionId: refreshFixture!.session.sessionId,
    });
  }).run({
    setup: async () => {
      refreshFixture = await createIndexedTranscript("sess_session_refresh_bench");
    },
    teardown: async () => {
      if (refreshFixture) await rm(refreshFixture.root, { recursive: true, force: true });
      refreshFixture = undefined;
    },
  });

  await bench(`loadSparkSessionSnapshotTail: ${TRANSCRIPT_ENTRY_COUNT}→${TAIL_MESSAGE_LIMIT} index-hit`, async () => {
    await runLoadSparkSessionSnapshotTail({
      sessionsRoot: loadFixture!.root,
      session: loadFixture!.session,
    });
  }).run({
    setup: async () => {
      loadFixture = await createIndexedTranscript("sess_session_load_bench");
    },
    teardown: async () => {
      if (loadFixture) await rm(loadFixture.root, { recursive: true, force: true });
      loadFixture = undefined;
    },
  });
});
