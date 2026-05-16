use chrono::{DateTime, Utc};
use executors::profile::ExecutorConfig;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum RoutineError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serde(#[from] serde_json::Error),
    #[error("Routine not found")]
    NotFound,
    #[error("Validation error: {0}")]
    Validation(String),
}

#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TS,
    sqlx::Type,
    strum_macros::Display,
    strum_macros::EnumString,
)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum ScheduleKind {
    Manual,
    Hourly,
    Daily,
    Weekdays,
    Weekly,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Routine {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub repo_id: Uuid,
    pub target_branch: Option<String>,
    pub use_worktree: bool,
    /// JSON-serialized `ExecutorConfig` (see crates/executors/src/profile.rs).
    pub executor_config: String,
    pub schedule_kind: ScheduleKind,
    pub schedule_time: Option<String>,
    pub schedule_dow: Option<i64>,
    pub enabled: bool,
    pub next_run_at: Option<DateTime<Utc>>,
    pub last_run_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateRoutine {
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub repo_id: Uuid,
    #[ts(optional, type = "string | null")]
    pub target_branch: Option<String>,
    pub use_worktree: bool,
    pub executor_config: ExecutorConfig,
    pub schedule_kind: ScheduleKind,
    #[ts(optional, type = "string | null")]
    pub schedule_time: Option<String>,
    #[ts(optional, type = "number | null")]
    pub schedule_dow: Option<i64>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateRoutine {
    #[ts(optional, type = "string | null")]
    pub name: Option<String>,
    #[ts(optional, type = "string | null")]
    pub description: Option<String>,
    #[ts(optional, type = "string | null")]
    pub instructions: Option<String>,
    #[ts(optional, type = "string | null")]
    pub target_branch: Option<String>,
    #[ts(optional, type = "boolean | null")]
    pub use_worktree: Option<bool>,
    #[ts(optional)]
    pub executor_config: Option<ExecutorConfig>,
    #[ts(optional)]
    pub schedule_kind: Option<ScheduleKind>,
    #[ts(optional, type = "string | null")]
    pub schedule_time: Option<String>,
    #[ts(optional, type = "number | null")]
    pub schedule_dow: Option<i64>,
    #[ts(optional, type = "boolean | null")]
    pub enabled: Option<bool>,
}

impl Routine {
    pub fn executor_config_parsed(&self) -> Result<ExecutorConfig, serde_json::Error> {
        serde_json::from_str(&self.executor_config)
    }

    pub async fn list(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Routine,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      description,
                      instructions,
                      repo_id AS "repo_id!: Uuid",
                      target_branch,
                      use_worktree AS "use_worktree!: bool",
                      executor_config,
                      schedule_kind AS "schedule_kind!: ScheduleKind",
                      schedule_time,
                      schedule_dow,
                      enabled AS "enabled!: bool",
                      next_run_at AS "next_run_at: DateTime<Utc>",
                      last_run_at AS "last_run_at: DateTime<Utc>",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM routines
               ORDER BY (next_run_at IS NULL), next_run_at ASC, name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Routine,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      description,
                      instructions,
                      repo_id AS "repo_id!: Uuid",
                      target_branch,
                      use_worktree AS "use_worktree!: bool",
                      executor_config,
                      schedule_kind AS "schedule_kind!: ScheduleKind",
                      schedule_time,
                      schedule_dow,
                      enabled AS "enabled!: bool",
                      next_run_at AS "next_run_at: DateTime<Utc>",
                      last_run_at AS "last_run_at: DateTime<Utc>",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM routines
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Routine,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      description,
                      instructions,
                      repo_id AS "repo_id!: Uuid",
                      target_branch,
                      use_worktree AS "use_worktree!: bool",
                      executor_config,
                      schedule_kind AS "schedule_kind!: ScheduleKind",
                      schedule_time,
                      schedule_dow,
                      enabled AS "enabled!: bool",
                      next_run_at AS "next_run_at: DateTime<Utc>",
                      last_run_at AS "last_run_at: DateTime<Utc>",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM routines
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_due(pool: &SqlitePool, now: DateTime<Utc>) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Routine,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      description,
                      instructions,
                      repo_id AS "repo_id!: Uuid",
                      target_branch,
                      use_worktree AS "use_worktree!: bool",
                      executor_config,
                      schedule_kind AS "schedule_kind!: ScheduleKind",
                      schedule_time,
                      schedule_dow,
                      enabled AS "enabled!: bool",
                      next_run_at AS "next_run_at: DateTime<Utc>",
                      last_run_at AS "last_run_at: DateTime<Utc>",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM routines
               WHERE enabled = TRUE
                 AND next_run_at IS NOT NULL
                 AND next_run_at <= $1"#,
            now
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateRoutine,
        id: Uuid,
        next_run_at: Option<DateTime<Utc>>,
    ) -> Result<Self, RoutineError> {
        let executor_config_json = serde_json::to_string(&data.executor_config)?;
        let schedule_kind_str = data.schedule_kind.to_string();
        Ok(sqlx::query_as!(
            Routine,
            r#"INSERT INTO routines
                 (id, name, description, instructions, repo_id, target_branch,
                  use_worktree, executor_config, schedule_kind, schedule_time,
                  schedule_dow, enabled, next_run_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               RETURNING id AS "id!: Uuid",
                         name,
                         description,
                         instructions,
                         repo_id AS "repo_id!: Uuid",
                         target_branch,
                         use_worktree AS "use_worktree!: bool",
                         executor_config,
                         schedule_kind AS "schedule_kind!: ScheduleKind",
                         schedule_time,
                         schedule_dow,
                         enabled AS "enabled!: bool",
                         next_run_at AS "next_run_at: DateTime<Utc>",
                         last_run_at AS "last_run_at: DateTime<Utc>",
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>""#,
            id,
            data.name,
            data.description,
            data.instructions,
            data.repo_id,
            data.target_branch,
            data.use_worktree,
            executor_config_json,
            schedule_kind_str,
            data.schedule_time,
            data.schedule_dow,
            data.enabled,
            next_run_at,
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM routines WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn set_next_run_at(
        pool: &SqlitePool,
        id: Uuid,
        next_run_at: Option<DateTime<Utc>>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE routines SET next_run_at = $1, updated_at = datetime('now','subsec') WHERE id = $2",
            next_run_at,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn mark_fired(
        pool: &SqlitePool,
        id: Uuid,
        now: DateTime<Utc>,
        next_run_at: Option<DateTime<Utc>>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE routines SET last_run_at = $1, next_run_at = $2, updated_at = datetime('now','subsec') WHERE id = $3",
            now,
            next_run_at,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }
}
