# 06: Test Failure Trace Viewer & Healer Loop with Staged Diff

**What to build:** Comprehensive post-failure diagnostics and repair loop, including surfacing error stacks, embedding the Playwright Trace Viewer directly in the UI, and providing a single-click "Heal with Agent" flow that invokes the Healer agent and stages repaired test code in a diff view.

**Blocked by:** 05: Playwright Test Runner with Live Console Streaming & Headed Toggle

**Status:** ready-for-agent

- [ ] Failed test runs capture error messages, stack traces, and Playwright execution traces
- [ ] An embedded Trace Viewer tab opens directly within the application when an execution trace exists
- [ ] A "Heal with Agent" button passes failure artifacts (error stack, trace, test script, test spec) to the Healer agent
- [ ] The Healer agent generates a targeted fix and displays the proposal in a side-by-side Monaco Staged Diff
- [ ] Users can review and apply the repaired code, followed by re-running the test to verify the fix
- [ ] Automated tests verify the failure artifact capture and the Healer staging/apply flow
