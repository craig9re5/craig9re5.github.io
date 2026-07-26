const DRAFT_STORAGE_KEY = "post-composer-draft-v2";
const LIBRARY_EXPANDED_STORAGE_KEY = "post-composer-library-expanded";

const titleInput = document.querySelector("#title");
const langInput = document.querySelector("#lang");
const publishInput = document.querySelector("#publishAt");
const slugInput = document.querySelector("#slug");
const slugHelp = document.querySelector("#slug-help");
const excerptInput = document.querySelector("#excerpt");
const tagsInput = document.querySelector("#tags-input");
const addTagButton = document.querySelector("#add-tag");
const postSearchInput = document.querySelector("#post-search");
const postListEl = document.querySelector("#post-list");
const newPostButton = document.querySelector("#new-post");
const composerLayout = document.querySelector("#composer-layout");
const toggleLibraryButton = document.querySelector("#toggle-library");
const libraryToggleLabel = document.querySelector("#library-toggle-label");
const libraryCurrentMeta = document.querySelector("#library-current-meta");
const composerModeChip = document.querySelector("#composer-mode-chip");
const composerHeading = document.querySelector("#composer-heading");
const bodyInput = document.querySelector("#body");
const statusEl = document.querySelector("#status");
const fileNameEl = document.querySelector("#file-name");
const previewHost = document.querySelector("#preview-host");
const previewTitle = document.querySelector("#preview-title");
const previewDate = document.querySelector("#preview-date");
const previewTags = document.querySelector("#preview-tags");
const editorStats = document.querySelector("#editor-stats");
const imagePicker = document.querySelector("#image-picker");
const connectionChip = document.querySelector("#connection-chip");
const connectionCopy = document.querySelector("#connection-copy");
const selectedTagsEl = document.querySelector("#selected-tags");
const savePublishButton = document.querySelector("#save-publish-post");
const downloadButton = document.querySelector("#download-post");
const passwordInput = document.querySelector("#post-password");
const ENCRYPTED_SIG = "::ENCRYPTED::";
const insertLocalImageButton = document.querySelector("#insert-local-image");
const insertRemoteImageButton = document.querySelector("#insert-remote-image");
const toolbarButtons = document.querySelectorAll("[data-action]");

const requestedEditFile = normalizePostFileName(new URLSearchParams(window.location.search).get("edit"));

const state = {
  serviceReady: false,
  repositoryName: "",
  requestToken: "",
  slugTouched: false,
  selectedTags: [],
  availableTags: [],
  hiddenPosts: new Set(),
  postsIndex: [],
  uiReady: false,
  libraryExpanded: false,
  mode: "create",
  currentFileName: "",
  originalFileName: "",
  originalAssetSlug: "",
  lastSavedContext: null,
  publishing: false,
  dirtyBaseline: "",
  lastRenderedBody: null,
  originalPublished: undefined,
  originalEncrypted: false,
  pendingEditFile: requestedEditFile
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function defaultDateTimeLocal() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-") + "T" + [pad(now.getHours()), pad(now.getMinutes())].join(":");
}

function formatOffset(date) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(totalMinutes);
  return sign + pad(Math.floor(absMinutes / 60)) + pad(absMinutes % 60);
}

function frontMatterDate(dateTimeValue) {
  const date = dateTimeValue ? new Date(dateTimeValue) : new Date();
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [pad(date.getHours()), pad(date.getMinutes()), "00"].join(":") + " " + formatOffset(date);
}

function formatPreviewDate(dateTimeValue, lang) {
  const value = dateTimeValue ? new Date(dateTimeValue) : new Date();
  const locale = lang === "zh-Hant" ? "zh-TW" : lang === "zh-Hans" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(value);
}

function formatListDate(post) {
  if (post.publishAt) {
    return formatPreviewDate(post.publishAt, post.lang || "en-US");
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(post.sortTimestamp || post.lastModified));
}

function slugFromTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// \u7eaf\u4e2d\u6587\u6807\u9898\u8f6c\u4e0d\u51fa slug\uff0c\u8fd9\u65f6\u624d\u7528"\u65f6\u95f4+\u968f\u673a"\u515c\u5e95\u3002
// \u53ea\u80fd\u5728\u771f\u6b63\u8981\u843d\u76d8\u65f6\u8c03\u7528\uff08\u751f\u6210\u6587\u4ef6\u540d\u3001\u5efa\u56fe\u7247\u76ee\u5f55\uff09\u3002
// \u4ee5\u524d\u5b83\u85cf\u5728 slugFromTitle \u91cc\uff0c\u800c syncSlugFromTitle \u6bcf\u6b21\u6309\u952e\u90fd\u4f1a\u8dd1\uff0c
// \u7ed3\u679c\u9875\u9762\u4e00\u52a0\u8f7d\uff08\u6807\u9898\u8fd8\u7a7a\u7740\uff09\u5c31\u628a\u968f\u673a\u4e32\u5199\u6b7b\u8fdb slug \u8f93\u5165\u6846\uff0c
// \u4e4b\u540e\u518d\u6539\u6807\u9898\u4e5f\u4e0d\u4f1a\u66f4\u65b0\u2014\u2014_posts \u91cc 0026-b9a / 2338-1fm / 2051-dwb
// \u8fd9\u4e09\u4e2a\u6c38\u4e45 URL \u5c31\u662f\u8fd9\u4e48\u6765\u7684\u3002
function generateFallbackSlug() {
  const date = publishInput.value ? new Date(publishInput.value) : new Date();
  const timePart = pad(date.getHours()) + pad(date.getMinutes());
  const randomPart = Math.random().toString(36).slice(2, 5).padEnd(3, "0");
  return timePart + "-" + randomPart;
}

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 项目规则（.agents/AGENTS.md）：摘要没有手写时必须是空字符串，
// 不允许由脚本从正文里截一段自动生成。
function buildExcerpt() {
  return excerptInput.value.trim();
}

// 标题或摘要里粘进换行/制表符时，不转义会直接写出断行的 front matter，
// Jekyll 那边就是一个解析错误。
function yamlString(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return "\"" + escaped + "\"";
}

function normalizeTag(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseTagTokens(raw) {
  return raw
    .split(",")
    .map((token) => normalizeTag(token))
    .filter(Boolean);
}

function normalizePostFileName(value) {
  if (!value) {
    return "";
  }

  const candidate = String(value).trim().split(/[\\/]/).pop();
  return /^[A-Za-z0-9._-]+\.md$/.test(candidate) ? candidate : "";
}

function assetSlugFromFileName(fileName) {
  const normalized = normalizePostFileName(fileName);
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  return safeSlug(match ? match[1] : normalized.replace(/\.md$/, ""));
}

function parseCanonicalTimestamp(rawDate, fileName, lastModified) {
  const normalizedDate = String(rawDate || "").trim();
  if (normalizedDate) {
    const jsDate = normalizedDate
      .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s+([+-]\d{2})(\d{2}))?$/, (_, date, time, hourOffset, minuteOffset) => (
        date + "T" + time + (hourOffset ? hourOffset + ":" + minuteOffset : "")
      ));
    const parsed = Date.parse(jsDate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const fileMatch = normalizePostFileName(fileName).match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (fileMatch) {
    const parsed = new Date(Number(fileMatch[1]), Number(fileMatch[2]) - 1, Number(fileMatch[3])).getTime();
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return lastModified;
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    // 与 yamlString 对称地还原，否则含换行的标题读回来会带着字面的 \n
    return trimmed.slice(1, -1).replace(/\\([\\"nrt])/g, (_, char) => (
      { n: "\n", r: "\r", t: "\t" }[char] || char
    ));
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  return trimmed;
}

function splitFrontMatter(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontMatter: "", body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { frontMatter: "", body: normalized };
  }

  const frontMatter = normalized.slice(4, endIndex);
  let body = normalized.slice(endIndex + 5);
  if (body.startsWith("\n")) {
    body = body.slice(1);
  }

  return { frontMatter, body };
}

function inputValueFromFrontMatterDate(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? match[1] + "T" + match[2] : "";
}

function parseFrontMatterBlock(frontMatter) {
  const fields = {};
  const lines = frontMatter.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2];

    if (key === "tags") {
      const tags = [];
      const inline = rawValue.trim();

      if (inline.startsWith("[") && inline.endsWith("]")) {
        inline
          .slice(1, -1)
          .split(",")
          .map((item) => normalizeTag(parseYamlScalar(item)))
          .filter(Boolean)
          .forEach((tag) => tags.push(tag));
      } else {
        for (let child = index + 1; child < lines.length; child += 1) {
          const tagLine = lines[child];
          if (!/^\s*-\s+/.test(tagLine)) {
            break;
          }
          const value = normalizeTag(parseYamlScalar(tagLine.replace(/^\s*-\s+/, "")));
          if (value) {
            tags.push(value);
          }
        }
      }

      fields.tags = tags;
      continue;
    }

    fields[key] = parseYamlScalar(rawValue);
  }

  return fields;
}

