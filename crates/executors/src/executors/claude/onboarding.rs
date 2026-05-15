//! Ensure `~/.claude.json` has `hasCompletedOnboarding: true` so Claude Code
//! skips its interactive onboarding when spawned as a child process.
//!
//! Some third-party providers leave the flag unset and the CLI then blocks
//! waiting for keyboard input that never arrives. We patch the flag once
//! per cdesktop process before the first spawn.

use std::{fs, io::Write, path::PathBuf, sync::OnceLock};

use serde_json::{Map, Value};

static ENSURED: OnceLock<()> = OnceLock::new();

/// Patch `~/.claude.json` so `hasCompletedOnboarding` is `true`. Idempotent
/// per process; only the first call does any IO. Failures are logged and
/// swallowed so a spawn is never blocked by a config-patching error.
pub fn ensure_completed() {
    ENSURED.get_or_init(|| {
        if let Err(err) = patch() {
            tracing::warn!(
                ?err,
                "Failed to ensure ~/.claude.json hasCompletedOnboarding"
            );
        }
    });
}

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude.json"))
}

fn patch() -> Result<(), String> {
    let path = config_path().ok_or_else(|| "no home directory".to_string())?;

    let mut obj: Map<String, Value> = match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Object(map)) => map,
            Ok(_) => {
                return Err(format!(
                    "{} is not a JSON object; refusing to overwrite",
                    path.display()
                ));
            }
            Err(e) => {
                return Err(format!(
                    "{} is malformed JSON ({e}); refusing to overwrite",
                    path.display()
                ));
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Map::new(),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    if obj.get("hasCompletedOnboarding") == Some(&Value::Bool(true)) {
        return Ok(());
    }
    obj.insert("hasCompletedOnboarding".to_string(), Value::Bool(true));

    let serialized =
        serde_json::to_vec_pretty(&Value::Object(obj)).map_err(|e| format!("serialize: {e}"))?;

    let tmp = path.with_extension("json.cdesktop-tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("create tmp: {e}"))?;
        f.write_all(&serialized)
            .map_err(|e| format!("write tmp: {e}"))?;
        f.sync_all().ok();
    }
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}
