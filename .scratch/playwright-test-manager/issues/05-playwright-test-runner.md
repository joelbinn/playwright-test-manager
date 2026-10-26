# 05: Playwright Test Runner with Live Console Streaming & Headed Toggle

**What to build:** Test execution capabilities within the UI, allowing users to run individual Test Scripts or the entire test suite, toggle between Headed and Headless Mode, watch stdout/stderr stream in real time in a console pane, and view pass/fail status badges.

**Blocked by:** 04: Generator Flow & Monaco Staged Diff Approval

**Status:** resolved

- [x] Users can trigger execution of an individual Test Script from its detail view
- [x] Users can trigger execution of all tests in the workspace with a single "Run All" action
- [x] Users can toggle between Headless Mode and Headed Mode before starting a run
- [x] Execution output (stdout, stderr, Playwright step events) streams in real time via WebSockets to a dedicated console pane
- [x] Tests report pass, fail, or running statuses with visual badges in the UI and sidebar
- [x] Automated tests verify test execution triggering, log streaming over WebSocket, and exit status reporting

## Answer

Implemented the Playwright Test Runner engine with live WebSocket streaming and dashboard UI controls via TDD across three agreed seams:
1. `src/server/runner.ts` (`runPlaywright`): Spawns Playwright test runs with `--headed` flag support, specific script targeting, and stdout/stderr stream callbacks.
2. `src/server/app.ts` (`/ws/runs`, `/api/runs`, `/api/runs/status`): WebSocket broadcaster and Fastify endpoints for executing runs and subscribing to real-time status and console log events.
3. Dashboard Web UI: Integrated "Run All", individual test "Run Test", Headed Mode toggle, dedicated `#console-pane`, and live status badges for running, passed, and failed tests. Verified by 29 automated unit and integration tests.
