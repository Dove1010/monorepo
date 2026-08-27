import type { ScoreBand } from "@/lib/creditScoreApi";

type CreditScoreGaugeProps = {
  score: number;
  band: ScoreBand;
};

const BAND_COLORS: Record<ScoreBand, string> = {
  Poor: "#ef4444",
  Fair: "#f59e0b",
  Good: "#22c55e",
  Excellent: "#16a34a",
};

export function CreditScoreGauge({ score, band }: CreditScoreGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (clampedScore / 100) * circumference;
  const color = BAND_COLORS[band];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40 md:h-48 md:w-48">
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-4xl font-black md:text-5xl">
            {clampedScore}
          </span>
          <span
            className="mt-1 font-mono text-sm font-bold uppercase tracking-wide"
            style={{ color }}
          >
            {band}
          </span>
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Your tenant risk score (0–100)
      </p>
    </div>
  );
}
