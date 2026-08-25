"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
import Link from "next/link";

// ── Left Panel: Company-grouped user list ──
function LeftUserPanel({
  users, selectedUserId, onSelect, onAdd, search, onSearchChange, companies,
}: {
  users: User[];
  selectedUserId: string | null;
  onSelect: (u: User) => void;
  onAdd: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  companies: Array<{ id: string; companyID: string; companyName: string }>;
}) {
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());
  const [incompleteCollapsed, setIncompleteCollapsed] = useState(false);

  // Identify users with incomplete profiles (missing email — the only nullable mandatory field)
  const incompleteUsers = useMemo(() => {
    return users.filter(u => !u.email || u.email.trim() === "");
  }, [users]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; users: User[] }>();
    const nameMap = new Map(companies.map(c => [c.id, c.companyName || c.companyID]));
    for (const u of users) {
      for (const cid of u.companyIds) {
        if (!map.has(cid)) map.set(cid, { name: nameMap.get(cid) || cid, users: [] });
        map.get(cid)!.users.push(u);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [users, companies]);

  return (
    <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
      <div className="p-3 border-b border-slate-200 space-y-2">
        <input type="text" value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Search users…"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
        <Button variant="primary" size="sm" className="w-full" onClick={onAdd}>+ Add User</Button>
        <Link href="/admin?view=manager-assignment"
          className="block text-center text-xs text-slate-500 hover:text-blue-600 hover:underline mt-1.5">
          👔 Manager Assignment
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* ── Incomplete Profiles Section ── */}
        {incompleteUsers.length > 0 && (
          <div>
            <button onClick={() => setIncompleteCollapsed(prev => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 border-b border-amber-200 bg-amber-50/50 sticky top-0">
              <span className="truncate">⚠️ Incomplete Profiles</span>
              <span className="text-amber-500 ml-1 shrink-0">{incompleteCollapsed ? "▶" : "▼"} {incompleteUsers.length}</span>
            </button>
            {!incompleteCollapsed && incompleteUsers.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm border-b border-amber-50 hover:bg-amber-50/50 transition-colors ${
                  selectedUserId === u.id ? "bg-amber-100 border-l-2 border-l-amber-500" : ""}`}>
                <span className="text-slate-700 truncate flex-1 text-left">{u.preferredName || u.name}</span>
                <span className="text-[10px] text-amber-500 shrink-0 ml-1">incomplete</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Company Groups ── */}
        {groups.map(([cid, group]) => (
          <div key={cid}>
            <button onClick={() => setCollapsedCompanies(prev => {
              const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n;
            })}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border-b border-slate-200 sticky top-0 bg-slate-50">
              <span className="truncate">{group.name}</span>
              <span className="text-slate-400 ml-1 shrink-0">{collapsedCompanies.has(cid) ? "▶" : "▼"} {group.users.length}</span>
            </button>
            {!collapsedCompanies.has(cid) && group.users.map(u => (
              <button key={u.id} onClick={() => onSelect(u)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm border-b border-slate-50 hover:bg-white transition-colors ${
                  selectedUserId === u.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                <span className="text-slate-800 truncate flex-1 text-left">{u.preferredName || u.name}</span>
                <span className="text-[11px] text-slate-400 shrink-0 ml-2">{u.role}</span>
              </button>
            ))}
          </div>
        ))}
        {users.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">No users found.</p>}
      </div>
    </div>
  );
}

type User = {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: string;
  totalPoints: number;
  companies: string[];
  companyIds: string[];
  managerName?: string;
  managerUsername?: string;
  preferredName?: string;
  organisationIndicator?: string;
  positionId?: string;
  positionTitle?: string;
  departmentName?: string;
  active?: boolean;
};

type Props = {
  initialUsers: any[];
  companies: Array<{ id: string; companyID: string; companyName: string }>;
  currentUserId?: string;
  departments: Array<{ id: string; name: string; companyId: string }>;
  positions: Array<{ id: string; title: string; departmentId: string }>;
};

const ROLE_OPTIONS = [
  { value: "Admin", label: "Admin" },
  { value: "Superuser", label: "Superuser" },
  { value: "Assessor", label: "Assessor" },
  { value: "Interviewee", label: "Interviewee" },
];

function parseUser(raw: any): User {
  return {
    id: raw.id,
    name: raw.name,
    username: raw.username,
    email: raw.email ?? "",
    role: raw.role,
    totalPoints: raw.totalPoints ?? 0,
    companies: raw.userCompanies?.map((uc: any) => uc.company?.companyID ?? uc.companyId) ?? [],
    companyIds: raw.userCompanies?.map((uc: any) => uc.company?.id ?? uc.companyId) ?? [],
    managerName: raw.managerName ?? "",
    managerUsername: raw.managerUsername ?? "",
    preferredName: raw.preferredName ?? "",
    organisationIndicator: raw.organisationIndicator ?? "",
    positionId: raw.positionId ?? "",
    positionTitle: raw.position?.title ?? "",
    departmentName: raw.position?.department?.name ?? "",
    active: raw.active ?? true,
  };
}

export function UserManager({ initialUsers, companies, currentUserId, departments, positions }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers.map(parseUser));
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter((u) =>
      u.name.toLowerCase().includes(term) ||
      (u.preferredName || "").toLowerCase().includes(term) ||
      u.username.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  }, [users, search]);

  // Form state
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "Assessor" as string,
    companyIds: [] as string[],
    managerName: "",
    organisationIndicator: "",
    preferredName: "",
    positionId: "",
    active: true,
  });

  const openAdd = () => {
    setEditingUser(null);
    setForm({ name: "", username: "", email: "", password: "", role: "Assessor", companyIds: [], managerName: "", organisationIndicator: "", preferredName: "", positionId: "", active: true });
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({
      name: u.name,
      username: u.username,
      email: u.email || "",
      password: "",
      role: u.role,
      companyIds: [...u.companyIds],
      managerName: u.managerName || "",
      organisationIndicator: u.organisationIndicator || "",
      preferredName: u.preferredName || "",
      positionId: u.positionId || "",
      active: u.active ?? true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) {
      showToast("Name and username are required", "error");
      return;
    }
    // Mandatory fields check (email)
    if (!form.email.trim()) {
      showToast("Email is required", "error");
      return;
    }
    if (!editingUser && !form.password) {
      showToast("Password is required for new users", "error");
      return;
    }

    setSaving(true);
    try {
      const url = editingUser
        ? `/api/admin/users/${editingUser.id}`
        : "/api/admin/users";
      const method = editingUser ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          username: form.username.trim(),
          email: form.email.trim() || undefined,
          role: form.role,
          companyIds: form.companyIds,
          managerName: form.managerName.trim() || undefined,
          organisationIndicator: form.organisationIndicator.trim() || undefined,
          preferredName: form.preferredName.trim() || undefined,
          positionId: form.positionId || undefined,
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }

      const data = await res.json();
      if (editingUser) {
        setUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? parseUser({ ...data.user, userCompanies: form.companyIds.map((cid) => ({ company: { id: cid, companyID: companies.find((c) => c.id === cid)?.companyID ?? cid } })) }) : u))
        );
      } else {
        setUsers((prev) => [
          ...prev,
          parseUser({ ...data.user, userCompanies: form.companyIds.map((cid) => ({ company: { id: cid, companyID: companies.find((c) => c.id === cid)?.companyID ?? cid } })) }),
        ]);
      }
      setShowModal(false);
      showToast(editingUser ? "User updated" : "User created", "success");
    } catch (err: any) {
      showToast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Delete user "${u.name}" (@${u.username})?\n\nThis cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed");
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      showToast("User deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Delete failed", "error");
    }
  };

  const toggleFormCompany = (cid: string) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(cid)
        ? prev.companyIds.filter((id) => id !== cid)
        : [...prev.companyIds, cid],
    }));
  };

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[60vh]">
      {/* ── LEFT: Navigation Panel ── */}
      <LeftUserPanel
        users={filteredUsers}
        selectedUserId={editingUser?.id ?? null}
        onSelect={openEdit}
        onAdd={openAdd}
        search={search}
        onSearchChange={setSearch}
        companies={companies}
      />

      {/* ── RIGHT: Content Panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {editingUser || (showModal && !editingUser) ? (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/50">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingUser ? `Edit: ${editingUser.name}` : "Add User"}
              </h3>
              <button
                onClick={() => { setShowModal(false); setEditingUser(null); }}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Preferred Name</label>
                <input
                  type="text"
                  value={form.preferredName || ""}
                  onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Calling name / nickname"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Username <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Login username"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">
                  Password {editingUser && "(leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder={editingUser ? "New password (optional)" : "Password"}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Role <span className="text-red-500">*</span></label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Department</label>
                <select
                  value={positions.find(p => p.id === form.positionId)?.departmentId ?? ""}
                  onChange={(e) => {
                    const deptId = e.target.value;
                    // Find first position in this department
                    const firstPos = positions.find(p => p.departmentId === deptId);
                    setForm({ ...form, positionId: firstPos?.id ?? "" });
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.companyId ? ` (${d.companyId})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Position</label>
                <select
                  value={form.positionId}
                  onChange={(e) => setForm({ ...form, positionId: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">—</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Manager</label>
                <input
                  type="text"
                  value={form.managerName}
                  onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Manager name"
                />
                {editingUser?.managerUsername && editingUser.managerUsername !== "tbc" && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ↳ <span className="font-mono text-slate-500">{editingUser.managerUsername}</span>
                    {(() => {
                      const mgr = users.find(u => u.username === editingUser.managerUsername);
                      return mgr ? <span className="text-slate-400"> — {mgr.name}</span> : null;
                    })()}
                    {editingUser.managerUsername === "TOP" ? " (top of hierarchy)" : ""}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Organisation Indicator</label>
                <input
                  type="text"
                  value={form.organisationIndicator}
                  onChange={(e) => setForm({ ...form, organisationIndicator: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. UPC/L/HMSA"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-xs text-slate-700 font-medium">Active</span>
                  <span className="text-[11px] text-slate-400">(User can log in)</span>
                </label>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Companies</label>
                <div className="max-h-32 overflow-y-auto rounded border border-slate-300 p-2 space-y-0.5">
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 py-0.5 text-xs cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={form.companyIds.includes(c.id)}
                        onChange={() => toggleFormCompany(c.id)}
                        className="rounded"
                      />
                      {c.companyID} — {c.companyName}
                    </label>
                  ))}
                  {companies.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1">No companies available</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
                  {saving ? "Saving…" : editingUser ? "Save Changes" : "Create User"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowModal(false); setEditingUser(null); }}>
                  Cancel
                </Button>
                {editingUser && (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(editingUser)} disabled={editingUser.id === currentUserId}
                    className="ml-auto text-red-500 hover:text-red-700">
                    🗑 Delete
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Select a user from the left panel or click &quot;+ Add User&quot; to create one.
          </div>
        )}
      </div>
    </div>
  );
}
