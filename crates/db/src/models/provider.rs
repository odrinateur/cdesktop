use std::collections::HashMap;

use chrono::{DateTime, Utc};
use executors::{env::CodexProviderInjection, executors::BaseCodingAgent};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use crate::provider_payloads::{
    ClaudePayload, CodexPayload, DeepseekTuiPayload, GeminiPayload, HermesPayload, OpencodePayload,
};

/// Hardcoded `model_providers.<id>` slug for the cdesktop-injected Codex
/// provider. Plan §3.2: the injected provider id is `cdt`, which keeps the
/// applier's emitted keys identical for every preset (`model_providers.cdt.*`)
/// without depending on user-record naming.
pub const CODEX_INJECTED_PROVIDER_ID: &str = "cdt";

/// Env-var name carrying the user's API key into Codex's `env_key`-driven
/// auth path. Plan §3.2 fixes this to `CDT_API_KEY` so the spawn applier
/// can wire `model_providers.cdt.env_key=CDT_API_KEY` once and never
/// re-derive the variable name.
pub const CODEX_INJECTED_API_KEY_ENV: &str = "CDT_API_KEY";

pub const DEFAULT_PROVIDER_ID: &str = "00000000-0000-0000-0000-000000000001";

/// Kind of AI routing provider. PascalCase end-to-end (wire + DB CHECK constraint).
/// Renamed in TypeScript to `AiProviderKind` to avoid collision with the git-host
/// `ProviderKind` already in `shared/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(rename = "AiProviderKind")]
pub enum AiProviderKind {
    Default,
    Preset,
    Custom,
}

impl std::fmt::Display for AiProviderKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProviderKind::Default => write!(f, "Default"),
            AiProviderKind::Preset => write!(f, "Preset"),
            AiProviderKind::Custom => write!(f, "Custom"),
        }
    }
}

impl std::str::FromStr for AiProviderKind {
    type Err = ProviderError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Default" => Ok(AiProviderKind::Default),
            "Preset" => Ok(AiProviderKind::Preset),
            "Custom" => Ok(AiProviderKind::Custom),
            _ => Err(ProviderError::InvalidKind(s.to_string())),
        }
    }
}

// Keep a type alias so call sites that used `ProviderKind` still compile.
pub type ProviderKind = AiProviderKind;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct EnabledModel {
    pub id: String,
    pub display_name: String,
    pub owned_by: Option<String>,
}

/// User provider record — persistent shape stored in the `providers` table.
/// `apiKey` and `perAgentEnabled` are top-level; per-agent payloads are nested.
/// Picker visibility and spawn-time injection both read this struct directly.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: Uuid,
    pub name: String,
    pub kind: AiProviderKind,
    pub preset_id: Option<String>,
    pub enabled: bool,
    pub api_key: Option<String>,
    /// Map<agent_enum_name, bool>. Single source of truth for picker visibility
    /// per plan §3.2. Keys span the full agent enum.
    pub per_agent_enabled: HashMap<String, bool>,
    pub claude: ClaudePayload,
    pub codex: CodexPayload,
    pub opencode: OpencodePayload,
    pub deepseek_tui: DeepseekTuiPayload,
    pub gemini: GeminiPayload,
    pub hermes: HermesPayload,
    pub enabled_models: Vec<EnabledModel>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateProvider {
    pub name: String,
    pub kind: AiProviderKind,
    pub preset_id: Option<String>,
    pub api_key: Option<String>,
    pub per_agent_enabled: HashMap<String, bool>,
    #[serde(default)]
    pub claude: ClaudePayload,
    #[serde(default)]
    pub codex: CodexPayload,
    #[serde(default)]
    pub opencode: OpencodePayload,
    #[serde(default)]
    pub deepseek_tui: DeepseekTuiPayload,
    #[serde(default)]
    pub gemini: GeminiPayload,
    #[serde(default)]
    pub hermes: HermesPayload,
    pub enabled_models: Vec<EnabledModel>,
}

