"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type MgrUser = {
  id: string;
  name: string;
  username: string;
  managerName: string | null;
  managerUsername: string | null;
};

type Props = {
  users: MgrUser[];
  allUsernames: string[];
};

export function ManagerAssignmentView({ users, allUsernames }: Props) {
  // Read initial filter from URL so it survives page reload
  const validFilters = ["all", "inTable", "notFound", "tbc"] as const;
  type MgrFilter = typeof validFilters[number];
  
  // Start with "all" (SSR-safe default), then sync from URL on client mount
  const [mgrStatusFilter, setMgrStatusFilterState] = useState<MgrFilter>("all");
  const [filterHydrated, setFilterHydrated] = useState(false);
  const [addedManagers, setAddedManagers] = useState<Set<string>>(new Set());
  const [remapSelections, setRemapSelections] = useState<Record<string, string>>({});
  const [addingManager, setAddingManager] = useState<string | null>(null);
  const [remappingManager, setRemappingManager] = useState<string | null>(null);
  
  // Local copy of users for optimistic updates — avoids full page reload
  const [localUsers, setLocalUsers] = useState(users);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Show success message briefly then clear
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 2500);
      return () => clearTimeout(t);
    }
  }, [successMsg]);
  
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("mgrFilter");
    if (f && validFilters.includes(f as MgrFilter)) {
      setMgrStatusFilterState(f as MgrFilter);
    }
    setFilterHydrated(true);
  }, []);

  // Sync filter to URL so reload preserves it (only after hydration complete)
  useEffect(() => {
    if (!filterHydrated) return; // Don't touch URL until we've read it
    const params = new URLSearchParams(window.location.search);
    if (mgrStatusFilter === "all") {
      params.delete("mgrFilter");
    } else {
      params.set("mgrFilter", mgrStatusFilter);
    }
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", newUrl);
  }, [mgrStatusFilter]);

  const [filter, setFilter] = useState<"all" | "resolved" | "tbc">("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const filtered = localUsers.filter((u) => {
    if (filter === "resolved") return u.managerUsername && u.managerUsername !== "tbc";
    if (filter === "tbc") return u.managerUsername === "tbc";
    return true;
  });

  // ── Distinct managers ──
  const distinctManagers = useMemo(() => {
    const map = new Map<string, { managerName: string; currentUsername: string | null; staffCount: number }>();
    for (const u of localUsers) {
      if (!u.managerName) continue;
      const key = u.managerName.trim();
      if (!map.has(key)) {
        map.set(key, { managerName: key, currentUsername: null, staffCount: 0 });
      }
      const entry = map.get(key)!;
      entry.staffCount++;
      // Use the most common non-tbc username as the current
      if (!entry.currentUsername && u.managerUsername && u.managerUsername !== "tbc") {
        entry.currentUsername = u.managerUsername;
      }
    }
    return [...map.values()].sort((a, b) => a.managerName.localeCompare(b.managerName));
  }, [localUsers]);

  // Filtered distinct managers by status (uses saved username, not in-progress typing)
  const filteredDistinctManagers = useMemo(() => {
    if (mgrStatusFilter === "all") return distinctManagers;
    return distinctManagers.filter(m => {
      const uname = m.currentUsername ?? "";
      const isInTable = !uname || uname === "tbc" ? null : allUsernames.includes(uname);
      if (mgrStatusFilter === "inTable") return isInTable === true;
      if (mgrStatusFilter === "notFound") return isInTable === false;
      if (mgrStatusFilter === "tbc") return isInTable === null;
      return true;
    });
  }, [distinctManagers, mgrStatusFilter, allUsernames]);

  // Managers whose resolved username is NOT in the user table, plus newly added ones
  const notInUserTable = useMemo(() => {
    return distinctManagers.filter(m => {
      // Keep if admin just added them (pending reload)
      if (addedManagers.has(m.managerName)) return true;
      const uname = m.currentUsername;
      if (!uname || uname === "tbc") return true;
      return !allUsernames.includes(uname);
    });
  }, [distinctManagers, allUsernames, addedManagers]);

  // Build username → name map for the Remap dropdown (sorted by name)
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of localUsers) {
      if (u.username && !map.has(u.username)) {
        map.set(u.username, u.name);
      }
    }
    return [...map.entries()]
      .map(([username, name]) => ({ username, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localUsers]);

  const handleSaveUser = async (userId: string) => {
    const newVal = (editValues[userId] ?? "").trim();
    setSaving(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerUsername: newVal || null }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Saved", "success");
      setEditValues((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      window.location.reload();
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(null);
    }
  };

  // Auto-save manager username — optimistically updates local state, no reload
  const handleManagerBlur = useCallback(async (managerName: string) => {
    const input = document.querySelector(`input[data-mgr-name="${CSS.escape(managerName)}"]`) as HTMLInputElement | null;
    if (!input) return;
    const newUsername = input.value.trim();
    const oldVal = distinctManagers.find(m => m.managerName === managerName)?.currentUsername ?? "";
    if (newUsername === oldVal) return;
    setSaving(`mgr-${managerName}`);
    try {
      const res = await fetch("/api/admin/manager-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerName, managerUsername: newUsername || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error("API returned not-ok");
      // Optimistic update: set managerUsername + managerName on all affected users
      const targetName = localUsers.find(u2 => u2.username === newUsername)?.name ?? managerName;
      setLocalUsers(prev => prev.map(u =>
        (u.managerName || "").trim() === managerName
          ? { ...u, managerUsername: newUsername || null, managerName: targetName }
          : u
      ));
      setSuccessMsg(`Updated ${managerName} → ${newUsername || "(cleared)"}`);
    } catch (e) {
      console.error("[handleManagerBlur] error", e);
      setSuccessMsg("Save failed — try again");
    } finally {
      setSaving(null);
    }
  }, [distinctManagers]);

  // Handle "Remap to" — reassign staff to a different existing manager (no reload)
  const handleRemap = useCallback(async (managerName: string, targetUsername: string) => {
    if (!targetUsername) return;
    setRemappingManager(managerName);
    try {
      const res = await fetch("/api/admin/manager-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerName, managerUsername: targetUsername }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic update: also set managerName to target user's name
      const targetName = localUsers.find(u2 => u2.username === targetUsername)?.name ?? managerName;
      setLocalUsers(prev => prev.map(u =>
        (u.managerName || "").trim() === managerName
          ? { ...u, managerUsername: targetUsername, managerName: targetName }
          : u
      ));
      setRemapSelections(prev => { const n = { ...prev }; delete n[managerName]; return n; });
      setSuccessMsg(`Remapped ${managerName} → ${targetUsername}`);
    } catch (e) {
      console.error("[handleRemap] error", e);
      setSuccessMsg("Remap failed — try again");
    } finally {
      setRemappingManager(null);
    }
  }, []);

  // Handle "Add User" — create a new User record (no reload)
  const handleAddUser = useCallback(async (managerName: string, username: string) => {
    if (!username || !managerName) return;
    setAddingManager(managerName);
    try {
      const res = await fetch("/api/admin/users/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: managerName, username }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Also link staff
      await fetch("/api/admin/manager-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerName, managerUsername: username }),
      });
      // Optimistic update
      setLocalUsers(prev => prev.map(u =>
        (u.managerName || "").trim() === managerName
          ? { ...u, managerUsername: username }
          : u
      ));
      setAddedManagers(prev => new Set(prev).add(managerName));
      setSuccessMsg(`Added ${managerName} as ${username}`);
    } catch (e) {
      console.error("[handleAddUser] error", e);
      setSuccessMsg("Add user failed — try again");
    } finally {
      setAddingManager(null);
    }
  }, []);

  const counts = {
    all: localUsers.length,
    resolved: localUsers.filter(u => u.managerUsername && u.managerUsername !== "tbc").length,
    tbc: localUsers.filter(u => u.managerUsername === "tbc").length,
  };

  return (
    <div className="mt-6 space-y-8">
      {/* Success indicator */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium shadow-lg animate-pulse">
          ✓ {successMsg}
        </div>
      )}

      {/* ── SECTION 1: Distinct Managers (inline edit, auto-save on blur) ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          👔 Distinct Managers ({filteredDistinctManagers.length}{mgrStatusFilter !== "all" ? ` / ${distinctManagers.length}` : ""})
          <span className="text-xs font-normal text-slate-400 ml-2">— assign username, auto-saves on blur</span>
        </h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
            <div className="col-span-4">Manager Name (from CSV)</div>
            <div className="col-span-4">Username</div>
            <div className="col-span-2">Staff</div>
            <div className="col-span-2 flex items-center gap-0.5">
              <span className="mr-1">Status</span>
              <button
                onClick={() => setMgrStatusFilterState("all")}
                className={`px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium transition-colors ${
                  mgrStatusFilter === "all" ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                }`}
              >All</button>
              <button
                onClick={() => setMgrStatusFilterState("inTable")}
                className={`px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium transition-colors ${
                  mgrStatusFilter === "inTable" ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                }`}
              >✓</button>
              <button
                onClick={() => setMgrStatusFilterState("notFound")}
                className={`px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium transition-colors ${
                  mgrStatusFilter === "notFound" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >✗</button>
              <button
                onClick={() => setMgrStatusFilterState("tbc")}
                className={`px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium transition-colors ${
                  mgrStatusFilter === "tbc" ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >tbc</button>
            </div>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {filteredDistinctManagers.length === 0 ? (
              <p className="px-4 py-8 text-xs text-slate-400 text-center">No managers match the selected filter.</p>
            ) : (
              filteredDistinctManagers.map((m) => {
              const uname = m.currentUsername ?? "";
              const isInTable = !uname || uname === "tbc" ? null : allUsernames.includes(uname);
              const savingThis = saving === `mgr-${m.managerName}`;
              return (
                <div key={m.managerName} className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-slate-100 text-sm items-center hover:bg-slate-50">
                  <div className="col-span-4 text-slate-700 truncate font-medium" title={m.managerName}>
                    {m.managerName}
                  </div>
                  <div className="col-span-4 flex items-center gap-1">
                    <input
                      type="text"
                      defaultValue={m.currentUsername || ""}
                      data-mgr-name={m.managerName}
                      onBlur={() => handleManagerBlur(m.managerName)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleManagerBlur(m.managerName); }}
                      placeholder={m.currentUsername || "tbc"}
                      disabled={savingThis}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => handleManagerBlur(m.managerName)}
                      disabled={savingThis}
                      className="shrink-0 px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {savingThis ? "…" : "Save"}
                    </button>
                  </div>
                  <div className="col-span-2 text-xs text-slate-400">{m.staffCount} reports</div>
                  <div className="col-span-2">
                    {savingThis ? (
                      <span className="text-xs text-slate-400">saving…</span>
                    ) : isInTable === true ? (
                      <span className="text-xs text-emerald-600 font-medium">✓ in table</span>
                    ) : isInTable === false ? (
                      <span className="text-xs text-red-500 font-medium">✗ not found</span>
                    ) : (
                      <span className="text-xs text-amber-500">tbc</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Managers NOT in User table (collapsible) ── */}
      <details className="border border-red-200 rounded-lg overflow-hidden">
        <summary className="cursor-pointer px-4 py-3 bg-red-50 text-sm font-semibold text-red-800 hover:bg-red-100 select-none">
          ⚠️ Managers Not in User Table ({notInUserTable.length})
          <span className="text-xs font-normal text-red-500 ml-2">— these managers have no user account</span>
        </summary>
        <div className="max-h-[40vh] overflow-y-auto">
          {notInUserTable.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400">All managers have valid user accounts.</p>
          ) : (
            notInUserTable.map((m) => {
              const uname = m.currentUsername ?? "";
              const isAdded = addedManagers.has(m.managerName);
              const remapVal = remapSelections[m.managerName] ?? "";
              return (
                <div key={m.managerName} className={`flex items-center gap-2 px-4 py-2 border-b text-sm ${isAdded ? "bg-amber-50 border-amber-100" : "border-red-100 hover:bg-red-50/50"}`}>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-700 truncate block" title={m.managerName}>{m.managerName}</span>
                    <span className="text-xs text-slate-400">{m.staffCount} reports</span>
                  </div>
                  
                  {/* Username input + Save */}
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="text"
                      defaultValue={uname}
                      data-mgr-name={m.managerName}
                      placeholder="username"
                      disabled={addingManager === m.managerName || remappingManager === m.managerName}
                      className="w-28 rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => handleManagerBlur(m.managerName)}
                      disabled={addingManager === m.managerName || remappingManager === m.managerName}
                      className="shrink-0 px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {addingManager === m.managerName ? "…" : "Save"}
                    </button>
                  </div>

                  {/* Remap to */}
                  <select
                    value={remapVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRemapSelections(prev => ({ ...prev, [m.managerName]: val }));
                      if (val) handleRemap(m.managerName, val);
                    }}
                    disabled={addingManager === m.managerName || remappingManager === m.managerName}
                    className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-600 focus:border-blue-400 focus:outline-none disabled:opacity-50 max-w-[140px]"
                    title="Remap staff to a different manager"
                  >
                    <option value="">Remap to…</option>
                    {userOptions.map(u => (
                      <option key={u.username} value={u.username}>{u.name} ({u.username})</option>
                    ))}
                  </select>

                  {/* Add User */}
                  <button
                    onClick={() => {
                      const input = document.querySelector(`input[data-mgr-name="${CSS.escape(m.managerName)}"]`) as HTMLInputElement | null;
                      const newUsername = input?.value.trim() || uname;
                      if (!newUsername) return;
                      handleAddUser(m.managerName, newUsername);
                    }}
                    disabled={addingManager === m.managerName || remappingManager === m.managerName}
                    className="shrink-0 px-2 py-1 text-xs font-medium rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    title="Add this manager as a new user"
                  >
                    {addingManager === m.managerName ? "…" : isAdded ? "Re-Add" : "Add User"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </details>

      {/* ── SECTION 3: User-by-User Table ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-slate-700">📋 User-by-User Assignment</h2>
          <div className="flex gap-1">
            {(["all", "resolved", "tbc"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  filter === f ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f === "all" ? `All (${counts.all})` : f === "resolved" ? `Resolved (${counts.resolved})` : `TBC (${counts.tbc})`}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
            <div className="col-span-3">User</div>
            <div className="col-span-3">Manager (from CSV)</div>
            <div className="col-span-3">Manager Username</div>
            <div className="col-span-3">Action</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {filtered.map((u) => {
            const isEditing = u.id in editValues;
            const currentVal = isEditing ? editValues[u.id] : (u.managerUsername || "");
            const isTbc = u.managerUsername === "tbc";
            const isResolved = u.managerUsername && u.managerUsername !== "tbc";

            return (
              <div key={u.id} className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-slate-100 text-sm items-center ${
                isTbc ? "bg-amber-50" : isResolved ? "bg-green-50/30" : ""
              }`}>
                <div className="col-span-3 truncate" title={u.name}>
                  <span className="font-medium text-slate-800">{u.name}</span>
                  <span className="text-xs text-slate-400 ml-1">@{u.username}</span>
                </div>
                <div className="col-span-3 text-slate-600 truncate" title={u.managerName || ""}>
                  {u.managerName || "—"}
                </div>
                <div className="col-span-3">
                  {isEditing ? (
                    <select
                      value={currentVal}
                      onChange={(e) => setEditValues({ ...editValues, [u.id]: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">— Clear —</option>
                      <option value="tbc">tbc</option>
                      <option value="TOP">TOP</option>
                      {allUsernames.filter(un => un !== u.username).map(un => (
                        <option key={un} value={un}>{un}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-mono ${isTbc ? "text-amber-600 font-semibold" : isResolved ? "text-emerald-600" : "text-slate-400"}`}>
                      {u.managerUsername || "—"}
                    </span>
                  )}
                </div>
                <div className="col-span-3 flex gap-1">
                  {isEditing ? (
                    <>
                      <Button variant="primary" size="sm" disabled={saving === u.id} onClick={() => handleSaveUser(u.id)}>
                        {saving === u.id ? "…" : "Save"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditValues(prev => { const n = { ...prev }; delete n[u.id]; return n; });
                      }}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditValues({ ...editValues, [u.id]: currentVal });
                    }}>✏️ Edit</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}
