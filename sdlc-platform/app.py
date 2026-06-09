# app.py
import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
import jira_client
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
You are an SDLC analyst at a financial company. Given this software requirement, return a JSON object with exactly these fields:
- user_stories: list of user story strings (max 5, format: "As a <role>, I want <goal> so that <benefit>")
- tasks: list of objects, each with: title (string), description (string), effort_hours (integer), department (string)
- total_effort_hours: integer, sum of all task hours

Departments must be one of: Backend Dev, Frontend Dev, QA, DevOps, Business Analysis, Security

Requirement: {requirement}

Return ONLY valid JSON. No markdown, no explanation, no code fences. Just the raw JSON object.
"""

# ── Demo mode fallback ────────────────────────────────────────
def demo_response(requirement: str) -> dict:
    """
    Return realistic fake AI output when DEMO_MODE=true in .env.
    Used when Gemini API is unavailable or during presentations.
    """
    short = requirement[:60] if len(requirement) > 60 else requirement
    return {
        "user_stories": [
            f"As a user, I want to {short[:40].lower()} so that I can improve my workflow",
            "As a developer, I want clear technical specifications so that I can implement correctly",
            "As a QA engineer, I want defined acceptance criteria so that I can write proper tests",
            "As a project manager, I want effort estimates so that I can plan the sprint",
            "As a stakeholder, I want progress visibility so that I can track delivery",
        ],
        "tasks": [
            {"title": "Requirement Analysis & System Design", "description": "Analyze requirements, design system architecture and database schema", "effort_hours": 8, "department": "Business Analysis"},
            {"title": "Backend API Development", "description": "Implement REST API endpoints, business logic, and data models", "effort_hours": 16, "department": "Backend Dev"},
            {"title": "Frontend UI Implementation", "description": "Build responsive user interface and connect to backend APIs", "effort_hours": 12, "department": "Frontend Dev"},
            {"title": "Security Review & Implementation", "description": "Implement authentication, authorization, and security best practices", "effort_hours": 6, "department": "Security"},
            {"title": "QA Testing & Bug Fixes", "description": "Write and execute test cases, perform regression testing", "effort_hours": 8, "department": "QA"},
            {"title": "CI/CD Pipeline & Deployment", "description": "Set up deployment pipeline and deploy to staging environment", "effort_hours": 4, "department": "DevOps"},
        ],
        "total_effort_hours": 54,
    }


# ── Gemini helper ────────────────────────────────────────────
def call_gemini(requirement: str) -> dict:
    """
    Send requirement text to Gemini API and parse the JSON response.
    Falls back to demo_response if DEMO_MODE=true in .env.
    """
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        return demo_response(requirement)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise ValueError("GEMINI_API_KEY not set in .env file")

    client = genai.Client(api_key=api_key)
    prompt = GEMINI_PROMPT.format(requirement=requirement)
    response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    raw = response.text.strip()

    # Strip markdown code fences if Gemini adds them anyway
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(raw)


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

    if not requirement:
        return jsonify({"error": "Requirement text is required"}), 400

    try:
        result = call_gemini(requirement)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned unexpected format. Please try again."}), 500
    except Exception as e:
        return jsonify({"error": f"AI analysis failed: {str(e)}"}), 500


@app.route("/api/approve", methods=["POST"])
def approve():
    """
    Accept the human-approved task list, create real Jira tickets,
    log the requirement to history, and return the created tickets.
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


@app.route("/api/tickets", methods=["GET"])
def get_tickets():
    """Return all Jira tickets from the local session cache."""
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