/// Update payload — full replacement (frontend always supplies the complete
/// state). `kind` is intentionally absent (sticky once set).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProvider {
    pub name: String,
    pub preset_id: Option<String>,
    pub enabled: bool,
    pub api_key: Option<String>,
    pub per_agent_enabled: HashMap<String, bool>,
    #[serde(default)]
    pub claude: ClaudePayload,
    #[serde(default)]
    pub codex: CodexPayload,
    #[serde(default)]
    pub opencode: OpencodePayload,
    #[serde(default)]
    pub deepseek_tui: DeepseekTuiPayload,
    #[serde(default)]
    pub gemini: GeminiPayload,
    #[serde(default)]
    pub hermes: HermesPayload,
    pub enabled_models: Vec<EnabledModel>,
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Provider not found")]
    NotFound,
    #[error("Invalid provider kind: {0}")]
    InvalidKind(String),
    #[error("Invalid UUID: {0}")]
    InvalidUuid(String),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Cannot delete the Default provider")]
    CannotDeleteDefault,
    #[error("enabledModels must not be empty")]
    EmptyEnabledModels,
    #[error("agent {0} is enabled but its baseUrl is empty")]
    EnabledAgentMissingBaseUrl(String),
    #[error("agent {0} is enabled but apiKey is empty")]
    MissingApiKey(String),
}

