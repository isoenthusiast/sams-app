"use client";

import { useId } from "react";

type SelectProps = {
  label?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
};

export function Select({ label, options, value, onChange, placeholder, disabled, error }: SelectProps) {
  const id = useId();
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-50 ${
          error ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
