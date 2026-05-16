use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

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
pub enum RoutineRunStatus {
    Pending,
    Running,
    Done,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct RoutineRun {
    pub id: Uuid,
    pub routine_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub scheduled_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub status: RoutineRunStatus,
    pub skip_reason: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl RoutineRun {
    pub async fn list_by_routine(
        pool: &SqlitePool,
        routine_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            RoutineRun,
            r#"SELECT id AS "id!: Uuid",
                      routine_id AS "routine_id!: Uuid",
                      workspace_id AS "workspace_id: Uuid",
                      scheduled_at AS "scheduled_at!: DateTime<Utc>",
                      started_at AS "started_at: DateTime<Utc>",
                      finished_at AS "finished_at: DateTime<Utc>",
                      status AS "status!: RoutineRunStatus",
                      skip_reason,
                      created_at AS "created_at!: DateTime<Utc>"
               FROM routine_runs
               WHERE routine_id = $1
               ORDER BY scheduled_at DESC"#,
            routine_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            RoutineRun,
            r#"SELECT id AS "id!: Uuid",
                      routine_id AS "routine_id!: Uuid",
                      workspace_id AS "workspace_id: Uuid",
                      scheduled_at AS "scheduled_at!: DateTime<Utc>",
                      started_at AS "started_at: DateTime<Utc>",
                      finished_at AS "finished_at: DateTime<Utc>",
                      status AS "status!: RoutineRunStatus",
                      skip_reason,
                      created_at AS "created_at!: DateTime<Utc>"
               FROM routine_runs
               WHERE rowid = $1"#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            RoutineRun,
            r#"SELECT id AS "id!: Uuid",
                      routine_id AS "routine_id!: Uuid",
                      workspace_id AS "workspace_id: Uuid",
                      scheduled_at AS "scheduled_at!: DateTime<Utc>",
                      started_at AS "started_at: DateTime<Utc>",
                      finished_at AS "finished_at: DateTime<Utc>",
                      status AS "status!: RoutineRunStatus",
                      skip_reason,
                      created_at AS "created_at!: DateTime<Utc>"
               FROM routine_runs
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn has_running(pool: &SqlitePool, routine_id: Uuid) -> Result<bool, sqlx::Error> {
        let row = sqlx::query!(
            r#"SELECT EXISTS(
                 SELECT 1 FROM routine_runs
                 WHERE routine_id = $1 AND status IN ('pending','running')
               ) AS "exists!: bool""#,
            routine_id
        )
        .fetch_one(pool)
        .await?;
        Ok(row.exists)
    }

    pub async fn create(
        pool: &SqlitePool,
        id: Uuid,
        routine_id: Uuid,
        scheduled_at: DateTime<Utc>,
        status: RoutineRunStatus,
        skip_reason: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        let status_str = status.to_string();
        sqlx::query_as!(
            RoutineRun,
            r#"INSERT INTO routine_runs (id, routine_id, scheduled_at, status, skip_reason)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id AS "id!: Uuid",
                         routine_id AS "routine_id!: Uuid",
                         workspace_id AS "workspace_id: Uuid",
                         scheduled_at AS "scheduled_at!: DateTime<Utc>",
                         started_at AS "started_at: DateTime<Utc>",
                         finished_at AS "finished_at: DateTime<Utc>",
                         status AS "status!: RoutineRunStatus",
                         skip_reason,
                         created_at AS "created_at!: DateTime<Utc>""#,
            id,
            routine_id,
            scheduled_at,
            status_str,
            skip_reason
        )
        .fetch_one(pool)
        .await
    }

    pub async fn attach_workspace(
        pool: &SqlitePool,
        id: Uuid,
        workspace_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE routine_runs SET workspace_id = $1 WHERE id = $2",
            workspace_id,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn mark_running(
        pool: &SqlitePool,
        id: Uuid,
        now: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE routine_runs SET status = 'running', started_at = $1 WHERE id = $2",
            now,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn mark_done(
        pool: &SqlitePool,
        id: Uuid,
        now: DateTime<Utc>,
        failed: bool,
    ) -> Result<(), sqlx::Error> {
        let status = if failed { "failed" } else { "done" };
        sqlx::query!(
            "UPDATE routine_runs SET status = $1, finished_at = $2 WHERE id = $3",
            status,
            now,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Find the most recent non-terminal (pending / running) run attached to
    /// the given workspace. Used by the container's completion hook to mark
    /// a routine run done when its workspace finishes.
    pub async fn find_active_by_workspace(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            RoutineRun,
            r#"SELECT id AS "id!: Uuid",
                      routine_id AS "routine_id!: Uuid",
                      workspace_id AS "workspace_id: Uuid",
                      status AS "status!: RoutineRunStatus",
                      scheduled_at AS "scheduled_at!: DateTime<Utc>",
                      started_at AS "started_at: DateTime<Utc>",
                      finished_at AS "finished_at: DateTime<Utc>",
                      skip_reason,
                      created_at AS "created_at!: DateTime<Utc>"
               FROM routine_runs
               WHERE workspace_id = $1
                 AND status IN ('pending', 'running')
               ORDER BY created_at DESC
               LIMIT 1"#,
            workspace_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn workspace_ids_for_routine(
        pool: &SqlitePool,
        routine_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT workspace_id AS "workspace_id!: Uuid"
               FROM routine_runs
               WHERE routine_id = $1 AND workspace_id IS NOT NULL"#,
            routine_id
        )
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }

    pub async fn run_count_for_routine(
        pool: &SqlitePool,
        routine_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            r#"SELECT COUNT(*) AS "count!: i64" FROM routine_runs WHERE routine_id = $1"#,
            routine_id
        )
        .fetch_one(pool)
        .await?;
        Ok(row.count)
    }
}
