const DRAFT_STORAGE_KEY = "post-composer-draft-v2";
const LIBRARY_EXPANDED_STORAGE_KEY = "post-composer-library-expanded";
const GH_TOKEN_KEY = "post_composer_gh_token";
const ENGINE_STORAGE_KEY = "post_composer_engine_choice";

const GH_OWNER = "craig9re5";
const GH_REPO = "craig9re5.github.io";
const GH_BRANCH = "main";

const ENGINE_LOCAL = "local";
const ENGINE_CLOUD = "cloud";

// DOM Elements
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
const cameraPicker = document.querySelector("#camera-picker");
const mobileCameraBtn = document.querySelector("#mobile-camera-btn");
const connectionChip = document.querySelector("#connection-chip");
const connectionCopy = document.querySelector("#connection-copy");
const engineChip = document.querySelector("#engine-chip");
const engineLabel = document.querySelector("#engine-label");
const selectedTagsEl = document.querySelector("#selected-tags");
const savePublishButton = document.querySelector("#save-publish-post");
const downloadButton = document.querySelector("#download-post");
const passwordInput = document.querySelector("#post-password");
const ENCRYPTED_SIG = "::ENCRYPTED::";
const insertLocalImageButton = document.querySelector("#insert-local-image");
const toolbarButtons = document.querySelectorAll("[data-action]");

// Modals and Mobile controls
const openSettingsBtn = document.querySelector("#open-settings-btn");
const settingsModal = document.querySelector("#settings-modal");
const closeSettingsModalBtn = document.querySelector("#close-settings-modal-btn");
const ghTokenInput = document.querySelector("#gh-token-input");
const saveGhTokenBtn = document.querySelector("#save-gh-token-btn");
const testGhTokenBtn = document.querySelector("#test-gh-token-btn");
const tokenStatusMsg = document.querySelector("#token-status-msg");
const toggleTokenVisibilityBtn = document.querySelector("#toggle-token-visibility");
const radioLocal = document.querySelector("input[name='engine_choice'][value='local']");
const radioCloud = document.querySelector("input[name='engine_choice'][value='cloud']");

const publishSuccessModal = document.querySelector("#publish-success-modal");
const closeSuccessModalBtn = document.querySelector("#close-success-modal-btn");
const modalPostUrl = document.querySelector("#modal-post-url");
const copyPostLinkBtn = document.querySelector("#copy-post-link-btn");
const viewPostLinkBtn = document.querySelector("#view-post-link-btn");
const modalNewPostBtn = document.querySelector("#modal-new-post-btn");

const tabWrite = document.querySelector("#tab-write");
const tabPreview = document.querySelector("#tab-preview");

const requestedEditFile = normalizePostFileName(new URLSearchParams(window.location.search).get("edit"));

const state = {
  engine: ENGINE_LOCAL,
  githubToken: localStorage.getItem(GH_TOKEN_KEY) || "",
  serviceReady: false,
  repositoryName: "",
  requestToken: "",
  slugTouched: false,
  selectedTags: [],
  availableTags: [],
  hiddenPosts: new Set(),
  postsIndex: [],
  fileShas: new Map(),
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
    month: "short",
    day: "numeric"
  }).format(value);
}