function parsePostDocument(fileName, source, lastModified) {
  const parts = splitFrontMatter(source);
  const fields = parseFrontMatterBlock(parts.frontMatter);
  return {
    fileName,
    title: fields.title || fileName.replace(/\.md$/, ""),
    excerpt: fields.excerpt || "",
    lang: fields.lang || "en-US",
    publishAt: inputValueFromFrontMatterDate(fields.date) || "",
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    body: parts.body,
    lastModified,
    sortTimestamp: parseCanonicalTimestamp(fields.date, fileName, lastModified),
    assetSlug: assetSlugFromFileName(fileName),
    encrypted: fields.encrypted === true || fields.encrypted === "true",
    encrypted_data: fields.encrypted_data || "",
    encrypted_excerpt: fields.encrypted_excerpt || "",
    // "隐藏并发布到网站"是靠服务端往 front matter 写 published: false 实现的。
    // buildMarkdown 会整份重建 front matter，这个键必须带回来，
    // 否则改个错字再保存就把文章重新公开了。
    published: fields.published === false || fields.published === "false" ? false : undefined
  };
}

function decryptContent(ciphertext, password) {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, password);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (decrypted.startsWith(ENCRYPTED_SIG + "\n")) {
      return decrypted.slice((ENCRYPTED_SIG + "\n").length);
    }
  } catch (e) {
    // decryption failed
  }
  return null;
}

function isPostHiddenLocally(fileName) {
  return state.hiddenPosts.has(normalizePostFileName(fileName));
}

function hasTag(tag) {
  return state.selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
}

function addTag(tag) {
  const normalized = normalizeTag(tag);
  if (!normalized || hasTag(normalized)) {
    return false;
  }

  setPublishAvailability(null);
  state.selectedTags.push(normalized);
  renderTags();
  renderPreview();
  return true;
}

function removeTag(tag) {
  setPublishAvailability(null);
  state.selectedTags = state.selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
  renderTags();
  renderPreview();
}

function collectPendingTags() {
  const pending = parseTagTokens(tagsInput.value);
  if (!pending.length) {
    return;
  }

  pending.forEach(addTag);
  tagsInput.value = "";
  renderTags();
  renderPreview();
}

function toggleTag(tag) {
  setPublishAvailability(null);
  if (hasTag(tag)) {
    state.selectedTags = state.selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
  } else {
    state.selectedTags.push(tag);
  }
  renderTags();
  renderPreview();
}

function renderSelectedTags() {
  const allTagsSet = new Set([
    ...state.availableTags,
    ...state.selectedTags
  ]);
  
  const allTags = Array.from(allTagsSet).sort((a, b) => a.localeCompare(b));
  
  if (!allTags.length) {
    selectedTagsEl.innerHTML = "<span class=\"tag-empty\">还没有任何标签</span>";
    return;
  }
  
  selectedTagsEl.innerHTML = allTags.map((tag) => {
    const isSelected = hasTag(tag);
    if (isSelected) {
      return (
        "<button class=\"tag-pill selected\" type=\"button\" data-toggle-tag=\"" + escapeHtml(tag) + "\">" +
          "<span>" + escapeHtml(tag) + "</span>" +
          "<span class=\"tag-pill-remove\" aria-hidden=\"true\">×</span>" +
        "</button>"
      );
    } else {
      return (
        "<button class=\"tag-pill suggestion\" type=\"button\" data-toggle-tag=\"" + escapeHtml(tag) + "\">" +
          "<span>" + escapeHtml(tag) + "</span>" +
        "</button>"
      );
    }
  }).join("");
}

function renderPreviewTags() {
  if (!state.selectedTags.length) {
    previewTags.innerHTML = "";
    previewTags.hidden = true;
    return;
  }

  previewTags.hidden = false;
  previewTags.innerHTML = state.selectedTags.map((tag) => (
    "<span class=\"preview-tag\">" + escapeHtml(tag) + "</span>"
  )).join("");
}

function renderTags() {
  renderSelectedTags();
  renderPreviewTags();
  schedulePersistDraft();
}

function getCurrentSlug() {
  if (state.mode === "edit" && state.originalAssetSlug) {
    return state.originalAssetSlug;
  }

  return safeSlug(slugInput.value.trim()) || slugFromTitle(titleInput.value.trim());
}

// 需要一个确定可用的 slug 时（落盘文件名、建图片目录）才调这个。
// 不要在 renderPreview 这类每次按键都会跑的路径里调用。
function ensureSlug() {
  const current = getCurrentSlug();
  if (current) {
    return current;
  }

  const generated = generateFallbackSlug();
  slugInput.value = generated;
  state.slugTouched = true;
  return generated;
}

function buildFileName() {
  if (state.mode === "edit" && state.originalFileName) {
    return state.originalFileName;
  }

  const slug = getCurrentSlug();
  if (!slug) {
    return "";
  }

  const sourceDate = publishInput.value ? new Date(publishInput.value) : new Date();
  const datePart = [
    sourceDate.getFullYear(),
    pad(sourceDate.getMonth() + 1),
    pad(sourceDate.getDate())
  ].join("-");
  return datePart + "-" + slug + ".md";
}

function buildMarkdown() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  const excerpt = buildExcerpt();
  const password = passwordInput ? passwordInput.value.trim() : "";

  const lines = [
    "---",
    "layout: post",
    "title: " + yamlString(title || "Untitled Post"),
    "date: " + frontMatterDate(publishInput.value)
  ];

  let finalExcerpt = excerpt;
  let finalBody = body;
  if (password) {
    lines.push("encrypted: true");
    const plainTextToEncrypt = ENCRYPTED_SIG + "\n" + body;
    const ciphertext = CryptoJS.AES.encrypt(plainTextToEncrypt, password).toString();
    lines.push("encrypted_data: " + yamlString(ciphertext));
    
    if (excerpt) {
      const encryptedExcerpt = CryptoJS.AES.encrypt(ENCRYPTED_SIG + "\n" + excerpt, password).toString();
      lines.push("encrypted_excerpt: " + yamlString(encryptedExcerpt));
    }
    
    finalExcerpt = "本文已加密保护，请点击标题输入密码访问内容。";
    finalBody = "> 本文已加密保护，请在浏览器中输入密码访问。";
  }

  // 必须无条件写出：省略 excerpt 键的话 Jekyll 会自己拿正文首段当摘要，
  // 那正是 .agents/AGENTS.md 明令禁止的自动摘要。空摘要要落成 excerpt: ""。
  lines.push("excerpt: " + yamlString(finalExcerpt));

  lines.push("lang: " + langInput.value);
  if (state.selectedTags.length) {
    lines.push("tags:");
    state.selectedTags.forEach((tag) => {
      lines.push("  - " + yamlString(tag));
    });
  }

  // 保留"隐藏并发布到网站"写下的下架标记，别让一次普通保存把文章重新公开。
  if (state.originalPublished === false) {
    lines.push("published: false");
  }

  lines.push("---");
  lines.push("");
  lines.push(finalBody);

  return lines.join("\n") + "\n";
}

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = "status-text" + (kind ? " " + kind : "");
}

const SAVE_PUBLISH_IDLE_LABEL = "保存并发送";

function setPublishAvailability(context) {
  state.lastSavedContext = context;
}

// 界面上只有一个主按钮，它必须在整个「保存 → 检查 Git → 推送」过程中说明自己在做什么，
// 并且全程禁用——否则连点两下会发出两次保存请求。
function setBusyState(active, activeLabel) {
  state.publishing = Boolean(active);

  if (!savePublishButton) {
    return;
  }

  savePublishButton.disabled = Boolean(active);
  savePublishButton.textContent = active ? activeLabel : SAVE_PUBLISH_IDLE_LABEL;
  savePublishButton.classList.toggle("is-busy", Boolean(active));
}

function setPublishingState(active, activeLabel = "正在发布...") {
  setBusyState(active, activeLabel);
}

function setConnectionState(mode, text, detail) {
  connectionChip.textContent = text;
  connectionChip.className = "status-chip" + (mode ? " " + mode : "");
  connectionCopy.textContent = detail;
}

function disconnectLocalService(message) {
  state.serviceReady = false;
  state.requestToken = "";
  setPublishAvailability(null);
  setConnectionState("offline", "本地服务未连接", "服务会话已失效，请刷新发帖器页面重新连接。");
  setStatus(message || "本地服务会话已失效，请刷新页面重新连接。", "error");
}

function updateEditorStats() {
  const value = bodyInput.value;
  const lineCount = value ? value.split("\n").length : 0;
  editorStats.textContent = value.length + " 字符 | " + lineCount + " 行";
}

function syncSlugFromTitle() {
  if (state.mode !== "create" || state.slugTouched) {
    return;
  }
  // 每次都从标题重新推导，而不是读回输入框里上一轮写进去的值，
  // 否则一旦写进去就再也跟不上标题了。
  slugInput.value = slugFromTitle(titleInput.value.trim());
}

