# 04: Generator Flow & Monaco Staged Diff Approval

**What to build:** An automated workflow to generate executable Playwright Test Scripts from a Test Spec using the Generator agent, presenting the proposed code in a visual side-by-side Monaco Staged Diff for human review before anything is written to disk.

**Blocked by:** 03: Mock Agent & Interactive Planner Dialog

**Status:** resolved

- [x] A "Generate Script" button in the spec view triggers the Generator agent for the current Test Spec
- [x] Generated test code is held in an in-memory staging state without immediately touching the filesystem
- [x] The UI renders a side-by-side Monaco Diff Viewer comparing the existing Test Script (or empty template) with the proposed code
- [x] Users can click "Apply" to commit the code to the workspace filesystem as a `.spec.ts` Test Script
- [x] Users can click "Reject" to discard the proposed changes without writing to disk
- [x] Automated tests verify the generation, diff preview, apply, and reject lifecycle
