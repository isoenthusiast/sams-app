import { cn } from "@/lib/cn";

type CardProps = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
};

const paddings = { none: "p-0", sm: "p-3", md: "p-6", lg: "p-8" };

export function Card({ title, subtitle, actions, children, padding = "md", className }: CardProps) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", paddings[padding], className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
