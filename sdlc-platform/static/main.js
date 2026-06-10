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

const manualTasks = [];

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

      if (target === "jira-board") loadJiraBrowser();
      if (target === "history") loadHistory();
    });
  });
};

// ── Tab switching inside New Request section ──────────────────
const initTabs = () => {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("tab-btn--active"));
      btn.classList.add("tab-btn--active");

      const target = btn.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      document.getElementById(`tab-${target}`).classList.remove("hidden");
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

// ── Manual task state and list ────────────────────────────────
const manualTasks = [];

// Re-render the pending tasks list below the manual form
const renderManualTaskList = () => {
  const list = document.getElementById("manualTaskList");
  const reviewBtn = document.getElementById("manualReviewBtn");

  if (manualTasks.length === 0) {
    list.classList.add("hidden");
    reviewBtn.disabled = true;
    return;
  }

  list.classList.remove("hidden");
  reviewBtn.disabled = false;
  list.innerHTML = `<p class="subsection__title">Tasks added (${manualTasks.length})</p>`;

  manualTasks.forEach((task, i) => {
    const item = document.createElement("div");
    item.className = "manual-task-item";
    item.innerHTML = `
      <div class="manual-task-item__info">
        <span class="manual-task-item__title">${escapeHtml(task.title)}</span>
        <span class="manual-task-item__meta">${escapeHtml(task.department)} · ${task.effort_hours}h · ${task.priority}</span>
      </div>
      <button class="btn btn--danger-ghost" data-remove="${i}">🗑</button>
    `;
    item.querySelector("[data-remove]").addEventListener("click", () => {
      manualTasks.splice(i, 1);
      renderManualTaskList();
    });
    list.appendChild(item);
  });
};

// Handle "Add Task to List" form submission
const initManualForm = () => {
  const form = document.getElementById("manualForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("manualTitle").value.trim();
    const description = document.getElementById("manualDescription").value.trim();
    if (!title || !description) return;

    manualTasks.push({
      title,
      description,
      effort_hours: parseInt(document.getElementById("manualHours").value) || 4,
      department: document.getElementById("manualDepartment").value,
      priority: document.getElementById("manualPriority").value,
    });

    // Clear just the task-specific fields, keep project name
    document.getElementById("manualTitle").value = "";
    document.getElementById("manualDescription").value = "";
    document.getElementById("manualHours").value = "";

    renderManualTaskList();
    logActivity("✏️", `Manual task added: <strong>${escapeHtml(title)}</strong>`);
  });
};

