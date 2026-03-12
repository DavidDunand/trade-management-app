"use client";

import { Check } from "lucide-react";
import type { WizardStep } from "../types";

const STEPS: { label: string }[] = [
  { label: "Search" },
  { label: "Leg Preview" },
  { label: "Validation" },
  { label: "Contact" },
  { label: "Preview" },
  { label: "Export" },
];

export default function Stepper({
  current,
  maxReached,
}: {
  current: WizardStep;
  maxReached: WizardStep;
}) {
  return (
    <div className="flex items-start justify-between w-full">
      {STEPS.map((s, i) => {
        const stepNum = (i + 1) as WizardStep;
        const isActive = stepNum === current;
        const isCompleted = stepNum < current;
        const isUpcoming = stepNum > current;

        return (
          <div key={i} className="flex flex-col items-center flex-1 relative">
            {/* Connector line left */}
            {i > 0 && (
              <div
                className={[
                  "absolute top-4 right-1/2 h-[2px] w-full -translate-y-1/2",
                  isCompleted ? "bg-teal-500" : "bg-gray-200",
                ].join(" ")}
              />
            )}

            {/* Circle */}
            <div
              className={[
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                isCompleted
                  ? "bg-teal-500 border-teal-500 text-white"
                  : isActive
                  ? "bg-teal-500 border-teal-500 text-white"
                  : "bg-white border-gray-300 text-gray-400",
              ].join(" ")}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
            </div>

            {/* Label */}
            <span
              className={[
                "mt-2 text-[11px] font-medium text-center leading-tight",
                isActive ? "text-teal-600" : isCompleted ? "text-teal-500" : "text-gray-400",
              ].join(" ")}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