// 所有对正文的程序化改写都走这里：用 execCommand("insertText") 而不是直接赋值
// bodyInput.value，否则浏览器原生的撤销栈会被清空，Ctrl+Z 撤不回工具栏的操作。
function applyEditorEdit(start, end, text, selectionStart, selectionEnd) {
  bodyInput.focus();
  bodyInput.setSelectionRange(start, end);

  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch (error) {
    inserted = false;
  }

  if (!inserted) {
    // execCommand 不可用时退回 setRangeText，撤销栈会丢，但至少功能可用。
    bodyInput.setRangeText(text, start, end, "end");
    bodyInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  bodyInput.setSelectionRange(selectionStart, selectionEnd);
}

function wrapSelection(before, after, placeholder) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const value = bodyInput.value;
  const selected = value.slice(start, end);

  // 再点一次同一个按钮 = 取消格式。分两种情况：标记在选区外侧，或标记被一起选中。
  const outerStart = start - before.length;
  const outerEnd = end + after.length;
  if (
    selected
    && outerStart >= 0
    && value.slice(outerStart, start) === before
    && value.slice(end, outerEnd) === after
  ) {
    applyEditorEdit(outerStart, outerEnd, selected, outerStart, outerStart + selected.length);
    return;
  }

  if (
    selected.length >= before.length + after.length
    && selected.startsWith(before)
    && selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    applyEditorEdit(start, end, inner, start, start + inner.length);
    return;
  }

  const content = selected || placeholder;
  const cursorStart = start + before.length;
  applyEditorEdit(start, end, before + content + after, cursorStart, cursorStart + content.length);
}

// 默认把光标留在插入内容的末尾。以前默认是把整段插入内容选中，
// 于是插完分割线或图片，随手一打字就把它整个删掉了。
function insertAtSelection(snippet, selectStartOffset = snippet.length, selectEndOffset = 0) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  applyEditorEdit(start, end, snippet, start + selectStartOffset, start + snippet.length - selectEndOffset);
}

// 行首块级标记：标题、引用、任务列表、无序列表、有序列表
const BLOCK_PREFIX_PATTERN = /^(\s*)(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+\.[ \t]+)/;

function stripBlockPrefix(line) {
  return line.replace(BLOCK_PREFIX_PATTERN, "$1");
}

function prefixSelectedLines(prefixFactory) {
  const value = bodyInput.value;
  const selectionStart = bodyInput.selectionStart;
  const selectionEnd = bodyInput.selectionEnd;
  const collapsed = selectionStart === selectionEnd;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const prefixes = lines.map((_, index) => prefixFactory(index));

  // 整块都已经是这个标记时，再点一次就去掉它
  const allPrefixed = lines.every((line, index) => line.startsWith(prefixes[index]));
  const nextLines = allPrefixed
    ? lines.map((line, index) => line.slice(prefixes[index].length))
    // 先剥掉原有的块级标记，避免点了 H1 再点 H2 变成 "## # 标题"
    : lines.map((line, index) => prefixes[index] + stripBlockPrefix(line));
  const replacement = nextLines.join("\n");

  if (collapsed) {
    // 只是把光标停在某一行上就点了按钮：改完让光标留在原来的位置（按首行长度变化平移），
    // 而不是把整行选中——否则接着打字会把刚加的标记连同整行一起替换掉。
    const firstLineDelta = nextLines[0].length - lines[0].length;
    const caret = Math.min(
      Math.max(selectionStart + firstLineDelta, lineStart),
      lineStart + replacement.length
    );
    applyEditorEdit(lineStart, lineEnd, replacement, caret, caret);
    return;
  }

  applyEditorEdit(lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length);
}

function handleToolbarAction(action) {
  switch (action) {
    case "h1":
      return prefixSelectedLines(() => "# ");
    case "h2":
      return prefixSelectedLines(() => "## ");
    case "h3":
      return prefixSelectedLines(() => "### ");
    case "bold":
      return wrapSelection("**", "**", "粗体文字");
    case "italic":
      return wrapSelection("*", "*", "斜体文字");
    case "link":
      return wrapSelection("[", "](https://example.com)", "链接文字");
    case "inline-code":
      return wrapSelection("`", "`", "code");
    case "quote":
      return prefixSelectedLines(() => "> ");
    case "ul":
      return prefixSelectedLines(() => "- ");
    case "ol":
      return prefixSelectedLines((index) => (index + 1) + ". ");
    case "task":
      return prefixSelectedLines(() => "- [ ] ");
    case "code-block":
      // 选中"代码内容"这四个字，不要把后面的换行也框进去，
      // 否则一打字闭合的 ``` 会被并到代码同一行，产出坏 Markdown。
      return insertAtSelection("```txt\n代码内容\n```\n", 7, 5);
    case "hr":
      return insertAtSelection("\n---\n");
    default:
      return null;
  }
}

function captureEditorSnapshot() {
  return {
    title: titleInput.value,
    lang: langInput.value,
    publishAt: publishInput.value,
    slug: slugInput.value,
    excerpt: excerptInput.value,
    body: bodyInput.value,
    tags: state.selectedTags.slice(),
    pendingTagInput: tagsInput.value,
    password: passwordInput ? passwordInput.value : ""
  };
}

function setDirtyBaseline(snapshot) {
  state.dirtyBaseline = JSON.stringify(snapshot || captureEditorSnapshot());
}

function isDirty() {
  return JSON.stringify(captureEditorSnapshot()) !== state.dirtyBaseline;
}

function emptySnapshot() {
  return {
    title: "",
    lang: "zh-Hans",
    publishAt: defaultDateTimeLocal(),
    slug: "",
    excerpt: "",
    body: "",
    tags: [],
    pendingTagInput: "",
    password: ""
  };
}

function snapshotFromPost(post) {
  return {
    title: post.title || "",
    lang: post.lang || "en-US",
    publishAt: post.publishAt || defaultDateTimeLocal(),
    slug: post.assetSlug || "",
    excerpt: post.excerpt || "",
    body: post.body || "",
    tags: Array.isArray(post.tags) ? post.tags.slice() : [],
    pendingTagInput: "",
    password: post.password || ""
  };
}

// <select> 收到不在选项列表里的值会被吞掉（回落到默认项），
// 于是 _posts 里 lang: en 这类写法一打开就变成 zh-Hans，
// 保存时把文章语言静默改掉，而脏检查还认为"没有改动"。
// 遇到未知语言就临时补一个选项，让它能原样存回去。
function setLangValue(value) {
  const next = value || "zh-Hans";
  langInput.value = next;
  if (langInput.value !== next) {
    langInput.add(new Option(next + "（文件中的原值）", next));
    langInput.value = next;
  }
}

function applySnapshot(snapshot) {
  titleInput.value = snapshot.title || "";
  setLangValue(snapshot.lang);
  publishInput.value = snapshot.publishAt || defaultDateTimeLocal();
  slugInput.value = safeSlug(snapshot.slug || "");
  excerptInput.value = snapshot.excerpt || "";
  bodyInput.value = snapshot.body || "";
  tagsInput.value = snapshot.pendingTagInput || "";
  if (passwordInput) {
    passwordInput.value = snapshot.password || "";
  }
  state.selectedTags = Array.isArray(snapshot.tags)
    ? snapshot.tags
      .map((tag) => normalizeTag(String(tag)))
      .filter(Boolean)
      .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
    : [];
  state.slugTouched = slugInput.value.trim().length > 0;
}

function readDraftStore() {
  if (!("localStorage" in window)) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return {};
  }
}

function writeDraftStore(store) {
  if (!("localStorage" in window)) {
    return;
  }

  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
}

function draftKeyFor(fileName) {
  return fileName ? "edit:" + fileName : "create";
}

function currentDraftKey() {
  return state.mode === "edit" && state.originalFileName ? draftKeyFor(state.originalFileName) : "create";
}

function hasSnapshotContent(snapshot) {
  return Boolean(
    snapshot.title.trim() ||
    snapshot.slug.trim() ||
    snapshot.excerpt.trim() ||
    snapshot.body.trim() ||
    snapshot.tags.length ||
    snapshot.pendingTagInput.trim()
  );
}

function loadDraftByKey(key) {
  const store = readDraftStore();
  if (!store[key]) {
    return null;
  }

  try {
    const snapshot = JSON.parse(JSON.stringify(store[key]));
    return {
      title: typeof snapshot.title === "string" ? snapshot.title : "",
      lang: typeof snapshot.lang === "string" ? snapshot.lang : "zh-Hans",
      publishAt: typeof snapshot.publishAt === "string" && snapshot.publishAt ? snapshot.publishAt : defaultDateTimeLocal(),
      slug: typeof snapshot.slug === "string" ? snapshot.slug : "",
      excerpt: typeof snapshot.excerpt === "string" ? snapshot.excerpt : "",
      body: typeof snapshot.body === "string" ? snapshot.body : "",
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
      pendingTagInput: typeof snapshot.pendingTagInput === "string" ? snapshot.pendingTagInput : ""
    };
  } catch (error) {
    return null;
  }
}

function clearDraftByKey(key) {
  const store = readDraftStore();
  if (!(key in store)) {
    return;
  }

  delete store[key];
  writeDraftStore(store);
}

