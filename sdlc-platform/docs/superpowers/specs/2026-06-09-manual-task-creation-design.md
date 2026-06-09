# Manual Task Creation — Design Spec
**Date:** 2026-06-09
**Feature:** Manual task entry for managers who want to create Jira tickets without AI analysis

---

## Context

The current platform requires going through the AI analysis flow to create Jira tickets. Managers sometimes know exactly what tasks are needed without needing AI help. This feature adds a "Manual Entry" tab so any team member can create tasks directly and send them to Jira using the same review-and-approve flow.

---

## UI Layout

The "New Request" section gains a **tab bar** at the top with two tabs:
- **AI Analysis** — existing flow (unchanged)
- **Manual Entry** — new form-based flow

### Manual Entry Tab

```
┌─────────────────────────────────────────┐
│  [ AI Analysis ]  [ Manual Entry ]      │
├─────────────────────────────────────────┤
│  Title*           [____________________]│
│  Description      [____________________]│
│  Department       [Backend Dev       ▼] │
│  Effort Hours     [____]                │
│  Priority         [Medium            ▼] │
│                   [ + Add Task ]        │
├─────────────────────────────────────────┤
│  Tasks added (2):                       │
│  ┌──────────────────────────────────┐   │
│  │ Set up database schema      [🗑] │   │
│  │ Build login API              [🗑] │   │
│  └──────────────────────────────────┘   │
│  [ Review & Create Jira Tickets → ]     │
└─────────────────────────────────────────┘
```

---

## Data Flow

1. Manager fills in the form fields and clicks **"+ Add Task"**
2. Task is added to a local JS pending list (not sent to server yet)
3. Task appears in the list below the form with a 🗑 remove button
4. Manager repeats for as many tasks as needed
5. Manager clicks **"Review & Create Jira Tickets"**
   - Transfers the pending task list into the existing `state.tasks`
   - Shows the existing `step-review` UI (same editable task cards)
   - Sets `state.projectName` from a project name field at top of manual form
6. Manager clicks **"Approve & Create"**
   - Calls existing `POST /api/approve` route — no new backend needed
   - Jira tickets created, activity log updates, success screen shows

---

## Task Fields

| Field | Type | Required |
|---|---|---|
| Project Name | text input | Yes (shown once at top of manual tab) |
| Title | text input | Yes |
| Description | textarea | Yes |
| Department | dropdown | Yes — Backend Dev, Frontend Dev, QA, DevOps, Business Analysis, Security |
| Effort Hours | number input | Yes |
| Priority | dropdown | Yes — Low, Medium, High, Critical |

---

## Files Changed

| File | Change |
|---|---|
| `templates/index.html` | Add tab bar + Manual Entry tab HTML inside `#section-new-request` |
| `static/main.js` | Tab switching + add-to-list logic + review button handler |
| `static/style.css` | Tab bar styles + pending task list item styles |

**No backend changes.** `app.py` and `jira_client.py` are untouched.

---

## Key Reuse

The manual flow feeds directly into the existing review/approve pipeline:
- Reuses `step-review` HTML (editable task cards)
- Reuses `renderReview()` and `renderTaskCards()` JS functions
- Reuses `initApprove()` and `POST /api/approve` backend route
- Reuses success screen and activity log

---

## Error Handling

- "Add Task" button disabled if Title is empty
- "Review & Create" button disabled if pending task list is empty
- After entering review step, same validation as AI flow applies

---

## Out of Scope

- Saving draft tasks across page refreshes (no database)
- Assigning tasks to specific users
- Attaching files to tasks
