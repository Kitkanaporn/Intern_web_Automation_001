# Regenerate with Feedback — Design Spec
**Date:** 2026-06-10
**Feature:** Let a manager reject the AI-generated task breakdown, give feedback, and have the AI regenerate a fresh breakdown for the same requirement.

---

## Context

Today, after submitting a requirement on the AI Analysis tab, the manager lands on the Review step (`#step-review`) with AI-generated user stories and task cards. Their only options are to edit task cards inline or click **"Approve & Create Jira Tickets"**. If the overall result isn't what they wanted (wrong focus, missing areas, too much/too little detail), there's no way to ask the AI to try again — they'd have to go back and resubmit the original requirement, getting an unrelated fresh attempt.

This feature adds a **"Regenerate with Feedback"** action to the Review step: the manager types what's wrong/missing, and the AI produces a brand-new breakdown for the *same original requirement*, taking that feedback into account.

---

## UI Layout

The bottom of the Review step (`#step-review`, below `#reviewSummary`) changes from a single full-width Approve button to:

```
┌─────────────────────────────────────────┐
│  3 tasks · Total estimated effort: 14h   │   <- #reviewSummary (unchanged)
├─────────────────────────────────────────┤
│  [ 🔄 Regenerate with Feedback ]  [ ✅ Approve & Create Jira Tickets ] │
└─────────────────────────────────────────┘
```

Clicking **"Regenerate with Feedback"** expands a feedback box directly above the two buttons:

```
┌─────────────────────────────────────────┐
│  Feedback for AI                         │
│  [____________________________________] │
│  [____________________________________] │
│                                           │
│  [        Send to AI ✨ (disabled)     ] │
├─────────────────────────────────────────┤
│  [ 🔄 Regenerate with Feedback ]  [ ✅ Approve & Create Jira Tickets ] │
└─────────────────────────────────────────┘
```

- The feedback textarea is empty by default.
- **"Send to AI"** is disabled until the textarea has non-empty (trimmed) text — feedback is **required** to regenerate.
- Clicking "Regenerate with Feedback" again toggles the box closed.

---

## Data Flow

1. Manager clicks **"Regenerate with Feedback"** → feedback box appears, textarea focused.
2. Manager types feedback (e.g. "Add more security tasks, reduce frontend hours") → "Send to AI" becomes enabled.
3. Manager clicks **"Send to AI"**:
   - Activity log: `🔄 Regenerating with feedback: "<feedback>"`
   - `POST /api/analyze` with `{ "requirement": state.requirement, "feedback": "<feedback>" }`
   - `state.requirement` is the **original** requirement text — never mutated by feedback.
4. Backend builds a prompt that includes the feedback as explicit reviewer guidance (see below) and calls Gemini (or `demo_response` in `DEMO_MODE`).
5. On success:
   - `state.userStories` and `state.tasks` are **fully replaced** with the new AI output (fresh start, not a merge/diff of the previous attempt or any inline edits the manager made).
   - Activity log: `✨ AI regenerated <N> tasks based on feedback`
   - `renderReview()` re-renders the meta info, user stories, and task cards.
   - Feedback textarea is cleared and the feedback box collapses.
6. Manager can repeat steps 1–5 as many times as needed, or click **"Approve & Create Jira Tickets"** once satisfied (existing flow, unchanged).

---

## API Contract Changes

### `POST /api/analyze`

**Request body** gains an optional field:
```json
{
  "requirement": "...",
  "feedback": ""
}
```
- `feedback` defaults to `""` if omitted (backward compatible — the initial AI Analysis call from `initForm()` continues to send no feedback).

**Response shape is unchanged**: `{ "user_stories": [...], "tasks": [...], "total_effort_hours": N }`.

---

## Backend Prompt Changes (`app.py`)

`GEMINI_PROMPT` gets a new `{feedback_section}` placeholder, inserted immediately before `Requirement: {requirement}`:

- When `feedback == ""` → `feedback_section = ""` (prompt is byte-identical to today's behavior).
- When `feedback` is non-empty:
  ```
  IMPORTANT: A previous task breakdown for this requirement was reviewed and rejected by a manager.
  Reviewer feedback: "{feedback}"

  Generate a NEW breakdown for the requirement below that addresses this feedback.
  ```

`call_gemini(requirement: str, feedback: str = "") -> dict` and `demo_response(requirement: str, feedback: str = "") -> dict` signatures are updated accordingly. The `/api/analyze` route reads `feedback = (data or {}).get("feedback", "").strip()` and passes it through.

### `demo_response()` feedback handling

When `feedback` is non-empty, append one extra user story to the returned list:
```
As a reviewer, I want this revision to address: "<feedback>" so that the plan matches expectations
```
This lets `DEMO_MODE=true` visibly demonstrate the regenerate flow without calling Gemini.

---

## Frontend Changes

### `templates/index.html`

Replace the current full-width `#approveBtn` block in `#step-review` with the feedback box + a `.review-actions` row containing `#regenerateBtn` and `#approveBtn` side-by-side (see UI Layout above).

### `static/main.js`

New `initRegenerate()` function:
- `#regenerateBtn` click → toggle `.hidden` on `#feedbackBox`; focus `#feedbackText` when shown.
- `#feedbackText` `input` listener → `#submitFeedbackBtn.disabled = (trimmed value is empty)`.
- `#submitFeedbackBtn` click →
  - Disable button, show spinner, `setStatus("working", "AI Regenerating...")`.
  - `logActivity("🔄", ...)` with the (escaped) feedback text.
  - `fetch("/api/analyze", { ..., body: JSON.stringify({ requirement: state.requirement, feedback }) })`.
  - On success: update `state.userStories`/`state.tasks`, `logActivity("✨", ...)`, `setStatus("ready", "Ready")`, `renderReview()`, clear textarea, hide feedback box.
  - On error: same `catch` pattern as `initApprove()`/`initForm()` — `logActivity("❌", ...)`, `setStatus("error", "Error")`, `alert(...)`.
- Called from the `// ── Init ──` section alongside the other `init*()` calls.

Additionally, the `newRequestBtn` handler (in `initForm()`) is extended to also clear `#feedbackText` and hide `#feedbackBox`, so a fresh requirement starts with a clean Review step.

### `static/style.css`

- `.review-actions` — flex row, `gap: 10px`, both children `flex: 1`.
- `.feedback-box` — flex column, `gap: 8px`, `margin: 10px 0`.

---

## Error Handling

- Network/API errors during regenerate use the same pattern as the existing Analyze/Approve flows: `logActivity("❌", ...)`, `setStatus("error", "Error")`, `alert(err.message)`. The feedback box stays open with the manager's text intact so they can retry without retyping.
- "Send to AI" cannot be clicked with empty/whitespace-only feedback (client-side `disabled` check) — no new server-side validation needed beyond the existing `requirement` check already in `/api/analyze`.

---

## Out of Scope

- Merging/diffing the previous task list with the new one (each regenerate is a fresh AI attempt — Approach "(a) Fresh start", confirmed).
- Limiting the number of regenerations per requirement.
- Persisting feedback history (the activity log already provides a transient record for the session).
- Changes to the Manual Entry tab (not yet implemented) — this feature only affects the AI Analysis review flow.
