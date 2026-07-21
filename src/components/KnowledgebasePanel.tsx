import { Card } from "@/components/Card";
import { formatDate } from "@/lib/formatDate";

type KbEntry = { kID: string; knowledgeName: string; knowledgeContent: string; remarks?: string | null; createdDate: string; addedBy?: string };
type KnowledgebasePanelProps = { entries: KbEntry[] };

export function KnowledgebasePanel({ entries }: KnowledgebasePanelProps) {
  if (entries.length === 0) {
    return <p className="py-12 text-center text-sm text-slate-400">No knowledgebase entries for this process area.</p>;
  }
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <Card key={entry.kID} padding="sm">
          <h3 className="font-semibold text-slate-900">{entry.knowledgeName}</h3>
          <div className="text-xs text-slate-500 mt-1">
            Added by {entry.addedBy ?? "—"} · {formatDate(entry.createdDate)}
          </div>
          <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap line-clamp-6">{entry.knowledgeContent}</p>
        </Card>
      ))}
    </div>
  );
}
