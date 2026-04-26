import type { DecisionLifecycleStage } from "@/types/trading";

type InternalPhase =
  | "SCANNING"
  | "SPAWNED"
  | "VALIDATED"
  | "EXECUTE"
  | "MANAGE"
  | "EXIT"
  | "FILTERED"
  | "NO_TRADE";

export function toLifecycleStage(phase: InternalPhase): DecisionLifecycleStage {
  if (phase === "SPAWNED") return "SPAWN";
  if (phase === "VALIDATED") return "VALIDATE";
  if (phase === "EXECUTE") return "EXECUTE";
  if (phase === "MANAGE") return "MANAGE";
  if (phase === "EXIT") return "EXIT";
  return "CANCEL";
}
