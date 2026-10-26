# 03: Mock Agent & Interactive Planner Dialog

**What to build:** An interactive dialog where users prompt a Planner agent to generate a Test Spec, with support for attaching or pasting a PRD. The generation streams into the dialog in real time using a built-in Mock Agent, and can be saved as a new Test Spec upon completion.

**Blocked by:** 02: Spec Split-Pane Editor & Markdown Preview with File Sync

**Status:** ready-for-agent

- [ ] A "Plan New Test" action button opens a dedicated planning modal in the UI
- [ ] Users can enter a natural language prompt and optionally attach/paste PRD context
- [ ] Submitting the prompt triggers the Planner agent using the built-in Mock Agent implementation
- [ ] The generated Markdown stream renders live in the modal as tokens arrive
- [ ] Users can accept the generated plan to automatically save it as a new Test Spec file in the workspace
- [ ] Users can cancel an in-flight planning generation
- [ ] Automated tests verify the Planner prompt-to-spec streaming flow and file creation
