import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

type Action = { id: string; actionDescription: string; actionParty?: string | null; actionClosureEffective: boolean };
type FindingCardProps = {
  id: string;
  description: string;
  severity: string;
  risks?: string | null;
  actions: Action[];
};

export function FindingCard({ id, description, severity, risks, actions }: FindingCardProps) {
  return (
    <Card padding="sm">
      <div className="flex items-start gap-3">
        <Badge variant={severity === "Serious" || severity === "High" ? "danger" : severity === "Medium" ? "warning" : "default"}>
          {severity}
        </Badge>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">{description}</p>
          {risks && <p className="text-xs text-slate-500 mt-1">Risk: {risks}</p>}
          {actions.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="text-xs font-medium text-slate-600 mb-1">Actions ({actions.length})</p>
              {actions.map((act) => (
                <div key={act.id} className="flex items-center justify-between py-1 text-xs">
                  <span>{act.actionDescription}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-400">{act.actionParty ?? "—"}</span>
                    <Badge variant={act.actionClosureEffective ? "success" : "default"} size="sm">
                      {act.actionClosureEffective ? "Done" : "Open"}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
