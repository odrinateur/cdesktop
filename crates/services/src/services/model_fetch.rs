//! Fetches the available model list from an OpenAI-compatible /v1/models endpoint.
//!
//! Ported from cc-switch `src-tauri/src/services/model_fetch.rs` (MIT license,
//! farion1231/cc-switch @ 72ab8a5c). Logic is functionally identical; HTTP client
//! and error taxonomy adapted for cdesktop.

use std::time::Duration;

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchedModel {
    pub id: String,
    pub owned_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
    owned_by: Option<String>,
}

const FETCH_TIMEOUT_SECS: u64 = 15;
const ERROR_BODY_MAX_CHARS: usize = 512;

/// Compat suffixes stripped from base URL when building candidate endpoints.
/// Listed longest-first so longer matches take priority.
const KNOWN_COMPAT_SUFFIXES: &[&str] = &[
    "/api/claudecode",
    "/api/anthropic",
    "/apps/anthropic",
    "/api/coding",
    "/claudecode",
    "/anthropic",
    "/step_plan",
    "/coding",
    "/claude",
];

/// Fetch available models from the provider's endpoint.
///
/// `base_url` — the provider's ANTHROPIC_BASE_URL value.
/// `api_key`  — bearer token; required.
/// `models_url_override` — if Some, skip candidate generation and use this URL directly.
pub async fn fetch_models(
    base_url: &str,
    api_key: &str,
    models_url_override: Option<&str>,
) -> Result<Vec<FetchedModel>, String> {
    if api_key.is_empty() {
        return Err("API key is required to fetch models".to_string());
    }

    let candidates = build_models_url_candidates(base_url, models_url_override)?;
    let client = reqwest::Client::new();
    let mut last_err: Option<String> = None;

    for url in &candidates {
        tracing::debug!(url = %url, "trying model list endpoint");
        let response = match client
            .get(url)
            .header("Authorization", format!("Bearer {api_key}"))
            .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return Err(format!("Request failed: {e}")),
        };

        let status = response.status();

        if status.is_success() {
            let resp: ModelsResponse = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse response: {e}"))?;

            let mut models: Vec<FetchedModel> = resp
                .data
                .unwrap_or_default()
                .into_iter()
                .map(|m| FetchedModel {
                    id: m.id,
                    owned_by: m.owned_by,
                })
                .collect();

            models.sort_by(|a, b| a.id.cmp(&b.id));
            return Ok(models);
        }

        if status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED {
            let body = truncate_body(response.text().await.unwrap_or_default());
            last_err = Some(format!("HTTP {status}: {body}"));
            continue;
        }

        let body = truncate_body(response.text().await.unwrap_or_default());
        return Err(format!("HTTP {status}: {body}"));
    }

    Err(format!(
        "All candidates failed: {}",
        last_err.unwrap_or_else(|| "no candidates".to_string())
    ))
}

/// Build the ordered list of candidate model-list URLs for a given base URL.
pub fn build_models_url_candidates(
    base_url: &str,
    models_url_override: Option<&str>,
) -> Result<Vec<String>, String> {
    if let Some(raw) = models_url_override {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Ok(vec![trimmed.to_string()]);
        }
    }

    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is empty".to_string());
    }

    let mut candidates: Vec<String> = Vec::new();

    let primary = if trimmed.ends_with("/v1") {
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    };
    candidates.push(primary);

    if let Some(stripped) = strip_compat_suffix(trimmed) {
        let root = stripped.trim_end_matches('/');
        if !root.is_empty() && root.contains("://") {
            candidates.push(format!("{root}/v1/models"));
            candidates.push(format!("{root}/models"));
        }
    }

    // Deduplicate, preserving insertion order.
    let mut unique: Vec<String> = Vec::with_capacity(candidates.len());
    for url in candidates {
        if !unique.iter().any(|u| u == &url) {
            unique.push(url);
        }
    }

    Ok(unique)
}

fn truncate_body(body: String) -> String {
    if body.chars().count() <= ERROR_BODY_MAX_CHARS {
        body
    } else {
        let mut s: String = body.chars().take(ERROR_BODY_MAX_CHARS).collect();
        s.push('…');
        s
    }
}

fn strip_compat_suffix(base_url: &str) -> Option<&str> {
    for suffix in KNOWN_COMPAT_SUFFIXES {
        if base_url.ends_with(*suffix) {
            return Some(&base_url[..base_url.len() - suffix.len()]);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_plain_root() {
        let c = build_models_url_candidates("https://api.siliconflow.cn", None).unwrap();
        assert_eq!(c, vec!["https://api.siliconflow.cn/v1/models"]);
    }

    #[test]
    fn candidates_trailing_slash() {
        let c = build_models_url_candidates("https://api.example.com/", None).unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/models"]);
    }

    #[test]
    fn candidates_with_v1() {
        let c = build_models_url_candidates("https://api.example.com/v1", None).unwrap();
        assert_eq!(c, vec!["https://api.example.com/v1/models"]);
    }

    #[test]
    fn candidates_empty() {
        assert!(build_models_url_candidates("", None).is_err());
    }

    #[test]
    fn candidates_override_returns_single() {
        let c = build_models_url_candidates(
            "https://api.deepseek.com/anthropic",
            Some("https://api.deepseek.com/models"),
        )
        .unwrap();
        assert_eq!(c, vec!["https://api.deepseek.com/models"]);
    }

    #[test]
    fn candidates_override_empty_falls_through() {
        let c = build_models_url_candidates("https://api.siliconflow.cn", Some("   ")).unwrap();
        assert_eq!(c, vec!["https://api.siliconflow.cn/v1/models"]);
    }

    #[test]
    fn candidates_deepseek_strip_anthropic() {
        let c = build_models_url_candidates("https://api.deepseek.com/anthropic", None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.deepseek.com/anthropic/v1/models",
                "https://api.deepseek.com/v1/models",
                "https://api.deepseek.com/models",
            ]
        );
    }

    #[test]
    fn candidates_zhipu_strip_api_anthropic() {
        let c =
            build_models_url_candidates("https://open.bigmodel.cn/api/anthropic", None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://open.bigmodel.cn/api/anthropic/v1/models",
                "https://open.bigmodel.cn/v1/models",
                "https://open.bigmodel.cn/models",
            ]
        );
    }

    #[test]
    fn candidates_longer_suffix_wins() {
        let c = build_models_url_candidates("https://api.z.ai/api/anthropic", None).unwrap();
        assert_eq!(
            c,
            vec![
                "https://api.z.ai/api/anthropic/v1/models",
                "https://api.z.ai/v1/models",
                "https://api.z.ai/models",
            ]
        );
    }

    #[test]
    fn candidates_openrouter_no_strip() {
        let c = build_models_url_candidates("https://openrouter.ai/api", None).unwrap();
        assert_eq!(c, vec!["https://openrouter.ai/api/v1/models"]);
    }

    #[test]
    fn candidates_deduplicate() {
        let c = build_models_url_candidates("https://host.example.com", None).unwrap();
        assert_eq!(c.len(), 1);
    }
}
