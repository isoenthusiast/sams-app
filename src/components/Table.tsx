"use client";

type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
};

type TableProps<T extends Record<string, unknown>> = {
  columns: Array<Column<T>>;
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
};

export function Table<T extends Record<string, unknown>>({ columns, data, loading, emptyMessage = "No data.", onRowClick }: TableProps<T>) {
  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (data.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">{emptyMessage}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" role="region" aria-label="Data table" tabIndex={0}>
      <table className="w-full text-sm" role="table">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr role="row">
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined} className="px-4 py-3 text-left font-medium text-slate-600" role="columnheader" scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              role="row"
              className={`border-t border-slate-100 ${onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-2.5 text-slate-700" role="cell">
                  {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
