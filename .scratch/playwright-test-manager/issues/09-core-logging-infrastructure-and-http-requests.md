# 09: Core Logging Infrastructure & HTTP Request Logging

**What to build:** Configurable backend logging using Fastify's built-in Pino logger paired with `pino-pretty` for human-readable terminal output. Supports `--verbose` and `--debug` CLI flags as well as the `LOG_LEVEL` environment variable. Automatically logs HTTP requests with method, path, response status, duration, and correlation `reqId`, while muting noise from static assets and WebSocket pings.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Add `pino-pretty` dependency to project dependencies
- [x] Support `--verbose` / `--debug` CLI arguments in `src/cli.ts` and `LOG_LEVEL` environment variable, defaulting to `info` and switching to `debug` when enabled
- [x] Initialize Fastify logger in `src/server/app.ts` using pretty transport for terminal output with timestamps and colors
- [x] Implement request logging for HTTP routes capturing request ID (`reqId`), HTTP method, URL, status code, and response time
- [x] Suppress request logging for static assets (`/dist`, favicon, etc.) and WebSocket ping/pong traffic
- [x] Add tests verifying logger configuration, CLI/env log level resolution, and HTTP request logging behavior
