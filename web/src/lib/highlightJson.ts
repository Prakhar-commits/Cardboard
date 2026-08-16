// Tokenizes pretty-printed JSON into HTML spans for the SpecPanel's syntax highlighting.
// Keys blue-ish, strings amber, numbers coral, booleans/null purple, punctuation dim.
const TOKEN_RE = /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;

export function highlightJson(json: string): string {
  const escaped = json.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

  return escaped.replace(TOKEN_RE, (match) => {
    let cls = "text-accent"; // number
    if (/^"/.test(match)) {
      cls = /:$/.test(match) ? "text-sky-400" : "text-amber-400"; // key vs string
    } else if (/true|false|null/.test(match)) {
      cls = "text-purple-400";
    }
    return `<span class="${cls}">${match}</span>`;
  });
}
