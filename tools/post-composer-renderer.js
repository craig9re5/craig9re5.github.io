/*
 * 发帖器预览 与 线上加密文章 共用的 Markdown 渲染器。
 *
 * 注意：这个文件有两份副本，必须保持一致——
 *   tools/post-composer-renderer.js      发帖器的实时预览
 *   assets/js/post-composer-renderer.js  _layouts/post.html 用它渲染解密后的加密文章
 * 改了一份记得同步另一份，否则预览和线上会对不上。
 *
 * 目标不是实现完整的 kramdown，而是让"预览里长什么样"和"发出去长什么样"
 * 在日常写作会用到的语法上保持一致。
 */

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safePreviewUrl(rawUrl, isImage) {
  const value = String(rawUrl || "").trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) {
    return "";
  }
  if (/^https?:/i.test(value)) {
    return value;
  }
  if (!isImage && /^mailto:/i.test(value)) {
    return value;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }
  return "";
}

/* ---------------- 原始 HTML 的白名单清洗 ---------------- */

const ALLOWED_HTML_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "del", "div", "em", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p",
  "pre", "s", "small", "span", "strong", "sub", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "u", "ul"
]);

const ALLOWED_HTML_ATTRS = new Set([
  "alt", "class", "colspan", "decoding", "height", "href", "loading",
  "rel", "rowspan", "src", "target", "title", "width"
]);

// 正文里的原始 HTML 原样透传，但先过一遍白名单。
// 用 <template> 解析：里面的内容是惰性的，脚本不会执行、图片也不会发请求。
function sanitizeHtml(raw) {
  if (typeof document === "undefined") {
    return escapeHtml(raw);
  }

  const template = document.createElement("template");
  template.innerHTML = raw;

  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 8) {
        child.remove();
        return;
      }
      if (child.nodeType !== 1) {
        return;
      }

      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tag)) {
        child.remove();
        return;
      }

      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_HTML_ATTRS.has(name)) {
          child.removeAttribute(attr.name);
          return;
        }
        if (name === "href" || name === "src") {
          const safe = safePreviewUrl(attr.value, name === "src");
          if (safe) {
            child.setAttribute(name, safe);
          } else {
            child.removeAttribute(attr.name);
          }
        }
      });

      if (tag === "a" && child.getAttribute("target") === "_blank") {
        child.setAttribute("rel", "noreferrer");
      }

      walk(child);
    });
  };

  walk(template.content);
  return template.innerHTML;
}

/* ---------------- 行内语法 ---------------- */

function renderInlineMarkdown(text) {
  const tokens = [];

  function stash(pattern, renderer, input) {
    return input.replace(pattern, (...args) => {
      const token = "%%TOKEN_" + tokens.length + "%%";
      tokens.push(renderer(...args));
      return token;
    });
  }

  let value = text;

  // 行内代码最先取出，里面的一切都不再当作标记
  value = stash(/`([^`]+)`/g, (_, code) => "<code>" + escapeHtml(code) + "</code>", value);

  value = stash(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const safeSrc = safePreviewUrl(src, true);
    return safeSrc
      ? "<img src=\"" + escapeHtml(safeSrc) + "\" alt=\"" + escapeHtml(alt) + "\">"
      : "<span class=\"preview-blocked-url\">[已拦截不安全图片地址]</span>";
  }, value);

  // 允许 URL 里带一层成对括号，维基百科那种 /wiki/Foo_(bar) 才不会被截断
  value = stash(/\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))+)\)/g, (_, label, href) => {
    const safeHref = safePreviewUrl(href, false);
    return safeHref
      ? "<a href=\"" + escapeHtml(safeHref) + "\" target=\"_blank\" rel=\"noreferrer\">" + escapeHtml(label) + "</a>"
      : "<span class=\"preview-blocked-url\">" + escapeHtml(label) + "</span>";
  }, value);

  // 行内 HTML 标签也先存起来，免得被下面的 escapeHtml 变成字面文字
  value = stash(/<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?>/g, (tag) => sanitizeHtml(tag), value);

  value = escapeHtml(value);

  value = value.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  value = value.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // 下划线强调：只认词边界，避免把 snake_case_name 拆开
  value = value.replace(/(^|[\s(])__([^_]+)__(?=$|[\s.,!?)])/g, "$1<strong>$2</strong>");
  value = value.replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,!?)])/g, "$1<em>$2</em>");

  value = value.replace(/%%TOKEN_(\d+)%%/g, (_, index) => tokens[Number(index)]);
  return value;
}

// 段落内的软换行：行尾两个空格 = 硬换行，其余按 kramdown 的做法用空格连接
function renderParagraphText(lines) {
  return lines
    .map((line, index) => {
      const hardBreak = /  $/.test(line) && index < lines.length - 1;
      return renderInlineMarkdown(line.trim()) + (hardBreak ? "<br>" : "");
    })
    .join(" ")
    .replace(/<br> /g, "<br>");
}

/* ---------------- 块级语法 ---------------- */

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```(.*)$/;
const HTML_BLOCK_RE = /^\s*<([a-zA-Z][\w-]*)(?:\s|>|\/)/;