function clearCurrentDraft() {
  clearDraftByKey(currentDraftKey());
}

// 预览渲染和草稿落盘都不便宜（整块 innerHTML 重建 + JSON 序列化 + localStorage 写入），
// 逐字符同步执行会让长文打字明显发涩，这里统一做防抖。
let previewTimer = 0;
let draftTimer = 0;

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    previewTimer = 0;
    renderPreview();
  }, 120);
}

function schedulePersistDraft() {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    draftTimer = 0;
    persistDraft();
  }, 500);
}

// 保存/关闭/切换文章前必须把挂起的草稿写完，否则最后几百毫秒的输入会丢。
function flushPendingWork() {
  const hadPending = previewTimer || draftTimer;
  window.clearTimeout(previewTimer);
  window.clearTimeout(draftTimer);
  previewTimer = 0;
  draftTimer = 0;
  if (hadPending) {
    renderPreview();
    // renderPreview 只会再排一次防抖，这里直接同步落盘。
    window.clearTimeout(draftTimer);
    draftTimer = 0;
    persistDraft();
  }
}

function persistDraft() {
  if (!state.uiReady || !("localStorage" in window)) {
    return;
  }

  // 密码不进 localStorage：草稿是明文存的，把访问密码一起写进去等于白加密。
  const { password, ...snapshot } = captureEditorSnapshot();
  const store = readDraftStore();
  const key = currentDraftKey();

  // 和已保存的基线一致时就不该留草稿，否则保存后 renderPreview 会立刻把
  // clearCurrentDraft 刚删掉的草稿重新写回来，下次打开必然误报"恢复草稿"。
  if (state.dirtyBaseline && JSON.stringify(captureEditorSnapshot()) === state.dirtyBaseline) {
    if (key in store) {
      delete store[key];
      writeDraftStore(store);
    }
    return;
  }

  if (!hasSnapshotContent(snapshot)) {
    if (key in store) {
      delete store[key];
      writeDraftStore(store);
    }
    return;
  }

  store[key] = snapshot;
  writeDraftStore(store);
}

function setComposerUrl(fileName) {
  const url = new URL(window.location.href);
  if (fileName) {
    url.searchParams.set("edit", fileName);
  } else {
    url.searchParams.delete("edit");
  }
  window.history.replaceState({}, "", url.toString());
}

function setLibraryExpanded(expanded, options = {}) {
  state.libraryExpanded = Boolean(expanded);

  if (composerLayout) {
    composerLayout.classList.toggle("library-expanded", state.libraryExpanded);
  }

  if (toggleLibraryButton) {
    const label = state.libraryExpanded ? "折叠文章库" : "展开文章库";
    toggleLibraryButton.setAttribute("aria-expanded", state.libraryExpanded ? "true" : "false");
    toggleLibraryButton.setAttribute("title", label);
    toggleLibraryButton.setAttribute("aria-label", label);
    if (libraryToggleLabel) {
      libraryToggleLabel.textContent = label;
    }
  }

  if (options.persist) {
    localStorage.setItem(LIBRARY_EXPANDED_STORAGE_KEY, state.libraryExpanded ? "true" : "false");
  }

  if (state.libraryExpanded && postSearchInput && options.focusSearch) {
    postSearchInput.focus();
  }
}

function updateLibraryCollapsedSummary() {
  if (!libraryCurrentMeta) {
    return;
  }

  if (state.mode === "edit" && state.originalFileName) {
    libraryCurrentMeta.textContent = "编辑";
    return;
  }

  libraryCurrentMeta.textContent = "新建";
}

function initializeLibraryState() {
  setLibraryExpanded(localStorage.getItem(LIBRARY_EXPANDED_STORAGE_KEY) === "true");
  updateLibraryCollapsedSummary();
}

function renderComposerMode() {
  const editing = state.mode === "edit";
  composerModeChip.textContent = editing ? "编辑模式" : "新建模式";
  composerModeChip.classList.toggle("editing", editing);

  // 标题一直写着"新建文章"会让人分不清自己是在写新的还是在改旧的
  if (composerHeading) {
    composerHeading.textContent = editing ? "编辑文章" : "新建文章";
  }

  slugInput.disabled = editing;
  slugHelp.textContent = editing
    ? "编辑模式会保留原文件名与图片目录；slug 仅作为当前文件标识显示。"
    : "建议使用英文、数字和连字符。留空时会自动生成安全 slug。";
}

function renderPostList() {
  if (!state.serviceReady) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">正在连接本地文章库。</div>";
    return;
  }

  if (!state.postsIndex.length) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">当前项目里还没有可编辑的文章。</div>";
    return;
  }

  const keyword = postSearchInput.value.trim().toLowerCase();
  const filtered = state.postsIndex.filter((post) => {
    if (!keyword) {
      return true;
    }

    const haystack = [
      post.title,
      post.fileName,
      post.excerpt,
      post.tags.join(" ")
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });

  if (!filtered.length) {
    postListEl.innerHTML = "<div class=\"post-library-empty\">没有匹配的文章。试试标题、文件名或标签。</div>";
    return;
  }

  postListEl.innerHTML = filtered.map((post) => {
    const hiddenLocally = isPostHiddenLocally(post.fileName);
    return (
    "<div class=\"post-library-item-wrapper" + (hiddenLocally ? " is-hidden-locally" : "") + "\">" +
      "<button class=\"post-library-item" + (state.mode === "edit" && state.originalFileName === post.fileName ? " active" : "") + "\" type=\"button\" data-open-post=\"" + escapeHtml(post.fileName) + "\">" +
        "<span class=\"post-library-item-title\">" + escapeHtml(post.title) + "</span>" +
        "<span class=\"post-library-item-meta\">" + escapeHtml(formatListDate(post)) + "</span>" +
        "<span class=\"post-library-local-status" + (hiddenLocally ? " is-hidden" : "") + "\">" + (hiddenLocally ? "线上已下架" : "线上可见") + "</span>" +
        (post.tags.length
          ? "<span class=\"post-library-item-tags\">" + post.tags.map((tag) => (
            "<span class=\"tag-pill suggestion\">" + escapeHtml(tag) + "</span>"
          )).join("") + "</span>"
          : "") +
      "</button>" +
      "<div class=\"post-library-actions\" role=\"group\" aria-label=\"文章操作\">" +
      "<button class=\"post-library-visibility-btn\" type=\"button\" data-toggle-post-visibility=\"" + escapeHtml(post.fileName) + "\" data-hidden=\"" + (hiddenLocally ? "true" : "false") + "\" title=\"" + (hiddenLocally ? "恢复到线上（会 commit 并 push）" : "从线上下架（会 commit 并 push）") + "\" aria-label=\"" + (hiddenLocally ? "恢复到线上（会 commit 并 push）" : "从线上下架（会 commit 并 push）") + "\">" +
        (hiddenLocally
          ? "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M12 5c5 0 9 5.5 9 7s-4 7-9 7-9-5.5-9-7 4-7 9-7zm0 2c-3.5 0-6.5 3.6-7 5 .5 1.4 3.5 5 7 5s6.5-3.6 7-5c-.5-1.4-3.5-5-7-5zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z\"/></svg>"
          : "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M2.3 4.7 3.7 3.3l17 17-1.4 1.4-3.1-3.1A10 10 0 0 1 12 19c-5 0-9-5.5-9-7 0-.8 1.1-2.6 2.8-4.2L2.3 4.7zM7.2 9.2C6 10.2 5.2 11.4 5 12c.5 1.4 3.5 5 7 5 .9 0 1.8-.2 2.6-.6l-2-2A2.5 2.5 0 0 1 9.6 11.4L7.2 9.2zM12 5c5 0 9 5.5 9 7 0 .8-.9 2.3-2.4 3.8l-2.1-2.1c.2-.5.4-1.1.4-1.7A4.8 4.8 0 0 0 12 7.1c-.6 0-1.2.1-1.7.3L8.6 5.7c1-.4 2.2-.7 3.4-.7z\"/></svg>") +
      "</button>" +
      "<button class=\"post-library-delete-btn\" type=\"button\" data-delete-post=\"" + escapeHtml(post.fileName) + "\" title=\"删除文章\" aria-label=\"删除文章\">" +
        "<svg viewBox=\"0 0 24 24\" width=\"15\" height=\"15\"><path fill=\"currentColor\" d=\"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z\"/></svg>" +
      "</button>" +
      "</div>" +
    "</div>"
    );
  }).join("");
}

