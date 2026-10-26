Status: ready-for-agent

# Spec: Playwright Test Manager

## Problem Statement

Developing, maintaining, and repairing end-to-end browser tests with Playwright is time-consuming and often requires continuous manual upkeep as user interfaces change. While Playwright Test Agents provide intelligent roles for planning, generating, and healing tests, developers lack a dedicated, user-friendly graphical interface to orchestrate this lifecycle. Interacting with raw agent CLI tools or bespoke editor plugins is fragmented, lacks live visibility into test execution and traces, and does not provide an integrated human-in-the-loop review workflow for generated or healed test code.

## Solution

A standalone fullstack application and CLI tool that serves as a web-based control center for Playwright testing augmented with Playwright Test Agents over the Agent Client Protocol (ACP). The application directly manages the target repository's filesystem, allowing developers to interactively prompt a Planner to create Test Specs (in Markdown), review and edit specs in a split-screen editor, generate Test Scripts via a Generator with visual Staged Diff approval, execute tests in Headed or Headless mode with live streaming and trace inspection, and seamlessly invoke a Healer to repair failing tests.

## User Stories

1. As a developer, I want to launch the manager from my terminal in any project directory via a single CLI command, so that I can immediately start managing my tests without complex setup.
2. As a developer, I want to see a list of all existing Test Specs and Test Scripts in my project, so that I have a clear overview of my test suite.
3. As a developer, I want to open a "Plan New Test" dialog and enter a natural language prompt, so that the Planner agent can explore the application and propose a structured Test Spec.
4. As a developer, I want to optionally attach or paste a Product Requirement Document (PRD) into the Planner dialog, so that the agent has deep domain context for edge cases.
5. As a developer, I want to watch the Planner's Markdown output stream into the UI in real time, so that I can see the proposed plan taking shape and cancel early if it goes off track.
6. As a developer, I want to edit Test Specs in a rich split-pane editor with live rendered Markdown preview, so that I can refine the test scenario before generating code.
7. As a developer, I want syntax highlighting and autocomplete for Markdown in the editor, so that editing feels comfortable and familiar.
8. As a developer, I want to trigger the Generator agent directly from a Test Spec view, so that executable Playwright code is synthesized from the specification.
9. As a developer, I want the Generator's proposed code to appear in a visual Staged Diff against any existing code, so that I can inspect every line before it touches my filesystem.
10. As a developer, I want to accept ("Apply") or reject a Staged Diff with a single click, so that I retain full control over what enters the codebase.
11. As a developer, I want to execute an individual Test Script directly from its detail view, so that I get fast feedback during active test authoring.
12. As a developer, I want to toggle between Headless Mode and Headed Mode before running a test, so that I can choose between fast background execution and watching the browser live on screen.
13. As a developer, I want to see stdout, stderr, and Playwright step logs stream in real time during test execution, so that I know exactly what step is running.
14. As a developer, I want clear visual indicators (Pass, Fail, Running, Skipped) for each test execution, so that test outcomes are immediately obvious.
15. As a developer, I want failing tests to automatically capture and surface the error stack and failure location, so that I immediately understand why a test broke.
16. As a developer, I want to inspect execution Traces in an embedded Trace Viewer within the application, so that I don't have to leave the UI to diagnose failures.
17. As a developer, I want a single-click "Heal with Agent" button on failed test runs, so that the Healer agent can analyze the failure, trace, and DOM to fix broken locators or assertions.
18. As a developer, I want the Healer's repair proposal to be presented as a Staged Diff, so that I can verify the agent didn't over-correct or weaken valid assertions.
19. As a developer, I want to configure the target application's Base URL and Seed Test path in project settings, so that all agents know how to reach and bootstrap the application.
20. As a developer, I want to configure the external ACP Agent command and arguments, so that I can switch between different coding agents or model providers seamlessly.
21. As a developer, I want an option to enable a built-in Mock Agent, so that I can test, demo, and develop the application deterministically without incurring API costs or requiring external agent binaries.
22. As a developer, I want to run the full test suite with one click ("Run All Tests"), so that I can verify overall suite health before pushing changes.
23. As a developer, I want to filter the test list by status (e.g. failing tests only), so that I can focus quickly on regressions.
24. As a developer, I want all Test Specs and Test Scripts to be saved directly into my repository files (`specs/` and `tests/`), so that my entire test suite is automatically versioned in Git without database synchronization.

