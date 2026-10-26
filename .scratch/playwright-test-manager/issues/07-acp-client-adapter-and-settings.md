# 07: External ACP Client Subprocess Adapter & Project Settings

**What to build:** A Project Settings interface and backend ACP client adapter that enables connecting to external AI coding agents (such as Claude Code or custom ACP servers) over stdio with ephemeral task-based sessions and strict filesystem sandboxing, replacing or complementing the Mock Agent.

**Blocked by:** 06: Test Failure Trace Viewer & Healer Loop with Staged Diff

**Status:** ready-for-human

- [x] A Project Settings view allows configuring the target Base URL, Seed Test path, and ACP Agent CLI command/arguments
- [x] Backend implements an ACP client using JSON-RPC 2.0 over stdio subprocesses
- [x] Agent sessions are created ephemerally per task (Plan, Generate, Heal) and closed upon completion
- [x] Filesystem read/write operations by the agent are auto-approved within the target workspace directory and strictly blocked outside it
- [x] Users can toggle between the external ACP agent and the built-in Mock Agent
- [x] Integration tests verify ACP handshake, session creation, permission handling, and clean shutdown
