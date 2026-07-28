export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
        <p className="text-sm text-slate-400 mt-4">Loading…</p>
      </div>
    </div>
  );
}
