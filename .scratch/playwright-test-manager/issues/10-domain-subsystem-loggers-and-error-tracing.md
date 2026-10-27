# 10: Domain Subsystem Loggers & Error Tracing

**What to build:** Modular domain child loggers across backend subsystems (Playwright runner, ACP agent adapter, workspace/specs manager, and WebSocket manager) and a unified error-handling pipeline that logs full stack traces and error details correlated by `reqId`.

**Blocked by:** 09: Core Logging Infrastructure & HTTP Request Logging

**Status:** done

- [x] Create domain child loggers (`runner`, `acp`, `workspace`, `websocket`) tagged with their component names
- [x] Instrument `runner.ts` to log test run dispatch (command, arguments, cwd, headed/headless), status transitions, duration, exit code, and trace discovery (without echoing raw Playwright stdout line-by-line)
- [x] Instrument `acp-client.ts` to log subprocess lifecycle events, handshake status, session events, and communication errors
- [x] Instrument `workspace.ts` and `specs.ts` to log scan counts, spec file reads/writes, and frontmatter parsing warnings
- [x] Instrument WebSocket connection handler to log client connect/disconnect events and active connection counts
- [x] Implement Fastify error handler logging full stack traces and detailed error context on unexpected errors and 500 responses correlated with `reqId`
- [x] Add tests verifying domain subsystem logging and error handling