// ── Requirement form submit → call AI ─────────────────────────
const initForm = () => {
  const form = document.getElementById("requirementForm");
  const btn = document.getElementById("analyzeBtn");
  const btnText = document.getElementById("analyzeBtnText");
  const spinner = document.getElementById("analyzeSpinner");

  const projectInput = document.getElementById("projectName");
  const requirementInput = document.getElementById("requirementText");
  const additionalPromptInput = document.getElementById("additionalPrompt");

  // Auto-save logic
  const loadSaved = () => {
    projectInput.value = localStorage.getItem("sdlc_draft_project") || "";
    requirementInput.value = localStorage.getItem("sdlc_draft_req") || "";
    additionalPromptInput.value = localStorage.getItem("sdlc_draft_add_prompt") || "";
  };

  const saveDraft = () => {
    localStorage.setItem("sdlc_draft_project", projectInput.value);
    localStorage.setItem("sdlc_draft_req", requirementInput.value);
    localStorage.setItem("sdlc_draft_add_prompt", additionalPromptInput.value);
  };

  projectInput.addEventListener("input", saveDraft);
  requirementInput.addEventListener("input", saveDraft);
  additionalPromptInput.addEventListener("input", saveDraft);
  loadSaved();

  // Dual-range slider logic
  const initDualSlider = (minId, maxId, valId, trackId) => {
    const minInput = document.getElementById(minId);
    const maxInput = document.getElementById(maxId);
    const valDisplay = document.getElementById(valId);
    const track = document.getElementById(trackId);

    const update = (e) => {
      let minVal = parseInt(minInput.value);
      let maxVal = parseInt(maxInput.value);

      // Prevent crossing
      if (minVal > maxVal) {
        // If min was moved, push max
        if (e && e.target === minInput) {
          maxVal = minVal;
          maxInput.value = maxVal;
        } else {
          minVal = maxVal;
          minInput.value = minVal;
        }
      }

      valDisplay.textContent = `${minVal} - ${maxVal}`;

      // Update track visual
      const minPercent = ((minVal - minInput.min) / (minInput.max - minInput.min)) * 100;
      const maxPercent = ((maxVal - maxInput.min) / (maxInput.max - maxInput.min)) * 100;

      // Remove existing active track if any
      const active = track.querySelector(".range-track-active") || document.createElement("div");
      active.className = "range-track-active";
      active.style.left = `${minPercent}%`;
      active.style.width = `${maxPercent - minPercent}%`;
      if (!active.parentNode) track.appendChild(active);
    };

    minInput.addEventListener("input", update);
    maxInput.addEventListener("input", update);
    update(); // Init
  };

  initDualSlider("minStories", "maxStories", "valStories", "trackStories");
  initDualSlider("minTasks", "maxTasks", "valTasks", "trackTasks");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    state.projectName = projectInput.value.trim();
    state.requirement = requirementInput.value.trim();
    state.priority = document.getElementById("priority").value;
    state.department = document.getElementById("department").value;
    
    // Custom Min/Max ranges from dual sliders
    const minS = document.getElementById("minStories").value;
    const maxS = document.getElementById("maxStories").value;
    const minT = document.getElementById("minTasks").value;
    const maxT = document.getElementById("maxTasks").value;

    btn.disabled = true;
    btnText.textContent = "Analyzing...";
    spinner.classList.remove("hidden");
    setStatus("working", "AI Thinking...");
    logActivity("📋", `Requirement submitted: <strong>${state.projectName}</strong>`);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          requirement: state.requirement,
          min_stories: parseInt(minS),
          max_stories: parseInt(maxS),
          min_tasks: parseInt(minT),
          max_tasks: parseInt(maxT)
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "API error");
      }

      state.userStories = data.user_stories || [];
      state.tasks = data.tasks || [];

      logActivity("🤖", `AI generated <strong>${state.tasks.length} tasks</strong> and <strong>${state.userStories.length} user stories</strong>`);
      setStatus("ready", "Ready");
      
      // Reset drafting state on successful analysis
      localStorage.removeItem("sdlc_draft_project");
      localStorage.removeItem("sdlc_draft_req");

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
    document.getElementById("manualForm").reset();
    manualTasks.length = 0;
    renderManualTaskList();
    document.querySelector("#step-review .section__title").textContent = "Review AI Output";
    showStep("step-form");
  });

  // Regenerate button handler
  document.getElementById("regenerateBtn").addEventListener("click", async () => {
    const regenerateBtn = document.getElementById("regenerateBtn");
    const regenerateBtnText = document.getElementById("regenerateBtnText");
    const regenerateSpinner = document.getElementById("regenerateSpinner");
    const refinePrompt = document.getElementById("refinePrompt").value.trim();

    regenerateBtn.disabled = true;
    regenerateBtnText.textContent = "Regenerating...";
    regenerateSpinner.classList.remove("hidden");
    setStatus("working", "AI Refining...");
    logActivity("🔄", `Regenerating with feedback: <em>"${escapeHtml(refinePrompt.substring(0, 50))}..."</em>`);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: state.requirement, // Use the original requirement
          additional_prompt: refinePrompt, // Add the refinement prompt
          min_stories: parseInt(document.getElementById("minStories").value),
          max_stories: parseInt(document.getElementById("maxStories").value),
          min_tasks: parseInt(document.getElementById("minTasks").value),
          max_tasks: parseInt(document.getElementById("maxTasks").value)
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "API error");
      }

      state.userStories = data.user_stories || [];
      state.tasks = data.tasks || [];

      logActivity("🤖", `AI regenerated <strong>${state.tasks.length} tasks</strong> and <strong>${state.userStories.length} user stories</strong>`);
      setStatus("ready", "Ready");
      
      document.getElementById("refinePrompt").value = ""; // Clear refinement prompt

      renderReview();
    } catch (err) {
      logActivity("❌", `AI regeneration failed: ${err.message}`);
      setStatus("error", "Error");
      alert(`Error: ${err.message}`);
    } finally {
      regenerateBtn.disabled = false;
      regenerateBtnText.textContent = "Regenerate with Refinements ✨";
      regenerateSpinner.classList.add("hidden");
    }
  });
};

