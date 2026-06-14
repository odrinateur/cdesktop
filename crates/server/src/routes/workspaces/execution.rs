use axum::{
    Extension, Router,
    extract::State,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    session::{CreateSession, Session},
    workspace::Workspace,
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use executors::actions::{
    ExecutorAction, ExecutorActionType,
    script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RunScriptError {
    NoScriptConfigured,
    ProcessAlreadyRunning,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/dev-server/start", post(start_dev_server))
        .route("/cleanup", post(run_cleanup_script))
        .route("/archive", post(run_archive_script))
        .route("/stop", post(stop_workspace_execution))
        .route("/package-scripts", get(list_package_scripts))
        .route("/project-script", post(run_project_script))
        .route("/project-script/stop", post(stop_project_script))
}

#[axum::debug_handler]
pub async fn start_dev_server(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcess>>>, ApiError> {
    let pool = &deployment.db().pool;

    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_workspace(pool, workspace.id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for workspace {}: {}",
                    workspace.id,
                    e
                );
                return Err(ApiError::Workspace(
                    db::models::workspace::WorkspaceError::ValidationError(e.to_string()),
                ));
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for workspace {}",
            dev_server.id,
            workspace.id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        }
    }

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let repos_with_dev_script: Vec<_> = repos
        .iter()
        .filter(|r| r.dev_server_script.as_ref().is_some_and(|s| !s.is_empty()))
        .collect();

    if repos_with_dev_script.is_empty() {
        return Ok(ResponseJson(ApiResponse::error(
            "No dev server script configured for any repository in this workspace",
        )));
    }

    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: Some("dev-server".to_string()),
                    name: None,
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let mut execution_processes = Vec::new();
    for repo in repos_with_dev_script {
        // In worktree mode, the process cwd is the container root and the
        // dev-server script runs in the per-repo subdir. In direct mode the
        // cwd is already the repo root, so no subdir offset is needed.
        let working_dir = if workspace.use_worktree {
            Some(repo.name.clone())
        } else {
            None
        };
        let executor_action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: repo.dev_server_script.clone().unwrap(),
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::DevServer,
                working_dir,
                label: None,
            }),
            None,
        );

        let execution_process = deployment
            .container()
            .start_execution(
                &workspace,
                &session,
                &executor_action,
                &ExecutionProcessRunReason::DevServer,
            )
            .await?;
        execution_processes.push(execution_process);
    }

    deployment
        .track_if_analytics_allowed(
            "dev_server_started",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_processes)))
}

pub async fn stop_workspace_execution(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().try_stop(&workspace, false).await;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_stopped",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn run_cleanup_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Cleanup scripts assume a managed worktree; in direct mode the script's
    // `working_dir: Some(repo.name)` would resolve to `repo.path/<repo.name>`
    // (nonexistent). Refuse cleanly rather than running against a broken cwd.
    if !workspace.use_worktree {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::NoScriptConfigured,
        )));
    }

    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().cleanup_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };

    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: None,
                    name: None,
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::CleanupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "cleanup_script_executed",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn run_archive_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().archive_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };
    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: None,
                    name: None,
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::ArchiveScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "archive_script_executed",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[derive(Debug, Serialize, TS)]
pub struct PackageScript {
    pub name: String,
    pub command: String,
}

#[derive(Debug, Serialize, TS)]
pub struct PackageScriptsForRepo {
    pub repo_id: Uuid,
    /// Internal repo name (worktree subdirectory). Used by the frontend to
    /// match running processes back to their navbar button.
    pub repo_name: String,
    /// Human-friendly repo name shown in tooltips.
    pub repo_display_name: String,
    /// Detected package manager (npm / pnpm / yarn / bun) based on lockfile.
    pub package_manager: String,
    pub scripts: Vec<PackageScript>,
}

fn detect_package_manager(repo_path: &std::path::Path) -> &'static str {
    if repo_path.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if repo_path.join("yarn.lock").exists() {
        "yarn"
    } else if repo_path.join("bun.lockb").exists() || repo_path.join("bun.lock").exists() {
        "bun"
    } else {
        "npm"
    }
}

fn read_package_scripts(repo_path: &std::path::Path) -> Vec<PackageScript> {
    let pkg_path = repo_path.join("package.json");
    let Ok(contents) = std::fs::read_to_string(&pkg_path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return Vec::new();
    };
    let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) else {
        return Vec::new();
    };
    scripts
        .iter()
        .filter_map(|(name, value)| {
            value.as_str().map(|cmd| PackageScript {
                name: name.clone(),
                command: cmd.to_string(),
            })
        })
        .collect()
}

