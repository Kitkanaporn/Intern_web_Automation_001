// static/main.js

// ── State ─────────────────────────────────────────────────────
// Holds the current requirement form data and AI results
const state = {
  projectName: "",
  requirement: "",
  priority: "",
  department: "",
  userStories: [],
  tasks: [],
};

// ── DOM references ────────────────────────────────────────────
const navStatus = document.getElementById("navStatus");
const activityLog = document.getElementById("activityLog");
const ticketBadge = document.getElementById("ticketBadge");
const historyBadge = document.getElementById("historyBadge");

// ── Utility: log an activity entry ───────────────────────────
const logActivity = (icon, text) => {
  const empty = activityLog.querySelector(".activity-log__empty");
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const entry = document.createElement("div");
  entry.className = "activity-entry";
  entry.innerHTML = `
    <div>
      <span class="activity-entry__icon">${icon}</span>
      <span class="activity-entry__text">${text}</span>
    </div>
    <div class="activity-entry__time">${time}</div>
  `;
  activityLog.prepend(entry);
};

// ── Utility: set navbar status ────────────────────────────────
const setStatus = (type, label) => {
  const dot = navStatus.querySelector(".status-dot");
  dot.className = `status-dot status-dot--${type}`;
  navStatus.querySelector("span:last-child").textContent = label;
};

// ── Sidebar navigation ────────────────────────────────────────
const initSidebar = () => {
  const items = document.querySelectorAll(".sidebar__item");
  items.forEach(item => {
    item.addEventListener("click", () => {
      items.forEach(i => i.classList.remove("sidebar__item--active"));
      item.classList.add("sidebar__item--active");

      const target = item.dataset.section;
      document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
      document.getElementById(`section-${target}`).classList.remove("hidden");

      if (target === "jira-board") loadKanban();
      if (target === "history") loadHistory();
    });
  });
};

// ── Step navigation helpers ───────────────────────────────────
const showStep = (stepId) => {
  ["step-form", "step-review", "step-success"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(stepId).classList.remove("hidden");
};

// ── Requirement form submit → call AI ─────────────────────────
const initForm = () => {
  const form = document.getElementById("requirementForm");
  const btn = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("analyzeBtnText");
  const spinner = document.getElementById("analyzeSpinner");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    state.projectName = document.getElementById("projectName").value.trim();
    state.requirement = document.getElementById("requirementText").value.trim();
    state.priority = document.getElementById("priority").value;
    state.department = document.getElementById("department").value;

    btn.disabled = true;
    btnText.textContent = "Analyzing...";
    spinner.classList.remove("hidden");
    setStatus("working", "AI Thinking...");
    logActivity("📋", `Requirement submitted: <strong>${state.projectName}</strong>`);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: state.requirement }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "API error");
      }

      state.userStories = data.user_stories || [];
      state.tasks = data.tasks || [];

      logActivity("🤖", `AI generated <strong>${state.tasks.length} tasks</strong> and <strong>${state.userStories.length} user stories</strong>`);
      setStatus("ready", "Ready");
      renderReview();
      showStep("step-review");

    } catch (err) {
      logActivity("❌", `AI analysis failed: ${err.message}`);
      setStatus("error", "Error");
      alert(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btnText.textContent = "Analyze with AI ✨";
      spinner.classList.add("hidden");
    }
  });

  document.getElementById("backToFormBtn").addEventListener("click", () => showStep("step-form"));
  document.getElementById("newRequestBtn").addEventListener("click", () => {
    form.reset();
    showStep("step-form");
  });
};

// ── Render the review step with AI output ─────────────────────
const renderReview = () => {
  // Meta info
  document.getElementById("reviewMeta").innerHTML = `
    <div class="review-meta__item">
      <span class="review-meta__label">Project</span>
      <span class="review-meta__value">${state.projectName}</span>
    </div>
    <div class="review-meta__item">
      <span class="review-meta__label">Priority</span>
      <span class="review-meta__value">${state.priority}</span>
    </div>
    <div class="review-meta__item">
      <span class="review-meta__label">Department</span>
      <span class="review-meta__value">${state.department}</span>
    </div>
  `;

  // User stories
  const storyList = document.getElementById("storyList");
  storyList.innerHTML = state.userStories
    .map(s => `<li class="story-list__item">${s}</li>`)
    .join("");

  renderTaskCards();
  updateReviewSummary();
};

