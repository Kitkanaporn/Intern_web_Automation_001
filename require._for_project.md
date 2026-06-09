# Project Title
AI Assisted SDLC Workflow Automation Platform for TSD

# Requirement
Build an AI-assisted workflow automation platform that supports the full SDLC process and reduces manual work across all departments.

The platform should start from user request intake and continue through the full project lifecycle:
- Receive requirements from the user
- Analyze and separate the work into smaller tasks
- Generate user stories and related work items
- Analyze each task and estimate suitable man-hours and effort
- Assign the work to the correct department
- Track progress through Jira status changes
- Automatically notify the next department when the work is ready
- Keep the process traceable from start to finish

# Main Goal
The goal is to let people handle only the minimum manual action in Jira, while the system takes care of the coordination work.

Example:
- A user submits a requirement
- The system helps break the requirement into work items and user stories
- The work is assigned to the correct team
- When one stage is finished, changing the Jira status triggers the next step automatically
- The system sends email or notification to the next responsible department

# Detail
The platform should support common SDLC tools such as Jira, Git, and Gmail.

Main functions:
- Requirement intake
- Work decomposition
- User story generation
- Task effort and man-hour estimation
- Task creation and assignment
- Status-based workflow automation
- Email notification to the next department
- Audit trail and traceability

AI usage:
- AI can help understand the user requirement
- AI can help split work into tasks
- AI can generate user stories
- AI can analyze each task and suggest suitable man-hours and effort level
- AI can draft notification emails
- AI can help decide the next department when routing is not fixed
- AI can help check whether work is ready for the next step

For fixed workflow rules, rule-based automation should be used first because it is safer and more reliable than AI-only decisions.

# Example Use Case
1. A user submits a new project requirement
2. The system analyzes the requirement and creates user stories
3. The system separates the work into tasks for the right teams
4. The system estimates effort and man-hours for each task
5. The work is tracked in Jira
6. When a status changes, the system sends the next notification automatically
7. The process continues until the project is completed

# Notes
- The user should not need to manually write every email or coordinate every handoff
- The system should automate the workflow as much as possible
- The system should help estimate effort consistently across tasks
- AI should support the SDLC process, not replace workflow control and traceability