function postDateFromFrontMatter(value) {
  if (!value) {
    return new Date();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function inputValueFromFrontMatterDate(value) {
  if (!value) {
    return "";
  }
  const date = postDateFromFrontMatter(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function normalizePostFileName(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const cleaned = value.trim().replace(/^.*[\\/]/, "");
  return /^[A-Za-z0-9._-]+\.md$/.test(cleaned) ? cleaned : "";
}

function safeSlug(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromTitle(title) {
  return safeSlug(title);
}

function generateFallbackSlug() {
  const now = new Date();
  const timePart = [
    pad(now.getHours()),
    pad(now.getMinutes())
  ].join("");
  const randPart = Math.random().toString(36).slice(2, 5);
  return `${timePart}-${randPart}`;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
    return String.fromCharCode('0x' + p1);
  }));
}

function b64DecodeUnicode(str) {
  const clean = str.replace(/\s/g, "");
  return decodeURIComponent(atob(clean).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

/* ---------------- GitHub API Client Helper ---------------- */

function ghHeaders() {
  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
  if (state.githubToken) {
    headers["Authorization"] = `Bearer ${state.githubToken.trim()}`;
  }
  return headers;
}

async function fetchGhApi(endpoint, options = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `https://api.github.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...ghHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/* ---------------- Post & Front-Matter Parsing ---------------- */

function parseFrontMatter(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { fields: {}, body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { fields: {}, body: normalized };
  }

  const rawFrontMatter = normalized.slice(4, endIndex);
  const rawBody = normalized.slice(endIndex + 5).replace(/^\n/, "");
  const fields = {};
  let currentListKey = null;

  rawFrontMatter.split("\n").forEach((line) => {
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentListKey) {
      const item = listMatch[1].trim().replace(/^['"]|['"]$/g, "");
      fields[currentListKey] = Array.isArray(fields[currentListKey]) ? fields[currentListKey] : [];
      fields[currentListKey].push(item);
      return;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!keyMatch) {
      currentListKey = null;
      return;
    }

    const [, key, rawValue] = keyMatch;
    const value = rawValue.trim();
    if (!value) {
      currentListKey = key;
      fields[key] = [];
      return;
    }

    currentListKey = null;
    if (value === "true") {
      fields[key] = true;
    } else if (value === "false") {
      fields[key] = false;
    } else {
      fields[key] = value.replace(/^['"]|['"]$/g, "");
    }
  });

  return { fields, body: rawBody };
}

function parsePostDocument(fileName, source, lastModified) {
  const { fields, body } = parseFrontMatter(source);
  const slug = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
  return {
    fileName,
    slug,
    title: fields.title || fileName,
    lang: fields.lang || "zh-Hans",
    date: fields.date || "",
    publishAt: inputValueFromFrontMatterDate(fields.date) || "",
    excerpt: fields.excerpt || "",
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    encrypted: Boolean(fields.encrypted),
    encrypted_data: fields.encrypted_data || "",
    encrypted_excerpt: fields.encrypted_excerpt || "",
    published: fields.published === false || fields.published === "false" ? false : undefined,
    body,
    source,
    lastModified: lastModified || Date.now()
  };
}

/* ---------------- UI State & Engine Management ---------------- */

function updateEngineDisplay() {
  if (!engineChip || !engineLabel) return;
  engineChip.classList.remove("cloud", "error");

  if (state.engine === ENGINE_LOCAL) {
    if (state.serviceReady) {
      engineLabel.textContent = "🟢 本地模式";
      engineChip.title = "已连接本地服务 (127.0.0.1:4173)。点击可切换或配置。";
    } else {
      engineChip.classList.add("error");
      engineLabel.textContent = "🔴 本地离线";
      engineChip.title = "本地服务未连接。点击可切换到 GitHub 云端直发模式。";
    }
    if (radioLocal) radioLocal.checked = true;
  } else {
    engineChip.classList.add("cloud");
    if (state.githubToken) {
      engineLabel.textContent = "☁️ GitHub 直发";
      engineChip.title = "GitHub API 直连模式 (已配置 Token)。点击可查看详情。";
    } else {
      engineLabel.textContent = "☁️ 配置 Token";
      engineChip.title = "请点击填入 GitHub Token 以启用手机/云端发帖。";
    }
    if (radioCloud) radioCloud.checked = true;
  }
}

function setStatus(message, kind) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = "status-text" + (kind ? " " + kind : "");
}

function setBusyState(active, activeLabel) {
  state.publishing = Boolean(active);
  if (!savePublishButton) return;
  savePublishButton.disabled = Boolean(active);
  savePublishButton.classList.toggle("is-busy", Boolean(active));
  
  const iconSpan = savePublishButton.querySelector(".btn-icon");
  const textSpan = savePublishButton.querySelector(".btn-text");
  if (textSpan) {
    textSpan.textContent = active ? activeLabel : "发布到博客";
  }
  if (iconSpan) {
    iconSpan.textContent = active ? "⏳" : "🚀";
  }
}

function setPublishingState(active, activeLabel = "正在发布...") {
  setBusyState(active, activeLabel);
}

function updateEditorStats() {
  if (!editorStats || !bodyInput) return;
  const value = bodyInput.value;
  const lineCount = value ? value.split("\n").length : 0;
  editorStats.textContent = `${value.length} 字符 | ${lineCount} 行`;
}

function getCurrentSlug() {
  if (state.mode === "edit" && state.originalAssetSlug) {
    return state.originalAssetSlug;
  }
  return safeSlug(slugInput.value.trim()) || slugFromTitle(titleInput.value.trim());
}

function ensureSlug() {
  const current = getCurrentSlug();
  if (current) return current;
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
  if (!slug) return "";

  const sourceDate = publishInput.value ? new Date(publishInput.value) : new Date();
  const datePart = [
    sourceDate.getFullYear(),
    pad(sourceDate.getMonth() + 1),
    pad(sourceDate.getDate())
  ].join("-");
  return `${datePart}-${slug}.md`;
}

function buildExcerpt() {
  return excerptInput ? excerptInput.value.trim() : "";
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
  if (password && typeof CryptoJS !== "undefined") {
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

  // 严格遵循规则：若未手动输入摘要，严格保持 excerpt: ""
  lines.push("excerpt: " + yamlString(finalExcerpt));

  lines.push("lang: " + langInput.value);
  if (state.selectedTags.length) {
    lines.push("tags:");
    state.selectedTags.forEach((tag) => {
      lines.push("  - " + yamlString(tag));
    });
  }

  if (state.originalPublished === false) {
    lines.push("published: false");
  }

  lines.push("---");
  lines.push("");
  lines.push(finalBody);

  return lines.join("\n") + "\n";
}

/* ---------------- Editor Snapshots & Dirty Tracking ---------------- */

function captureEditorSnapshot() {
  return {
    title: titleInput.value,
    lang: langInput.value,
    publishAt: publishInput.value,
    slug: slugInput.value,
    excerpt: excerptInput.value,
    tags: [...state.selectedTags],
    body: bodyInput.value,
    password: passwordInput ? passwordInput.value : ""
  };
}

function emptySnapshot() {
  return {
    title: "",
    lang: "zh-Hans",
    publishAt: defaultDateTimeLocal(),
    slug: "",
    excerpt: "",
    tags: [],
    body: "",
    password: ""
  };
}

function isDirty() {
  return JSON.stringify(captureEditorSnapshot()) !== state.dirtyBaseline;
}

function setDirtyBaseline(snapshot) {
  state.dirtyBaseline = JSON.stringify(snapshot);
}

/* ---------------- Draft Persistence ---------------- */

function draftKeyFor(fileName) {
  return `${DRAFT_STORAGE_KEY}-${fileName || "create"}`;
}

function persistCurrentDraft() {
  const currentSnapshot = captureEditorSnapshot();
  const key = draftKeyFor(state.mode === "edit" ? state.originalFileName : "create");
  if (isDirty()) {
    localStorage.setItem(key, JSON.stringify(currentSnapshot));
  } else {
    localStorage.removeItem(key);
  }
}

function loadDraftByKey(key) {
  try {
    const raw = localStorage.getItem(draftKeyFor(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraftByKey(key) {
  localStorage.removeItem(draftKeyFor(key));
}

let previewDebounceTimer = null;
function schedulePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => {
    renderPreview();
    persistCurrentDraft();
  }, 120);
}

function flushPendingWork() {
  clearTimeout(previewDebounceTimer);
  persistCurrentDraft();
}

/* ---------------- Preview Rendering ---------------- */

function renderPreview() {
  if (!previewTitle || !previewDate || !previewHost) return;
  const title = titleInput.value.trim();
  previewTitle.textContent = title || "在左边输入标题和正文";
  previewDate.textContent = formatPreviewDate(publishInput.value, langInput.value);
  
  if (previewTags) {
    previewTags.innerHTML = "";
    state.selectedTags.forEach((tag) => {
      const tagSpan = document.createElement("span");
      tagSpan.className = "preview-tag";
      tagSpan.textContent = tag;
      previewTags.appendChild(tagSpan);
    });
  }

  const rawBody = bodyInput.value;
  if (rawBody === state.lastRenderedBody && rawBody !== "") return;
  state.lastRenderedBody = rawBody;

  if (!rawBody.trim()) {
    previewHost.innerHTML = `<p class="preview-empty">这里会实时渲染接近博客文章页的预览，包括标题、段落、列表、代码块和图片。</p>`;
    return;
  }

  if (typeof renderMarkdown === "function") {
    previewHost.innerHTML = renderMarkdown(rawBody);
  } else {
    previewHost.innerHTML = `<pre>${escapeHtml(rawBody)}</pre>`;
  }

  if (fileNameEl) {
    fileNameEl.textContent = buildFileName() || "填了标题后这里会显示文件名";
  }
}

/* ---------------- Tag System ---------------- */

function renderSelectedTags() {
  if (!selectedTagsEl) return;
  selectedTagsEl.innerHTML = "";
  state.selectedTags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `${escapeHtml(tag)} <button type="button" class="tag-remove-btn" data-toggle-tag="${escapeHtml(tag)}" aria-label="移除标签">✕</button>`;
    selectedTagsEl.appendChild(chip);
  });
}

function addTag(tag) {
  const clean = tag.trim().replace(/^#+/, "");
  if (!clean || state.selectedTags.includes(clean)) return;
  state.selectedTags.push(clean);
  renderSelectedTags();
  renderPreview();
  schedulePreview();
}

function removeTag(tag) {
  state.selectedTags = state.selectedTags.filter((t) => t !== tag);
  renderSelectedTags();
  renderPreview();
  schedulePreview();
}

function toggleTag(tag) {
  if (state.selectedTags.includes(tag)) {
    removeTag(tag);
  } else {
    addTag(tag);
  }
}

function collectPendingTags() {
  if (!tagsInput) return;
  const raw = tagsInput.value;
  if (!raw) return;
  raw.split(/[,，]/).forEach((part) => addTag(part));
  tagsInput.value = "";
}

/* ---------------- Post Library & Dual-Engine Data Loading ---------------- */

async function loadPostsIndex() {
  try {
    if (state.engine === ENGINE_LOCAL && state.serviceReady) {
      const response = await fetch("/api/posts", {
        headers: { "X-Post-Composer-Token": state.requestToken }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "无法读取文章列表");
      
      const docs = result.posts || [];
      state.postsIndex = docs.map((doc) => parsePostDocument(doc.fileName, doc.source, doc.lastModified));
    } else {
      // Cloud Engine (GitHub API)
      if (!state.githubToken) {
        state.postsIndex = [];
        renderPostList();
        return true;
      }
      const { response, data } = await fetchGhApi(`/repos/${GH_OWNER}/${GH_REPO}/contents/_posts?ref=${GH_BRANCH}`);
      if (!response.ok) throw new Error(data.message || `GitHub API 响应 ${response.status}`);
      
      const files = Array.isArray(data) ? data : [];
      state.fileShas.clear();
      files.forEach((f) => state.fileShas.set(f.name, f.sha));

      state.postsIndex = files
        .filter((f) => f.name.endsWith(".md"))
        .map((f) => {
          const slug = f.name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
          return {
            fileName: f.name,
            slug,
            title: slug.replace(/-/g, " "),
            date: f.name.slice(0, 10),
            publishAt: f.name.slice(0, 10) + "T12:00",
            tags: [],
            body: "",
            source: "",
            lastModified: Date.now()
          };
        });
    }

    // Collect available tags
    const tagSet = new Set();
    state.postsIndex.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
    state.availableTags = Array.from(tagSet);

    renderPostList();
    return true;
  } catch (error) {
    renderPostList();
    setStatus("读取文章库列表失败：" + error.message, "warn");
    return false;
  }
}

function renderPostList() {
  if (!postListEl) return;
  const filter = (postSearchInput ? postSearchInput.value.trim().toLowerCase() : "");
  postListEl.innerHTML = "";

  const filtered = state.postsIndex.filter((post) => {
    if (!filter) return true;
    return (
      post.title.toLowerCase().includes(filter) ||
      post.fileName.toLowerCase().includes(filter) ||
      post.tags.some((t) => t.toLowerCase().includes(filter))
    );
  });

  if (!filtered.length) {
    postListEl.innerHTML = `<p class="library-empty">${state.postsIndex.length ? "无匹配文章" : "文章库为空"}</p>`;
    return;
  }

  filtered.forEach((post) => {
    const item = document.createElement("div");
    item.className = "post-library-item" + (state.mode === "edit" && state.originalFileName === post.fileName ? " is-active" : "");
    item.innerHTML = `
      <div class="post-library-info" data-open-post="${escapeHtml(post.fileName)}">
        <h4 class="post-library-title">${escapeHtml(post.title || post.fileName)}</h4>
        <span class="post-library-date">${escapeHtml(post.date ? post.date.slice(0, 10) : post.fileName.slice(0, 10))}</span>
      </div>
      <div class="post-library-actions">
        <button class="tool-button" data-delete-post="${escapeHtml(post.fileName)}" title="删除此文章">🗑️</button>
      </div>
    `;
    postListEl.appendChild(item);
  });
}

/* ---------------- Editor Mode Switching ---------------- */

function enterCreateMode({ snapshot, baseline, focus = true }) {
  state.mode = "create";
  state.currentFileName = "";
  state.originalFileName = "";
  state.originalAssetSlug = "";
  state.originalPublished = undefined;
  state.originalEncrypted = false;

  titleInput.value = snapshot.title || "";
  langInput.value = snapshot.lang || "zh-Hans";
  publishInput.value = snapshot.publishAt || defaultDateTimeLocal();
  slugInput.value = snapshot.slug || "";
  if (excerptInput) excerptInput.value = snapshot.excerpt || "";
  state.selectedTags = snapshot.tags ? [...snapshot.tags] : [];
  bodyInput.value = snapshot.body || "";
  if (passwordInput) passwordInput.value = snapshot.password || "";

  if (composerModeChip) {
    composerModeChip.textContent = "新建模式";
    composerModeChip.className = "status-chip mode-create";
  }

  setDirtyBaseline(baseline || emptySnapshot());
  renderSelectedTags();
  renderPreview();
  updateEditorStats();

  if (focus) titleInput.focus();
}

async function openPostForEditing(fileName) {
  if (isDirty() && !window.confirm("当前编辑区有未保存修改，确定打开其他文章吗？")) {
    return;
  }

  setStatus(`正在加载 ${fileName}...`, "");
  let post = state.postsIndex.find((p) => p.fileName === fileName);

  try {
    let source = post ? post.source : "";
    if (!source) {
      if (state.engine === ENGINE_LOCAL && state.serviceReady) {
        const res = await fetch("/api/posts", { headers: { "X-Post-Composer-Token": state.requestToken } });
        const data = await res.json();
        const found = (data.posts || []).find((p) => p.fileName === fileName);
        if (found) source = found.source;
      } else {
        // Fetch from GitHub API
        const { response, data } = await fetchGhApi(`/repos/${GH_OWNER}/${GH_REPO}/contents/_posts/${fileName}?ref=${GH_BRANCH}`);
        if (!response.ok) throw new Error(data.message || "无法从 GitHub 获取文章内容");
        source = b64DecodeUnicode(data.content || "");
        if (data.sha) state.fileShas.set(fileName, data.sha);
      }
    }

    if (!source) throw new Error("未找到文章内容");
    post = parsePostDocument(fileName, source, Date.now());

    state.mode = "edit";
    state.originalFileName = fileName;
    state.currentFileName = fileName;
    state.originalAssetSlug = post.slug;
    state.originalPublished = post.published;
    state.originalEncrypted = post.encrypted;

    titleInput.value = post.title;
    langInput.value = post.lang;
    publishInput.value = post.publishAt || defaultDateTimeLocal();
    slugInput.value = post.slug;
    if (excerptInput) excerptInput.value = post.excerpt;
    state.selectedTags = [...post.tags];
    bodyInput.value = post.body;
    if (passwordInput) passwordInput.value = "";

    if (composerModeChip) {
      composerModeChip.textContent = "编辑模式";
      composerModeChip.className = "status-chip mode-edit";
    }

    setDirtyBaseline(captureEditorSnapshot());
    renderSelectedTags();
    renderPreview();
    updateEditorStats();
    renderPostList();
    setStatus(`已加载 ${fileName}`, "success");

    // Close library drawer on mobile after selection
    if (window.innerWidth < 860) {
      document.body.dataset.mobileView = "write";
      if (tabWrite) tabWrite.click();
    }
  } catch (error) {
    setStatus("载入失败：" + error.message, "error");
  }
}

function switchToNewPost() {
  if (isDirty() && !window.confirm("当前编辑区有未保存修改，确定切换到新建模式吗？")) {
    return;
  }
  clearDraftByKey("create");
  enterCreateMode({ snapshot: emptySnapshot(), baseline: emptySnapshot() });
  setStatus("已切换到新建文章模式。", "");
}

/* ---------------- Image Importing ---------------- */

async function importImages(files) {
  if (!files || !files.length) return;
  ensureSlug();
  const assetSlug = getCurrentSlug();
  
  setStatus(`正在上传 ${files.length} 张图片...`, "");

  for (const file of files) {
    try {
      const base64 = await readFileAsBase64(file);
      const safeName = safeSlug(file.name.replace(/\.[^.]+$/, "")) + (file.name.match(/\.[^.]+$/) ? file.name.match(/\.[^.]+$/)[0].toLowerCase() : ".png");
      
      let webPath = "";
      if (state.engine === ENGINE_LOCAL && state.serviceReady) {
        const res = await fetch("/api/images/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Post-Composer-Token": state.requestToken
          },
          body: JSON.stringify({
            assetSlug,
            fileName: safeName,
            base64
          })
        });
        const result = await res.json();
        if (!res.ok || !result.ok) throw new Error(result.message || "上传图片失败");
        webPath = result.webPath;
      } else {
        // Upload directly via GitHub API
        if (!state.githubToken) throw new Error("请先配置 GitHub Token 以支持云端上传图片");
        const endpoint = `/repos/${GH_OWNER}/${GH_REPO}/contents/assets/posts/${assetSlug}/${safeName}`;
        const { response, data } = await fetchGhApi(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            message: `assets: add ${safeName}`,
            content: base64,
            branch: GH_BRANCH
          })
        });
        if (!response.ok) throw new Error(data.message || "GitHub API 图片上传失败");
        webPath = `/assets/posts/${assetSlug}/${safeName}`;
      }

      insertAtSelection(`\n![${safeName}](${webPath})\n`);
      schedulePreview();
      setStatus(`图片 ${safeName} 上传成功！`, "success");
    } catch (err) {
      setStatus(`图片上传失败：${err.message}`, "error");
    }
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const base64 = res.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- Streamlined One-Tap Publishing ---------------- */

function calculateOnlineUrl(dateStr, slug) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `https://${GH_REPO}/${y}/${m}/${d}/${slug}/`;
}

function showPublishSuccess(fileName, slug, dateValue) {
  const fullUrl = calculateOnlineUrl(dateValue, slug);
  if (modalPostUrl) {
    modalPostUrl.textContent = fullUrl;
    modalPostUrl.href = fullUrl;
  }
  if (viewPostLinkBtn) {
    viewPostLinkBtn.href = fullUrl;
  }
  if (publishSuccessModal) {
    publishSuccessModal.hidden = false;
  }
}

async function publishPost() {
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    setStatus("标题和正文不能为空。", "warn");
    return;
  }

  ensureSlug();
  const slug = getCurrentSlug();
  const fileName = buildFileName();
  const markdown = buildMarkdown();

  setPublishingState(true, "🚀 正在提交并推送到 GitHub...");

  try {
    if (state.engine === ENGINE_LOCAL && state.serviceReady) {
      // Step 1: Save local file
      const saveRes = await fetch("/api/posts/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Post-Composer-Token": state.requestToken
        },
        body: JSON.stringify({
          fileName,
          markdown,
          mode: state.mode,
          overwrite: true
        })
      });
      const saveResult = await saveRes.json();
      if (!saveRes.ok || !saveResult.ok) throw new Error(saveResult.message || "本地保存失败");

      // Step 2: Publish (Git Commit & Push)
      const pubRes = await fetch("/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Post-Composer-Token": state.requestToken
        },
        body: JSON.stringify({
          fileName,
          assetSlug: slug,
          mode: state.mode
        })
      });
      const pubResult = await pubRes.json();
      if (!pubRes.ok || !pubResult.ok) throw new Error(pubResult.message || "Git 推送失败");

    } else {
      // Cloud Engine (GitHub REST API Direct)
      if (!state.githubToken) {
        openSettingsModal();
        throw new Error("请先填入 GitHub Token 以完成发布");
      }

      // Check existing SHA
      let sha = state.fileShas.get(fileName);
      if (!sha && state.mode === "edit") {
        const check = await fetchGhApi(`/repos/${GH_OWNER}/${GH_REPO}/contents/_posts/${fileName}?ref=${GH_BRANCH}`);
        if (check.response.ok && check.data.sha) {
          sha = check.data.sha;
        }
      }

      const { response, data } = await fetchGhApi(`/repos/${GH_OWNER}/${GH_REPO}/contents/_posts/${fileName}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `post: ${state.mode === "create" ? "add" : "update"} ${fileName}`,
          content: b64EncodeUnicode(markdown),
          sha: sha || undefined,
          branch: GH_BRANCH
        })
      });

      if (!response.ok) throw new Error(data.message || `GitHub 提交失败 (${response.status})`);
      if (data.content && data.content.sha) {
        state.fileShas.set(fileName, data.content.sha);
      }
    }

    // Success Handling
    clearDraftByKey(state.mode === "edit" ? state.originalFileName : "create");
    setDirtyBaseline(captureEditorSnapshot());
    await loadPostsIndex();
    
    setStatus("🎉 发布成功！GitHub Pages 正在自动构建上线。", "success");
    showPublishSuccess(fileName, slug, publishInput.value);

  } catch (error) {
    setStatus("发布失败：" + error.message, "error");
  } finally {
    setPublishingState(false);
  }
}

/* ---------------- Settings & Token Modal Handling ---------------- */

function openSettingsModal() {
  if (ghTokenInput) ghTokenInput.value = state.githubToken;
  if (tokenStatusMsg) tokenStatusMsg.textContent = "";
  if (settingsModal) settingsModal.hidden = false;
}

function closeSettingsModal() {
  if (settingsModal) settingsModal.hidden = true;
}

async function testGitHubToken(token) {
  if (!token) {
    if (tokenStatusMsg) {
      tokenStatusMsg.textContent = "Token 不能为空";
      tokenStatusMsg.className = "token-status-text error";
    }
    return false;
  }
  if (tokenStatusMsg) {
    tokenStatusMsg.textContent = "正在测试连接 GitHub...";
    tokenStatusMsg.className = "token-status-text";
  }

  const { response, data } = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${token.trim()}`
    }
  }).then(async (r) => ({ response: r, data: await r.json().catch(() => ({})) })).catch((err) => ({ response: { ok: false }, data: { message: err.message } }));

  if (response.ok) {
    if (tokenStatusMsg) {
      tokenStatusMsg.textContent = `✅ 连接成功！已验证仓库: ${data.full_name}`;
      tokenStatusMsg.className = "token-status-text success";
    }
    return true;
  } else {
    if (tokenStatusMsg) {
      tokenStatusMsg.textContent = `❌ 验证失败: ${data.message || "未知错误"}`;
      tokenStatusMsg.className = "token-status-text error";
    }
    return false;
  }
}

