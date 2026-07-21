import Link from "next/link";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

type AssessmentCardProps = {
  id: string;
  name: string;
  status: string;
  activityTypeName: string;
  startDate: Date;
  samplesCount: number;
  findingsCount: number;
};

export function AssessmentCard({ id, name, status, activityTypeName, startDate, samplesCount, findingsCount }: AssessmentCardProps) {
  return (
    <Link href={`/fla/${id}`} className="flex items-center justify-between rounded-md border border-slate-100 px-4 py-3 hover:bg-slate-50">
      <div>
        <div className="text-sm font-medium text-slate-900">{name}</div>
        <div className="text-xs text-slate-500">
          {activityTypeName} · {new Date(startDate).toLocaleDateString()} · {samplesCount} samples · {findingsCount} findings
        </div>
      </div>
      <StatusBadge status={status} />
    </Link>
  );
}
