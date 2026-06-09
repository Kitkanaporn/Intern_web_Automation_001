# Manual Task Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Manual Entry" tab inside the New Request section so managers can create Jira tasks without AI analysis.

**Architecture:** Wrap the existing AI form inside a tab, add a second Manual Entry tab with its own form and pending-task list. When the manager clicks "Review & Create", populate `state.tasks` and call the existing `renderReview()` + `showStep("step-review")` — reusing the entire approve/Jira flow with zero backend changes.

**Tech Stack:** Vanilla JS (ES6), HTML5, CSS3 — no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `templates/index.html` | Add tab bar + wrap AI form in `#tab-ai` div + add `#tab-manual` div |
| `static/style.css` | Add tab bar styles + pending task list item styles |
| `static/main.js` | Add `manualTasks[]`, tab switching, add/remove task, "Review & Create" handler |

---

### Task 1: Add tab bar HTML and wrap existing form

**Files:**
- Modify: `templates/index.html` — lines 53–93 (the `#step-form` div)

- [ ] **Step 1: Replace `#step-form` content with tabbed structure**

Replace the entire `<!-- Step 1: Requirement form -->` block (lines 53–93) with:

```html
        <!-- Step 1: Requirement form (tabbed) -->
        <div id="step-form">
          <h2 class="section__title">New Request</h2>

          <!-- Tab bar -->
          <div class="tab-bar">
            <button class="tab-btn tab-btn--active" data-tab="ai">AI Analysis ✨</button>
            <button class="tab-btn" data-tab="manual">Manual Entry ✏️</button>
          </div>

          <!-- AI Analysis tab -->
          <div id="tab-ai" class="tab-content">
            <form id="requirementForm" class="form">
              <div class="form__row">
                <label class="form__label" for="projectName">Project Name</label>
                <input class="form__input" type="text" id="projectName" placeholder="e.g. Customer Portal Upgrade" required>
              </div>
              <div class="form__row">
                <label class="form__label" for="requirementText">Requirement Description</label>
                <textarea class="form__textarea" id="requirementText" rows="5"
                  placeholder="Describe what needs to be built. The more detail, the better the AI output." required></textarea>
              </div>
              <div class="form__row form__row--split">
                <div>
                  <label class="form__label" for="priority">Priority</label>
                  <select class="form__select" id="priority">
                    <option value="Low">Low</option>
                    <option value="Medium" selected>Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label class="form__label" for="department">Target Department</label>
                  <select class="form__select" id="department">
                    <option value="Backend Dev">Backend Dev</option>
                    <option value="Frontend Dev">Frontend Dev</option>
                    <option value="QA">QA</option>
                    <option value="DevOps">DevOps</option>
                    <option value="Business Analysis">Business Analysis</option>
                    <option value="All Teams">All Teams</option>
                  </select>
                </div>
              </div>
              <button class="btn btn--primary btn--full" type="submit" id="analyzeBtn">
                <span id="analyzeBtnText">Analyze with AI ✨</span>
                <span id="analyzeSpinner" class="spinner hidden"></span>
              </button>
            </form>
          </div>

          <!-- Manual Entry tab -->
          <div id="tab-manual" class="tab-content hidden">
            <form id="manualForm" class="form">
              <div class="form__row">
                <label class="form__label" for="manualProjectName">Project Name</label>
                <input class="form__input" type="text" id="manualProjectName" placeholder="e.g. Customer Portal Upgrade">
              </div>
              <div class="form__row">
                <label class="form__label" for="manualTitle">Task Title *</label>
                <input class="form__input" type="text" id="manualTitle" placeholder="e.g. Set up authentication module">
              </div>
              <div class="form__row">
                <label class="form__label" for="manualDescription">Description *</label>
                <textarea class="form__textarea" id="manualDescription" rows="3"
                  placeholder="What needs to be done for this task?"></textarea>
              </div>
              <div class="form__row form__row--split">
                <div>
                  <label class="form__label" for="manualDepartment">Department</label>
                  <select class="form__select" id="manualDepartment">
                    <option value="Backend Dev">Backend Dev</option>
                    <option value="Frontend Dev">Frontend Dev</option>
                    <option value="QA">QA</option>
                    <option value="DevOps">DevOps</option>
                    <option value="Business Analysis">Business Analysis</option>
                    <option value="Security">Security</option>
                  </select>
                </div>
                <div>
                  <label class="form__label" for="manualHours">Effort Hours</label>
                  <input class="form__input" type="number" id="manualHours" min="1" max="999" placeholder="8">
                </div>
              </div>
              <div class="form__row">
                <label class="form__label" for="manualPriority">Priority</label>
                <select class="form__select" id="manualPriority">
                  <option value="Low">Low</option>
                  <option value="Medium" selected>Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <button class="btn btn--ghost btn--full" type="submit" id="addManualTaskBtn">
                + Add Task to List
              </button>
            </form>

            <!-- Pending tasks list -->
            <div id="manualTaskList" class="manual-task-list hidden"></div>

            <button class="btn btn--success btn--full" id="manualReviewBtn" disabled>
              Review &amp; Create Jira Tickets →
            </button>
          </div>

        </div>
```

