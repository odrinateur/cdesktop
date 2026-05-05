use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: Uuid,
    pub name: String,
    pub kind: AiProviderKind,
    pub agent_kind: String,
    pub preset_id: Option<String>,
    pub enabled: bool,
    pub env: HashMap<String, String>,
    pub extra_args: Vec<String>,
    pub haiku_model: Option<String>,
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
    pub agent_kind: Option<String>,
    pub preset_id: Option<String>,
    pub env: HashMap<String, String>,
    pub extra_args: Vec<String>,
    pub haiku_model: Option<String>,
    pub enabled_models: Vec<EnabledModel>,
}

/// All fields required; the frontend form always has the full provider state.
/// Pass `None` for nullable fields to clear them (e.g. `haiku_model: null` to
/// switch to "Follow main model"). Pass `true`/`false` for `enabled`.
///
/// Note: `kind` is intentionally absent — kind is sticky once set (§3.1).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProvider {
    pub name: String,
    pub preset_id: Option<String>,
    pub enabled: bool,
    pub env: HashMap<String, String>,
    pub extra_args: Vec<String>,
    pub haiku_model: Option<String>,
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
}

// Raw row returned from SQLite — JSON fields stored as TEXT.
#[derive(Debug, FromRow)]
struct ProviderRow {
    id: String,
    name: String,
    kind: String,
    agent_kind: String,
    preset_id: Option<String>,
    enabled: bool,
    env: String,
    extra_args: String,
    haiku_model: Option<String>,
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
            agent_kind: r.agent_kind,
            preset_id: r.preset_id,
            enabled: r.enabled,
            env: serde_json::from_str(&r.env)?,
            extra_args: serde_json::from_str(&r.extra_args)?,
            haiku_model: r.haiku_model,
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
                id, name, kind, agent_kind, preset_id,
                enabled as "enabled!: bool",
                env, extra_args, haiku_model, enabled_models,
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
                id, name, kind, agent_kind, preset_id,
                enabled as "enabled!: bool",
                env, extra_args, haiku_model, enabled_models,
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

    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        data: &CreateProvider,
    ) -> Result<Self, ProviderError> {
        let id_str = id.to_string();
        let kind_str = data.kind.to_string();
        let agent_kind = data
            .agent_kind
            .clone()
            .unwrap_or_else(|| "CLAUDE_CODE".to_string());
        let env_str = serde_json::to_string(&data.env)?;
        let extra_args_str = serde_json::to_string(&data.extra_args)?;
        let enabled_models_str = serde_json::to_string(&data.enabled_models)?;

        let row = sqlx::query_as!(
            ProviderRow,
            r#"INSERT INTO providers (
                id, name, kind, agent_kind, preset_id, enabled,
                env, extra_args, haiku_model, enabled_models
               )
               VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)
               RETURNING
                id, name, kind, agent_kind, preset_id,
                enabled as "enabled!: bool",
                env, extra_args, haiku_model, enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id_str,
            data.name,
            kind_str,
            agent_kind,
            data.preset_id,
            env_str,
            extra_args_str,
            data.haiku_model,
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
        let id_str = id.to_string();
        let env_str = serde_json::to_string(&data.env)?;
        let extra_args_str = serde_json::to_string(&data.extra_args)?;
        let enabled_models_str = serde_json::to_string(&data.enabled_models)?;

        let row = sqlx::query_as!(
            ProviderRow,
            r#"UPDATE providers
               SET name = $1, preset_id = $2, enabled = $3, env = $4,
                   extra_args = $5, haiku_model = $6, enabled_models = $7,
                   updated_at = datetime('now')
               WHERE id = $8
               RETURNING
                id, name, kind, agent_kind, preset_id,
                enabled as "enabled!: bool",
                env, extra_args, haiku_model, enabled_models,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            data.name,
            data.preset_id,
            data.enabled,
            env_str,
            extra_args_str,
            data.haiku_model,
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

    /// Build the env map to inject at process spawn time for a given selected model.
    ///
    /// For the Default provider (ambient auth) this returns an empty map —
    /// no env injection needed.
    ///
    /// For Preset/Custom providers:
    /// - Strips ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL
    ///   (§6.1 normalization — these conflict with the per-message --model flag)
    /// - Injects ANTHROPIC_DEFAULT_HAIKU_MODEL from haiku_model field, or follows model_id
    ///   if haiku_model is None and model_id is non-empty
    /// - Injects CLAUDE_CODE_SUBAGENT_MODEL = model_id (if non-empty)
    pub fn build_spawn_env(&self, model_id: &str) -> HashMap<String, String> {
        if self.kind == AiProviderKind::Default {
            return HashMap::new();
        }

        let mut env = self.env.clone();

        // §6.1: strip keys that conflict with per-message model selection
        env.remove("ANTHROPIC_MODEL");
        env.remove("ANTHROPIC_DEFAULT_SONNET_MODEL");
        env.remove("ANTHROPIC_DEFAULT_OPUS_MODEL");
        // haiku_model lives in its own field
        env.remove("ANTHROPIC_DEFAULT_HAIKU_MODEL");

        // Only inject model-specific vars when a model is selected
        if !model_id.is_empty() {
            env.insert(
                "CLAUDE_CODE_SUBAGENT_MODEL".to_string(),
                model_id.to_string(),
            );
        }

        // Haiku: use preset value if set, else follow main model (if any)
        let haiku = self.haiku_model.as_deref().or_else(|| {
            if model_id.is_empty() {
                None
            } else {
                Some(model_id)
            }
        });
        if let Some(h) = haiku {
            env.insert("ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(), h.to_string());
        }

        env
    }
}
