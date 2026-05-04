-- Providers table: catalog of configured AI providers.
-- env, extra_args, and enabled_models are stored as JSON TEXT.
CREATE TABLE providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('Default', 'Preset', 'Custom')),
    agent_kind TEXT NOT NULL DEFAULT 'CLAUDE_CODE',
    preset_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    env TEXT NOT NULL DEFAULT '{}',
    extra_args TEXT NOT NULL DEFAULT '[]',
    haiku_model TEXT,
    enabled_models TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the Default provider singleton.
INSERT INTO providers (id, name, kind, agent_kind, preset_id, enabled, env, extra_args, haiku_model, enabled_models)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default',
    'Default',
    'CLAUDE_CODE',
    NULL,
    1,
    '{}',
    '[]',
    NULL,
    '[]'
);

-- Per-message model+provider selection, used for recently-used query and transcript markers.
ALTER TABLE coding_agent_turns ADD COLUMN selected_model_id TEXT;
ALTER TABLE coding_agent_turns ADD COLUMN selected_provider_id TEXT;
