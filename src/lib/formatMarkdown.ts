/**
 * Simple markdown-to-HTML formatter for AI chat responses.
 * Handles: **bold**, *italic*, lists, `code`, headers, tables, line breaks.
 */
export function formatMarkdown(text: string): string {
  if (!text) return "";

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 1. Code blocks (``` ... ```) — preserve before other processing
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    codeBlocks.push(`<pre class="bg-slate-800 text-slate-100 rounded p-3 my-2 text-xs overflow-x-auto"><code>${code.trim()}</code></pre>`);
    return `%%CB${codeBlocks.length - 1}%%`;
  });

  // 2. Tables — must process before line breaks
  html = html.replace(/(\|[^\n]+\|\n\|[-:| ]+\|\n(\|[^\n]+\|\n?)+)/g, (match) => {
    const lines = match.trim().split("\n");
    let table = '<table class="w-full text-xs border-collapse my-2"><thead>';
    const headers = lines[0].split("|").filter((c: string) => c.trim());
    table += "<tr class=\"bg-slate-100\">";
    for (const h of headers) {
      table += `<th class="border border-slate-300 px-2 py-1 text-left font-semibold">${h.trim()}</th>`;
    }
    table += "</tr></thead><tbody>";
    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i].split("|").filter((c: string) => c.trim());
      if (cells.length === 0) continue;
      table += "<tr class=\"even:bg-slate-50\">";
      for (const cell of cells) {
        table += `<td class="border border-slate-200 px-2 py-1">${cell.trim()}</td>`;
      }
      table += "</tr>";
    }
    table += "</tbody></table>";
    return table;
  });

  // 3. Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-200 text-red-700 px-1 rounded text-xs">$1</code>');

  // 4. Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 5. Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-slate-800 mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold text-slate-800 mt-3 mb-1">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="font-semibold text-slate-800 mt-3 mb-1">$1</h2>');

  // 6. HR
  html = html.replace(/^---$/gm, '<hr class="border-slate-200 my-2" />');

  // 7. Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul class="list-disc pl-5 my-1 space-y-0.5">$1</ul>');

  // 8. Restore code blocks
  html = html.replace(/%%CB(\d+)%%/g, (_m, i) => codeBlocks[parseInt(i)]);

  // 9. Line breaks and paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  if (!/^<(p|table|pre|ul|ol|h[1-4]|hr|div)/.test(html)) {
    html = `<p>${html}</p>`;
  }

  return html;
}
