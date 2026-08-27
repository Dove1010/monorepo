"use client";

import { Check } from "lucide-react";

interface OnboardingStepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function OnboardingStepIndicator({
  currentStep,
  totalSteps,
}: OnboardingStepIndicatorProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const step = idx + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;

          return (
            <div key={step} className="flex items-center w-full last:w-auto">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                    ? "border-primary text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step}
              </div>
              {step < totalSteps && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-colors ${
                    isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 px-1">
        <span className="text-xs font-medium text-primary">Personal Info</span>
        <span className="text-xs font-medium text-muted-foreground">KYC</span>
        <span className="text-xs font-medium text-muted-foreground">Service Areas</span>
        <span className="text-xs font-medium text-muted-foreground">Bank</span>
        <span className="text-xs font-medium text-muted-foreground">Review</span>
      </div>
    </div>
  );
}
