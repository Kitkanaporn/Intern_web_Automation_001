# app.py
import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
import jira_client
import confluence_client
import gmail_client
import requests as http_requests

load_dotenv()

app = Flask(__name__)

# ── Constants ────────────────────────────────────────────────
DEFAULT_PORT = 2500

# In-memory storage — resets when Flask restarts (intentional for demo)
MOCK_TICKETS: list = []
HISTORY: list = []

# Prompt sent to Gemini for requirement analysis
GEMINI_PROMPT = """
You are a senior SDLC analyst at a financial company (SET Thailand — Stock Exchange of Thailand).

Given the software requirement below, break it down into user stories and GRANULAR engineering tasks.

Rules:
- Generate between {min_s} and {max_s} user stories.
- Generate between {min_t} and {max_t} tasks. Each task must be ONE concrete deliverable.
- IMPORTANT: Every task must have a `story_index` (integer) that refers to the index of the user story it belongs to (0-based).
- Title: short imperative phrase (max 10 words).
- Description: 2–3 sentences.
- effort_hours: realistic integer (1–24 hours).
- department: Backend Dev, Frontend Dev, QA, DevOps, Business Analysis, Security

Return a JSON object with exactly these fields:
{{
  "user_stories": ["As a <role>, I want <goal> so that <benefit>", ...],
  "tasks": [
    {{"title": "...", "description": "...", "effort_hours": 4, "department": "Backend Dev", "story_index": 0}},
    ...
  ],
  "total_effort_hours": 0
}}

Requirement: {requirement}

Return ONLY valid JSON.
"""

# ── Demo mode fallback ────────────────────────────────────────
def demo_response(requirement: str) -> dict:
    """
    Return granular fake AI output when DEMO_MODE=true in .env.
    """
    short = requirement[:50] if len(requirement) > 50 else requirement
    return {
        "user_stories": [
            f"As a user, I want to {short[:40].lower()} so that I can improve my daily workflow",
            "As a developer, I want a clear API contract so that I can implement each endpoint without ambiguity",
            "As a QA engineer, I want defined acceptance criteria per task so that I can write targeted tests",
        ],
        "tasks": [
            {"title": "Define functional requirements document", "description": "Write a structured requirements doc covering scope, actors, and edge cases.", "effort_hours": 4, "department": "Business Analysis", "story_index": 0},
            {"title": "Design database schema and ERD", "description": "Model all entities, relationships, and indexes required by the feature.", "effort_hours": 4, "department": "Backend Dev", "story_index": 0},
            {"title": "Build REST API endpoints", "description": "Expose CRUD endpoints for the feature following the existing API conventions.", "effort_hours": 6, "department": "Backend Dev", "story_index": 1},
            {"title": "Build UI screens and components", "description": "Implement all required views according to the wireframes.", "effort_hours": 8, "department": "Frontend Dev", "story_index": 1},
            {"title": "Write integration and API tests", "description": "Cover all happy paths and key error cases for the new endpoints.", "effort_hours": 6, "department": "QA", "story_index": 2},
        ],
        "total_effort_hours": 28,
    }


import time

# ── Jira ticket creation helper ───────────────────────────────
def create_jira_ticket(task: dict, req_id: str) -> dict:

    """
    Create a real Jira issue and return a ticket dict with the real Jira key.
    Calls jira_client.create_issue() which calls the Jira REST API.
    """
    jira_key = jira_client.create_issue(
        title=task.get("title", "Untitled"),
        description=task.get("description", ""),
        effort_hours=task.get("effort_hours", 0),
        department=task.get("department", "Backend Dev"),
    )
    return {
        "id": jira_key,
        "req_id": req_id,
        "title": task.get("title", "Untitled"),
        "description": task.get("description", ""),
        "effort_hours": task.get("effort_hours", 0),
        "department": task.get("department", "Backend Dev"),
        "status": "To Do",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }


# ── Routes ────────────────────────────────────────────────────
@app.route("/")
def index():
    """Serve the main dashboard HTML page."""
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """
    Accept a requirement from the frontend, call Gemini API,
    and return structured tasks + user stories as JSON.
    """
    data = request.get_json()
    requirement = (data or {}).get("requirement", "").strip()
    additional_prompt = (data or {}).get("additional_prompt", "").strip()
    min_s = (data or {}).get("min_stories", 3)
    max_s = (data or {}).get("max_stories", 5)
    min_t = (data or {}).get("min_tasks", 8)
    max_t = (data or {}).get("max_tasks", 15)

    if not requirement:
        return jsonify({"error": "Requirement text is required"}), 400

    try:
        # Pass custom ranges to the prompt
        formatted_prompt = GEMINI_PROMPT.format(
            requirement=requirement, 
            min_s=min_s, max_s=max_s,
            min_t=min_t, max_t=max_t
        )
        
        # Append additional prompt if provided
        if additional_prompt:
            formatted_prompt += f"\n\nAdditional instructions: {additional_prompt}"

        result = call_gemini_with_prompt(formatted_prompt, requirement)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned unexpected format. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"AI analysis failed: {str(e)}"}), 500


