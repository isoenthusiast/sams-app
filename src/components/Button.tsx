import { cn } from "@/lib/cn";

type ButtonProps = {
  variant?: "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

const variants = {
  primary: "bg-blue-800 text-white hover:bg-blue-900 disabled:bg-blue-300",
  secondary: "border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300",
  warning: "bg-amber-600 text-white hover:bg-amber-700 disabled:bg-amber-300",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  ghost: "text-blue-700 hover:bg-blue-50 disabled:opacity-50",
};

const sizes = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({ variant = "primary", size = "md", disabled, loading, type = "button", onClick, children, className }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "rounded-md font-medium transition-colors inline-flex items-center gap-2 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <span aria-hidden="true">⏳</span>}
      {children}
    </button>
  );
}
