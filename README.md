# cdesktop

> A local desktop/web client for [Claude Code](https://www.anthropic.com/claude-code).

cdesktop runs the Claude Code CLI as a child process on your machine, gives you a browser-based UI for driving sessions, and keeps everything local — your code, your transcripts, and your worktrees all stay on disk. No cloud account, no kanban boards, no agent marketplace. Just Claude Code sessions with a decent UI around them.

Multi-model support is available via `ANTHROPIC_BASE_URL` overrides.

## Quick start

```bash
npx cdesktop
```

This launches the local backend and opens the UI in your default browser.

Requirements:
- **Node.js** 20+
- **Git**
- **[Claude Code](https://www.anthropic.com/claude-code) CLI** installed and on your `PATH`

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=20)
- [pnpm](https://pnpm.io/) (>=8)

```bash
cargo install cargo-watch
cargo install sqlx-cli --no-default-features --features rustls,sqlite,postgres
pnpm i
```

### Running the dev server

```bash
pnpm run dev
```

Starts the backend and the Vite-served web app on auto-assigned ports. Dev state is persisted under `dev_assets/` (gitignored) rather than the production data directory.

### Building for local install

```bash
./local-build.sh
cd npx-cli && node bin/cli.js
```

### Environment variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | Runtime | Auto-assign | Prod: server port. Dev: frontend port (backend uses PORT+1) |
| `BACKEND_PORT` | Runtime | `0` (auto-assign) | Backend server port (dev mode) |
| `FRONTEND_PORT` | Runtime | `3000` | Frontend dev server port |
| `HOST` | Runtime | `127.0.0.1` | Backend server host |
| `MCP_HOST` | Runtime | Value of `HOST` | MCP server connection host |
| `MCP_PORT` | Runtime | Value of `BACKEND_PORT` | MCP server connection port |
| `DISABLE_WORKTREE_CLEANUP` | Runtime | Not set | Disable git worktree cleanup (debugging) |

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE).

cdesktop is a derivative work of [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban), also Apache 2.0. See [`NOTICE`](./NOTICE) for attribution details.
