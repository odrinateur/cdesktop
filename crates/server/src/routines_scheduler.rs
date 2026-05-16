use std::time::Duration;

use chrono::{Local, Utc};
use db::models::{
    routine::Routine,
    routine_run::{RoutineRun, RoutineRunStatus},
};
use tokio::time::interval;
use uuid::Uuid;

use crate::{DeploymentImpl, routes::routines::spawn_routine_run, scheduling::compute_next_run_at};

const TICK_INTERVAL: Duration = Duration::from_secs(60);

/// Spawn the in-process routine scheduler. On boot it records skipped rows for
/// any enabled routine whose `next_run_at` is in the past, then settles into a
/// 60s tick loop that fires due routines.
pub fn spawn(deployment: DeploymentImpl) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(e) = handle_boot_missed_runs(&deployment).await {
            tracing::error!("Routine scheduler boot handler failed: {:?}", e);
        }
        run_loop(deployment).await;
    })
}

async fn run_loop(deployment: DeploymentImpl) {
    let mut ticker = interval(TICK_INTERVAL);
    // First tick fires immediately; skip it so the boot-handler isn't doubled.
    ticker.tick().await;
    loop {
        ticker.tick().await;
        if let Err(e) = tick_once(&deployment).await {
            tracing::error!("Routine scheduler tick failed: {:?}", e);
        }
    }
}

async fn tick_once(deployment: &DeploymentImpl) -> Result<(), sqlx::Error> {
    use deployment::Deployment;
    let pool = &deployment.db().pool;
    let now = Utc::now();
    let due = Routine::find_due(pool, now).await?;
    for routine in due {
        let routine_id = routine.id;
        if let Err(e) = fire_routine(deployment, &routine).await {
            tracing::error!("Failed to fire routine {}: {:?}", routine_id, e);
        }
        // Always advance next_run_at, whether the fire succeeded or skipped.
        let advance_from = Local::now() + chrono::Duration::seconds(1);
        let next = compute_next_run_at(
            routine.schedule_kind,
            routine.schedule_time.as_deref(),
            routine.schedule_dow,
            routine.enabled,
            advance_from,
        );
        if let Err(e) = Routine::mark_fired(pool, routine_id, now, next).await {
            tracing::error!(
                "Failed to advance next_run_at for routine {}: {:?}",
                routine_id,
                e
            );
        }
    }
    Ok(())
}

async fn fire_routine(deployment: &DeploymentImpl, routine: &Routine) -> anyhow::Result<()> {
    use deployment::Deployment;
    let pool = &deployment.db().pool;
    let now = Utc::now();
    let run_id = Uuid::new_v4();

    if RoutineRun::has_running(pool, routine.id).await? {
        RoutineRun::create(
            pool,
            run_id,
            routine.id,
            now,
            RoutineRunStatus::Skipped,
            Some("prev_still_running".to_string()),
        )
        .await?;
        return Ok(());
    }

    let run = RoutineRun::create(
        pool,
        run_id,
        routine.id,
        now,
        RoutineRunStatus::Pending,
        None,
    )
    .await?;
    if let Err(e) = spawn_routine_run(deployment, routine, run.id).await {
        tracing::error!("Routine run spawn failed: {:?}", e);
        RoutineRun::mark_done(pool, run.id, Utc::now(), true).await?;
    }
    Ok(())
}

/// Boot-time pass: write one skipped row per overdue enabled routine, then
/// advance `next_run_at` to the next future slot. Single row regardless of how
/// many slots were missed (per plan §3, Q20 = #1).
async fn handle_boot_missed_runs(deployment: &DeploymentImpl) -> Result<(), sqlx::Error> {
    use deployment::Deployment;
    let pool = &deployment.db().pool;
    let now = Utc::now();
    let overdue = Routine::find_due(pool, now).await?;
    if overdue.is_empty() {
        return Ok(());
    }
    tracing::info!(
        "Routine scheduler: writing {} skipped row(s) for missed runs at boot",
        overdue.len()
    );
    for routine in overdue {
        let scheduled_at = routine.next_run_at.unwrap_or(now);
        let run_id = Uuid::new_v4();
        if let Err(e) = RoutineRun::create(
            pool,
            run_id,
            routine.id,
            scheduled_at,
            RoutineRunStatus::Skipped,
            Some("app_offline".to_string()),
        )
        .await
        {
            tracing::error!(
                "Failed to write boot-skip row for routine {}: {:?}",
                routine.id,
                e
            );
        }
        let advance_from = Local::now();
        let next = compute_next_run_at(
            routine.schedule_kind,
            routine.schedule_time.as_deref(),
            routine.schedule_dow,
            routine.enabled,
            advance_from,
        );
        if let Err(e) = Routine::set_next_run_at(pool, routine.id, next).await {
            tracing::error!(
                "Failed to advance next_run_at after boot-skip for routine {}: {:?}",
                routine.id,
                e
            );
        }
    }
    Ok(())
}
