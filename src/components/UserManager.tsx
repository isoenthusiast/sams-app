"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type User = {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: string;
  totalPoints: number;
  companies: string[];
  companyIds: string[];
};

type Props = {
  initialUsers: any[];
  companies: Array<{ id: string; companyID: string; companyName: string }>;
  currentUserId?: string;
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
  };
}

export function UserManager({ initialUsers, companies, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers.map(parseUser));
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "Assessor" as string,
    companyIds: [] as string[],
  });

  const openAdd = () => {
    setEditingUser(null);
    setForm({ name: "", username: "", email: "", password: "", role: "Assessor", companyIds: [] });
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
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) {
      showToast("Name and username are required", "error");
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

  const toggleCompany = (cid: string) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(cid)
        ? prev.companyIds.filter((id) => id !== cid)
        : [...prev.companyIds, cid],
    }));
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{users.length} user(s)</p>
        <Button variant="primary" size="sm" onClick={openAdd}>
          + Add User
        </Button>
      </div>

      {users.map((u) => (
        <Card key={u.id} padding="sm">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900">
                {u.name}{" "}
                <span className="text-xs text-slate-400">@{u.username}</span>
              </div>
              {u.email && <div className="text-xs text-slate-500">{u.email}</div>}
              <div className="text-xs text-slate-500 mt-0.5">
                Role: {u.role} · Points: {u.totalPoints}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {u.companies.length > 0 ? u.companies.join(", ") : "No company"}
              </div>
            </div>
            <div className="flex gap-1 ml-3 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                ✏️
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(u)}
                disabled={u.id === currentUserId}
              >
                🗑
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {users.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">No users found.</p>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingUser ? "Edit User" : "Add User"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Login username"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Email</label>
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
                <label className="text-xs text-slate-500 block mb-0.5">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Companies</label>
                <div className="max-h-32 overflow-y-auto rounded border border-slate-300 p-2 space-y-0.5">
                  {companies.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-1.5 py-0.5 text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={form.companyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
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
                <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