#[axum::debug_handler]
pub async fn list_package_scripts(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<PackageScriptsForRepo>>>, ApiError> {
    let pool = &deployment.db().pool;
    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;

    let result = repos
        .into_iter()
        .map(|repo| {
            let scripts = read_package_scripts(&repo.path);
            let package_manager = detect_package_manager(&repo.path).to_string();
            PackageScriptsForRepo {
                repo_id: repo.id,
                repo_name: repo.name.clone(),
                repo_display_name: repo.display_name.clone(),
                package_manager,
                scripts,
            }
        })
        .collect();

    Ok(ResponseJson(ApiResponse::success(result)))
}

#[derive(Debug, Deserialize, TS)]
pub struct RunProjectScriptRequest {
    pub repo_id: Uuid,
    pub script_name: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RunProjectScriptError {
    RepoNotInWorkspace,
    ScriptNotFound,
    AlreadyRunning,
}

#[axum::debug_handler]
pub async fn run_project_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Json(payload): axum::extract::Json<RunProjectScriptRequest>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunProjectScriptError>>, ApiError> {
    let pool = &deployment.db().pool;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let Some(repo) = repos.into_iter().find(|r| r.id == payload.repo_id) else {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunProjectScriptError::RepoNotInWorkspace,
        )));
    };

    let scripts = read_package_scripts(&repo.path);
    if !scripts.iter().any(|s| s.name == payload.script_name) {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunProjectScriptError::ScriptNotFound,
        )));
    }

    // Refuse to start a duplicate (same repo + same script_name) when one is
    // already running for this workspace. Multiple distinct scripts in
    // parallel are fine.
    let running =
        ExecutionProcess::find_running_project_scripts_by_workspace(pool, workspace.id).await?;
    let already_running = running
        .iter()
        .any(|process| match process.executor_action() {
            Ok(action) => match action.typ() {
                ExecutorActionType::ScriptRequest(req) => {
                    req.label.as_deref() == Some(payload.script_name.as_str())
                        && req.working_dir.as_deref() == Some(repo.name.as_str())
                }
                _ => false,
            },
            Err(_) => false,
        });
    if already_running {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunProjectScriptError::AlreadyRunning,
        )));
    }

    let package_manager = detect_package_manager(&repo.path);
    let script_command = format!("{} run {}", package_manager, payload.script_name);

    let working_dir = if workspace.use_worktree {
        Some(repo.name.clone())
    } else {
        None
    };

    let executor_action = ExecutorAction::new(
        ExecutorActionType::ScriptRequest(ScriptRequest {
            script: script_command,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ProjectScript,
            working_dir,
            label: Some(payload.script_name.clone()),
        }),
        None,
    );

    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: Some("project-script".to_string()),
                    name: None,
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::ProjectScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "project_script_executed",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "script_name": payload.script_name,
                "package_manager": package_manager,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[derive(Debug, Deserialize, TS)]
pub struct StopProjectScriptRequest {
    pub execution_process_id: Uuid,
}

#[axum::debug_handler]
pub async fn stop_project_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Json(payload): axum::extract::Json<StopProjectScriptRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let Some(process) = ExecutionProcess::find_by_id(pool, payload.execution_process_id).await?
    else {
        return Ok(ResponseJson(ApiResponse::error("Process not found")));
    };

    // Make sure the process belongs to this workspace before stopping it.
    let session = Session::find_by_id(pool, process.session_id).await?;
    let belongs_to_workspace = session
        .as_ref()
        .is_some_and(|s| s.workspace_id == workspace.id);
    if !belongs_to_workspace || process.run_reason != ExecutionProcessRunReason::ProjectScript {
        return Ok(ResponseJson(ApiResponse::error(
            "Process does not belong to this workspace",
        )));
    }

    if let Err(e) = deployment
        .container()
        .stop_execution(&process, ExecutionProcessStatus::Killed)
        .await
    {
        tracing::error!("Failed to stop project script {}: {}", process.id, e);
        return Ok(ResponseJson(ApiResponse::error(
            "Failed to stop project script",
        )));
    }

    Ok(ResponseJson(ApiResponse::success(())))
}
