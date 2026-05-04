use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

pub const DEFAULT_PROVIDER_ID: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "AiProviderKind")]
pub enum ProviderKind {
    Default,
    Preset,
    Custom,
}

impl std::fmt::Display for ProviderKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderKind::Default => write!(f, "Default"),
            ProviderKind::Preset => write!(f, "Preset"),
            ProviderKind::Custom => write!(f, "Custom"),
        }
    }
}

impl std::str::FromStr for ProviderKind {
    type Err = ProviderError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Default" => Ok(ProviderKind::Default),
            "Preset" => Ok(ProviderKind::Preset),
            "Custom" => Ok(ProviderKind::Custom),
            _ => Err(ProviderError::InvalidKind(s.to_string())),
        }
    }
}

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
    pub kind: ProviderKind,
    pub agent_kind: String,
    pub preset_id: Option<String>,
    pub enabled: bool,
    pub env: HashMap<String, String>,
    pub extra_args: Vec<String>,
    pub haiku_model: Option<String>,
    pub enabled_models: Vec<EnabledModel>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateProvider {
    pub name: String,
    pub kind: ProviderKind,
    pub agent_kind: Option<String>,
    pub preset_id: Option<String>,
    pub env: HashMap<String, String>,
    pub extra_args: Vec<String>,
    pub haiku_model: Option<String>,
    pub enabled_models: Vec<EnabledModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProvider {
    pub name: Option<String>,
    pub preset_id: Option<String>,
    pub enabled: Option<bool>,
    pub env: Option<HashMap<String, String>>,
    pub extra_args: Option<Vec<String>>,
    pub haiku_model: Option<String>,
    pub enabled_models: Option<Vec<EnabledModel>>,
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Provider not found")]
    NotFound,
    #[error("Invalid provider kind: {0}")]
    InvalidKind(String),
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
        Ok(Provider {
            id: r
                .id
                .parse()
                .map_err(|_| ProviderError::InvalidKind(format!("invalid UUID: {}", r.id)))?,
            name: r.name,
            kind: r.kind.parse()?,
            agent_kind: r.agent_kind,
            preset_id: r.preset_id,
            enabled: r.enabled,
            env: serde_json::from_str(&r.env)?,
            extra_args: serde_json::from_str(&r.extra_args)?,
            haiku_model: r.haiku_model,
            enabled_models: serde_json::from_str(&r.enabled_models)?,
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
        let existing = Self::find_by_id(pool, id).await?;
        let id_str = id.to_string();

        let name = data.name.clone().unwrap_or(existing.name);
        let preset_id = if data.preset_id.is_some() {
            data.preset_id.clone()
        } else {
            existing.preset_id
        };
        let enabled = data.enabled.unwrap_or(existing.enabled);
        let env_str = serde_json::to_string(data.env.as_ref().unwrap_or(&existing.env))?;
        let extra_args_str =
            serde_json::to_string(data.extra_args.as_ref().unwrap_or(&existing.extra_args))?;
        let haiku_model = if data.haiku_model.is_some() {
            data.haiku_model.clone()
        } else {
            existing.haiku_model
        };
        let enabled_models_str = serde_json::to_string(
            data.enabled_models
                .as_ref()
                .unwrap_or(&existing.enabled_models),
        )?;

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
            name,
            preset_id,
            enabled,
            env_str,
            extra_args_str,
            haiku_model,
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
        self.kind == ProviderKind::Default
    }

    /// Build the env map to inject at process spawn time for a given selected model.
    ///
    /// For the Default provider (ambient auth) this returns an empty map —
    /// no env injection needed.
    ///
    /// For Preset/Custom providers:
    /// - Strips ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL
    ///   (§6.1 normalization — these conflict with the per-message --model flag)
    /// - Moves ANTHROPIC_DEFAULT_HAIKU_MODEL to the haiku_model field value
    ///   (or falls back to the selected model id if haiku_model is None)
    /// - Injects CLAUDE_CODE_SUBAGENT_MODEL = selected model id
    pub fn build_spawn_env(&self, model_id: &str) -> HashMap<String, String> {
        if self.kind == ProviderKind::Default {
            return HashMap::new();
        }

        let mut env = self.env.clone();

        // §6.1: strip keys that conflict with per-message model selection
        env.remove("ANTHROPIC_MODEL");
        env.remove("ANTHROPIC_DEFAULT_SONNET_MODEL");
        env.remove("ANTHROPIC_DEFAULT_OPUS_MODEL");
        // haiku_model lives in its own field; remove from env to avoid duplication
        env.remove("ANTHROPIC_DEFAULT_HAIKU_MODEL");

        // Inject per-message model into both subagent and haiku slots
        env.insert(
            "CLAUDE_CODE_SUBAGENT_MODEL".to_string(),
            model_id.to_string(),
        );
        let haiku = self.haiku_model.as_deref().unwrap_or(model_id);
        env.insert(
            "ANTHROPIC_DEFAULT_HAIKU_MODEL".to_string(),
            haiku.to_string(),
        );

        env
    }
}
