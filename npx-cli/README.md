# cdesktop

> A local desktop/web client for Claude Code.

## Quick Start

Run cdesktop without installing anything:

```bash
npx cdesktop
```

This launches a local backend and opens the UI in your browser.

Helpful entrypoints:

```bash
npx cdesktop --help
npx cdesktop --version
npx cdesktop review --help
npx cdesktop mcp --help
```

## What is cdesktop?

cdesktop is a local client for the [Claude Code](https://www.anthropic.com/claude-code) CLI. It runs a local backend on your machine and gives you a browser-based UI for starting coding sessions, watching them execute, inspecting diffs, and iterating — no cloud account required, no kanban, just Claude Code sessions.

Multi-model support is available via `ANTHROPIC_BASE_URL` overrides (e.g., point at a different model provider that speaks the Anthropic API).

## How it works

1. `npx cdesktop` downloads and runs the local backend binary for your platform.
2. The backend opens a UI in your default browser.
3. You pick a project directory (git repo), start a session, and Claude Code runs inside an isolated git worktree on your machine.
4. You review the diff, merge or discard, and keep going.

All execution is local. No code or transcript leaves your machine unless you explicitly push it.

## Requirements

- **Node.js** 20+ (for `npx`)
- **Git** (for worktree operations)
- **Claude Code CLI** installed and on your `PATH`

## Supported platforms

- Linux x64
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- Windows x64

## License

Apache License 2.0. Derived from [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) — see `NOTICE` at the repo root.