function renderPreview() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  syncSlugFromTitle();
  updateEditorStats();
  updateLibraryCollapsedSummary();

  if (!title && !body) {
    if (fileNameEl) {
      fileNameEl.textContent = state.mode === "edit" && state.originalFileName
        ? state.originalFileName
        : "填了标题后这里会显示文件名";
    }
    previewDate.textContent = "POST";
    previewTitle.textContent = "在左边输入标题和正文";
    previewHost.innerHTML = "<p class=\"preview-empty\">这里会渲染接近博客文章页的预览，包括标题、段落、列表、代码块和图片。</p>";
    state.lastRenderedBody = "";
    renderPreviewTags();
    schedulePersistDraft();
    return;
  }

  if (fileNameEl) {
    // 中文标题推不出 slug，保存时才会自动补一个，这里如实说明而不是提前写死。
    fileNameEl.textContent = buildFileName() || "保存时会自动生成文件名（可在「文章设置」自定 slug）";
  }
  previewDate.textContent = formatPreviewDate(publishInput.value, langInput.value);
  previewTitle.textContent = title || "Untitled Post";
  // 只改标题/时间/标签时正文没变，没必要重跑 Markdown 再整块重建 DOM
  if (body !== state.lastRenderedBody) {
    previewHost.innerHTML = body ? renderMarkdown(body) : "<p class=\"preview-empty\">正文为空。</p>";
    state.lastRenderedBody = body;
  }
  renderPreviewTags();
  schedulePersistDraft();
}

function confirmDiscardChanges(message) {
  if (!isDirty()) {
    return true;
  }

  return window.confirm(message);
}

function enterCreateMode(options = {}) {
  const snapshot = options.snapshot || emptySnapshot();
  state.mode = "create";
  state.currentFileName = "";
  state.originalFileName = "";
  state.originalAssetSlug = "";
  state.originalPublished = undefined;
  state.originalEncrypted = false;
  setPublishAvailability(null);
  applySnapshot(snapshot);
  renderComposerMode();
  renderTags();
  renderPostList();
  renderPreview();
  setComposerUrl("");
  setDirtyBaseline(options.baseline || emptySnapshot());
  if (options.focus !== false) {
    bodyInput.focus();
  }
}

async function openPostForEditing(fileName, options = {}) {
  const normalizedFileName = normalizePostFileName(fileName);
  if (!normalizedFileName) {
    setStatus("目标文章文件名无效。", "error");
    return false;
  }

  if (!options.skipDirtyCheck && !confirmDiscardChanges("当前编辑区有未保存修改，确定切换到另一篇文章吗？")) {
    return false;
  }

  if (!state.serviceReady) {
    state.pendingEditFile = normalizedFileName;
    setStatus("本地文章库连接完成后会自动打开 " + normalizedFileName + "。", "warn");
    return false;
  }

  try {
    const parsed = state.postsIndex.find((post) => post.fileName === normalizedFileName);
    if (!parsed) {
      throw new Error("文章不存在");
    }
    const decryptedPost = { ...parsed };
    let postPassword = "";
    if (parsed.encrypted) {
      let password = prompt("该贴文已加密保护，请输入访问密码以编辑：");
      if (password === null) {
        setStatus("取消加载加密贴文。", "warn");
        return false;
      }
      let decrypted = decryptContent(parsed.encrypted_data, password);
      while (decrypted === null) {
        password = prompt("密码错误，请重新输入访问密码（或点取消放弃）：");
        if (password === null) {
          setStatus("取消加载加密贴文。", "warn");
          return false;
        }
        decrypted = decryptContent(parsed.encrypted_data, password);
      }
      decryptedPost.body = decrypted;
      let decryptedExcerpt = "";
      if (parsed.encrypted_excerpt) {
        decryptedExcerpt = decryptContent(parsed.encrypted_excerpt, password) || "";
      }
      decryptedPost.excerpt = decryptedExcerpt;
      postPassword = password;
    }
    decryptedPost.password = postPassword;

    const baseSnapshot = snapshotFromPost(decryptedPost);
    const draftSnapshot = loadDraftByKey(draftKeyFor(normalizedFileName));

    state.mode = "edit";
    state.currentFileName = normalizedFileName;
    state.originalFileName = normalizedFileName;
    state.originalAssetSlug = parsed.assetSlug;
    state.originalPublished = parsed.published;
    state.originalEncrypted = parsed.encrypted;
    setPublishAvailability(null);
    applySnapshot(draftSnapshot || baseSnapshot);
    // 密码永远取自本次解密，不能让草稿里的空值把它盖掉——
    // 否则保存时 buildMarkdown 走不加密分支，正文会以明文写回 _posts。
    if (passwordInput) {
      passwordInput.value = postPassword;
    }
    slugInput.value = parsed.assetSlug;
    tagsInput.value = draftSnapshot ? draftSnapshot.pendingTagInput : "";
    renderComposerMode();
    renderTags();
    renderPostList();
    renderPreview();
    setComposerUrl(normalizedFileName);
    setDirtyBaseline(baseSnapshot);
    bodyInput.focus();
    // 有没有草稿和"这篇是不是还有东西没发出去"是两回事，每次打开都该探一下
    let hasPublishableChanges = false;
    const publishContext = {
      fileName: normalizedFileName,
      assetSlug: parsed.assetSlug,
      mode: "edit"
    };
    try {
      const previewRequest = await postJson("/publish/preview", publishContext);
      const previewStatus = previewRequest.response.ok ? previewRequest.result.status : "";
      hasPublishableChanges = previewStatus === "ready" || previewStatus === "ahead";
      setPublishAvailability(hasPublishableChanges ? publishContext : null);
    } catch (error) {
      setPublishAvailability(null);
    }

    setStatus(draftSnapshot
      ? "已打开 " + normalizedFileName + "，并恢复了这篇文章的未保存草稿。"
      : hasPublishableChanges
        ? "已载入 " + normalizedFileName + "，并发现尚未发布的本地改动。"
        : "已载入 " + normalizedFileName + "，后续保存会覆盖原文件。", hasPublishableChanges ? "warn" : "success");
    setLibraryExpanded(false, { persist: true });
    return true;
  } catch (error) {
    state.pendingEditFile = "";
    setStatus("打开文章失败：" + normalizedFileName + " 不存在，或本地文章库尚未刷新。", "error");
    return false;
  }
}

async function maybeOpenPendingEditFile() {
  if (!state.pendingEditFile) {
    return;
  }

  const target = state.pendingEditFile;
  state.pendingEditFile = "";
  await openPostForEditing(target, { skipDirtyCheck: true });
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return { ok: false, message: "本地服务返回了无效响应。" };
  }
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Post-Composer-Token": state.requestToken
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (response.status === 403) {
    disconnectLocalService(result.message || "本地服务会话已失效，请刷新页面重新连接。");
    throw new Error(result.message || "本地服务会话已失效，请刷新页面重新连接。");
  }
  return { response, result };
}

async function loadPostsIndex() {
  try {
    const response = await fetch("/api/posts", {
      headers: {
        "X-Post-Composer-Token": state.requestToken
      }
    });
    const result = await readJsonResponse(response);
    if (response.status === 403) {
      disconnectLocalService(result.message || "本地服务会话已失效，请刷新页面重新连接。");
      return false;
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法读取文章列表。");
    }

    const tags = new Map();
    const posts = result.posts.map((post) => parsePostDocument(post.fileName, post.source, post.lastModified));
    posts.forEach((post) => post.tags.forEach((tag) => {
      const key = tag.toLowerCase();
      if (!tags.has(key)) {
        tags.set(key, tag);
      }
    }));
    posts.sort((left, right) => right.sortTimestamp - left.sortTimestamp || left.fileName.localeCompare(right.fileName, "en"));
    state.postsIndex = posts;
    state.availableTags = Array.from(tags.values()).sort((left, right) => left.localeCompare(right, "en"));
    renderPostList();
    renderTags();
    return true;
  } catch (error) {
    state.postsIndex = [];
    state.availableTags = [];
    renderPostList();
    renderTags();
    setStatus("读取文章列表失败：" + error.message, "warn");
    return false;
  }
}

async function loadLocalVisibility() {
  if (!state.serviceReady) {
    state.hiddenPosts = new Set();
    return false;
  }

  try {
    const response = await fetch("/api/local-post-visibility");
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法读取本地隐藏状态。");
    }
    state.hiddenPosts = new Set(
      (Array.isArray(result.hiddenPosts) ? result.hiddenPosts : [])
        .map((fileName) => normalizePostFileName(fileName))
        .filter(Boolean)
    );
    renderPostList();
    return true;
  } catch (error) {
    state.hiddenPosts = new Set();
    renderPostList();
    setStatus("读取本地隐藏状态失败：" + error.message, "warn");
    return false;
  }
}

async function setPostLocalVisibility(fileName, hidden) {
  if (!state.serviceReady) {
    setStatus("本地服务未连接，无法发布隐藏状态。", "error");
    return;
  }

  const normalizedFileName = normalizePostFileName(fileName);
  if (!normalizedFileName) {
    return;
  }

  try {
    const request = await postJson("/api/local-post-visibility", {
      fileName: normalizedFileName,
      hidden
    });
    if (!request.response.ok || !request.result.ok) {
      throw new Error(request.result.message || "发布隐藏状态失败。");
    }
    state.hiddenPosts = new Set(
      (Array.isArray(request.result.hiddenPosts) ? request.result.hiddenPosts : [])
        .map((nextFileName) => normalizePostFileName(nextFileName))
        .filter(Boolean)
    );
    renderPostList();
    const publishStatus = request.result.publish && request.result.publish.status;
    const suffix = publishStatus === "published" ? " GitHub Pages 稍后会自动更新。" : "";
    setStatus(hidden ? "已隐藏并推送 " + normalizedFileName + "。" + suffix : "已恢复可见并推送 " + normalizedFileName + "。" + suffix, "success");
  } catch (error) {
    setStatus("发布隐藏状态失败：" + error.message, "error");
  }
}

