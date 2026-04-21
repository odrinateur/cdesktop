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

// Change #4 (hide-inner-sessions): upstream surfaces a "Sessions" switcher
// inside the workspace view (Latest/Previous, New/Rename Session) that maps
// to multiple agent attempts per workspace. v1 is one-conversation-per-
// session. When false: switcher markup in SessionChatBox is hidden, the
// "Multiple Sessions" workspaces-guide card is filtered out, and
// RenameSessionDialog becomes unreachable.
// See openspec/changes/hide-inner-sessions/ for scope.
export const SHOW_INNER_SESSION_SWITCHER = false;

// Change #4 (hide-inner-sessions): agent-driven "Resolve Conflicts" flow
// spawns a new inner session to fix merge conflicts. Not in v1 spec. When
// false: the ResolveConflicts action/trigger is hidden; users resolve via
// git in the Terminal pane or their shell.
// See openspec/changes/hide-inner-sessions/ for scope.
export const SHOW_RESOLVE_CONFLICTS = false;
