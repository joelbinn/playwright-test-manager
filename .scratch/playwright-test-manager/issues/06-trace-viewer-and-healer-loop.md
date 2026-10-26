# 06: Test Failure Trace Viewer & Healer Loop with Staged Diff

**What to build:** Comprehensive post-failure diagnostics and repair loop, including surfacing error stacks, embedding the Playwright Trace Viewer directly in the UI, and providing a single-click "Heal with Agent" flow that invokes the Healer agent and stages repaired test code in a diff view.

**Blocked by:** 05: Playwright Test Runner with Live Console Streaming & Headed Toggle

**Status:** resolved

- [x] Failed test runs capture error messages, stack traces, and Playwright execution traces
- [x] An embedded Trace Viewer tab opens directly within the application when an execution trace exists
- [x] A "Heal with Agent" button passes failure artifacts (error stack, trace, test script, test spec) to the Healer agent
- [x] The Healer agent generates a targeted fix and displays the proposal in a side-by-side Monaco Staged Diff
- [x] Users can review and apply the repaired code, followed by re-running the test to verify the fix
- [x] Automated tests verify the failure artifact capture and the Healer staging/apply flow

## Answer

Implemented the Test Failure Trace Viewer and Healer repair loop with Monaco Staged Diff via TDD across four agreed seams:
1. `src/server/runner.ts` (`RunResult` & artifact capture): Spawns Playwright test runs with `--trace on`, captures stdout/stderr, extracts failure error summaries & stack traces, and locates generated `trace.zip` files in `test-results/`.
2. `src/server/mock-agent.ts` (`healTestScriptStream`): Mock Healer agent synthesizing targeted test script fixes based on failure artifacts (broken selector diagnosis, assertion timeouts), streaming token chunks, and supporting abort signals.
3. `src/server/app.ts` (`/api/traces/:slug`, `/api/traces/file/*`, `/api/healer/stream`, `/ws/runs`): Fastify endpoints for serving trace metadata and files, broadcasting failure diagnostics via WebSockets, and streaming Healer repairs via SSE.
4. Web UI & Diagnostics (`GET /`): Integrated `#failure-diagnostics` banner, `#error-stack` viewer, embedded Playwright Trace Viewer tab (`#tab-trace`, `#trace-viewer-frame`), single-click `#btn-heal` action, and Monaco Staged Diff staging/apply/re-run workflow. Verified by 37 automated unit and integration tests.
