//! Per-agent provider payload types, shared between the catalog
//! (`provider_catalog.rs`, immutable cdesktop-shipped data) and the user
//! `Provider` record (`models/provider.rs`, mutable user-saved data).
//!
//! Shape and field semantics match plan §3.2.
//!
//! Each payload carries an optional `api_key` override. When present, the
//! spawn-time applier prefers it over the top-level `Provider::api_key`. This
//! handles aggregators (e.g. Packy Code) that issue distinct keys per agent
//! while keeping the common case (one key for all agents) ergonomic.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ClaudePayload {
    pub api_key_field: Option<String>,
    pub base_url: Option<String>,
    pub haiku_model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CodexPayload {
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OpencodePayload {
    pub npm: Option<String>,
    pub base_url: Option<String>,
    #[serde(default)]
    pub options: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DeepseekTuiPayload {
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GeminiPayload {
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HermesPayload {
    pub base_url: Option<String>,
    pub api_mode: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}
