type HealthIndicatorProps = {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md";
};

export function HealthIndicator({ score, showLabel = true, size = "md" }: HealthIndicatorProps) {
  const level = score > 80 ? "healthy" : score >= 50 ? "tolerable" : "poor";
  const config = {
    healthy: { emoji: "🟢", text: "text-emerald-700", label: "Healthy" },
    tolerable: { emoji: "🟡", text: "text-amber-700", label: "Tolerable" },
    poor: { emoji: "🔴", text: "text-red-700", label: "Not Tolerable" },
  }[level];

  return (
    <span
      role="img"
      aria-label={`Health score: ${score} percent, ${config.label}`}
      className={`inline-flex items-center gap-1 font-medium ${config.text} ${size === "sm" ? "text-xs" : "text-sm"}`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {showLabel && <span>{score}% {config.label}</span>}
      {!showLabel && <span>{score}%</span>}
    </span>
  );
}
