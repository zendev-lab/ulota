import {
  resolveSessionPendingTurns as resolveProtocolSessionPendingTurns,
  type SparkPendingTurn,
} from "@zendev-lab/spark-protocol/presentation";
import type { SparkSessionView } from "@zendev-lab/spark-protocol/presentation";

export type HubPendingTurn = SparkPendingTurn;

export function resolveSessionPendingTurns(
  projected: readonly HubPendingTurn[],
  session: SparkSessionView | null,
): HubPendingTurn[] {
  return resolveProtocolSessionPendingTurns(projected, session);
}
