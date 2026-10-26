# 01: Project Scaffold, CLI Entrypoint & Workspace Explorer

**What to build:** A CLI-executable command that starts a local web server, opens the browser to the application dashboard, and scans the target workspace to display all existing Test Specs and Test Scripts in a navigable sidebar.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Running the CLI command in a target directory starts the backend server and serves the frontend dashboard
- [ ] Passing a custom directory path as a CLI argument targets that specific workspace
- [ ] The UI scans and lists all existing Test Specs from the workspace specs directory
- [ ] The UI scans and lists all existing Test Scripts from the workspace tests directory
- [ ] Tests verify that the CLI command launches the server and returns the discovered workspace files over the API
