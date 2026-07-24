import Link from "next/link";
import { Card } from "@/components/Card";

type ProcessAreaCardProps = {
  id: string;
  name: string;
  standard?: string;
  description?: string | null;
  requirementsCount: number;
  controlsCount: number;
};

export function ProcessAreaCard({ id, name, standard, description, requirementsCount, controlsCount }: ProcessAreaCardProps) {
  return (
    <Link href={`/setup/processdetails/${id}`} target="_blank">
      <Card className="hover:border-blue-300 transition-colors" padding="sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">
              {standard} · {requirementsCount} requirements · {controlsCount} controls
            </div>
          </div>
          <span className="text-slate-300">→</span>
        </div>
      </Card>
    </Link>
  );
}