// ── Manual task state and list ────────────────────────────────
const renderManualTaskList = () => {
  const list = document.getElementById("manualTaskList");
  const reviewBtn = document.getElementById("manualReviewBtn");

  if (manualTasks.length === 0) {
    list.classList.add("hidden");
    reviewBtn.disabled = true;
    return;
  }

  list.classList.remove("hidden");
  reviewBtn.disabled = false;
  list.innerHTML = `<p class="subsection__title">Tasks added (${manualTasks.length})</p>`;

  manualTasks.forEach((task, i) => {
    const item = document.createElement("div");
    item.className = "manual-task-item";
    item.innerHTML = `
      <div class="manual-task-item__info">
        <span class="manual-task-item__title">${escapeHtml(task.title)}</span>
        <span class="manual-task-item__meta">${escapeHtml(task.department)} · ${task.effort_hours}h · ${task.priority}</span>
      </div>
      <button class="btn btn--danger-ghost" data-remove="${i}">🗑</button>
    `;
    item.querySelector("[data-remove]").addEventListener("click", () => {
      manualTasks.splice(i, 1);
      renderManualTaskList();
    });
    list.appendChild(item);
  });
};

const initManualForm = () => {
  const form = document.getElementById("manualForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = document.getElementById("manualTitle").value.trim();
    const description = document.getElementById("manualDescription").value.trim();
    if (!title || !description) return;

    manualTasks.push({
      title,
      description,
      effort_hours: parseInt(document.getElementById("manualHours").value) || 4,
      department: document.getElementById("manualDepartment").value,
      priority: document.getElementById("manualPriority").value,
    });

    document.getElementById("manualTitle").value = "";
    document.getElementById("manualDescription").value = "";
    document.getElementById("manualHours").value = "";

    renderManualTaskList();
    logActivity("✏️", `Manual task added: <strong>${escapeHtml(title)}</strong>`);
  });
};

