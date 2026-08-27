"use client";

import { useEffect, useRef } from "react";

interface AccessibleFlowStatusProps {
  step: number;
  totalSteps: number;
  stepName: string;
  error?: string;
  status?: string;
  focusTargetId?: string;
}

export function AccessibleFlowStatus({
  step,
  totalSteps,
  stepName,
  error,
  status,
  focusTargetId,
}: AccessibleFlowStatusProps) {
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = focusTargetId
      ? document.getElementById(focusTargetId)
      : headingRef.current;

    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: false });
    }
  }, [focusTargetId, step]);

  return (
    <>
      <div
        ref={headingRef}
        id="flow-status"
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Step {step} of {totalSteps}: {stepName}. {totalSteps - step} step
        {totalSteps - step === 1 ? "" : "s"} remaining.
      </div>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {status}
      </div>
      {error ? (
        <div id="flow-error" role="alert" className="sr-only">
          {error}
        </div>
      ) : null}
    </>
  );
}
