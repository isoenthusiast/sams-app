/**
 * Simple markdown-to-HTML formatter for AI chat responses.
 * Handles: **bold**, *italic*, - lists, 1. numbered lists, `code`, line breaks.
 */
export function formatMarkdown(text: string): string {
  if (!text) return "";

  let html = text
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="bg-slate-800 text-slate-100 rounded p-3 my-2 text-xs overflow-x-auto"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-200 text-red-700 px-1 rounded text-xs">$1</code>');

  // Bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*text*)
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers (### text)
  html = html.replace(/^### (.+)$/gm, "<h4 class=\"font-semibold text-slate-800 mt-3 mb-1\">$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3 class=\"font-semibold text-slate-800 mt-3 mb-1\">$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2 class=\"font-semibold text-slate-800 mt-3 mb-1\">$1</h2>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr class=\"border-slate-200 my-2\" />");

  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  // Wrap consecutive <li> in <ol>
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, (_m) => {
    // Find groups of consecutive LIs
    return _m;
  });

  // Unordered lists (- item)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive list items in proper tags
  // First, mark where lists start/end
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, (match) => {
    // Determine if it's an ordered list (contains numbers) or unordered
    // Simple heuristic: wrap in <ul>
    return `<ul class="list-disc pl-5 my-1 space-y-0.5">${match}</ul>`;
  });

  // Line breaks (double newline → paragraph, single → <br>)
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  // Wrap in paragraph if not already
  if (!html.startsWith("<")) {
    html = `<p>${html}</p>`;
  }

  return html;
}