// ── Render editable task cards ────────────────────────────────
const renderTaskCards = () => {
  const container = document.getElementById("taskCards");
  document.getElementById("taskCount").textContent = `(${state.tasks.length})`;

  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "task-cards";

  state.tasks.forEach((task, i) => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.index = i;
    card.innerHTML = `
      <div class="task-card__header">
        <input class="task-card__title" type="text" value="${escapeHtml(task.title)}" data-field="title" data-index="${i}">
        <button class="btn btn--danger-ghost" data-delete="${i}" title="Remove task">🗑</button>
      </div>
      <p class="task-card__desc">${escapeHtml(task.description)}</p>
      <div class="task-card__footer">
        <span class="task-card__tag">${escapeHtml(task.department)}</span>
        <div class="task-card__hours">
          <span>⏱ Hours:</span>
          <input class="task-card__hours-input" type="number" min="1" max="999" value="${task.effort_hours}" data-field="effort_hours" data-index="${i}">
        </div>
      </div>
    `;
    wrapper.appendChild(card);
  });

  container.appendChild(wrapper);

  // Edit title
  container.querySelectorAll("[data-field='title']").forEach(input => {
    input.addEventListener("input", (e) => {
      state.tasks[parseInt(e.target.dataset.index)].title = e.target.value;
      updateReviewSummary();
    });
  });

  // Edit hours
  container.querySelectorAll("[data-field='effort_hours']").forEach(input => {
    input.addEventListener("input", (e) => {
      state.tasks[parseInt(e.target.dataset.index)].effort_hours = parseInt(e.target.value) || 0;
      updateReviewSummary();
    });
  });

  // Delete task
  container.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.delete);
      state.tasks.splice(idx, 1);
      renderTaskCards();
      updateReviewSummary();
    });
  });
};

// ── Add blank task card ───────────────────────────────────────
document.getElementById("addTaskBtn").addEventListener("click", () => {
  state.tasks.push({
    title: "New Task",
    description: "Describe this task",
    effort_hours: 4,
    department: state.department,
  });
  renderTaskCards();
  updateReviewSummary();
});

// ── Update the total hours summary ───────────────────────────
const updateReviewSummary = () => {
  const total = state.tasks.reduce((sum, t) => sum + (parseInt(t.effort_hours) || 0), 0);
  document.getElementById("reviewSummary").innerHTML =
    `<strong>${state.tasks.length} tasks</strong> · Total estimated effort: <strong>${total} hours</strong>`;

  document.getElementById("approveBtn").disabled = state.tasks.length === 0;
};

// ── Approve → generate mock Jira tickets ─────────────────────
const initApprove = () => {
  const btn = document.getElementById("approveBtn");
  const btnText = document.getElementById("approveBtnText");
  const spinner = document.getElementById("approveSpinner");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btnText.textContent = "Creating tickets...";
    spinner.classList.remove("hidden");
    setStatus("working", "Creating...");
    logActivity("✅", "Human approved AI output");

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: state.tasks,
          project_name: state.projectName,
          requirement: state.requirement,
          department: state.department,
          priority: state.priority,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "API error");

      logActivity("🎫", `<strong>${data.tickets.length} Jira tickets</strong> created (${data.req_id})`);
      logActivity("📧", `Mock email sent to <strong>${state.department}</strong> team`);
      setStatus("ready", "Ready");

      updateBadges();
      renderSuccess(data);
      showStep("step-success");

    } catch (err) {
      logActivity("❌", `Failed to create tickets: ${err.message}`);
      setStatus("error", "Error");
      alert(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btnText.textContent = "Approve & Create Jira Tickets ✅";
      spinner.classList.add("hidden");
    }
  });
};

// ── Render success screen ─────────────────────────────────────
const renderSuccess = (data) => {
  document.getElementById("successSub").textContent =
    `${data.tickets.length} tickets created for ${state.projectName} (${data.req_id})`;

  const container = document.getElementById("createdTickets");
  const wrapper = document.createElement("div");
  wrapper.className = "created-tickets";

  data.tickets.forEach(t => {
    const chip = document.createElement("div");
    chip.className = "ticket-chip";
    chip.innerHTML = `
      <span class="ticket-chip__id">${t.id}</span>
      <span class="ticket-chip__title">${escapeHtml(t.title)}</span>
      <span class="ticket-chip__dept">${escapeHtml(t.department)}</span>
      <span class="ticket-chip__hours">⏱ ${t.effort_hours}h</span>
    `;
    wrapper.appendChild(chip);
  });
  container.innerHTML = "";
  container.appendChild(wrapper);

  // Email preview
  const ep = data.email_preview;
  document.getElementById("emailPreview").innerHTML = `
    <div class="email-preview__label">📧 Mock Email Notification</div>
    <div class="email-preview__field"><strong>To:</strong> ${escapeHtml(ep.to)}</div>
    <div class="email-preview__field"><strong>Subject:</strong> ${escapeHtml(ep.subject)}</div>
    <div class="email-preview__body">${escapeHtml(ep.body)}</div>
  `;
};

