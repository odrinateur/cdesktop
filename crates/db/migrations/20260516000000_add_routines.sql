-- Routines: saved templates that spawn workspaces on a schedule or manually.
-- Per plans/routines.md.

CREATE TABLE routines (
    id BLOB PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    instructions TEXT NOT NULL,
    repo_id BLOB NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    target_branch TEXT,
    use_worktree BOOLEAN NOT NULL,
    -- JSON ExecutorConfig (see crates/executors/src/profile.rs)
    executor_config TEXT NOT NULL,
    schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('manual','hourly','daily','weekdays','weekly')),
    -- HH:MM for daily/weekdays/weekly; MM for hourly; NULL for manual
    schedule_time TEXT,
    -- 0=Sun..6=Sat for weekly; NULL otherwise
    schedule_dow INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- RFC3339 UTC
    next_run_at TEXT,
    last_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_routines_next_run_at ON routines(next_run_at) WHERE enabled = TRUE;
CREATE INDEX idx_routines_repo ON routines(repo_id);

CREATE TABLE routine_runs (
    id BLOB PRIMARY KEY NOT NULL,
    routine_id BLOB NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    workspace_id BLOB REFERENCES workspaces(id) ON DELETE SET NULL,
    scheduled_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending','running','done','skipped','failed')),
    skip_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
);

CREATE INDEX idx_routine_runs_routine ON routine_runs(routine_id, scheduled_at DESC);
CREATE INDEX idx_routine_runs_workspace ON routine_runs(workspace_id);

-- Workspaces gain a source column so the sidebar can hide routine-spawned workspaces.
ALTER TABLE workspaces ADD COLUMN source TEXT NOT NULL DEFAULT 'user'
    CHECK (source IN ('user','routine'));