- [ ] **Step 2: Verify in browser — both tabs visible, AI tab shows old form**

Restart Flask, open `http://127.0.0.1:2500`. You should see two tab buttons at the top of New Request. The AI Analysis tab should show the existing form. Clicking Manual Entry tab should show the new form (tab switching not wired yet — that's Task 2).

---

### Task 2: Add CSS for tabs and pending task list

**Files:**
- Modify: `static/style.css` — add new rules at the bottom before the final comment

- [ ] **Step 1: Add tab bar and pending task list CSS**

Add before the `/* ── Kanban section override for full width ── */` comment at the bottom of `style.css`:

```css
/* ── Tab bar ── */
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0;
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn:hover {
  color: var(--color-text);
}

.tab-btn--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

/* ── Manual task pending list ── */
.manual-task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 16px 0;
}

.manual-task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 10px 14px;
}

.manual-task-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.manual-task-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.manual-task-item__meta {
  font-size: 11px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 2: Verify in browser**

Refresh page. Tab bar should now have an underline on the active tab. No other visible change yet.

---

### Task 3: Wire tab switching in JavaScript

**Files:**
- Modify: `static/main.js` — add after the `initSidebar` function

- [ ] **Step 1: Add tab switching function**

Add this function after the `initSidebar` closing brace in `main.js`:

```javascript
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
```

- [ ] **Step 2: Call `initTabs()` at the bottom of main.js**

Find the `// ── Init ──` section at the bottom of `main.js` and add `initTabs();`:

```javascript
// ── Init ──────────────────────────────────────────────────────
initSidebar();
initTabs();
initForm();
initApprove();
```

- [ ] **Step 3: Verify in browser**

Refresh. Clicking "Manual Entry" tab should show the manual form and hide the AI form. Clicking "AI Analysis" should switch back. The underline should follow the active tab.

---

### Task 4: Add manual task list logic in JavaScript

**Files:**
- Modify: `static/main.js` — add after `initTabs` function

- [ ] **Step 1: Add `manualTasks` state and list functions**

Add this block after the `initTabs` function:

```javascript
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
```

- [ ] **Step 2: Add manual form submit handler**

Add this function after `renderManualTaskList`:

```javascript
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
```

- [ ] **Step 3: Call `initManualForm()` in the Init section**

```javascript
// ── Init ──────────────────────────────────────────────────────
initSidebar();
initTabs();
initForm();
initManualForm();
initApprove();
```

- [ ] **Step 4: Verify in browser**

Refresh. Switch to Manual Entry tab. Fill in Title, Description, click "+ Add Task to List". The task should appear in the list below. The 🗑 button should remove it. Activity log should show "Manual task added".

---

### Task 5: Wire "Review & Create" button

**Files:**
- Modify: `static/main.js` — add after `initManualForm`

- [ ] **Step 1: Add the review button handler**

Add this function after `initManualForm`:

```javascript
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
```

- [ ] **Step 2: Call `initManualReview()` in the Init section**

```javascript
// ── Init ──────────────────────────────────────────────────────
initSidebar();
initTabs();
initForm();
initManualForm();
initManualReview();
initApprove();
```

- [ ] **Step 3: Reset manual state when "Submit Another Requirement" is clicked**

Find the `newRequestBtn` event listener inside `initForm()`:

```javascript
document.getElementById("newRequestBtn").addEventListener("click", () => {
  form.reset();
  showStep("step-form");
});
```

Replace it with:

```javascript
document.getElementById("newRequestBtn").addEventListener("click", () => {
  form.reset();
  document.getElementById("manualForm").reset();
  manualTasks.length = 0;
  renderManualTaskList();
  document.querySelector("#step-review .section__title").textContent = "Review AI Output";
  showStep("step-form");
});
```

- [ ] **Step 4: Verify full end-to-end manual flow**

1. Open `http://127.0.0.1:2500`
2. Click "Manual Entry" tab
3. Fill in project name, add 2–3 tasks using the form
4. Click "Review & Create Jira Tickets →"
5. Review screen appears with your tasks as editable cards
6. Click "Approve & Create Jira Tickets ✅"
7. Jira tickets are created, success screen shows with real ticket IDs
8. Activity log shows all steps
9. Click "Submit Another Requirement" — manual tab should be cleared

---

## Self-Review

**Spec coverage:**
- ✅ Two tabs: AI Analysis + Manual Entry
- ✅ Fields: Title, Description, Department, Hours, Priority, Project Name
- ✅ Add task to list, remove with 🗑
- ✅ Review step reused (same as AI flow)
- ✅ Approve & Create → real Jira tickets
- ✅ No backend changes

**Placeholder scan:** None found.

**Type consistency:**
- `manualTasks` array holds objects with `title`, `description`, `effort_hours`, `department`, `priority` — matches what `renderTaskCards()` and `/api/approve` expect ✅
- `state.tasks` is populated with spread copies `{ ...t }` so editing in review doesn't mutate `manualTasks` ✅
- `escapeHtml()` used on all user-input display ✅
