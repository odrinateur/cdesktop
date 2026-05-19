use db::models::provider::{AgentInjection, Provider};
use executors::profile::ExecutorConfig;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::ApiError;

/// Build the spawn-time provider injection (env vars + Codex overrides) for
/// a selected provider id. Mirrors what `workspaces::create::create_and_start_workspace`
/// builds before calling `start_workspace`; shared so the routine spawn path
/// behaves identically.
///
/// Mutates `executor_config.model_id` to apply the provider's opencode prefix
/// when applicable (no-op for non-opencode agents).
///
/// Returns the default (empty) injection when no provider id is supplied.
pub async fn build_injection_for_provider(
    pool: &SqlitePool,
    selected_provider_id: Option<Uuid>,
    executor_config: &mut ExecutorConfig,
) -> Result<AgentInjection, ApiError> {
    let Some(provider_id) = selected_provider_id else {
        return Ok(AgentInjection::default());
    };

    let provider = Provider::find_by_id(pool, provider_id)
        .await
        .map_err(|_| ApiError::BadRequest(format!("Provider '{provider_id}' not found")))?;
    if !provider.enabled {
        return Err(ApiError::BadRequest(format!(
            "Provider '{}' is disabled",
            provider.name
        )));
    }
    if let Some(m) = executor_config.model_id.as_deref() {
        executor_config.model_id =
            Some(provider.prefix_opencode_model_id(executor_config.executor, m));
    }
    let model_id = executor_config.model_id.as_deref().unwrap_or("");
    provider
        .build_agent_injection(executor_config.executor, model_id)
        .map_err(|e| ApiError::BadRequest(e.to_string()))
}