function indentWidth(line) {
  return line.match(/^\s*/)[0].replace(/\t/g, "  ").length;
}

function isBlockStart(line) {
  return HEADING_RE.test(line)
    || HR_RE.test(line)
    || FENCE_RE.test(line)
    || LIST_ITEM_RE.test(line)
    || HTML_BLOCK_RE.test(line)
    || /^\s*>/.test(line);
}

function isTableAt(lines, index) {
  const header = lines[index];
  const divider = lines[index + 1];
  if (!header || !divider || header.indexOf("|") === -1) {
    return false;
  }
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(divider) && divider.indexOf("-") !== -1;
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines, start) {
  const alignments = splitTableRow(lines[start + 1]).map((spec) => {
    const left = spec.startsWith(":");
    const right = spec.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });

  const cell = (text, index, tag) => {
    const align = alignments[index] ? " style=\"text-align:" + alignments[index] + "\"" : "";
    return "<" + tag + align + ">" + renderInlineMarkdown(text) + "</" + tag + ">";
  };

  const head = "<thead><tr>"
    + splitTableRow(lines[start]).map((text, i) => cell(text, i, "th")).join("")
    + "</tr></thead>";

  const bodyRows = [];
  let index = start + 2;
  while (index < lines.length && lines[index].trim() && lines[index].indexOf("|") !== -1) {
    bodyRows.push("<tr>" + splitTableRow(lines[index]).map((text, i) => cell(text, i, "td")).join("") + "</tr>");
    index += 1;
  }

  return {
    html: "<table>" + head + "<tbody>" + bodyRows.join("") + "</tbody></table>",
    next: index
  };
}

function renderQuote(lines, start) {
  const inner = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*>/.test(line)) {
      inner.push(line.replace(/^\s*>\s?/, ""));
      index += 1;
      continue;
    }
    // 引用的懒续行：没有 > 前缀但仍属于这段引用
    if (line.trim() && !isBlockStart(line)) {
      inner.push(line.trim());
      index += 1;
      continue;
    }
    break;
  }

  return { html: "<blockquote>" + renderBlocks(inner) + "</blockquote>", next: index };
}

