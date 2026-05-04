use std::collections::HashMap;

use serde::Deserialize;

const CATALOG_JSON: &str = include_str!("provider_catalog.json");

#[derive(Debug, Clone, Deserialize)]
pub struct ProviderCatalog {
    pub schema_version: u32,
    pub cc_switch_source_sha: String,
    pub presets: Vec<CatalogPreset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogPreset {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub website_url: String,
    pub api_key_url: Option<String>,
    pub api_key_field: String,
    pub icon: Option<String>,
    pub icon_color: Option<String>,
    pub env: HashMap<String, String>,
    pub models_url: Option<String>,
    pub endpoint_candidates: Option<Vec<String>>,
}

pub fn load_catalog() -> &'static ProviderCatalog {
    use std::sync::OnceLock;
    static CATALOG: OnceLock<ProviderCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(CATALOG_JSON).expect("provider_catalog.json is malformed")
    })
}
