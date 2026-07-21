"use client";

import { useId } from "react";

type InputProps = {
  label?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
};

export function Input({ label, type = "text", placeholder, error, helperText, disabled, required, value, onChange }: InputProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-600" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error || helperText ? helperId : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 ${
          error ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
        }`}
      />
      {(error || helperText) && (
        <p id={helperId} role={error ? "alert" : undefined} className={`text-xs ${error ? "text-red-600" : "text-slate-500"}`}>
          {error ?? helperText}
        </p>
      )}
    </div>
  );
}
