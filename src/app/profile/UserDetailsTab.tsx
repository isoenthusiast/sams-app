"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";

type UserData = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  position: { id: string; title: string; department: { id: string; name: string } | null } | null;
  userCompanies: Array<{ company: { id: string; companyID: string; companyName: string } }>;
  totalPoints: number;
  createdAt: string;
} | null;

const ROLE_LABELS: Record<string, string> = {
  Admin: "Administrator",
  Superuser: "Superuser / SPO",
  Assessor: "Assessor",
  Interviewee: "Frontline / Interviewee",
};

export function UserDetailsTab({ user }: { user: UserData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    username: user?.username ?? "",
    email: user?.email ?? "",
  });

  if (!user) {
    return <p className="text-sm text-slate-500">User information not available.</p>;
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) {
      showToast("Name and username are required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, username: form.username, email: form.email || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      showToast("Profile updated", "success");
      setEditing(false);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({ name: user.name, username: user.username, email: user.email ?? "" });
    setEditing(false);
  };

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Unknown";

  return (
    <div className="space-y-6">
      {/* ── Profile Card ── */}
      <Card title="Profile Information" padding="sm">
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <span className="text-slate-500">Name:</span>{" "}
                <span className="font-medium text-slate-800">{user.name}</span>
              </div>
              <div>
                <span className="text-slate-500">Username:</span>{" "}
                <span className="font-medium text-slate-800">@{user.username}</span>
              </div>
              <div>
                <span className="text-slate-500">Email:</span>{" "}
                <span className="font-medium text-slate-800">{user.email || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Role:</span>{" "}
                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Position:</span>{" "}
                <span className="font-medium text-slate-800">{user.position?.title || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Department:</span>{" "}
                <span className="font-medium text-slate-800">{user.position?.department?.name || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Member since:</span>{" "}
                <span className="font-medium text-slate-800">{memberSince}</span>
              </div>
              <div>
                <span className="text-slate-500">Total Points:</span>{" "}
                <span className="font-medium text-emerald-600">{user.totalPoints.toLocaleString()} XP</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                ✏️ Edit
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Companies Card ── */}
      <Card title="Company Memberships" padding="sm">
        {user.userCompanies.length === 0 ? (
          <p className="text-sm text-slate-400">No company memberships.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {user.userCompanies.map((uc) => (
              <div key={uc.company.id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs">
                <span className="font-semibold text-blue-800">{uc.company.companyID}</span>
                <span className="text-blue-600">{uc.company.companyName}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
