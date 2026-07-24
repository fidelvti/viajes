#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const imageExtensions = new Set([".apng", ".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function renderInline(markdown) {
  let text = escapeHtml(markdown);

  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, alt, href, title) => {
    const decodedHref = decodeURI(href);
    const ext = path.extname(decodedHref).toLowerCase();
    const label = alt || path.basename(decodedHref);

    if (imageExtensions.has(ext)) {
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
      return `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}"${titleAttr}>`;
    }

    return `<a class="attachment" href="${escapeAttr(href)}">${renderInline(label)}</a>`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, label, href, title) => {
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    return `<a href="${escapeAttr(href)}"${titleAttr}>${renderInline(label)}</a>`;
  });

  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");

  return text;
}

function renderParagraph(lines) {
  return `<p>${renderInline(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
}

function closeList(state, out) {
  if (!state.listType) return;
  out.push(`</${state.listType}>`);
  state.listType = null;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const paragraph = [];
  const state = { listType: null, code: false, codeLines: [] };

  function flushParagraph() {
    if (!paragraph.length) return;
    closeList(state, out);
    out.push(renderParagraph(paragraph));
    paragraph.length = 0;
  }

  for (const line of lines) {
    const fence = line.match(/^```/);
    if (fence) {
      if (state.code) {
        out.push(`<pre><code>${escapeHtml(state.codeLines.join("\n"))}</code></pre>`);
        state.code = false;
        state.codeLines = [];
      } else {
        flushParagraph();
        closeList(state, out);
        state.code = true;
      }
      continue;
    }

    if (state.code) {
      state.codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList(state, out);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList(state, out);
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (state.listType !== "ul") {
        closeList(state, out);
        out.push("<ul>");
        state.listType = "ul";
      }
      out.push(`<li>${renderInline(unordered[1].trim())}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (state.listType !== "ol") {
        closeList(state, out);
        out.push("<ol>");
        state.listType = "ol";
      }
      out.push(`<li>${renderInline(ordered[1].trim())}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      closeList(state, out);
      out.push(`<blockquote>${renderInline(quote[1].trim())}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList(state, out);

  if (state.code) {
    out.push(`<pre><code>${escapeHtml(state.codeLines.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

function titleFromMarkdown(markdown, fallback) {
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  return firstHeading ? firstHeading[1].trim() : fallback;
}

function htmlDocument(title, body) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f7;
      --paper: #ffffff;
      --text: #1d1d1f;
      --muted: #6e6e73;
      --border: #d2d2d7;
      --link: #0066cc;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at 50% -20%, #ffffff 0, #f5f5f7 42%, #ececf0 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
      font-size: 17px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    main {
      width: min(980px, calc(100% - 40px));
      margin: 44px auto;
      padding: clamp(28px, 5vw, 72px);
      background: var(--paper);
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 28px;
      box-shadow: var(--shadow);
    }

    h1, h2, h3, h4, h5, h6 {
      line-height: 1.08;
      margin: 1.7em 0 0.55em;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
      font-weight: 700;
      letter-spacing: 0;
    }

    h1 {
      margin-top: 0;
      margin-bottom: 1.2rem;
      font-size: clamp(2.4rem, 7vw, 5rem);
      text-align: center;
    }

    p, ul, ol, blockquote, pre {
      margin: 0 0 1.15rem;
    }

    a {
      color: var(--link);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 2rem auto;
      border-radius: 18px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
    }

    blockquote {
      padding: 0.35rem 0 0.35rem 1.25rem;
      color: var(--muted);
      border-left: 4px solid var(--border);
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.95em;
    }

    pre {
      overflow: auto;
      padding: 1.1rem;
      background: #f5f5f7;
      border-radius: 14px;
    }

    .attachment {
      display: inline-block;
      margin: 0.35rem 0;
      padding: 0.7rem 1rem;
      background: #f5f5f7;
      border-radius: 999px;
      font-weight: 600;
    }

    @media (max-width: 640px) {
      main {
        width: auto;
        margin: 0;
        padding: 24px 20px;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <main>
${body.split("\n").map((line) => `    ${line}`).join("\n")}
  </main>
</body>
</html>
`;
}

const files = fs
  .readdirSync(root)
  .filter((file) => file.endsWith(".md"))
  .sort();

for (const file of files) {
  const markdown = fs.readFileSync(path.join(root, file), "utf8");
  const title = titleFromMarkdown(markdown, path.basename(file, ".md"));
  const body = renderMarkdown(markdown);
  const output = path.join(root, file.replace(/\.md$/, ".html"));
  fs.writeFileSync(output, htmlDocument(title, body));
  console.log(`${file} -> ${path.basename(output)}`);
}

console.log(`Converted ${files.length} markdown files.`);