def call_gemini_with_prompt(prompt: str, original_requirement: str) -> dict:
    """
    Internal helper to call Gemini with a pre-formatted prompt.
    """
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        return demo_response(original_requirement)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise ValueError("GEMINI_API_KEY not set in .env file")

    client = genai.Client(api_key=api_key)
    
    max_retries = 5
    base_delay = 5
    
    for attempt in range(max_retries + 1):
        try:
            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            raw = response.text.strip()
            break
        except Exception as e:
            error_msg = str(e)
            if ("503" in error_msg or "429" in error_msg) and attempt < max_retries:
                wait_time = 15 if "429" in error_msg else base_delay * (2 ** attempt)
                time.sleep(wait_time)
                continue
            raise e

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(raw)


@app.route("/api/approve", methods=["POST"])
def approve():
    """
    Accept the human-approved task list, create real Jira tickets,
    log the requirement to history, and return the created tickets.
    Triggers Confluence and Gmail integrations.
    """
    data = request.get_json() or {}
    tasks = data.get("tasks", [])
    project_name = data.get("project_name", "Untitled Project")
    requirement = data.get("requirement", "")
    department = data.get("department", "All")
    priority = data.get("priority", "Medium")

    if not tasks:
        return jsonify({"error": "No tasks provided"}), 400

    req_id = f"REQ-{str(uuid.uuid4())[:8].upper()}"

    try:
        new_tickets = [create_jira_ticket(t, req_id) for t in tasks]
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except http_requests.HTTPError as e:
        return jsonify({"error": f"Jira API unavailable: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": f"Failed to create Jira tickets: {str(e)}"}), 500

    # Jira tickets exist now — commit them locally before attempting any
    # best-effort integrations, so a Confluence/Gmail failure can't lose them.
    MOCK_TICKETS.extend(new_tickets)

    HISTORY.append({
        "req_id": req_id,
        "project_name": project_name,
        "requirement": requirement,
        "priority": priority,
        "department": department,
        "ticket_count": len(new_tickets),
        "total_hours": sum(t.get("effort_hours", 0) for t in tasks),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })

    email_preview = build_email_preview(project_name, department, new_tickets)

    # ── Integration: Confluence (best-effort, doesn't fail the request) ──
    try:
        confluence_client.create_page(project_name, requirement, new_tickets)
    except Exception as e:
        print(f"Failed to create Confluence page: {e}")

    # ── Integration: Gmail (best-effort, doesn't fail the request) ──
    try:
        gmail_client.send_email(email_preview["to"], email_preview["subject"], email_preview["body"])
    except Exception as e:
        print(f"Failed to send kickoff email: {e}")

    return jsonify({
        "req_id": req_id,
        "tickets": new_tickets,
        "email_preview": email_preview,
    })


@app.route("/api/ticket/<jira_key>/status", methods=["POST"])
def update_ticket_status(jira_key: str):
    """
    Transition a Jira ticket to a new status and update the local cache.
    Expects JSON body: {"status": "In Progress"}
    """
    data = request.get_json() or {}
    new_status = data.get("status", "").strip()

    if not new_status:
        return jsonify({"error": "Status is required"}), 400

    try:
        jira_client.update_status(jira_key, new_status)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except http_requests.HTTPError as e:
        return jsonify({"error": f"Jira API error: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": f"Failed to update status: {str(e)}"}), 500

    # Update local cache so Kanban board reflects the change immediately
    for ticket in MOCK_TICKETS:
        if ticket["id"] == jira_key:
            ticket["status"] = new_status
            return jsonify(ticket)

    return jsonify({"error": f"Ticket {jira_key} not found in local cache"}), 404


@app.route("/api/config", methods=["GET"])
def get_config():
    """
    Provide public configuration to the frontend, such as the Jira URL.
    """
    return jsonify({
        "jira_url": os.getenv("JIRA_URL", "https://your-domain.atlassian.net")
    })


@app.route("/api/tickets", methods=["GET"])
def get_tickets():
    """
    Return all Jira tickets from the local session cache.
    Syncs the latest status from Jira API for each ticket if possible.
    """
    # Sync statuses in a real environment (skipped in demo mode for speed)
    if os.getenv("DEMO_MODE", "false").lower() != "true":
        for ticket in MOCK_TICKETS:
            try:
                current_status = jira_client.get_status(ticket["id"])
                ticket["status"] = current_status
            except (ValueError, http_requests.RequestException):
                pass

    return jsonify(MOCK_TICKETS)


@app.route("/api/history", methods=["GET"])
def get_history():
    """Return all past requirements submitted in this session."""
    return jsonify(HISTORY)


# ── Email preview helper ──────────────────────────────────────
def build_email_preview(project_name: str, department: str, tickets: list) -> dict:
    """
    Build a mock email notification dict to show in the activity panel.
    Nothing is actually sent — this is display-only for the demo.
    """
    ticket_lines = "\n".join(
        f"  - [{t['id']}] {t['title']} ({t['effort_hours']}h)" for t in tickets
    )
    body = (
        f"Hi {department} Team,\n\n"
        f"New work has been assigned to your team for project: {project_name}\n\n"
        f"Tickets created:\n{ticket_lines}\n\n"
        f"Please check Jira for full details.\n\n"
        f"Best regards,\nAI SDLC Platform"
    )
    return {
        "to": f"{department.lower().replace(' ', '-')}@set.or.th",
        "subject": f"[SDLC] New tasks assigned — {project_name}",
        "body": body,
    }


if __name__ == "__main__":
    app.run(debug=True, port=DEFAULT_PORT)
