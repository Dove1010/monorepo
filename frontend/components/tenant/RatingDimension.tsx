"use client";

import { Star } from "lucide-react";

interface RatingDimensionProps {
  label: string;
  score: number;
  maxScore?: number;
  className?: string;
}

function scoreToLabel(score: number): string {
  if (score >= 4.5) return "Excellent";
  if (score >= 3.5) return "Good";
  if (score >= 2.5) return "Average";
  if (score >= 1.5) return "Below Average";
  return "Poor";
}

export default function RatingDimension({
  label,
  score,
  maxScore = 5,
  className = "",
}: RatingDimensionProps) {
  const barWidth = Math.round((score / maxScore) * 100);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="w-32 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      <div
        className="flex-1 h-3 border-2 border-foreground bg-muted"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={maxScore}
        aria-label={`${label}: ${score} out of ${maxScore}`}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex items-center gap-1 w-24 justify-end">
        <span className="font-mono font-bold text-sm">{score}</span>
        <span className="text-xs text-muted-foreground">/ {maxScore}</span>
        <span className="text-xs text-muted-foreground ml-1">
          {scoreToLabel(score)}
        </span>
      </div>
    </div>
  );
}

export function StarRating({
  score,
  maxScore = 5,
  size = "sm",
}: {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${score} out of ${maxScore} stars`}>
      {Array.from({ length: maxScore }, (_, i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i < Math.round(score)
              ? "fill-primary text-primary"
              : "text-muted-foreground"
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}
