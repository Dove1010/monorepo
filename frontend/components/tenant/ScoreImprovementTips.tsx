import { Lightbulb } from "lucide-react";

type ScoreImprovementTipsProps = {
  tips: string[];
};

export function ScoreImprovementTips({ tips }: ScoreImprovementTipsProps) {
  return (
    <ul className="space-y-3">
      {tips.map((tip) => (
        <li
          key={tip}
          className="flex items-start gap-3 border-2 border-foreground bg-amber-50 p-4 dark:bg-amber-950/30"
        >
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed">{tip}</p>
        </li>
      ))}
    </ul>
  );
}
