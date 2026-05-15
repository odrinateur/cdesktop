//! Install the bundled `cdesktop` skill into `~/.agent/skills/cdesktop/` at
//! server startup, then create symlinks into every supported agent's
//! per-user config directory.
//!
//! - Canonical location: `~/.agent/skills/cdesktop/SKILL.md`. Always
//!   overwritten so the bundled markdown is the source of truth (users
//!   wanting persistent overrides can keep them in a separate `*.local.md`).
//! - Symlinks: idempotent. If a target already points at our canonical
//!   path, it is left alone. If it points elsewhere we leave it alone too
//!   — never clobber user content.
//! - If the parent directory does not exist (e.g. the user has not
//!   installed Cursor), we skip silently.
//! - On Windows we fall back to a file copy when `symlink` fails — the OS
//!   gates symlinks behind developer mode.
//!
//! Called from `main` once at boot. Errors are logged and not fatal — the
//! server keeps running even if skill install fails.

use std::path::{Path, PathBuf};

use utils::assets::SkillAssets;

/// Per-user agent-config dirs we install a symlink into. The directory
/// must already exist on the user's machine — we never create the parent
/// (that's the agent's job).
fn agent_skill_dirs(home: &Path) -> Vec<PathBuf> {
    // The Claude Code / Hermes mappings ship in cdesktop's `npx skills`
    // story; the rest mirror the install paths from
    // <https://github.com/anthropics/skills>. Add or rename entries here
    // when an agent changes its on-disk config layout.
    [
        ".agent/skills",       // canonical
        ".claude/skills",      // Claude Code
        ".hermes/skills",      // Hermes
        ".amp/skills",         // Amp
        ".antigravity/skills", // Antigravity
        ".cline/skills",       // Cline
        ".codex/skills",       // Codex
        ".cursor/skills",      // Cursor
        ".deep-agents/skills", // Deep Agents
        ".dexto/skills",       // Dexto
        ".firebender/skills",  // Firebender
        ".gemini/skills",      // Gemini CLI
        ".copilot/skills",     // GitHub Copilot
        ".kimi/skills",        // Kimi Code CLI
        ".opencode/skills",    // OpenCode
        ".warp/skills",        // Warp
    ]
    .iter()
    .map(|p| home.join(p))
    .collect()
}

pub fn install() {
    let Some(home) = dirs::home_dir() else {
        tracing::warn!("Skipping skill install: no home directory");
        return;
    };

    let canonical_dir = home.join(".agent/skills/cdesktop");
    match write_canonical(&canonical_dir) {
        Ok(written) => tracing::debug!(?canonical_dir, files = written, "skill installed"),
        Err(e) => {
            tracing::warn!(error = %e, "Failed to install canonical skill; aborting symlink phase");
            return;
        }
    }

    for parent in agent_skill_dirs(&home) {
        // `.agent/skills/cdesktop` is the canonical install target — skip
        // linking it to itself.
        if parent == home.join(".agent/skills") {
            continue;
        }
        link_into(&parent, &canonical_dir);
    }
}

/// Write every bundled file under `assets/skills/cdesktop/` to
/// `target_dir`. Always overwrites — the cdesktop binary is the source
/// of truth for skill content.
fn write_canonical(target_dir: &Path) -> std::io::Result<usize> {
    std::fs::create_dir_all(target_dir)?;
    let prefix = "cdesktop/";
    let mut written = 0usize;
    for file in SkillAssets::iter() {
        let path = file.as_ref();
        let Some(rel) = path.strip_prefix(prefix) else {
            // Skip future skill bundles (e.g. `other-skill/SKILL.md`) — the
            // server only owns the canonical `cdesktop` skill for now.
            continue;
        };
        let Some(asset) = SkillAssets::get(path) else {
            continue;
        };
        let dest = target_dir.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&dest, asset.data.as_ref())?;
        written += 1;
    }
    Ok(written)
}

