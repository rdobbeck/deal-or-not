"use client";

import Briefcase from "./Briefcase";
import { NUM_CASES } from "@/types/game";

interface BriefcaseRowProps {
  opened: readonly boolean[];
  playerCase: number;
  caseValues: readonly bigint[];
  onCaseClick?: (index: number) => void;
  disabled?: boolean;
  selectMode?: boolean;
}

export default function BriefcaseRow({
  opened,
  playerCase,
  caseValues,
  onCaseClick,
  disabled,
  selectMode,
}: BriefcaseRowProps) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {Array.from({ length: NUM_CASES }, (_, i) => (
        <Briefcase
          key={i}
          index={i}
          isOpened={opened[i]}
          isPlayerCase={i === playerCase}
          value={caseValues[i]}
          onClick={() => onCaseClick?.(i)}
          disabled={disabled || opened[i] || i === playerCase}
          selectMode={selectMode}
        />
      ))}
    </div>
  );
}