// Raw row returned from SQLite — JSON fields stored as TEXT.
#[derive(Debug, FromRow)]
struct ProviderRow {
    id: String,
    name: String,
    kind: String,
    preset_id: Option<String>,
    enabled: bool,
    api_key: Option<String>,
    per_agent_enabled: String,
    claude: String,
    codex: String,
    opencode: String,
    deepseek_tui: String,
    gemini: String,
    hermes: String,
    enabled_models: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<ProviderRow> for Provider {
    type Error = ProviderError;

    fn try_from(r: ProviderRow) -> Result<Self, ProviderError> {
        let kind: AiProviderKind = r.kind.parse()?;
        let mut enabled_models: Vec<EnabledModel> = serde_json::from_str(&r.enabled_models)?;
        // Default provider has no DB-stored model list; synthesize it from the
        // Claude executor's canonical alias list at read time, so updates ship
        // with the binary instead of needing a migration.
        if matches!(kind, AiProviderKind::Default) && enabled_models.is_empty() {
            enabled_models = executors::executors::claude::DEFAULT_MODEL_IDS
                .iter()
                .map(|(id, name)| EnabledModel {
                    id: (*id).to_string(),
                    display_name: (*name).to_string(),
                    owned_by: Some("anthropic".to_string()),
                })
                .collect();
        }
        Ok(Provider {
            id: r
                .id
                .parse()
                .map_err(|_| ProviderError::InvalidUuid(r.id.clone()))?,
            name: r.name,
            kind,
            preset_id: r.preset_id,
            enabled: r.enabled,
            api_key: r.api_key,
            per_agent_enabled: serde_json::from_str(&r.per_agent_enabled)?,
            claude: serde_json::from_str(&r.claude)?,
            codex: serde_json::from_str(&r.codex)?,
            opencode: serde_json::from_str(&r.opencode)?,
            deepseek_tui: serde_json::from_str(&r.deepseek_tui)?,
            gemini: serde_json::from_str(&r.gemini)?,
            hermes: serde_json::from_str(&r.hermes)?,
            enabled_models,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

impl Provider {
    pub async fn list(pool: &SqlitePool) -> Result<Vec<Self>, ProviderError> {
        let rows = sqlx::query_as!(
            ProviderRow,
            r#"SELECT
                id, name, kind, preset_id,
                enabled as "enabled!: bool",
                api_key, per_agent_enabled,
                claude, codex, opencode, deepseek_tui, gemini, hermes,
                enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM providers
               ORDER BY
                CASE kind WHEN 'Default' THEN 0 ELSE 1 END,
                created_at ASC"#
        )
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Provider::try_from).collect()
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Self, ProviderError> {
        let id_str = id.to_string();
        let row = sqlx::query_as!(
            ProviderRow,
            r#"SELECT
                id, name, kind, preset_id,
                enabled as "enabled!: bool",
                api_key, per_agent_enabled,
                claude, codex, opencode, deepseek_tui, gemini, hermes,
                enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM providers WHERE id = $1"#,
            id_str
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ProviderError::NotFound)?;

        Provider::try_from(row)
    }

    /// Reject empty `enabledModels` — see plan §3.6 validation rule (defense in
    /// depth so a misbehaving client can't persist a record OpenCode would
    /// silently delete at runtime).
    fn validate_enabled_models(
        kind: &AiProviderKind,
        models: &[EnabledModel],
    ) -> Result<(), ProviderError> {
        // Default singleton carries no model list (synthesized at read).
        if matches!(kind, AiProviderKind::Default) {
            return Ok(());
        }
        if models.is_empty() {
            return Err(ProviderError::EmptyEnabledModels);
        }
        Ok(())
    }

    /// Reject save when an agent is enabled but its `base_url` is missing —
    /// otherwise the spawn applier silently falls through to the user's
    /// ambient config (defeating the point of cdesktop-managed routing).
    /// The Default provider is exempt: it carries no per-agent payloads.
    fn validate_enabled_agent_payloads(
        kind: &AiProviderKind,
        per_agent_enabled: &HashMap<String, bool>,
        claude: &ClaudePayload,
        codex: &CodexPayload,
        opencode: &OpencodePayload,
        deepseek_tui: &DeepseekTuiPayload,
        gemini: &GeminiPayload,
        hermes: &HermesPayload,
    ) -> Result<(), ProviderError> {
        if matches!(kind, AiProviderKind::Default) {
            return Ok(());
        }
        let is_on = |k: &str| per_agent_enabled.get(k).copied().unwrap_or(false);
        let has = |s: &Option<String>| s.as_deref().map_or(false, |v| !v.is_empty());
        let missing = |agent: &str, ok: bool| {
            if ok {
                Ok(())
            } else {
                Err(ProviderError::EnabledAgentMissingBaseUrl(agent.to_string()))
            }
        };
        if is_on("CLAUDE_CODE") {
            missing("CLAUDE_CODE", has(&claude.base_url))?;
        }
        if is_on("CODEX") {
            missing("CODEX", has(&codex.base_url))?;
        }
        if is_on("OPENCODE") {
            missing("OPENCODE", has(&opencode.base_url))?;
        }
        if is_on("DEEPSEEK_TUI") {
            missing("DEEPSEEK_TUI", has(&deepseek_tui.base_url))?;
        }
        if is_on("GEMINI") {
            missing("GEMINI", has(&gemini.base_url))?;
        }
        if is_on("HERMES") {
            missing("HERMES", has(&hermes.base_url))?;
        }
        Ok(())
    }

    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        data: &CreateProvider,
    ) -> Result<Self, ProviderError> {
        Self::validate_enabled_models(&data.kind, &data.enabled_models)?;
        Self::validate_enabled_agent_payloads(
            &data.kind,
            &data.per_agent_enabled,
            &data.claude,
            &data.codex,
            &data.opencode,
            &data.deepseek_tui,
            &data.gemini,
            &data.hermes,
        )?;

        let id_str = id.to_string();
        let kind_str = data.kind.to_string();
        let per_agent_enabled = serde_json::to_string(&data.per_agent_enabled)?;
        let claude_str = serde_json::to_string(&data.claude)?;
        let codex_str = serde_json::to_string(&data.codex)?;
        let opencode_str = serde_json::to_string(&data.opencode)?;
        let deepseek_tui_str = serde_json::to_string(&data.deepseek_tui)?;
        let gemini_str = serde_json::to_string(&data.gemini)?;
        let hermes_str = serde_json::to_string(&data.hermes)?;
        let enabled_models_str = serde_json::to_string(&data.enabled_models)?;

        let row = sqlx::query_as!(
            ProviderRow,
            r#"INSERT INTO providers (
                id, name, kind, preset_id, enabled,
                api_key, per_agent_enabled,
                claude, codex, opencode, deepseek_tui, gemini, hermes,
                enabled_models
               )
               VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               RETURNING
                id, name, kind, preset_id,
                enabled as "enabled!: bool",
                api_key, per_agent_enabled,
                claude, codex, opencode, deepseek_tui, gemini, hermes,
                enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id_str,
            data.name,
            kind_str,
            data.preset_id,
            data.api_key,
            per_agent_enabled,
            claude_str,
            codex_str,
            opencode_str,
            deepseek_tui_str,
            gemini_str,
            hermes_str,
            enabled_models_str,
        )
        .fetch_one(pool)
        .await?;

        Provider::try_from(row)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateProvider,
    ) -> Result<Self, ProviderError> {
        // Look up kind to know whether to enforce the non-empty rule (Default exempt).
        let existing = Self::find_by_id(pool, id).await?;
        Self::validate_enabled_models(&existing.kind, &data.enabled_models)?;
        Self::validate_enabled_agent_payloads(
            &existing.kind,
            &data.per_agent_enabled,
            &data.claude,
            &data.codex,
            &data.opencode,
            &data.deepseek_tui,
            &data.gemini,
            &data.hermes,
        )?;

        let id_str = id.to_string();
        let per_agent_enabled = serde_json::to_string(&data.per_agent_enabled)?;
        let claude_str = serde_json::to_string(&data.claude)?;
        let codex_str = serde_json::to_string(&data.codex)?;
        let opencode_str = serde_json::to_string(&data.opencode)?;
        let deepseek_tui_str = serde_json::to_string(&data.deepseek_tui)?;
        let gemini_str = serde_json::to_string(&data.gemini)?;
        let hermes_str = serde_json::to_string(&data.hermes)?;
        let enabled_models_str = serde_json::to_string(&data.enabled_models)?;

        let row = sqlx::query_as!(
            ProviderRow,
            r#"UPDATE providers
               SET name = $1, preset_id = $2, enabled = $3,
                   api_key = $4, per_agent_enabled = $5,
                   claude = $6, codex = $7, opencode = $8,
                   deepseek_tui = $9, gemini = $10, hermes = $11,
                   enabled_models = $12,
                   updated_at = datetime('now')
               WHERE id = $13
               RETURNING
                id, name, kind, preset_id,
                enabled as "enabled!: bool",
                api_key, per_agent_enabled,
                claude, codex, opencode, deepseek_tui, gemini, hermes,
                enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            data.name,
            data.preset_id,
            data.enabled,
            data.api_key,
            per_agent_enabled,
            claude_str,
            codex_str,
            opencode_str,
            deepseek_tui_str,
            gemini_str,
            hermes_str,
            enabled_models_str,
            id_str,
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ProviderError::NotFound)?;

        Provider::try_from(row)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), ProviderError> {
        if id.to_string() == DEFAULT_PROVIDER_ID {
            return Err(ProviderError::CannotDeleteDefault);
        }
        let id_str = id.to_string();
        sqlx::query!("DELETE FROM providers WHERE id = $1", id_str)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub fn is_default(&self) -> bool {
        self.kind == AiProviderKind::Default
    }

    /// Per-agent credential resolution. Each per-agent payload may carry an
    /// `api_key` override; when present (and non-empty) it wins over the
    /// top-level `Provider::api_key`. Aggregators like Packy Code use this to
    /// issue distinct keys per backing agent. The common case (one key for
    /// every agent) leaves payload overrides empty and falls through.
    pub fn resolved_api_key(&self, agent: BaseCodingAgent) -> Option<&str> {
        let override_key: Option<&str> = match agent {
            BaseCodingAgent::ClaudeCode => self.claude.api_key.as_deref(),
            BaseCodingAgent::Codex => self.codex.api_key.as_deref(),
            BaseCodingAgent::Opencode => self.opencode.api_key.as_deref(),
            BaseCodingAgent::Gemini => self.gemini.api_key.as_deref(),
            // Phase E (DeepSeek TUI) / Hermes will fall through to top-level
            // until their executor enums land. Other agents (Amp, Cursor,
            // Qwen, Copilot, Droid, QaMock) have no per-agent payload.
            _ => None,
        };
        override_key
            .filter(|s| !s.is_empty())
            .or_else(|| self.api_key.as_deref().filter(|s| !s.is_empty()))
    }

    /// Build the Claude-side env map to inject at process spawn time.
    ///
    /// For Default (ambient auth): empty map — Claude CLI uses its own config.
    /// For Preset/Custom: derives `ANTHROPIC_BASE_URL` from `claude.base_url`,
    /// names the credential env var per `claude.api_key_field`, sets
    /// `ANTHROPIC_DEFAULT_HAIKU_MODEL` from `claude.haiku_model` (or follows
    /// the picker model when unset), routes the picker's selected model into
    /// `CLAUDE_CODE_SUBAGENT_MODEL` for Task-tool / sub-agent routing, and
    /// overlays `claude.env` for vendor quirks.
    /// `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` /
    /// `ANTHROPIC_DEFAULT_OPUS_MODEL` are stripped because they conflict with
    /// the `--model` CLI flag the executor passes for the *main* model. See
    /// plan §3.2 spawn-time applier.
    ///
    /// Codex/OpenCode/DeepSeek TUI/Gemini/Hermes appliers ship in Phases C-F.
    pub fn build_spawn_env(&self, model_id: &str) -> HashMap<String, String> {
        if self.kind == AiProviderKind::Default {
            return HashMap::new();
        }

        let mut env = self.claude.env.clone();
        // Ensure no stray conflicting keys leaked into claude.env.
        env.remove("ANTHROPIC_MODEL");
        env.remove("ANTHROPIC_DEFAULT_SONNET_MODEL");
        env.remove("ANTHROPIC_DEFAULT_OPUS_MODEL");
        env.remove("ANTHROPIC_DEFAULT_HAIKU_MODEL");

        if let Some(base_url) = &self.claude.base_url {
            env.insert("ANTHROPIC_BASE_URL".to_string(), base_url.clone());
        }

        let api_key_field = self
            .claude
            .api_key_field
            .as_deref()
            .unwrap_or("ANTHROPIC_AUTH_TOKEN");
        if let Some(key) = self.resolved_api_key(BaseCodingAgent::ClaudeCode) {
            env.insert(api_key_field.to_string(), key.to_string());
        }

        if !model_id.is_empty() {
            env.insert(
                "CLAUDE_CODE_SUBAGENT_MODEL".to_string(),
                model_id.to_string(),
            );
        }

        let haiku = self.claude.haiku_model.clone().or_else(|| {
            if model_id.is_empty() {
                None
            } else {
                Some(model_id.to_string())
            }
        });
        if let Some(h) = haiku {
            env.insert("ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(), h);
        }

        env
    }

    /// Build the Codex-side spawn injection: the env-var map carrying
    /// `CDT_API_KEY`, plus the dotted-path config overrides + model-provider
    /// id that get merged into Codex's `ThreadStartParams.config` and
    /// `ThreadStartParams.model_provider` respectively.
    ///
    /// Per plan §3.2 the emitted overrides are:
    /// ```text
    /// model_providers.cdt.name      = record.name
    /// model_providers.cdt.base_url  = record.codex.baseUrl
    /// model_providers.cdt.env_key   = "CDT_API_KEY"
    /// model_providers.cdt.wire_api  = "responses"
    /// ```
    /// `requires_openai_auth` is left at its default (false), so codex's
    /// auth path reads only the `env_key` env var and never consults
    /// `~/.codex/auth.json` for our provider — matching the plan's
    /// "user's home dir is read-only from cdesktop" rule.
    ///
    /// Errors:
    /// - `MissingApiKey("CODEX")` when `record.api_key` is empty.
    /// - `EnabledAgentMissingBaseUrl("CODEX")` when `record.codex.base_url` is empty.
    ///
    /// Both checks duplicate Phase B's save-time `validate_enabled_agent_payloads`.
    /// They re-run here to guard records edited (or whose secret got cleared)
    /// between save and spawn — the save-time validator can't see a
    /// post-save edit that goes through a different path.
    ///
    /// `record.codex.env` is overlaid first so the `CDT_API_KEY` we set
    /// last cannot be silently clobbered by a vendor-quirk env entry.
    /// Returns `Ok(None)` for the Default provider (ambient auth path).
    pub fn build_codex_injection(
        &self,
    ) -> Result<Option<(HashMap<String, String>, CodexProviderInjection)>, ProviderError> {
        if self.kind == AiProviderKind::Default {
            return Ok(None);
        }

        let api_key = self
            .resolved_api_key(BaseCodingAgent::Codex)
            .ok_or_else(|| ProviderError::MissingApiKey("CODEX".to_string()))?;
        let base_url = self
            .codex
            .base_url
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| ProviderError::EnabledAgentMissingBaseUrl("CODEX".to_string()))?;

        let mut env = self.codex.env.clone();
        // `CDT_API_KEY` set last so vendor-quirk env (set above) can't
        // accidentally overwrite the credential. Plan §3.2 is silent on
        // ordering; defensive choice.
        env.insert(CODEX_INJECTED_API_KEY_ENV.to_string(), api_key.to_string());

        let prefix = format!("model_providers.{CODEX_INJECTED_PROVIDER_ID}");
        let mut config_overrides = HashMap::new();
        config_overrides.insert(
            format!("{prefix}.name"),
            JsonValue::String(self.name.clone()),
        );
        config_overrides.insert(
            format!("{prefix}.base_url"),
            JsonValue::String(base_url.to_string()),
        );
        config_overrides.insert(
            format!("{prefix}.env_key"),
            JsonValue::String(CODEX_INJECTED_API_KEY_ENV.to_string()),
        );
        config_overrides.insert(
            format!("{prefix}.wire_api"),
            JsonValue::String("responses".to_string()),
        );

        Ok(Some((
            env,
            CodexProviderInjection {
                config_overrides,
                model_provider_id: CODEX_INJECTED_PROVIDER_ID.to_string(),
            },
        )))
    }

    /// Per-agent spawn injection — the single dispatch point that route
    /// handlers call when a user picks a provider for a given message.
    ///
    /// Each agent gets its own applier (Codex via `build_codex_injection`,
    /// every other agent via Claude-style env-only `build_spawn_env`).
    /// Phase D / E / F will populate the other slots on `AgentInjection`
    /// (OpenCode JSON config, DeepSeek TUI flags, Gemini env, Hermes carrier
    /// — see plan §3.2 lines 192-260). Adding a new agent only adds a match
    /// arm here and a field on `AgentInjection`; route handlers stay put.
    pub fn build_agent_injection(
        &self,
        agent: BaseCodingAgent,
        model_id: &str,
    ) -> Result<AgentInjection, ProviderError> {
        match agent {
            BaseCodingAgent::Codex => match self.build_codex_injection()? {
                Some((env, codex)) => Ok(AgentInjection {
                    env: Some(env),
                    codex: Some(codex),
                }),
                None => Ok(AgentInjection::default()),
            },
            _ => {
                let env = self.build_spawn_env(model_id);
                let env = if env.is_empty() { None } else { Some(env) };
                Ok(AgentInjection { env, codex: None })
            }
        }
    }
}

/// Per-agent spawn injection bundle — env vars + agent-specific structured
/// payloads. One slot per agent that has a non-trivial spawn-time applier.
/// Phases D/E/F add more slots; route handlers remain agent-agnostic.
#[derive(Debug, Clone, Default)]
pub struct AgentInjection {
    /// Process env to merge into `ExecutionEnv.provider_vars` for spawn.
    /// Carries `CDT_API_KEY` for Codex, native auth env for every other
    /// agent (e.g. `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` for Claude).
    pub env: Option<HashMap<String, String>>,
    /// Codex-only: dotted-path overrides + `model_provider` id merged into
    /// `ThreadStartParams` at spawn (see `Codex::build_thread_start_params`).
    pub codex: Option<CodexProviderInjection>,
    // Future: opencode (Phase D), deepseek_tui (Phase E), gemini (Phase F).
}

#[cfg(test)]
mod codex_injection_tests {
    use super::*;

    fn provider_with_codex(
        kind: AiProviderKind,
        api_key: Option<&str>,
        base_url: Option<&str>,
        codex_env: HashMap<String, String>,
    ) -> Provider {
        Provider {
            id: Uuid::new_v4(),
            name: "Test Provider".to_string(),
            kind,
            preset_id: None,
            enabled: true,
            api_key: api_key.map(|s| s.to_string()),
            per_agent_enabled: HashMap::new(),
            claude: ClaudePayload::default(),
            codex: CodexPayload {
                base_url: base_url.map(|s| s.to_string()),
                env: codex_env,
            },
            opencode: OpencodePayload::default(),
            deepseek_tui: DeepseekTuiPayload::default(),
            gemini: GeminiPayload::default(),
            hermes: HermesPayload::default(),
            enabled_models: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn default_returns_none() {
        let p = provider_with_codex(
            AiProviderKind::Default,
            Some("ignored"),
            Some("ignored"),
            HashMap::new(),
        );
        assert!(p.build_codex_injection().unwrap().is_none());
    }

    #[test]
    fn missing_api_key_rejected() {
        let p = provider_with_codex(
            AiProviderKind::Preset,
            None,
            Some("https://example.com/v1"),
            HashMap::new(),
        );
        assert!(matches!(
            p.build_codex_injection(),
            Err(ProviderError::MissingApiKey(_))
        ));
    }

    #[test]
    fn empty_api_key_rejected() {
        let p = provider_with_codex(
            AiProviderKind::Preset,
            Some(""),
            Some("https://example.com/v1"),
            HashMap::new(),
        );
        assert!(matches!(
            p.build_codex_injection(),
            Err(ProviderError::MissingApiKey(_))
        ));
    }

    #[test]
    fn missing_base_url_rejected() {
        let p = provider_with_codex(
            AiProviderKind::Preset,
            Some("sk-test"),
            None,
            HashMap::new(),
        );
        assert!(matches!(
            p.build_codex_injection(),
            Err(ProviderError::EnabledAgentMissingBaseUrl(_))
        ));
    }

    #[test]
    fn structural_keys_emitted() {
        let p = provider_with_codex(
            AiProviderKind::Preset,
            Some("sk-test"),
            Some("https://openrouter.ai/api/v1"),
            HashMap::new(),
        );
        let (env, injection) = p.build_codex_injection().unwrap().unwrap();

        assert_eq!(env.get("CDT_API_KEY").map(String::as_str), Some("sk-test"));
        assert_eq!(injection.model_provider_id, "cdt");

        let cfg = &injection.config_overrides;
        assert_eq!(
            cfg.get("model_providers.cdt.name"),
            Some(&JsonValue::String("Test Provider".to_string()))
        );
        assert_eq!(
            cfg.get("model_providers.cdt.base_url"),
            Some(&JsonValue::String("https://openrouter.ai/api/v1".to_string()))
        );
        assert_eq!(
            cfg.get("model_providers.cdt.env_key"),
            Some(&JsonValue::String("CDT_API_KEY".to_string()))
        );
        assert_eq!(
            cfg.get("model_providers.cdt.wire_api"),
            Some(&JsonValue::String("responses".to_string()))
        );
    }

    #[test]
    fn vendor_env_overlaid_first_credential_wins() {
        // Vendor-quirk env in record.codex.env is overlaid first; CDT_API_KEY
        // is set last so a misconfigured vendor entry can't overwrite the
        // credential.
        let mut codex_env = HashMap::new();
        codex_env.insert("OPENAI_TIMEOUT_MS".to_string(), "30000".to_string());
        codex_env.insert(
            "CDT_API_KEY".to_string(),
            "should-be-overridden".to_string(),
        );

        let p = provider_with_codex(
            AiProviderKind::Preset,
            Some("real-key"),
            Some("https://example.com/v1"),
            codex_env,
        );
        let (env, _) = p.build_codex_injection().unwrap().unwrap();
        assert_eq!(env.get("CDT_API_KEY").map(String::as_str), Some("real-key"));
        assert_eq!(
            env.get("OPENAI_TIMEOUT_MS").map(String::as_str),
            Some("30000")
        );
    }
}