/// Create `<parent>/cdesktop` pointing at `canonical_dir`. Skipped when
/// `parent` does not exist (the user hasn't installed that agent). Never
/// overwrites user content.
fn link_into(parent: &Path, canonical_dir: &Path) {
    if !parent.exists() {
        tracing::trace!(?parent, "skipping skill symlink: parent absent");
        return;
    }
    let link_path = parent.join("cdesktop");

    // If the link already exists, leave it alone unless it's an obvious
    // stale link to our previous canonical path.
    if link_path.symlink_metadata().is_ok() {
        match std::fs::read_link(&link_path) {
            Ok(existing) if existing == canonical_dir => {
                tracing::trace!(?link_path, "skill symlink already current");
            }
            Ok(_) | Err(_) => {
                tracing::trace!(?link_path, "skill symlink exists; leaving as-is");
            }
        }
        return;
    }

    let result = make_link(canonical_dir, &link_path);
    match result {
        Ok(()) => tracing::debug!(?link_path, "skill symlink created"),
        Err(e) => tracing::warn!(error = %e, ?link_path, "failed to create skill symlink"),
    }
}

#[cfg(unix)]
fn make_link(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dst)
}

#[cfg(windows)]
fn make_link(src: &Path, dst: &Path) -> std::io::Result<()> {
    // Windows requires developer mode (or admin) to create a directory
    // symlink. Fall back to copying every file if `symlink_dir` fails.
    match std::os::windows::fs::symlink_dir(src, dst) {
        Ok(()) => Ok(()),
        Err(e) => {
            tracing::debug!(error = %e, "symlink_dir failed on Windows; falling back to copy");
            copy_dir_recursive(src, dst)
        }
    }
}

#[cfg(windows)]
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    /// `write_canonical` is idempotent and always overwrites stale content.
    #[test]
    fn canonical_writes_skill_and_overwrites() {
        let tmp = tempdir().unwrap();
        let dir = tmp.path().join(".agent/skills/cdesktop");

        // Seed with a stale file so we can verify overwrite semantics.
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), b"stale").unwrap();

        let written = write_canonical(&dir).unwrap();
        assert!(written >= 1, "expected at least one bundled skill file");

        let written_content = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
        assert!(
            written_content.contains("cdesktop"),
            "expected bundled SKILL.md to overwrite stale content"
        );
        assert_ne!(written_content, "stale");

        // Second call is a no-op in observable outcome: same content
        // present after re-running.
        let again = write_canonical(&dir).unwrap();
        assert_eq!(written, again);
    }

    /// `link_into` silently skips when the parent dir does not exist.
    #[test]
    fn link_skipped_when_parent_absent() {
        let tmp = tempdir().unwrap();
        let canonical = tmp.path().join("canonical");
        std::fs::create_dir_all(&canonical).unwrap();

        let missing_parent = tmp.path().join("does-not-exist");
        link_into(&missing_parent, &canonical);

        assert!(
            !missing_parent.exists(),
            "link_into must not create the parent dir"
        );
    }

    /// When the parent exists, `link_into` creates a symlink (Unix) or
    /// directory copy (Windows) pointing at `canonical_dir`.
    #[cfg(unix)]
    #[test]
    fn link_created_when_parent_present() {
        let tmp = tempdir().unwrap();
        let canonical = tmp.path().join("canonical");
        std::fs::create_dir_all(&canonical).unwrap();
        std::fs::write(canonical.join("SKILL.md"), b"hello").unwrap();

        let parent = tmp.path().join(".some-agent/skills");
        std::fs::create_dir_all(&parent).unwrap();

        link_into(&parent, &canonical);

        let link = parent.join("cdesktop");
        let target = std::fs::read_link(&link).unwrap();
        assert_eq!(target, canonical);

        // Idempotent re-run.
        link_into(&parent, &canonical);
        let target2 = std::fs::read_link(&link).unwrap();
        assert_eq!(target2, canonical);
    }

    /// `link_into` does not clobber an existing entry (file, dir, or
    /// foreign symlink) at the target path.
    #[cfg(unix)]
    #[test]
    fn link_leaves_existing_user_content_alone() {
        let tmp = tempdir().unwrap();
        let canonical = tmp.path().join("canonical");
        std::fs::create_dir_all(&canonical).unwrap();

        let parent = tmp.path().join(".some-agent/skills");
        std::fs::create_dir_all(&parent).unwrap();
        // User-authored file at the target.
        let target = parent.join("cdesktop");
        std::fs::write(&target, b"my own skill").unwrap();

        link_into(&parent, &canonical);

        let after = std::fs::read_to_string(&target).unwrap();
        assert_eq!(after, "my own skill");
    }
}
