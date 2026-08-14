(function () {
  const root = document.querySelector("#home-todo-card");
  if (!root) {
    return;
  }

  const STORAGE_KEY = root.dataset.storageKey || "home-todo-v1";
  const form = root.querySelector(".todo-form");
  const input = root.querySelector(".todo-input");
  const dueInput = root.querySelector(".todo-due-input");
  const list = root.querySelector(".todo-list");
  const empty = root.querySelector(".todo-empty");
  const status = root.querySelector(".todo-status");

  let items = [];
  let editingId = null;
  let storageEnabled = false;

  function canUseStorage() {
    try {
      const probeKey = "__home_todo_probe__";
      window.localStorage.setItem(probeKey, "1");
      window.localStorage.removeItem(probeKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readItems() {
    if (!storageEnabled) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => ({
          id: typeof item.id === "string" ? item.id : String(Date.now()),
          text: typeof item.text === "string" ? item.text : "",
          dueAt: normalizeDue(item.dueAt),
          completed: Boolean(item.completed),
          createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
        }))
        .filter((item) => item.text.trim());
    } catch (error) {
      setStatus("Saved TODO data was reset because it could not be read.", true);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (nestedError) {
        // Ignore cleanup failures and continue with an empty list.
      }
      return [];
    }
  }

  function writeItems() {
    if (!storageEnabled) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      setStatus("Local storage is unavailable. Changes will only last until this tab closes.", true);
      storageEnabled = false;
    }
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeDue(value) {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? trimmed : "";
  }

  function formatDue(value) {
    const dueAt = normalizeDue(value);
    if (!dueAt) {
      return "";
    }

    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime())) {
      return "";
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const dayDiff = Math.round((dueDay - today) / 86400000);
    const time = dueDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (dayDiff === 0) {
      return "Today " + time;
    }

    if (dayDiff === 1) {
      return "Tomorrow " + time;
    }

    if (dayDiff === -1) {
      return "Yesterday " + time;
    }

    const options = dueDate.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" };

    return dueDate.toLocaleDateString([], options) + " " + time;
  }

  function isOverdue(item) {
    const dueAt = normalizeDue(item.dueAt);
    return Boolean(dueAt && !item.completed && new Date(dueAt).getTime() < Date.now());
  }

  function setStatus(message, warn) {
    status.textContent = message || "";
    status.dataset.state = warn ? "warn" : "";
  }

  function itemMarkup(item) {
    const checked = item.completed ? " checked" : "";
    const completedClass = item.completed ? " is-complete" : "";
    const dueAt = normalizeDue(item.dueAt);
    const dueText = formatDue(dueAt);
    const dueClass = isOverdue(item) ? " is-overdue" : "";
    const dueChip = dueText
      ? '<span class="todo-due-chip' + dueClass + '">' +
        (isOverdue(item) ? '<span class="sr-only">Overdue: </span>' : "") +
        escapeHtml(dueText) + "</span>"
      : "";

    if (editingId === item.id) {
      return [
        '<li class="todo-item is-editing" data-id="', item.id, '">',
        '<form class="todo-edit-form">',
        '<div class="todo-edit-fields">',
        '<input class="todo-edit-input" name="text" type="text" maxlength="180" value="', escapeHtml(item.text), '" aria-label="Edit todo item">',
        '<label class="todo-due-field todo-edit-due-field">',
        '<span class="todo-due-label">Due</span>',
        '<input class="todo-due-input todo-edit-due-input" name="due" type="datetime-local" value="', escapeHtml(dueAt), '" aria-label="Edit task deadline">',
        "</label>",
        "</div>",
        '<div class="todo-actions">',
         '<button type="submit" class="button-link todo-submit todo-action todo-action-save">Save</button>',
        '<button type="button" class="todo-action" data-action="cancel-edit">Cancel</button>',
        '</div>',
        "</form>",
        "</li>"
      ].join("");
    }

    return [
      '<li class="todo-item', completedClass, '" data-id="', item.id, '">',
      '<label class="todo-check">',
       '<input type="checkbox" data-action="toggle"', checked, '>',
      '<span class="todo-body">',
      '<span class="todo-text">', escapeHtml(item.text), "</span>",
      dueChip,
      "</span>",
      "</label>",
      '<div class="todo-actions">',
      '<button type="button" class="todo-action" data-action="edit">Edit</button>',
      '<button type="button" class="todo-action todo-action-danger" data-action="delete">Delete</button>',
      "</div>",
      "</li>"
    ].join("");
  }

  function render() {
    list.innerHTML = items.map(itemMarkup).join("");
    empty.hidden = items.length > 0;
    updateBadge();
  }

  function updateBadge() {
    const badge = document.getElementById("todo-count-badge");
    if (!badge) return;
    if (items.length === 0) {
      badge.hidden = true;
    } else {
      badge.hidden = false;
      const pendingCount = items.filter(function (i) { return !i.completed; }).length;
      badge.textContent = pendingCount === 0 ? "All done (" + items.length + ")" : pendingCount + " pending";
    }
  }

  function setupCollapseToggle() {
    const toggleBtn = document.getElementById("todo-toggle-btn");
    const sectionCopy = document.getElementById("todo-section-copy");
    const COLLAPSE_KEY = "home-todo-collapsed-v1";
    if (!toggleBtn) return;

    let isCollapsed = false;
    try {
      isCollapsed = window.localStorage.getItem(COLLAPSE_KEY) === "true";
    } catch (e) {
      isCollapsed = false;
    }

    function applyCollapseState(collapsed) {
      isCollapsed = collapsed;
      root.classList.toggle("is-collapsed", isCollapsed);
      if (sectionCopy) {
        sectionCopy.classList.toggle("is-collapsed", isCollapsed);
      }
      toggleBtn.setAttribute("aria-expanded", String(!isCollapsed));
      const toggleText = toggleBtn.querySelector(".todo-toggle-text");
      if (toggleText) {
        toggleText.textContent = isCollapsed ? "Expand" : "Collapse";
      }
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(isCollapsed));
      } catch (e) {}
    }

    toggleBtn.addEventListener("click", function () {
      applyCollapseState(!isCollapsed);
    });

    applyCollapseState(isCollapsed);
  }

  function createItem(text, dueAt) {
    const now = Date.now();
    return {
      id: "todo-" + now + "-" + Math.random().toString(36).slice(2, 8),
      text: text.trim(),
      dueAt: normalizeDue(dueAt),
      completed: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function getTomorrowNineAM() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day + "T09:00";
  }

  function addItem(text, dueAt) {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus("Enter a task before adding it.", true);
      return;
    }

    items.push(createItem(trimmed, dueAt));
    writeItems();
    render();
    setStatus("Task added.");
  }

  function updateItem(id, updater) {
    items = items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      return updater(item);
    });
    writeItems();
    render();
  }

  function deleteItem(id) {
    items = items.filter((item) => item.id !== id);
    writeItems();
    render();
    setStatus("Task removed.");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    addItem(input.value, dueInput ? dueInput.value : "");
    input.value = "";
    if (dueInput) {
      dueInput.value = getTomorrowNineAM();
    }
    input.focus();
  });

  list.addEventListener("click", function (event) {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) {
      return;
    }

    const itemEl = actionBtn.closest(".todo-item");
    if (!itemEl) {
      return;
    }

    const id = itemEl.dataset.id;
    const action = actionBtn.dataset.action;

    if (action === "delete") {
      deleteItem(id);
      return;
    }

    if (action === "edit") {
      editingId = id;
      render();
      const editInput = list.querySelector('.todo-item[data-id="' + id + '"] .todo-edit-input');
      if (editInput) {
        editInput.focus();
        editInput.select();
      }
      return;
    }

    if (action === "cancel") {
      editingId = null;
      render();
    }
  });

  list.addEventListener("change", function (event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-action="toggle"]');
    if (!checkbox) {
      return;
    }

    const itemEl = checkbox.closest(".todo-item");
    if (!itemEl) {
      return;
    }

    const id = itemEl.dataset.id;
    updateItem(id, function (item) {
      return {
        id: item.id,
        text: item.text,
        dueAt: item.dueAt,
        completed: checkbox.checked,
        createdAt: item.createdAt,
        updatedAt: Date.now()
      };
    });
    setStatus("");
  });

  list.addEventListener("submit", function (event) {
    const editForm = event.target.closest(".todo-edit-form");
    if (!editForm) {
      return;
    }

    event.preventDefault();

    const itemEl = editForm.closest(".todo-item");
    const editInput = editForm.querySelector(".todo-edit-input");
    const editDueInput = editForm.querySelector(".todo-edit-due-input");
    if (!itemEl || !editInput) {
      return;
    }

    const nextText = editInput.value.trim();
    if (!nextText) {
      setStatus("Edited tasks cannot be empty.", true);
      editInput.focus();
      return;
    }

    const id = itemEl.dataset.id;
    editingId = null;
    updateItem(id, function (item) {
      return {
        id: item.id,
        text: nextText,
        dueAt: editDueInput ? normalizeDue(editDueInput.value) : item.dueAt,
        completed: item.completed,
        createdAt: item.createdAt,
        updatedAt: Date.now()
      };
    });
    setStatus("");
  });

  storageEnabled = canUseStorage();
  if (!storageEnabled) {
    setStatus("This browser cannot persist local TODO items. Changes will not survive a reload.", true);
  }

  if (dueInput) {
    dueInput.value = getTomorrowNineAM();
  }

  items = readItems();
  setupCollapseToggle();
  render();
})();
