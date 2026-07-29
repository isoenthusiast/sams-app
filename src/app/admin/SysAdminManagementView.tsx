"use client";

import { useState } from "react";

const MENU_ITEMS = [
  { key: "activity", label: "📜 Activity Log" },
] as const;

export function SysAdminManagementView({
  activityLog,
}: {
  activityLog: any[];
}) {
  const [activeTab, setActiveTab] = useState<string>("activity");

  return (
    <div className="mt-6 flex gap-0 border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[65vh]">
      <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SysAdmin</h3>
        </div>
        <nav className="flex-1 py-2">
          {MENU_ITEMS.map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeTab === item.key ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-l-blue-600" : "text-slate-600 hover:bg-slate-100 border-l-2 border-l-transparent"
              }`}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-5 min-w-0">
        {activeTab === "activity" && (
          <div>
            <p className="text-sm text-slate-500 mb-4">Last 50 activity log entries</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 text-left">
                    <th className="py-2 pr-3 w-36 whitespace-nowrap">Timestamp</th>
                    <th className="py-2 pr-3 w-24 whitespace-nowrap">Type</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 w-20 text-right whitespace-nowrap">User</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLog.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 align-top">
                      <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs font-medium text-slate-600 whitespace-nowrap">{log.activityType}</td>
                      <td className="py-2 pr-3 text-slate-700 break-words whitespace-normal" title={log.description}>{log.description}</td>
                      <td className="py-2 text-xs text-slate-400 text-right whitespace-nowrap">{log.username}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {activityLog.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No activity recorded yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