function renderList(lines, start) {
  const first = LIST_ITEM_RE.exec(lines[start]);
  const baseIndent = indentWidth(lines[start]);
  const ordered = /\d/.test(first[2]);
  const items = [];
  let index = start;
  let loose = false;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      // 空行后如果还有属于本列表的内容，说明这是个"松散列表"，继续收
      const peek = index + 1;
      if (peek < lines.length && lines[peek].trim()) {
        const match = LIST_ITEM_RE.exec(lines[peek]);
        const width = indentWidth(lines[peek]);
        if ((match && indentWidth(lines[peek]) === baseIndent) || width > baseIndent) {
          loose = true;
          if (items.length) {
            items[items.length - 1].push("");
          }
          index = peek;
          continue;
        }
      }
      break;
    }

    const match = LIST_ITEM_RE.exec(line);
    const width = indentWidth(line);

    if (match && width === baseIndent) {
      if (/\d/.test(match[2]) !== ordered) {
        break;
      }
      items.push([match[3]]);
      index += 1;
      continue;
    }

    if (width > baseIndent) {
      // 缩进内容归属当前条目，去掉一层缩进后递归处理（子列表就是这么来的）
      if (!items.length) {
        break;
      }
      items[items.length - 1].push(line.slice(Math.min(width, baseIndent + 2)));
      index += 1;
      continue;
    }

    if (!match && !isBlockStart(line)) {
      // 懒续行：接在上一个条目后面，而不是另起一个段落
      if (!items.length) {
        break;
      }
      items[items.length - 1].push(line.trim());
      index += 1;
      continue;
    }

    break;
  }

  const renderedItems = items.map((itemLines) => {
    const trimmed = itemLines.slice();
    while (trimmed.length && !trimmed[trimmed.length - 1].trim()) {
      trimmed.pop();
    }

    const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(trimmed[0] || "");
    let checkbox = "";
    if (taskMatch) {
      checkbox = "<input type=\"checkbox\" disabled" + (taskMatch[1].toLowerCase() === "x" ? " checked" : "") + "> ";
      trimmed[0] = taskMatch[2];
    }

    // 开头连续的普通行是条目本身的文字，之后的（子列表、代码块等）按块渲染。
    // 紧凑列表里不给这段文字套 <p>，否则带子列表的条目会平白多出一截行距。
    let split = trimmed.length;
    for (let i = 1; i < trimmed.length; i += 1) {
      if (!trimmed[i].trim() || isBlockStart(trimmed[i])) {
        split = i;
        break;
      }
    }

    const lead = trimmed.slice(0, split);
    const rest = trimmed.slice(split);
    const leadText = lead.length ? renderParagraphText(lead) : "";
    const leadHtml = lead.length && loose ? "<p>" + leadText + "</p>" : leadText;
    const restHtml = rest.length ? renderBlocks(rest) : "";

    return "<li>" + checkbox + leadHtml + restHtml + "</li>";
  });

  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && first[2].replace(/[.)]/, "") !== "1"
    ? " start=\"" + Number(first[2].replace(/[.)]/, "")) + "\""
    : "";

  return { html: "<" + tag + startAttr + ">" + renderedItems.join("") + "</" + tag + ">", next: index };
}

// 逐块顺序处理：把结果直接 push 进 html 数组。
// 以前 paragraph / listItems / quoteLines 是三个并行缓冲区、用固定顺序 flush，
// 于是子列表和懒续行会被渲染到它所属的列表/引用**前面**，内容顺序整个错位。
function renderBlocks(lines) {
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const language = fence[1].trim();
      const code = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const classAttr = language ? " class=\"language-" + escapeHtml(language) + "\"" : "";
      html.push("<pre><code" + classAttr + ">" + escapeHtml(code.join("\n")) + "</code></pre>");
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push("<h" + level + ">" + renderInlineMarkdown(heading[2].trim()) + "</h" + level + ">");
      index += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = renderQuote(lines, index);
      html.push(quote.html);
      index = quote.next;
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const list = renderList(lines, index);
      html.push(list.html);
      index = list.next;
      continue;
    }

    if (isTableAt(lines, index)) {
      const table = renderTable(lines, index);
      html.push(table.html);
      index = table.next;
      continue;
    }

    if (HTML_BLOCK_RE.test(line)) {
      const block = [];
      while (index < lines.length && lines[index].trim()) {
        block.push(lines[index]);
        index += 1;
      }
      html.push(sanitizeHtml(block.join("\n")));
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index]) && !isTableAt(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length) {
      html.push("<p>" + renderParagraphText(paragraph) + "</p>");
    } else {
      // 兜底：万一某行既不成块也进不了段落，别在这里死循环
      index += 1;
    }
  }

  return html.join("");
}

function renderMarkdown(markdown) {
  return renderBlocks(String(markdown == null ? "" : markdown).replace(/\r\n/g, "\n").split("\n"));
}