async function connectLocalRepository() {
  try {
    const response = await fetch("/status");
    const result = await readJsonResponse(response);
    if (!response.ok || !result.ok) {
      throw new Error(result.message || "无法连接本地服务。");
    }
    if (typeof result.requestToken !== "string" || !result.requestToken) {
      throw new Error("本地服务未建立安全会话。请重启发帖器。");
    }
    state.serviceReady = true;
    state.repositoryName = result.repositoryName || "当前博客";
    state.requestToken = result.requestToken;
    setConnectionState("", "本地仓库已就绪", "已连接到 " + state.repositoryName + "，文章和图片会直接保存到项目中。");
    if (!await loadPostsIndex()) {
      return;
    }
    await loadLocalVisibility();
    await maybeOpenPendingEditFile();
    if (!requestedEditFile && state.mode !== "edit") {
      setStatus("", "");
    }
  } catch (error) {
    state.serviceReady = false;
    state.requestToken = "";
    setConnectionState("offline", "本地服务未连接", "请通过 Open Post Composer 启动发帖器后再重试。");
    renderPostList();
    setStatus("无法连接本地发帖服务：" + error.message, "error");
  }
}

function safeFileStem(name) {
  const stem = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return stem || "image";
}

function sanitizeImageName(fileName) {
  const parts = fileName.split(".");
  const extension = parts.length > 1 ? "." + parts.pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = safeFileStem(parts.join("."));
  return stem + (extension || ".png");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}

function insertImagesMarkdown(entries) {
  const lines = entries.map((entry) => "![" + entry.alt + "](" + entry.webPath + ")");
  const snippet = "\n" + lines.join("\n\n") + "\n";

  // 单张图且没有有意义的 alt 时，把光标停在 ![] 中间，方便顺手补一句说明
  if (entries.length === 1 && !entries[0].alt) {
    insertAtSelection(snippet, 3, snippet.length - 3);
    return;
  }

  insertAtSelection(snippet);
}

function handleLocalImageInsert() {
  imagePicker.click();
}

function insertRemoteImageTemplate() {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const value = bodyInput.value;
  const selected = value.slice(start, end).trim();
  const altText = selected || "网络图片";
  const urlPlaceholder = "https://example.com/image.png";
  const snippet = "![" + altText + "](" + urlPlaceholder + ")";
  const urlStartOffset = snippet.indexOf(urlPlaceholder);

  setPublishAvailability(null);
  bodyInput.value = value.slice(0, start) + snippet + value.slice(end);
  bodyInput.focus();
  bodyInput.setSelectionRange(start + urlStartOffset, start + urlStartOffset + urlPlaceholder.length);
  renderPreview();
  setStatus("已插入网络图片模板，直接粘贴图片链接即可。", "success");
}

async function importImages(files) {
  if (!files.length) {
    return;
  }

  if (!titleInput.value.trim()) {
    // 图片目录由 slug 决定，而 slug 来自标题，所以必须先有标题。
    // 直接把光标送过去，省得用户自己找。
    setStatus("图片会存到以标题命名的目录下，请先填标题（已把光标移到标题栏）。", "warn");
    titleInput.focus();
    return;
  }

  if (!state.serviceReady) {
    setStatus("本地服务未连接，暂时无法导入图片。", "warn");
    return;
  }

  // 加密只作用于正文，图片文件本身是以明文提交到公开仓库的。
  if (passwordInput && passwordInput.value.trim()) {
    if (!window.confirm("这篇文章设了访问密码，但插入的图片会以明文文件提交到公开仓库的 assets/posts/ 下，知道地址的人可以直接打开。\n\n仍然要插入吗？")) {
      setStatus("已取消插图。", "");
      return;
    }
  }

  try {
    setPublishAvailability(null);
    // 图片目录必须落在一个确定的 slug 下，这里把它定下来。
    const assetSlug = ensureSlug();
    if (state.mode === "create") {
      setStatus("图片会存到 assets/posts/" + assetSlug + "/，这篇文章的网址也就定为该 slug 了。要改请去「文章设置」。", "warn");
    }
    const inserted = [];
    const failed = [];

    // 逐张处理并各自捕获异常：以前任何一张失败都会抛出去，
    // 已经上传成功的几张既不插入正文也不告诉用户，等于白传。
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (files.length > 1) {
        setStatus("正在上传第 " + (index + 1) + " / " + files.length + " 张：" + file.name, "");
      }

      try {
        const request = await postJson("/api/images/import", {
          assetSlug,
          fileName: sanitizeImageName(file.name),
          base64: await fileToBase64(file)
        });
        if (!request.response.ok || !request.result.ok) {
          throw new Error(request.result.message || "图片保存失败。");
        }

        const stem = request.result.fileName.replace(/\.[^.]+$/, "");
        // 粘贴/拖拽生成的名字是 paste-20260726190941 这种时间戳，
        // 拿它当 alt 只是噪音，不如留空让作者自己补。
        const isGeneratedName = /^(?:paste|drop)-\d{8,}(?:-\d+)?$/.test(stem);
        inserted.push({
          alt: isGeneratedName ? "" : safeFileStem(stem).replace(/-/g, " "),
          webPath: request.result.webPath
        });
      } catch (error) {
        failed.push(file.name + "（" + error.message + "）");
      }
    }

    if (inserted.length) {
      insertImagesMarkdown(inserted);
    }

    if (failed.length && inserted.length) {
      setStatus("已插入 " + inserted.length + " 张，另有 " + failed.length + " 张失败：" + failed.join("；"), "warn");
    } else if (failed.length) {
      setStatus("图片导入失败：" + failed.join("；"), "error");
    } else {
      setStatus("已导入 " + inserted.length + " 张图片，并自动插入正文。", "success");
    }
  } catch (error) {
    setStatus("导入图片失败：" + error.message, "error");
  } finally {
    imagePicker.value = "";
  }
}

async function saveToPosts(resetAfterSave) {
  collectPendingTags();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return false;
  }

  // 这篇原本是加密的，密码却空了 —— 直接保存会把正文以明文写回 _posts，
  // 再一键推送就等于把加密内容公开了。
  if (state.originalEncrypted && passwordInput && !passwordInput.value.trim()) {
    if (!window.confirm("这篇文章原本设了访问密码。密码框现在是空的，保存会把正文以明文写回并可推送到公开仓库。\n\n确定要取消加密吗？")) {
      setStatus("已取消保存。请在「文章设置」里重新填入访问密码。", "warn");
      return false;
    }
  }

  // slug 到这一步才落定：中文标题推不出 slug 时在这里补，而不是在输入过程中写死。
  ensureSlug();
  const publishContext = {
    fileName: buildFileName(),
    assetSlug: getCurrentSlug(),
    mode: state.mode
  };

  if (state.mode === "edit" && !isDirty()) {
    // 内容没变不代表没东西可发：上次可能保存成功但 push 失败。
    // 给出发布上下文让 publishPost 去问服务端，而不是在这里断死。
    setPublishAvailability({
      fileName: state.originalFileName,
      assetSlug: state.originalAssetSlug,
      mode: "edit"
    });
    setStatus("内容没有改动，正在检查是否还有未推送的改动……", "");
    return true;
  }

  if (!state.serviceReady) {
    setStatus("本地服务未连接，无法保存文章。", "error");
    return false;
  }

  try {
    const fileName = buildFileName();
    // 把这一刻的内容固化下来：请求是异步的，期间用户还能继续打字。
    // 之前 baseline 是在 await 之后才采样的，于是保存期间敲进去的字
    // 会被当成"已经存过了"，实际并没有写进文件。
    const savedSnapshot = captureEditorSnapshot();
    const savedMarkdown = buildMarkdown();

    let saveRequest = await postJson("/api/posts/save", {
      fileName,
      markdown: savedMarkdown,
      mode: state.mode,
      overwrite: false
    });

    if (saveRequest.response.status === 409) {
      if (!window.confirm(saveRequest.result.message || (fileName + " 已存在，是否覆盖？"))) {
        return false;
      }
      saveRequest = await postJson("/api/posts/save", {
        fileName,
        markdown: savedMarkdown,
        mode: state.mode,
        overwrite: true
      });
    }
    if (!saveRequest.response.ok || !saveRequest.result.ok) {
      throw new Error(saveRequest.result.message || "保存失败。");
    }
    clearCurrentDraft();
    await loadPostsIndex();

    if (resetAfterSave) {
      enterCreateMode({ snapshot: emptySnapshot(), baseline: emptySnapshot() });
      setStatus("已保存 " + fileName + "，编辑器已准备好下一篇新文章。", "success");
      return true;
    }

    if (state.mode === "create") {
      state.mode = "edit";
      state.currentFileName = fileName;
      state.originalFileName = fileName;
      state.originalAssetSlug = publishContext.assetSlug;
      renderComposerMode();
      setComposerUrl(fileName);
    }
    // 基线是"写进文件的那一份"，不是当前 DOM
    setDirtyBaseline(savedSnapshot);
    setPublishAvailability(publishContext);
    renderPostList();
    renderPreview();

    const changedDuringSave = JSON.stringify(captureEditorSnapshot()) !== JSON.stringify(savedSnapshot);
    if (changedDuringSave) {
      setStatus("已保存 " + fileName + "，但保存过程中你又改了内容，这部分还没写进文件——再存一次。", "warn");
    } else {
      setStatus(publishContext.mode === "edit"
        ? "已保存修改到 " + fileName + "。"
        : "已保存到 " + fileName + "。刷新博客后就能看到新文章。", "success");
    }
    return true;
  } catch (error) {
    setStatus("保存失败：" + error.message, "error");
    return false;
  }
}

