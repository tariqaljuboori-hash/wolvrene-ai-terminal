export type NormalizedDirection = "LONG" | "SHORT" | "WAIT" | "NONE";

export function normalizeDirection(rawDirection: string | undefined | null): NormalizedDirection {
  if (!rawDirection) return "NONE";

  const upper = rawDirection.toUpperCase().trim();

  switch (upper) {
    case "BUY":
    case "BULLISH":
    case "BULLISH_REACTION":
      return "LONG";
    case "SELL":
    case "BEARISH":
    case "BEARISH_REACTION":
      return "SHORT";
    case "WAIT":
    case "NEUTRAL":
    case "RADAR_WAIT":
    case "HUNT_BUILDING":
      return "WAIT";
    default:
      return "NONE";
  }
}