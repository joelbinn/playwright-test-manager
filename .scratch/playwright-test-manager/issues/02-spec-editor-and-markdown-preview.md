# 02: Spec Split-Pane Editor & Markdown Preview with File Sync

**What to build:** An interactive editor interface where selecting a Test Spec opens a split-pane view with a Monaco Markdown editor on one side and a live rendered HTML preview on the other, allowing users to create new specs, edit existing ones, and save updates directly to the workspace filesystem.

**Blocked by:** 01: Project Scaffold, CLI Entrypoint & Workspace Explorer

**Status:** ready-for-agent

- [ ] Selecting a Test Spec in the sidebar loads its contents into the editor
- [ ] Editing Markdown updates the rendered preview in real time
- [ ] Users can save spec changes back to the workspace filesystem via a save action / keyboard shortcut
- [ ] Users can create a new blank Test Spec with a unique name directly from the UI
- [ ] Frontmatter metadata (title, description, tags) is parsed and cleanly presented alongside the markdown body
- [ ] Automated tests verify reading, creating, and saving Test Specs through the backend API