function downloadMarkdown() {
  setPublishAvailability(null);
  collectPendingTags();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return;
  }

  const blob = new Blob([buildMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = buildFileName();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("已下载 Markdown 文件，可作为文章备份或外部编辑副本。", "success");
}

function publishConfirmationMessage(preview) {
  const lines = [
    "即将发布：" + preview.fileName,
    "分支：" + preview.branch,
    "",
    "本次文章相关改动：",
    ...preview.changes.map((change) => "  " + change)
  ];

  if (preview.aheadCount > 0) {
    lines.push("", "注意：当前分支另有 " + preview.aheadCount + " 个尚未推送的提交，推送时也会一并上传。");
  }
  if (preview.otherStagedPaths.length) {
    lines.push("", "已有其他暂存文件（本次提交不会包含）：", ...preview.otherStagedPaths.map((path) => "  " + path));
  }
  lines.push("", "确认提交当前文章并推送到远端吗？");
  return lines.join("\n");
}

async function publishPost() {
  if (!state.lastSavedContext || state.publishing) {
    return;
  }

  setPublishingState(true, "正在检查...");
  try {
    const previewRequest = await postJson("/publish/preview", state.lastSavedContext);
    const preview = previewRequest.result;
    if (!previewRequest.response.ok || !preview.ok) {
      setStatus("发布检查失败：" + (preview.message || "未知错误"), "error");
      return;
    }
    if (preview.status === "noop") {
      setStatus(preview.message || "当前文章没有可发布的 Git 改动。", "");
      return;
    }
    if (preview.status === "ahead") {
      // 这篇没有新改动，但本地攒着没推上去的提交（多半是上次 push 失败）
      setPublishingState(false);
      if (!window.confirm("这篇文章没有新的改动，但本地还有 " + preview.aheadCount + " 个提交没有推送到 " + (preview.upstream || "远端") + "。\n\n现在补推吗？")) {
        setStatus("已取消推送。", "");
        return;
      }
      setPublishingState(true, "正在推送...");
      const aheadRequest = await postJson("/publish", state.lastSavedContext);
      const aheadResult = aheadRequest.result;
      setStatus(
        aheadResult.message || (aheadRequest.response.ok && aheadResult.ok ? "已补推。" : "补推失败。"),
        aheadRequest.response.ok && aheadResult.ok ? "success" : "error"
      );
      return;
    }
    setPublishingState(false);
    if (!window.confirm(publishConfirmationMessage(preview))) {
      setStatus("已取消发布，文章仍保存在本地。", "");
      return;
    }
    setPublishingState(true, "正在发布...");
    const publishRequest = await postJson("/publish", state.lastSavedContext);
    const result = publishRequest.result;

    if (!publishRequest.response.ok || !result.ok) {
      setStatus(result.message || "发布失败。", result.status === "committed_not_pushed" ? "warn" : "error");
      return;
    }
    if (result.status === "noop") {
      setStatus(result.message || "当前文章没有可发布的 Git 改动。", "");
      return;
    }
    setStatus((result.message || "已提交并推送当前文章。") + (result.commitMessage ? " " + result.commitMessage : ""), "success");
  } catch (error) {
    setStatus("发布失败：" + error.message, "error");
  } finally {
    setPublishingState(false);
  }
}

function switchToNewPost() {
  if (!confirmDiscardChanges("当前编辑区有未保存修改，确定切换到新建模式吗？")) {
    return;
  }

  clearDraftByKey("create");
  enterCreateMode({
    snapshot: emptySnapshot(),
    baseline: emptySnapshot()
  });
  setLibraryExpanded(false, { persist: true });
  setStatus("已切换到新建模式。", "");
}

if (toggleLibraryButton) {
  toggleLibraryButton.addEventListener("click", () => {
    setLibraryExpanded(!state.libraryExpanded, { persist: true, focusSearch: !state.libraryExpanded });
  });
}

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => handleToolbarAction(button.dataset.action));
});

/* ---------- 编辑器手感：快捷键、缩进、列表续行、粘贴与拖拽插图 ---------- */

const editorContainer = document.querySelector(".editor-container");

// 行首标记：任务列表、无序列表、有序列表、引用
const LIST_ITEM_PATTERN = /^([ \t]*)((?:[-*+] \[[ xX]\] )|(?:[-*+] )|(?:\d+\. )|(?:> ))(.*)$/;

function nextListMarker(marker) {
  const ordered = /^(\d+)\. $/.exec(marker);
  if (ordered) {
    return (Number(ordered[1]) + 1) + ". ";
  }
  // 续行的任务项永远是未勾选的
  return marker.replace(/\[[xX]\]/, "[ ]");
}

// 回车时自动接上同样的列表/引用标记；在空列表项上回车则退出列表。
function handleListContinuation(event) {
  const value = bodyInput.value;
  const caret = bodyInput.selectionStart;
  if (bodyInput.selectionEnd !== caret) {
    return false;
  }

  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const lineEndIndex = value.indexOf("\n", caret);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const match = LIST_ITEM_PATTERN.exec(value.slice(lineStart, lineEnd));
  if (!match) {
    return false;
  }

  const [, indent, marker, content] = match;
  // 光标还在标记内部时不接管，交给浏览器默认行为
  if (caret < lineStart + indent.length + marker.length) {
    return false;
  }

  event.preventDefault();
  if (!content.trim()) {
    // 空条目上回车 = 结束列表，把这一行清空
    applyEditorEdit(lineStart, lineEnd, "", lineStart, lineStart);
    return true;
  }

  const insertion = "\n" + indent + nextListMarker(marker);
  applyEditorEdit(caret, caret, insertion, caret + insertion.length, caret + insertion.length);
  return true;
}

// Tab / Shift+Tab：单光标插入两个空格，多行选区整体缩进或反缩进。
function handleIndent(event) {
  const value = bodyInput.value;
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  const outdent = event.shiftKey;

  if (!outdent && !value.slice(start, end).includes("\n")) {
    applyEditorEdit(start, end, "  ", start + 2, start + 2);
    return;
  }

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const replacement = value
    .slice(lineStart, lineEnd)
    .split("\n")
    .map((line) => (outdent ? line.replace(/^(?: {1,2}|\t)/, "") : "  " + line))
    .join("\n");

  applyEditorEdit(lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length);
}

bodyInput.addEventListener("keydown", (event) => {
  // 中文输入法组字过程中不要拦截任何键
  if (event.isComposing || event.keyCode === 229) {
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const shortcut = { b: "bold", i: "italic", k: "link" }[event.key.toLowerCase()];
    if (shortcut && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      handleToolbarAction(shortcut);
    }
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    handleIndent(event);
    return;
  }

  // Esc 移开焦点，这样 Tab 仍然可以用来在界面里跳转
  if (event.key === "Escape") {
    bodyInput.blur();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
    handleListContinuation(event);
  }
});

function imageFilesFrom(dataTransfer) {
  return Array.from(dataTransfer && dataTransfer.files ? dataTransfer.files : [])
    .filter((file) => file.type.startsWith("image/"));
}

// 剪贴板里的截图统一叫 image.png，这里换成带时间戳的名字，避免一篇文章里全是 image-2/3/4。
function withTimestampedName(file, prefix) {
  const extension = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/g, "") || "png";
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
  try {
    return new File([file], prefix + "-" + stamp + "." + extension, { type: file.type });
  } catch (error) {
    return file;
  }
}

bodyInput.addEventListener("paste", (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return;
  }

  const images = imageFilesFrom(clipboard);
  if (images.length) {
    event.preventDefault();
    importImages(images.map((file) => withTimestampedName(file, "paste")));
    return;
  }

  // 选中一段文字后粘贴链接，直接组成 Markdown 链接
  const text = clipboard.getData("text/plain").trim();
  const hasSelection = bodyInput.selectionStart !== bodyInput.selectionEnd;
  if (hasSelection && /^https?:\/\/\S+$/.test(text) && !/\s/.test(text)) {
    event.preventDefault();
    wrapSelection("[", "](" + text + ")", "链接文字");
    setStatus("已把选中文字变成指向该链接的 Markdown 链接。", "success");
  }
});