/* ---------------- Connection & Initialization ---------------- */

async function initEngineConnection() {
  // Check user preferred engine or try local first
  const preferredEngine = localStorage.getItem(ENGINE_STORAGE_KEY) || ENGINE_LOCAL;
  
  if (preferredEngine === ENGINE_LOCAL) {
    try {
      const response = await fetch("/status", { signal: AbortSignal.timeout(2000) });
      const result = await response.json();
      if (response.ok && result.ok && result.requestToken) {
        state.engine = ENGINE_LOCAL;
        state.serviceReady = true;
        state.repositoryName = result.repositoryName || GH_REPO;
        state.requestToken = result.requestToken;
        updateEngineDisplay();
        await loadPostsIndex();
        return;
      }
    } catch {
      // Local connection unavailable
    }
  }

  // Fallback to Cloud Engine
  state.engine = ENGINE_CLOUD;
  state.serviceReady = false;
  updateEngineDisplay();
  await loadPostsIndex();
}

/* ---------------- Textarea Helpers & Formatting ---------------- */

function applyEditorEdit(start, end, text, selectionStart, selectionEnd) {
  bodyInput.focus();
  bodyInput.setSelectionRange(start, end);
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  if (!inserted) {
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

  const outerStart = start - before.length;
  const outerEnd = end + after.length;
  if (selected && outerStart >= 0 && value.slice(outerStart, start) === before && value.slice(end, outerEnd) === after) {
    applyEditorEdit(outerStart, outerEnd, selected, outerStart, outerStart + selected.length);
    return;
  }

  const content = selected || placeholder;
  applyEditorEdit(start, end, before + content + after, start + before.length, start + before.length + content.length);
}

function insertAtSelection(snippet) {
  const start = bodyInput.selectionStart;
  const end = bodyInput.selectionEnd;
  applyEditorEdit(start, end, snippet, start + snippet.length, start + snippet.length);
}

function handleToolbarAction(action) {
  switch (action) {
    case "h1": wrapSelection("# ", "\n", "标题 1"); break;
    case "h2": wrapSelection("## ", "\n", "标题 2"); break;
    case "h3": wrapSelection("### ", "\n", "标题 3"); break;
    case "bold": wrapSelection("**", "**", "加粗文字"); break;
    case "italic": wrapSelection("*", "*", "斜体文字"); break;
    case "link": wrapSelection("[", "](https://example.com)", "链接文字"); break;
    case "inline-code": wrapSelection("`", "`", "代码"); break;
    case "quote": wrapSelection("> ", "\n", "引用内容"); break;
    case "ul": wrapSelection("- ", "\n", "列表项目"); break;
    case "task": wrapSelection("- [ ] ", "\n", "待办事项"); break;
    case "code-block": wrapSelection("```javascript\n", "\n```", "// 代码块"); break;
    case "hr": insertAtSelection("\n\n---\n\n"); break;
  }
  schedulePreview();
}

/* ---------------- Event Listeners Setup ---------------- */

function initEventListeners() {
  // Save / Publish
  if (savePublishButton) {
    savePublishButton.addEventListener("click", publishPost);
  }

  // Keyboard Shortcuts: Ctrl+Enter (Publish), Ctrl+S (Draft)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      publishPost();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      flushPendingWork();
      setStatus("草稿已保存在本地。", "success");
    }
  });

  // Inputs live preview
  [titleInput, langInput, publishInput, excerptInput, bodyInput].forEach((el) => {
    if (el) {
      el.addEventListener("input", () => {
        updateEditorStats();
        schedulePreview();
      });
    }
  });

  // Slug input
  if (slugInput) {
    slugInput.addEventListener("input", () => {
      state.slugTouched = Boolean(slugInput.value.trim());
      renderPreview();
    });
  }

  // Toolbar
  toolbarButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleToolbarAction(btn.dataset.action));
  });

  // Image insertions
  if (insertLocalImageButton) {
    insertLocalImageButton.addEventListener("click", () => imagePicker && imagePicker.click());
  }
  if (mobileCameraBtn && cameraPicker) {
    mobileCameraBtn.addEventListener("click", () => cameraPicker.click());
  }
  if (imagePicker) {
    imagePicker.addEventListener("change", (e) => importImages(Array.from(e.target.files || [])));
  }
  if (cameraPicker) {
    cameraPicker.addEventListener("change", (e) => importImages(Array.from(e.target.files || [])));
  }

  // Paste & Drag image
  window.addEventListener("paste", (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items.filter((it) => it.type.startsWith("image/")).map((it) => it.getAsFile()).filter(Boolean);
    if (imageFiles.length) {
      e.preventDefault();
      importImages(imageFiles);
    }
  });

  bodyInput?.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      importImages(files);
    }
  });

  // Tags
  addTagButton?.addEventListener("click", collectPendingTags);
  tagsInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      collectPendingTags();
    }
  });
  selectedTagsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle-tag]");
    if (btn) toggleTag(btn.dataset.toggleTag);
  });

  // Post List Click
  postListEl?.addEventListener("click", async (e) => {
    const openBtn = e.target.closest("[data-open-post]");
    if (openBtn) {
      openPostForEditing(openBtn.dataset.openPost);
      return;
    }
    const delBtn = e.target.closest("[data-delete-post]");
    if (delBtn) {
      const fileName = delBtn.dataset.deletePost;
      if (window.confirm(`确定删除文章《${fileName}》吗？`)) {
        // Delete post
        if (state.engine === ENGINE_LOCAL && state.serviceReady) {
          await fetch("/api/posts/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Post-Composer-Token": state.requestToken },
            body: JSON.stringify({ fileName })
          });
        } else {
          const sha = state.fileShas.get(fileName);
          await fetchGhApi(`/repos/${GH_OWNER}/${GH_REPO}/contents/_posts/${fileName}`, {
            method: "DELETE",
            body: JSON.stringify({ message: `post: delete ${fileName}`, sha, branch: GH_BRANCH })
          });
        }
        await loadPostsIndex();
        if (state.originalFileName === fileName) switchToNewPost();
        setStatus(`已删除 ${fileName}`, "warn");
      }
    }
  });

  // Search
  postSearchInput?.addEventListener("input", renderPostList);
  newPostButton?.addEventListener("click", switchToNewPost);

  // Library Toggle
  toggleLibraryButton?.addEventListener("click", () => {
    state.libraryExpanded = !state.libraryExpanded;
    composerLayout?.classList.toggle("library-open", state.libraryExpanded);
  });

  // Mobile View Switcher (Write / Preview)
  if (tabWrite && tabPreview) {
    tabWrite.addEventListener("click", () => {
      tabWrite.classList.add("active");
      tabPreview.classList.remove("active");
      document.body.dataset.mobileView = "write";
    });
    tabPreview.addEventListener("click", () => {
      tabPreview.classList.add("active");
      tabWrite.classList.remove("active");
      document.body.dataset.mobileView = "preview";
      renderPreview();
    });
  }

  // Modals
  openSettingsBtn?.addEventListener("click", openSettingsModal);
  engineChip?.addEventListener("click", openSettingsModal);
  closeSettingsModalBtn?.addEventListener("click", closeSettingsModal);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  // Settings: Engine selection radio
  document.querySelectorAll("input[name='engine_choice']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.engine = e.target.value;
      localStorage.setItem(ENGINE_STORAGE_KEY, state.engine);
      updateEngineDisplay();
      loadPostsIndex();
    });
  });

  // Settings: GitHub Token
  saveGhTokenBtn?.addEventListener("click", async () => {
    const token = ghTokenInput.value.trim();
    const ok = await testGitHubToken(token);
    if (ok) {
      state.githubToken = token;
      localStorage.setItem(GH_TOKEN_KEY, token);
      state.engine = ENGINE_CLOUD;
      localStorage.setItem(ENGINE_STORAGE_KEY, ENGINE_CLOUD);
      updateEngineDisplay();
      loadPostsIndex();
      setTimeout(closeSettingsModal, 800);
    }
  });

  testGhTokenBtn?.addEventListener("click", () => {
    testGitHubToken(ghTokenInput.value.trim());
  });

  toggleTokenVisibilityBtn?.addEventListener("click", () => {
    ghTokenInput.type = ghTokenInput.type === "password" ? "text" : "password";
  });

  // Publish Success Modal Buttons
  closeSuccessModalBtn?.addEventListener("click", () => {
    publishSuccessModal.hidden = true;
  });
  publishSuccessModal?.addEventListener("click", (e) => {
    if (e.target === publishSuccessModal) publishSuccessModal.hidden = true;
  });
  copyPostLinkBtn?.addEventListener("click", async () => {
    const url = modalPostUrl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      copyPostLinkBtn.textContent = "✅ 已复制！";
      setTimeout(() => { copyPostLinkBtn.textContent = "📋 复制链接"; }, 2000);
    } catch {
      prompt("请手动复制链接：", url);
    }
  });
  modalNewPostBtn?.addEventListener("click", () => {
    publishSuccessModal.hidden = true;
    switchToNewPost();
  });

  // Theme Toggle
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

  const savedTheme = localStorage.getItem("post-composer-theme") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);

  themeToggleBtn?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

/* ---------------- App Initialization ---------------- */

async function initApp() {
  initEventListeners();
  
  // Register Service Worker for PWA
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Restore Draft if exists
  const draft = loadDraftByKey(requestedEditFile || "create");
  enterCreateMode({
    snapshot: draft || emptySnapshot(),
    baseline: emptySnapshot(),
    focus: false
  });

  await initEngineConnection();

  if (requestedEditFile) {
    openPostForEditing(requestedEditFile);
  }
}

document.addEventListener("DOMContentLoaded", initApp);
