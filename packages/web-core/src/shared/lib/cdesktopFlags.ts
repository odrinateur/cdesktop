// cdesktop v1 feature flags. Flip to true to restore the corresponding
// upstream vibe-kanban surface. See plans/openspec-changes.md for context.

// Change #3 (hide-agent-picker): pin the UI to Claude Code only.
// When false: useExecutorConfig forces selected=CLAUDE_CODE, composer dropdown
// collapses, Settings > Agents limits the agents column to Claude Code.
export const SHOW_AGENT_PICKER = false;

// v1 out-of-scope: agent-driven "Start Review" feature (spawns a new inner
// session to review workspace changes). Not in v1 spec. When false: the
// StartReview action is hidden from the command bar and session toolbar.
export const SHOW_REVIEW_FEATURE = false;
