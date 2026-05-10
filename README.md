# 📯 Agentara

[![CI](https://github.com/MagicCube/agentara/actions/workflows/ci.yml/badge.svg)](https://github.com/MagicCube/agentara/actions/workflows/ci.yml)
[![Test](https://github.com/MagicCube/agentara/actions/workflows/test.yml/badge.svg)](https://github.com/MagicCube/agentara/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Hono](https://img.shields.io/badge/API-Hono-E36002?logo=hono&logoColor=white)](https://hono.dev)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?logo=react&logoColor=white)](https://react.dev)

<img width="1916" height="821" alt="ADF7F867-88A5-4623-B5A9-06D1CDF4C28E_1_201_a 1" src="https://github.com/user-attachments/assets/ea8b312a-4631-410b-8649-6ed522d3e9b4" />

Meet Tara, your 24/7 personal assistant powered by Claude Code and OpenAI Codex. Multi-channel messaging, long-term memory, skills, task scheduling, session management, and more — all running locally.

## Features

- **Agent-powered sessions** — Interact with Claude Code and OpenAI Codex through managed sessions with full streaming support
- **Multi-channel messaging** — Receive and respond to messages from multiple channels (e.g. Feishu/Lark)
- **Message streaming** — Streaming response for IM channel (if supported message updating/patching, e.g. Feishu)
- **Task scheduling** — Queue-based task dispatcher with per-session serial execution and cross-session concurrency
- **Cron jobs** — Schedule recurring tasks with cron patterns
- **Session persistence** — Sessions stored as JSONL files with full message history
- **Web dashboard** — React-based UI for managing sessions, tasks, and memory
- **File and image support** — Send and receive files and images through message channels
- **RESTful API** — Hono-based API server with type-safe RPC client

## Built-in Skills

- [amap](user-home/.claude/skills/amap)
- [claude-usage](user-home/.claude/skills/claude-usage)
- [consulting-analysis](user-home/.claude/skills/consulting-analysis)
- [current-time](user-home/.claude/skills/current-time)
- [daily-hunt](user-home/.claude/skills/daily-hunt)
- [data-analysis](user-home/.claude/skills/data-analysis)
- [deep-research](user-home/.claude/skills/deep-research)
- [find-skills](user-home/.claude/skills/find-skills)
- [fix-my-life](user-home/.claude/skills/fix-my-life)
- [frontend-design](user-home/.claude/skills/frontend-design)
- [github-deep-research](user-home/.claude/skills/github-deep-research)
- [heartbeat](user-home/.claude/skills/heartbeat)
- [image-generation](user-home/.claude/skills/image-generation)
- [ppt-generation](user-home/.claude/skills/ppt-generation)
- [pulse](user-home/.claude/skills/pulse)
- [scheduled-tasks](user-home/.claude/skills/scheduled-tasks)
- [skill-creator](user-home/.claude/skills/skill-creator)
- [stock](user-home/.claude/skills/stock)
- [technical-writing-skill](user-home/.claude/skills/technical-writing-skill)
- [vercel-deploy-claimable](user-home/.claude/skills/vercel-deploy-claimable)
- [weather-report](user-home/.claude/skills/weather-report)
- [web-design-guidelines](user-home/.claude/skills/web-design-guidelines)

## Tech Stack

**Backend**

| Category | Technology |
|----------|------------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| API | [Hono](https://hono.dev) |
| Database | SQLite (Bun built-in) + [Drizzle ORM](https://orm.drizzle.team) |
| Task Queue | [Bunqueue](https://github.com/nicexlab/bunqueue) |
| Validation | [Zod](https://zod.dev) |
| Logging | [Pino](https://getpino.io) |
| Date | [Day.js](https://day.js.org) |
| Events | [EventEmitter3](https://github.com/primus/eventemitter3) |

**Frontend**

| Category | Technology |
|----------|------------|
| Framework | React 19 + Vite 7 |
| Routing | TanStack Router |
| Data Fetching | TanStack React Query |
| Styling | Tailwind CSS v4 + [Shadcn](https://ui.shadcn.com) |
| Theme | Dark mode by default |

## Prerequisites

- [Bun](https://bun.sh) (latest)
- One of the following coding agents:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured
  - [OpenAI Codex](https://openai.com/api/codex/) installed and configured

## Quick Start

First, clone the repo and install all its dependencies.

```bash
git clone https://github.com/magiccube/agentara.git
cd agentara
make install
```

Then, run in DEVELOPMENT mode. Both backend server and frontend website will be launched.

```bash
make dev
```

On first run, Agentara creates `~/.agentara` with default config, workspace, and data directories.

The backend runs on `http://localhost:1984` and the frontend dev server on `http://localhost:8000` (proxying API requests to the backend).

Go to your IM client and start chatting with Tara:

```
/bootstrap
```

Or schedule a cronjob:

```
Hey, Tara! Schedule a cronjob to run every 7:30 AM and 5:30 PM to run the `/pulse` skill.
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTARA_HOME` | Home directory for all Agentara data | `~/.agentara` |
| `AGENTARA_LOG_LEVEL` | Log level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |
| `AGENTARA_SERVICE_PORT` | API server port | `1984` |
| `AGENTARA_SERVICE_HOST` | API server host | `localhost` |

### Config File

A `config.yaml` is auto-generated at `$AGENTARA_HOME/config.yaml` on first run. Here is an example:

```yaml
agents:
  default:
    type: claude          # Agent runner to use

tasking:
  max_retries: 1          # Max attempts per task before marking as failed

messaging:
  default_channel_id: 9e3eae94-fe88-4043-af40-e7f88943a370  # Change it to yours
  channels:
    - id: 9e3eae94-fe88-4043-af40-e7f88943a370 # Unique ID for the channel
      type: feishu
      name: Tara
      description: Tara's default channel
      params:
        app_id: $FEISHU_APP_ID       # Resolved from environment variable
        app_secret: $FEISHU_APP_SECRET
        chat_id: oc_xxxxxxxxxxxxx
```

String values starting with `$` are automatically resolved from environment variables at load time. All fields are validated with Zod on startup — missing or invalid values will produce a clear error.

### Directory Structure

All data lives under `$AGENTARA_HOME` (`~/.agentara` by default):

```
~/.agentara/
├── config.yaml       # Configuration file
├── workspace/        # Agent workspace
├── sessions/         # Session JSONL files
├── memory/           # Agent memory
└── data/             # SQLite databases
```

## Architecture Overview

![architecture](https://github.com/user-attachments/assets/ecd7a64d-2191-48ec-bb2e-cda577d24d1f)


## Project Structure

```
src/
├── shared/           # Cross-layer types, utilities, conventions
│   ├── agents/       # AgentRunner interface
│   ├── messaging/    # Message types, channels, gateway
│   ├── tasking/      # Task payload types
│   ├── sessioning/   # Session types
│   ├── config/       # Paths and configuration
│   ├── logging/      # Pino logger
│   └── utils/        # Pure utilities
├── kernel/           # Core orchestration
│   ├── agents/       # Agent runner factory
│   ├── sessioning/   # Session, SessionManager
│   ├── tasking/      # TaskDispatcher (Bunqueue)
│   └── messaging/    # Multi-channel message gateway
├── community/        # Provider implementations
│   ├── anthropic/    # Claude agent runner
│   └── feishu/       # Feishu/Lark messaging channel
├── server/           # Hono API server
├── data/             # Database connection
└── boot-loader/      # Bootstrap and integrity verification
web/                  # React frontend (separate package)
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start backend and frontend in dev mode |
| `bun run dev:server` | Start backend only |
| `bun run dev:web` | Start frontend only |
| `bun run check` | Type-check and lint |
| `bun run build:bin` | Compile to a standalone binary |
| `bun run build:js` | Build JS bundle |

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Install dependencies**: `bun install`
4. **Make your changes** and ensure they pass checks:
   ```bash
   bun run check    # Type-check + lint
   ```
5. **Commit** with a clear message following [Conventional Commits](https://www.conventionalcommits.org):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `chore:` for maintenance
   - `docs:` for documentation
6. **Open a Pull Request** against `main`

### Code Conventions

- Use `logger` from `@/shared` for logging — never use `console.log` directly
- Import from `@/shared` directly, not from sub-paths
- Entities are defined with Zod schemas first, TypeScript interfaces second
- Use underscore naming for entity fields
- Private class members are prefixed with `_`
- Provide TSDoc for all public APIs

## License

[MIT](LICENSE)
