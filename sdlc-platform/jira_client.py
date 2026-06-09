# jira_client.py
import os
import requests
from requests.auth import HTTPBasicAuth

# ── Config loaded from .env via app.py's load_dotenv() ───────
def _get_config() -> tuple:
    """
    Read Jira credentials from environment variables.
    Raises ValueError if any required variable is missing.
    """
    url = os.getenv("JIRA_URL", "").rstrip("/")
    email = os.getenv("JIRA_EMAIL", "")
    token = os.getenv("JIRA_API_TOKEN", "")
    project_key = os.getenv("JIRA_PROJECT_KEY", "")

    missing = [k for k, v in {"JIRA_URL": url, "JIRA_EMAIL": email,
                               "JIRA_API_TOKEN": token, "JIRA_PROJECT_KEY": project_key}.items() if not v]
    if missing:
        raise ValueError(f"Missing Jira config in .env: {', '.join(missing)}")

    return url, email, token, project_key


def _auth_headers(email: str, token: str) -> tuple:
    """Return the auth and headers tuple used by all Jira requests."""
    auth = HTTPBasicAuth(email, token)
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    return auth, headers


def _to_adf(text: str) -> dict:
    """
    Wrap plain text in Atlassian Document Format (ADF).
    Jira REST API v3 requires ADF for description fields, not plain text.
    """
    return {
        "version": 1,
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}]
            }
        ]
    }


# ── Public API ────────────────────────────────────────────────
def create_issue(title: str, description: str, effort_hours: int, department: str) -> str:
    """
    Create a Jira issue (Task type) in the configured project.
    Returns the issue key string, e.g. 'SDLC-1'.
    Raises requests.HTTPError on API failure.
    """
    url, email, token, project_key = _get_config()
    auth, headers = _auth_headers(email, token)

    body = {
        "fields": {
            "project": {"key": project_key},
            "summary": title,
            "description": _to_adf(f"{description}\n\nEstimated effort: {effort_hours} hours"),
            "issuetype": {"name": "Task"},
            "labels": [department.replace(" ", "-")],
        }
    }

    response = requests.post(
        f"{url}/rest/api/3/issue",
        json=body,
        auth=auth,
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["key"]


def get_transitions(issue_key: str) -> dict:
    """
    Fetch available status transitions for a Jira issue.
    Returns a dict mapping status name → transition ID.
    Example: {"In Progress": "21", "In Review": "31", "Done": "41"}
    """
    url, email, token, _ = _get_config()
    auth, headers = _auth_headers(email, token)

    response = requests.get(
        f"{url}/rest/api/3/issue/{issue_key}/transitions",
        auth=auth,
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()

    return {
        t["name"]: t["id"]
        for t in response.json().get("transitions", [])
    }


def update_status(issue_key: str, target_status: str) -> None:
    """
    Transition a Jira issue to a new status column.
    Fetches available transitions first to find the correct transition ID.
    Raises ValueError if target_status is not available for this issue.
    Raises requests.HTTPError on API failure.
    """
    url, email, token, _ = _get_config()
    auth, headers = _auth_headers(email, token)

    transitions = get_transitions(issue_key)

    if target_status not in transitions:
        available = list(transitions.keys())
        raise ValueError(f"Status '{target_status}' not available. Available: {available}")

    transition_id = transitions[target_status]

    response = requests.post(
        f"{url}/rest/api/3/issue/{issue_key}/transitions",
        json={"transition": {"id": transition_id}},
        auth=auth,
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()