["dragenter", "dragover"].forEach((type) => {
  bodyInput.addEventListener(type, (event) => {
    if (!imageFilesFrom(event.dataTransfer).length) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (editorContainer) {
      editorContainer.classList.add("is-drop-target");
    }
  });
});

["dragleave", "dragend"].forEach((type) => {
  bodyInput.addEventListener(type, () => {
    if (editorContainer) {
      editorContainer.classList.remove("is-drop-target");
    }
  });
});

// 预览跟着正文滚：长文写到后半段时，右边不再停在开头
const previewPanel = document.querySelector(".preview-panel");
let syncingScroll = false;

function linkScroll(source, targetEl) {
  source.addEventListener("scroll", () => {
    if (syncingScroll || !targetEl) {
      return;
    }
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = targetEl.scrollHeight - targetEl.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) {
      return;
    }
    syncingScroll = true;
    targetEl.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    // 用 rAF 解锁，避免两边互相触发形成回环
    requestAnimationFrame(() => {
      syncingScroll = false;
    });
  });
}

if (previewPanel) {
  linkScroll(bodyInput, previewPanel);
  linkScroll(previewPanel, bodyInput);
}

bodyInput.addEventListener("drop", (event) => {
  if (editorContainer) {
    editorContainer.classList.remove("is-drop-target");
  }
  const images = imageFilesFrom(event.dataTransfer);
  if (!images.length) {
    return;
  }
  event.preventDefault();
  importImages(images.map((file) => withTimestampedName(file, "drop")));
});

newPostButton.addEventListener("click", switchToNewPost);
if (downloadButton) {
  downloadButton.addEventListener("click", downloadMarkdown);
}

if (savePublishButton) {
  savePublishButton.addEventListener("click", async () => {
    if (state.publishing) {
      return;
    }
    // 先把防抖里挂着的草稿写完，避免最后一两个字没进快照
    flushPendingWork();

    setBusyState(true, "正在保存...");
    let saved = false;
    try {
      saved = await saveToPosts(false);
    } finally {
      setBusyState(false);
    }

    if (saved) {
      await publishPost();
    }
  });
}
insertLocalImageButton.addEventListener("click", handleLocalImageInsert);
insertRemoteImageButton.addEventListener("click", insertRemoteImageTemplate);
imagePicker.addEventListener("change", (event) => importImages(Array.from(event.target.files || [])));
addTagButton.addEventListener("click", collectPendingTags);
postSearchInput.addEventListener("input", renderPostList);

tagsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    collectPendingTags();
  }
});

tagsInput.addEventListener("input", renderTags);
tagsInput.addEventListener("blur", collectPendingTags);

selectedTagsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-tag]");
  if (!button) {
    return;
  }
  toggleTag(button.dataset.toggleTag);
});

postListEl.addEventListener("click", async (event) => {
  const visibilityBtn = event.target.closest("[data-toggle-post-visibility]");
  if (visibilityBtn) {
    const fileName = visibilityBtn.dataset.togglePostVisibility;
    const willHide = visibilityBtn.dataset.hidden !== "true";
    // 这个按钮紧挨着删除按钮，而且点下去会直接 commit + push 到线上，
    // 和发布走同一条不可逆的路，必须先问一句。
    const action = willHide ? "从线上下架" : "恢复到线上";
    if (!window.confirm("确定把《" + fileName + "》" + action + "吗？\n\n这会改写文章的 published 标记，并立即 git commit + git push 到远端（当前分支其他待推送的提交也会一并上传）。")) {
      return;
    }
    await setPostLocalVisibility(fileName, willHide);
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-post]");
  if (deleteBtn) {
    const fileName = deleteBtn.dataset.deletePost;
    // 说清楚删除到底做了什么：只删本地文件，不会 git rm，线上那篇还在
    if (confirm("删除《" + fileName + "》？\n\n· 删除本地 _posts 文件和它的图片目录\n· 会在 tmp/post-backups/ 留一份备份\n· 不会自动 git rm，线上文章要等这次删除被提交推送后才消失")) {
      try {
        const response = await fetch("/api/posts/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Post-Composer-Token": state.requestToken
          },
          body: JSON.stringify({ fileName })
        });
        const result = await response.json();
        if (result.ok) {
          // 这篇的草稿也要清掉，否则会一直挂在 localStorage 里成为孤儿
          clearDraftByKey(draftKeyFor(fileName));
          if (state.mode === "edit" && state.originalFileName === fileName) {
            state.dirtyBaseline = JSON.stringify(emptySnapshot());
            switchToNewPost();
          }
          await loadPostsIndex();
          await loadLocalVisibility();
          renderPostList();
          setStatus(result.message || ("已删除本地文件 " + fileName + "。"), "warn");
        } else {
          setStatus(result.message || "删除文章失败。", "error");
        }
      } catch (error) {
        setStatus("删除失败：" + error.message, "error");
      }
    }
    return;
  }

  const button = event.target.closest("[data-open-post]");
  if (!button) {
    return;
  }
  openPostForEditing(button.dataset.openPost);
});

[titleInput, langInput, publishInput, excerptInput, bodyInput].forEach((element) => {
  element.addEventListener("input", () => {
    setPublishAvailability(null);
    // 字数统计很便宜，立刻更新；重的预览渲染和草稿写入交给防抖。
    updateEditorStats();
    schedulePreview();
  });
});

slugInput.addEventListener("input", () => {
  if (state.mode === "edit") {
    slugInput.value = state.originalAssetSlug;
    return;
  }

  state.slugTouched = slugInput.value.trim().length > 0;
  slugInput.value = safeSlug(slugInput.value);
  setPublishAvailability(null);
  renderPreview();
});

window.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
    return;
  }

  event.preventDefault();
  // 和"保存并发送"按钮保持一致：先把防抖里挂着的草稿写完再保存
  flushPendingWork();
  saveToPosts(event.shiftKey);
});

window.addEventListener("beforeunload", (event) => {
  flushPendingWork();
  if (!isDirty()) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});

const createDraft = !requestedEditFile ? loadDraftByKey("create") : null;
enterCreateMode({
  snapshot: createDraft || emptySnapshot(),
  baseline: emptySnapshot(),
  focus: false
});
initializeLibraryState();
state.uiReady = true;
setPublishAvailability(null);
renderPostList();
renderTags();
renderPreview();

if (requestedEditFile) {
  setStatus("正在载入 " + requestedEditFile + "。", "");
} else if (createDraft) {
  setStatus("已恢复上次未完成的新文章草稿。", "success");
}

connectLocalRepository();

// Theme Toggle Logic
const themeToggleBtn = document.querySelector("#theme-toggle");
const themeToggleIcon = document.querySelector("#theme-toggle-icon");

const sunIconPath = "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41z";
const moonIconPath = "M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.2-9.8.6-.1 1.2.3 1.3.9.1.6-.2 1.2-.8 1.4-2.8 1-4.7 3.5-4.7 6.5 0 3.9 3.1 7 7 7 3 0 5.5-1.9 6.5-4.7.2-.6.8-.9 1.4-.8.6.1 1 .7.9 1.3-.9 4.7-5 8.2-9.7 8.2z";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("post-composer-theme", theme);
  if (themeToggleIcon) {
    themeToggleIcon.innerHTML = `<path d="${theme === "dark" ? sunIconPath : moonIconPath}"/>`;
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("post-composer-theme");
  if (savedTheme) {
    applyTheme(savedTheme);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
}

initTheme();

// Liquid Glass Interactive Refraction Hover
const glassFilter = document.querySelector("#liquid-glass-filter feDisplacementMap");
if (glassFilter) {
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.addEventListener("mousemove", (e) => {
      const rect = panel.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Update glare highlight coordinates relative to the panel
      panel.style.setProperty("--mouse-x", `${x}px`);
      panel.style.setProperty("--mouse-y", `${y}px`);
      
      // Calculate normalized coordinates from center
      const cx = x / rect.width - 0.5;
      const cy = y / rect.height - 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      
      // Adjust scales of individual RGB displacement maps to create an organic fluid ripple feeling with chromatic dispersion
      const baseScale = 12 + dist * 24;
      const filterR = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(1)");
      const filterG = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(2)");
      const filterB = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(3)");
      
      if (filterR) filterR.setAttribute("scale", (baseScale + 4).toFixed(1));
      if (filterG) filterG.setAttribute("scale", baseScale.toFixed(1));
      if (filterB) filterB.setAttribute("scale", Math.max(2, baseScale - 4).toFixed(1));
    });
    
    panel.addEventListener("mouseleave", () => {
      const filterR = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(1)");
      const filterG = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(2)");
      const filterB = document.querySelector("#liquid-glass-filter feDisplacementMap:nth-of-type(3)");
      
      if (filterR) filterR.setAttribute("scale", "22");
      if (filterG) filterG.setAttribute("scale", "18");
      if (filterB) filterB.setAttribute("scale", "14");
    });
  });
}
