-- Phase B of multi-agent-routing: unify the providers table around a
-- per-agent record shape (one credential, per-agent payload slots,
-- perAgentEnabled toggle map).
--
-- Drop-and-recreate is acceptable: cdesktop is pre-release, no users.

DROP TABLE IF EXISTS providers;

CREATE TABLE providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('Default', 'Preset', 'Custom')),
    preset_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    api_key TEXT,
    -- JSON map: { CLAUDE_CODE: bool, CODEX: bool, OPENCODE: bool,
    --            DEEPSEEK_TUI: bool, GEMINI: bool, HERMES: bool }
    per_agent_enabled TEXT NOT NULL DEFAULT '{}',
    -- One JSON column per agent payload. Schemas mirror the plan §3.2 shape.
    claude TEXT NOT NULL DEFAULT '{}',
    codex TEXT NOT NULL DEFAULT '{}',
    opencode TEXT NOT NULL DEFAULT '{}',
    deepseek_tui TEXT NOT NULL DEFAULT '{}',
    gemini TEXT NOT NULL DEFAULT '{}',
    hermes TEXT NOT NULL DEFAULT '{}',
    enabled_models TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Re-seed the Default provider singleton.
-- Default carries no credentials and no per-agent payloads; the spawn applier
-- short-circuits when kind=Default and lets each agent use its native config.
INSERT INTO providers (
    id, name, kind, preset_id, enabled,
    api_key, per_agent_enabled,
    claude, codex, opencode, deepseek_tui, gemini, hermes,
    enabled_models
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default',
    'Default',
    NULL,
    1,
    NULL,
    '{}',
    '{}', '{}', '{}', '{}', '{}', '{}',
    '[]'
);
