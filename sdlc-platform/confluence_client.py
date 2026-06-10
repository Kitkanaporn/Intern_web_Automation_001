import os
import requests
from requests.auth import HTTPBasicAuth

def create_page(project_name: str, requirement: str, tickets: list):
    """
    Create a project spec page in Confluence.
    In a real environment, this uses the Confluence REST API.
    """
    url = os.getenv("CONFLUENCE_URL", "").rstrip("/")
    email = os.getenv("CONFLUENCE_EMAIL")
    token = os.getenv("CONFLUENCE_API_TOKEN")
    space_key = os.getenv("CONFLUENCE_SPACE_KEY")

    if not all([url, email, token, space_key]):
        # Fallback for demo mode
        print(f"[MOCK] Confluence page created for project: {project_name}")
        return

    auth = HTTPBasicAuth(email, token)
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    # Build the HTML content
    ticket_rows = "".join([
        f"<tr><td>{t['id']}</td><td>{t['title']}</td><td>{t['effort_hours']}h</td><td>{t['department']}</td></tr>"
        for t in tickets
    ])

    html_body = f"""
    <h2>Project Requirement</h2>
    <p>{requirement}</p>
    <h2>Engineering Tasks</h2>
    <table>
        <thead><tr><th>Key</th><th>Task</th><th>Effort</th><th>Dept</th></tr></thead>
        <tbody>{ticket_rows}</tbody>
    </table>
    """

    payload = {
        "title": f"Project Spec: {project_name}",
        "type": "page",
        "space": {"key": space_key},
        "body": {
            "storage": {
                "value": html_body,
                "representation": "storage"
            }
        }
    }

    response = requests.post(
        f"{url}/wiki/rest/api/content",
        json=payload,
        auth=auth,
        headers=headers,
        timeout=10
    )
    response.raise_for_status()
    return response.json().get("_links", {}).get("base") + response.json().get("_links", {}).get("webui")
