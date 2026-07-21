"use client";

import { useState, useRef, useEffect } from "react";

interface User {
  id: string;
  name: string;
}

interface Props {
  name: string;
  users: User[];
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

export function UserSearchSelect({ name, users, defaultValue, required, className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const ref = useRef<HTMLDivElement>(null);

  // Find the display name for the selected user
  const selectedUser = users.find(u => u.id === selectedId);
  const displayValue = open ? query : (selectedUser?.name ?? "");

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Restore query to selected name
        if (selectedUser) setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedUser]);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <input type="hidden" name={name} value={selectedId} />
      <input
        type="text"
        value={displayValue}
        required={required}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(selectedUser?.name ?? ""); }}
        placeholder="Search users…"
        autoComplete="off"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg">
          {filtered.map(u => (
            <li
              key={u.id}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-slate-100 ${u.id === selectedId ? "bg-blue-50 font-medium" : ""}`}
              onMouseDown={() => {
                setSelectedId(u.id);
                setQuery("");
                setOpen(false);
              }}
            >
              {u.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
