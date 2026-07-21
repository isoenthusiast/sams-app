import { Badge } from "./Badge";

const defaultVariantMap: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  Planned: "default",
  InProgress: "info",
  Completed: "success",
  Cancelled: "danger",
  Effective: "success",
  NotEffective: "danger",
  NotTested: "default",
  Tested: "info",
  Low: "default",
  Medium: "warning",
  High: "warning",
  Serious: "danger",
};

export function StatusBadge({ status, variantMap }: { status: string; variantMap?: Record<string, "default" | "success" | "warning" | "danger" | "info"> }) {
  const map = variantMap ?? defaultVariantMap;
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}