const initManualReview = () => {
  document.getElementById("manualReviewBtn").addEventListener("click", () => {
    if (manualTasks.length === 0) return;

    state.projectName = document.getElementById("manualProjectName").value.trim() || "Manual Entry";
    state.priority = document.getElementById("manualPriority").value;
    state.department = document.getElementById("manualDepartment").value;
    state.requirement = "(Manual entry — no AI analysis)";
    state.userStories = [];
    state.tasks = manualTasks.map(t => ({ ...t }));

    document.querySelector("#step-review .section__title").textContent = "Review Manual Tasks";

    logActivity("✏️", `Manual review started: <strong>${state.tasks.length} tasks</strong> for <strong>${state.projectName}</strong>`);
    renderReview();
    showStep("step-review");
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

  const container = document.getElementById("roadmapContainer");
  container.innerHTML = "";

  // 1. Render General / Manual Tasks at the top (story_index is null or undefined)
  const generalTasks = state.tasks
    .map((t, i) => ({ ...t, originalIndex: i }))
    .filter(t => t.story_index === null || t.story_index === undefined);

  if (generalTasks.length > 0) {
    const section = document.createElement("div");
    section.className = "roadmap-section";
    section.innerHTML = `<h4 class="roadmap-section__title">General & Manual Tasks</h4>`;
    renderTaskCards(section, generalTasks);
    container.appendChild(section);
  }

  // 2. Render tasks grouped under each User Story
  state.userStories.forEach((story, sIdx) => {
    const storyTasks = state.tasks
      .map((t, i) => ({ ...t, originalIndex: i }))
      .filter(t => t.story_index === sIdx);

    const section = document.createElement("div");
    section.className = "roadmap-section";
    section.innerHTML = `
      <div class="story-card">
        <div class="story-card__label">User Story #${sIdx + 1}</div>
        <div class="story-card__text">${escapeHtml(story)}</div>
      </div>
    `;
    
    if (storyTasks.length > 0) {
      renderTaskCards(section, storyTasks);
    } else {
      section.innerHTML += `<p class="roadmap-section__empty">No tasks linked to this story.</p>`;
    }
    
    container.appendChild(section);
  });

  updateReviewSummary();
};

// ── Render editable task cards into a section ────────────────
const renderTaskCards = (parent, tasksToRender) => {
  const wrapper = document.createElement("div");
  wrapper.className = "task-cards";

  tasksToRender.forEach((task) => {
    const i = task.originalIndex;
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.index = i;
    card.innerHTML = `
      <div class="task-card__header">
        <input class="task-card__title" type="text" value="${escapeHtml(task.title)}" data-field="title" data-index="${i}">
        <button class="btn btn--danger-ghost" data-delete="${i}" title="Remove task">🗑</button>
      </div>
      <textarea class="form__textarea task-card__desc-edit" data-field="description" data-index="${i}" rows="2">${escapeHtml(task.description)}</textarea>
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

  parent.appendChild(wrapper);

  // Re-bind listeners for the newly created elements
  wrapper.querySelectorAll("[data-field='title']").forEach(input => {
    input.addEventListener("input", (e) => {
      state.tasks[parseInt(e.target.dataset.index)].title = e.target.value;
      updateReviewSummary();
    });
  });

  wrapper.querySelectorAll("[data-field='description']").forEach(textarea => {
    textarea.addEventListener("input", (e) => {
      state.tasks[parseInt(e.target.dataset.index)].description = e.target.value;
    });
  });

  wrapper.querySelectorAll("[data-field='effort_hours']").forEach(input => {
    input.addEventListener("input", (e) => {
      state.tasks[parseInt(e.target.dataset.index)].effort_hours = parseInt(e.target.value) || 0;
      updateReviewSummary();
    });
  });

  wrapper.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.delete);
      state.tasks.splice(idx, 1);
      renderReview(); // Re-render everything to update groupings
    });
  });
};

// ── Add blank task card ───────────────────────────────────────
document.getElementById("addTaskBtn").addEventListener("click", () => {
  // Use unshift to put new tasks at the top
  state.tasks.unshift({
    title: "New Task",
    description: "Describe this task",
    effort_hours: 4,
    department: state.department,
    story_index: null // Manual tasks aren't linked to a story by default
  });
  renderReview();
});

// ── Update the total hours summary ───────────────────────────
const updateReviewSummary = () => {
  const total = state.tasks.reduce((sum, t) => sum + (parseInt(t.effort_hours) || 0), 0);
  document.getElementById("reviewSummary").innerHTML =
    `<strong>${state.tasks.length} tasks</strong> · Total estimated effort: <strong>${total} hours</strong>`;

  document.getElementById("approveBtn").disabled = state.tasks.length === 0;
};

// Transfer manual tasks into the shared review step
const initManualReview = () => {
  document.getElementById("manualReviewBtn").addEventListener("click", () => {
    if (manualTasks.length === 0) return;

    // Populate shared state from manual form fields
    state.projectName = document.getElementById("manualProjectName").value.trim() || "Manual Entry";
    state.priority = document.getElementById("manualPriority").value;
    state.department = document.getElementById("manualDepartment").value;
    state.requirement = "(Manual entry — no AI analysis)";
    state.userStories = [];
    state.tasks = manualTasks.map(t => ({ ...t }));

    // Update review header title to show "Manual Review" instead of "Review AI Output"
    document.querySelector("#step-review .section__title").textContent = "Review Manual Tasks";

    logActivity("✏️", `Manual review started: <strong>${state.tasks.length} tasks</strong> for <strong>${state.projectName}</strong>`);
    renderReview();
    showStep("step-review");
  });
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
    logActivity("✅", "Human approved tasks");

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
      logActivity("📧", `Kickoff email sent to <strong>${state.department}</strong> team`);
      logActivity("📝", `Confluence spec page created for <strong>${state.projectName}</strong>`);
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
    <div class="email-preview__label">📧 Kickoff Email Sent</div>
    <div class="email-preview__field"><strong>To:</strong> ${escapeHtml(ep.to)}</div>
    <div class="email-preview__field"><strong>Subject:</strong> ${escapeHtml(ep.subject)}</div>
    <div class="email-preview__body">${escapeHtml(ep.body)}</div>
  `;
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
initTabs();
initForm();
initManualForm();
initManualReview();
initApprove();
initThemeToggle();

// ── Theme Toggle Logic ────────────────────────────────────────
function initThemeToggle() {
  const themeToggleBtn = document.getElementById("themeToggle");
  const body = document.body;

  // Load saved theme preference
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    body.classList.add("light-mode");
    themeToggleBtn.querySelector("span").textContent = "🌙"; // Moon icon for light mode
  } else {
    themeToggleBtn.querySelector("span").textContent = "💡"; // Bulb icon for dark mode
  }

  themeToggleBtn.addEventListener("click", () => {
    if (body.classList.contains("light-mode")) {
      body.classList.remove("light-mode");
      localStorage.setItem("theme", "dark");
      themeToggleBtn.querySelector("span").textContent = "💡";
    } else {
      body.classList.add("light-mode");
      localStorage.setItem("theme", "light");
      themeToggleBtn.querySelector("span").textContent = "🌙";
    }
  });
}

