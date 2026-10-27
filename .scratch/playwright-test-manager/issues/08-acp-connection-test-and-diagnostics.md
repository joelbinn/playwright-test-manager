# 08: ACP Connection Test & Agent Model Diagnostics

**What to build:** A "Test Connection" button in the Project Settings ACP configuration section that probes the external ACP agent via stdio handshake and session creation, returning connection health, agent metadata (name and version), and active model diagnosis.

**Blocked by:** 07: External ACP Client Subprocess Adapter & Project Settings

**Status:** ready-for-human

- [x] Backend implements probe endpoint `POST /api/settings/test-acp` that executes handshake (`initialize`) and ephemeral session check (`session/new`, `session/close`) with an 8-second timeout
- [x] Agent metadata (name, version) and model (hybrid: protocol metadata or `--model` CLI argument fallback) are resolved and returned in probe result
- [x] UI provides a `🔌 Test Connection` button in the Project Settings modal under ACP configuration
- [x] UI displays an animated testing state and renders a green success badge with agent details and active model, or a red alert box with actionable error/stderr details
- [x] Tests verify successful connection diagnosis, model resolution, timeout enforcement, and failure reporting
