"use client";

import { useState } from "react";
import { ProcessAreaCard } from "@/components/ProcessAreaCard";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type ProcessAreaWithRelations = {
  id: string;
  name: string;
  description: string | null;
  standardId: string | null;
  standardRef: {
    id: string;
    standard: string;
    sequenceNo: number;
    standardDescription?: string | null;
  } | null;
  _count: {
    controls: number;
    subProcesses: number;
    requirements: number;
  };
};

type StandardGroup = {
  id: string;
  name: string;
  description: string | null;
  sequenceNo: number;
  processAreas: ProcessAreaWithRelations[];
  totalRequirements: number;
  totalControls: number;
};

type Props = {
  processAreas: ProcessAreaWithRelations[];
};

export function ProcessAreaList({ processAreas }: Props) {
  // Group by standard
  const standardGroups: StandardGroup[] = Object.values(
    processAreas.reduce<Record<string, StandardGroup>>((acc, pa) => {
      const stdId = pa.standardRef?.id ?? pa.standardId ?? "__unmapped__";
      const stdName = pa.standardRef?.standard ?? "Unmapped";
      const stdDesc = pa.standardRef?.standardDescription ?? null;
      const seqNo = pa.standardRef?.sequenceNo ?? 999;

      if (!acc[stdId]) {
        acc[stdId] = {
          id: stdId,
          name: stdName,
          description: stdDesc,
          sequenceNo: seqNo,
          processAreas: [],
          totalRequirements: 0,
          totalControls: 0,
        };
      }

      acc[stdId].processAreas.push(pa);
      acc[stdId].totalRequirements += pa._count.requirements;
      acc[stdId].totalControls += pa._count.controls;

      return acc;
    }, {})
  ).sort((a, b) => a.sequenceNo - b.sequenceNo);

  return (
    <div className="space-y-2">
      {standardGroups.map((group, idx) => (
        <CollapsibleSection
          key={group.id}
          title={group.name}
          count={group.processAreas.length}
          defaultOpen={idx === 0}
        >
          {group.description && (
            <p className="text-xs text-slate-400 mb-2">{group.description}</p>
          )}
          <p className="text-xs text-slate-400 mb-2">
            {group.totalRequirements} requirements · {group.totalControls} controls
          </p>
          <div className="space-y-1.5">
            {group.processAreas.map((pa) => (
              <ProcessAreaCard
                key={pa.id}
                id={pa.id}
                name={pa.name}
                standard={pa.standardRef?.standard ?? undefined}
                requirementsCount={pa._count.requirements}
                controlsCount={pa._count.controls}
              />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}
