# 05: Playwright Test Runner with Live Console Streaming & Headed Toggle

**What to build:** Test execution capabilities within the UI, allowing users to run individual Test Scripts or the entire test suite, toggle between Headed and Headless Mode, watch stdout/stderr stream in real time in a console pane, and view pass/fail status badges.

**Blocked by:** 04: Generator Flow & Monaco Staged Diff Approval

**Status:** ready-for-agent

- [ ] Users can trigger execution of an individual Test Script from its detail view
- [ ] Users can trigger execution of all tests in the workspace with a single "Run All" action
- [ ] Users can toggle between Headless Mode and Headed Mode before starting a run
- [ ] Execution output (stdout, stderr, Playwright step events) streams in real time via WebSockets to a dedicated console pane
- [ ] Tests report pass, fail, or running statuses with visual badges in the UI and sidebar
- [ ] Automated tests verify test execution triggering, log streaming over WebSocket, and exit status reporting