## Implementation Decisions

### Architectural Shape & Modules

- **CLI Runner & Host Module**: An executable entrypoint that resolves the target workspace path, parses startup arguments, starts the HTTP/WebSocket server, and opens the user's default browser.
- **Workspace & File Management Module**: Discovers, reads, and writes `specs/*.md` and `tests/*.spec.ts` files, parses YAML frontmatter, and validates file boundaries against a strict path sandbox.
- **ACP Client Orchestrator Module**: Connects to the external agent process over `stdio` using JSON-RPC 2.0. Manages ephemeral sessions for Planner, Generator, and Healer invocations. Automatically approves file and terminal operations strictly confined within the workspace sandbox while blocking external path traversal.
- **Mock Agent Provider**: A built-in ACP-compatible stub implementation that serves simulated responses for planning, code generation, and test healing for offline development and testing.
- **Playwright Test Runner Module**: Spawns and manages `npx playwright test` processes. Streams stdout/stderr via WebSockets to the client, parses JSON reporter outputs, and ensures trace files are generated upon failure.
- **Trace Server Module**: Hosts or embeds Playwright's local Trace Viewer for visual inspection of failing test execution artifacts.
- **Frontend SPA Module**: A single-page application built with React, Tailwind CSS, and Monaco Editor. Divided into:
  - Sidebar & Test Explorer: Navigation, status badges, filters, and run-all controls.
  - Spec Editor & Preview: Split-pane editor with Markdown rendering.
  - Staged Diff Review: Side-by-side Monaco diff viewer for reviewing agent proposals.
  - Test Execution & Console: Live streaming log output, execution summary, and trace tab.
  - Project Settings: Base URL, Seed Test path, and ACP Agent configuration.

### Data Model & Protocols

- **File Convention**:
  - `specs/<slug>.md`: Contains YAML frontmatter (title, description, tags, seed reference) followed by the Markdown test scenario.
  - `tests/<slug>.spec.ts`: The executable Playwright test script.
  - `.playwright-manager.json`: Target repository configuration (Base URL, seed test path, agent command).
- **Communication Protocol**:
  - Frontend to Backend: REST API for file operations and configuration; WebSocket for real-time log streaming, ACP agent turn-by-turn events, and test run status updates.
  - Backend to AI Agent: Agent Client Protocol (ACP) over stdio subprocess.

## Testing Decisions

### What Makes a Good Test

Tests must only verify observable external behavior at system boundaries, avoiding coupling to internal implementation details, internal helper functions, or ephemeral state machines.

### Testing Seams

The primary seam for the test suite is the **HTTP / WebSocket API of the running Test Manager server backed by the Mock Agent and a temporary test workspace**.
At this seam, automated tests will:
1. Initialize a temporary project directory with a sample `seed.spec.ts` and `playwright.config.ts`.
2. Send API / WebSocket requests to plan a new test, verifying that the Test Spec is written to disk.
3. Trigger test generation, verifying that a Staged Diff is returned over WebSocket.
4. Send an "Apply" command, verifying that the Test Script (`.spec.ts`) is committed to the filesystem.
5. Trigger a test run, verifying real-time log streaming and completion status.
6. Trigger a test failure and healing sequence, verifying that the Healer produces an updated Staged Diff.

### Modules to Test

- End-to-end integration tests over the HTTP/WS API covering the full Plan -> Edit -> Generate -> Run -> Heal lifecycle.
- Workspace filesystem sandbox unit tests to verify path traversal prevention.
- ACP JSON-RPC client protocol parser tests verifying request/response handling and cancellation.

## Out of Scope

- Multi-tenant cloud hosting or remote SaaS accounts (the application runs locally as a developer tool).
- Proprietary proprietary database storage (the local filesystem is the exclusive source of truth).
- Custom proprietary AI model training or hosting (any standard ACP agent is consumed as a client).
- Visual regression snapshot baseline approvals (delegated to Playwright's native snapshot tooling).

## Further Notes

- Respects ADRs 0001 through 0008 recorded in `docs/adr/`.
- Adheres strictly to the domain vocabulary in `GLOSSARY.md`.
