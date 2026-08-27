import { CheckCircle2, XCircle } from "lucide-react";
import type { ScoreFactor } from "@/lib/creditScoreApi";

type ScoreFactorListProps = {
  factors: ScoreFactor[];
};

export function ScoreFactorList({ factors }: ScoreFactorListProps) {
  return (
    <ul className="space-y-3">
      {factors.map((factor) => {
        const passed = factor.status === "pass";
        return (
          <li
            key={factor.name}
            className="flex items-start justify-between gap-3 border-2 border-foreground bg-background p-3"
          >
            <div className="flex items-start gap-3">
              {passed ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              )}
              <div>
                <p className="font-medium">{factor.name}</p>
                <p className="text-xs text-muted-foreground">
                  Weight: {factor.weight} pts
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 font-mono text-xs font-bold uppercase ${
                passed ? "text-green-600" : "text-red-500"
              }`}
            >
              {passed ? "Pass" : "Fail"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
