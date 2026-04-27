export type SignalQualityGrade = "A+" | "A" | "B" | "C";

export type SignalQualityInput = {
  structureScore: number;
  liquidityScore: number;
  triggerScore: number;
  volumeScore: number;
  sessionScore: number;
  volatilityRegime: "LOW" | "NORMAL" | "HIGH";
  conflictFlags: {
    structureConflict: boolean;
    liquidityConflict: boolean;
    triggerConflict: boolean;
    fakeout: boolean;
  };
  phase: "SCANNING" | "WATCH" | "VALIDATED" | "EXECUTE" | "MANAGE" | "EXIT";
};

export type SignalQualityOutput = {
  qualityScore: number;
  qualityGrade: SignalQualityGrade;
  confirmationCount: number;
  requiredConfirmations: number;
  canExecute: boolean;
  blockedReason: string;
};

export function scoreSignalQuality(input: SignalQualityInput): SignalQualityOutput {
  const volatilityScore = input.volatilityRegime === "HIGH" ? 35 : input.volatilityRegime === "LOW" ? 62 : 78;
  const baseScore = Math.round(
    input.structureScore * 0.22 +
      input.liquidityScore * 0.22 +
      input.triggerScore * 0.24 +
      input.volumeScore * 0.16 +
      input.sessionScore * 0.1 +
      volatilityScore * 0.06
  );
  const conflictPenalty =
    (input.conflictFlags.structureConflict ? 18 : 0) +
    (input.conflictFlags.liquidityConflict ? 14 : 0) +
    (input.conflictFlags.triggerConflict ? 14 : 0) +
    (input.conflictFlags.fakeout ? 18 : 0);
  const qualityScore = Math.max(0, Math.min(100, baseScore - conflictPenalty));
  const qualityGrade: SignalQualityGrade = qualityScore >= 90 ? "A+" : qualityScore >= 80 ? "A" : qualityScore >= 70 ? "B" : "C";
  const confirmationChecks = [
    input.structureScore >= 60,
    input.liquidityScore >= 58,
    input.triggerScore >= 60,
    input.volumeScore >= 55,
    input.sessionScore >= 58,
  ];
  const confirmationCount = confirmationChecks.filter(Boolean).length;
  const requiredConfirmations = confirmationChecks.length;
  const hasConflict = input.conflictFlags.structureConflict || input.conflictFlags.liquidityConflict || input.conflictFlags.triggerConflict || input.conflictFlags.fakeout;
  const canExecute = input.phase === "VALIDATED" && qualityScore >= 80 && !hasConflict && confirmationCount === requiredConfirmations;
  const blockedReason =
    input.phase !== "VALIDATED"
      ? "Phase is not VALIDATED."
      : hasConflict
      ? "Conflict/fakeout protection active."
      : qualityScore < 80
      ? `Quality score ${qualityScore} below execute threshold 80.`
      : confirmationCount < requiredConfirmations
      ? `Confirmations ${confirmationCount}/${requiredConfirmations}.`
      : "";
  return { qualityScore, qualityGrade, confirmationCount, requiredConfirmations, canExecute, blockedReason };
}