// ── Load Kanban board ─────────────────────────────────────────
const loadKanban = async () => {
  try {
    const res = await fetch("/api/tickets");
    const tickets = await res.json();

    const colTodo = document.getElementById("col-todo");
    const colInProgress = document.getElementById("col-inprogress");
    const colInReview = document.getElementById("col-inreview");
    const colDone = document.getElementById("col-done");
    const boardEmpty = document.getElementById("boardEmpty");

    colTodo.innerHTML = "";
    colInProgress.innerHTML = "";
    colInReview.innerHTML = "";
    colDone.innerHTML = "";

    if (tickets.length === 0) {
      boardEmpty.classList.remove("hidden");
      return;
    }

    boardEmpty.classList.add("hidden");
    tickets.forEach(t => {
      const card = buildKanbanCard(t);
      if (t.status === "To Do") colTodo.appendChild(card);
      else if (t.status === "In Progress") colInProgress.appendChild(card);
      else if (t.status === "In Review") colInReview.appendChild(card);
      else colDone.appendChild(card);
    });

  } catch (err) {
    console.error("Failed to load Kanban:", err);
  }
};

// All 4 Jira statuses
const JIRA_STATUSES = ["To Do", "In Progress", "In Review", "Done"];

// ── Build a single Kanban card with status dropdown ───────────
const buildKanbanCard = (ticket) => {
  const card = document.createElement("div");
  card.className = "kanban-card";
  card.dataset.id = ticket.id;

  // Build status options — exclude current status
  const options = JIRA_STATUSES
    .filter(s => s !== ticket.status)
    .map(s => `<option value="${s}">${s}</option>`)
    .join("");

  card.innerHTML = `
    <div class="kanban-card__id">${ticket.id}</div>
    <div class="kanban-card__title">${escapeHtml(ticket.title)}</div>
    <div class="kanban-card__meta">
      <span class="kanban-card__tag">${escapeHtml(ticket.department)}</span>
      <span class="kanban-card__tag">⏱ ${ticket.effort_hours}h</span>
    </div>
    <select class="kanban-card__status-select" data-jira-key="${ticket.id}">
      <option value="">Move to...</option>
      ${options}
    </select>
  `;

  // Status change handler — calls Jira API via Flask
  card.querySelector("select").addEventListener("change", async (e) => {
    const newStatus = e.target.value;
    if (!newStatus) return;

    const jiraKey = e.target.dataset.jiraKey;
    e.target.disabled = true;

    try {
      const res = await fetch(`/api/ticket/${jiraKey}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      logActivity("🔄", `<strong>${jiraKey}</strong> moved to <strong>${newStatus}</strong>`);
      loadKanban(); // reload board to move card to new column

    } catch (err) {
      logActivity("❌", `Status update failed: ${err.message}`);
      e.target.value = "";
      e.target.disabled = false;
    }
  });

  return card;
};

// ── Load history table ────────────────────────────────────────
const loadHistory = async () => {
  try {
    const res = await fetch("/api/history");
    const history = await res.json();

    const tbody = document.getElementById("historyBody");
    const emptyMsg = document.getElementById("historyEmpty");
    tbody.innerHTML = "";

    if (history.length === 0) {
      emptyMsg.classList.remove("hidden");
      return;
    }

    emptyMsg.classList.add("hidden");
    history.forEach(req => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${req.req_id}</code></td>
        <td>${escapeHtml(req.project_name)}</td>
        <td><span class="priority-badge priority-badge--${req.priority}">${req.priority}</span></td>
        <td>${escapeHtml(req.department)}</td>
        <td>${req.ticket_count}</td>
        <td>${req.total_hours}h</td>
        <td>${req.created_at}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Failed to load history:", err);
  }
};

// ── Update sidebar badges ─────────────────────────────────────
const updateBadges = async () => {
  try {
    const [ticketRes, historyRes] = await Promise.all([
      fetch("/api/tickets"),
      fetch("/api/history"),
    ]);
    const tickets = await ticketRes.json();
    const history = await historyRes.json();
    ticketBadge.textContent = tickets.length;
    historyBadge.textContent = history.length;
  } catch (_) { /* badges are non-critical */ }
};

// ── Escape HTML to prevent XSS ───────────────────────────────
const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

// ── Init ──────────────────────────────────────────────────────
initSidebar();
initForm();
initApprove();
