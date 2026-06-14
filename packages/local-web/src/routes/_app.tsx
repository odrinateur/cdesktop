import { useEffect, type ReactNode } from 'react';
import {
  createFileRoute,
  useParams,
  useLocation,
} from '@tanstack/react-router';
import { Provider as NiceModalProvider } from '@ebay/nice-modal-react';
import { SequenceTrackerProvider } from '@/shared/keyboard/SequenceTracker';
import { SequenceIndicator } from '@/shared/keyboard/SequenceIndicator';
import { useWorkspaceShortcuts } from '@/shared/keyboard/useWorkspaceShortcuts';
import { useIssueShortcuts } from '@/shared/keyboard/useIssueShortcuts';
import {
  useKeyShowHelp,
  useKeyToggleLeftSidebar,
  useKeyNewFromCurrent,
  Scope,
} from '@/shared/keyboard';
import { KeyboardShortcutsDialog } from '@/shared/dialogs/shared/KeyboardShortcutsDialog';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { useActions } from '@/shared/hooks/useActions';
import { Actions } from '@/shared/actions';
import { ReleaseNotesDialog } from '@/shared/dialogs/global/ReleaseNotesDialog';
import { TerminalProvider } from '@/shared/providers/TerminalProvider';
import { HostIdProvider } from '@/shared/providers/HostIdProvider';
import { LiveSessionFollowerProvider } from '@/shared/providers/LiveSessionFollowerProvider';
import { WorkspaceProvider } from '@/shared/providers/WorkspaceProvider';
import { ExecutionProcessesProvider } from '@/shared/providers/ExecutionProcessesProvider';
import { LogsPanelProvider } from '@/shared/providers/LogsPanelProvider';
import { ActionsProvider } from '@/shared/providers/ActionsProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { SharedAppLayout } from '@/shared/components/ui-new/containers/SharedAppLayout';

function KeyboardShortcutsHandler() {
  const { executeAction } = useActions();
  const { workspaceId } = useWorkspaceContext();

  useKeyShowHelp(
    () => {
      KeyboardShortcutsDialog.show();
    },
    { scope: Scope.GLOBAL }
  );

  const globalHotkeyOptions = {
    scope: Scope.GLOBAL,
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  } as const;

  useKeyToggleLeftSidebar(() => {
    useUiPreferencesStore.getState().toggleLeftSidebar();
  }, globalHotkeyOptions);

  // Cmd/Ctrl+, must match the comma CHARACTER, not the US-QWERTY physical
  // key position that react-hotkeys-hook uses by default (event.code). On
  // AZERTY/Dvorak/etc. the US comma position produces a different character,
  // so we bind via event.key here.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== ',') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      e.preventDefault();
      SettingsDialog.show();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useKeyNewFromCurrent(() => {
    if (workspaceId) {
      void executeAction(Actions.DuplicateWorkspace, workspaceId);
    } else {
      void executeAction(Actions.NewWorkspace);
    }
  }, globalHotkeyOptions);

  useWorkspaceShortcuts();
  useIssueShortcuts();
  return null;
}

function ReleaseNotesHandler() {
  const { config, updateAndSaveConfig } = useUserSystem();
  const location = useLocation();

  useEffect(() => {
    if (!config || !config.remote_onboarding_acknowledged) return;

    const pathname = location.pathname;
    if (pathname.startsWith('/onboarding')) {
      return;
    }

    let cancelled = false;

    const showReleaseNotes = async () => {
      if (config.show_release_notes) {
        await ReleaseNotesDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ show_release_notes: false });
        }
        ReleaseNotesDialog.hide();
      }
    };

    void showReleaseNotes();

    return () => {
      cancelled = true;
    };
  }, [config, updateAndSaveConfig, location.pathname]);

  return null;
}

function ExecutionProcessesProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  const { selectedSessionId } = useWorkspaceContext();

  return (
    <ExecutionProcessesProvider sessionId={selectedSessionId}>
      {children}
    </ExecutionProcessesProvider>
  );
}

function AppRouteProviders({ children }: { children: ReactNode }) {
  return (
    <HostIdProvider>
      <LiveSessionFollowerProvider>
        <WorkspaceProvider>
          <ExecutionProcessesProviderWrapper>
            <LogsPanelProvider>
              <ActionsProvider>
                {/* NiceModal renders dialogs as siblings of children at the
                    Provider level, so it must be inside all providers that
                    dialogs depend on (Workspace, Actions, etc.). */}
                <NiceModalProvider>{children}</NiceModalProvider>
              </ActionsProvider>
            </LogsPanelProvider>
          </ExecutionProcessesProviderWrapper>
        </WorkspaceProvider>
      </LiveSessionFollowerProvider>
    </HostIdProvider>
  );
}

function AppLayoutRouteComponent() {
  const { hostId } = useParams({ strict: false });

  return (
    <AppRouteProviders key={hostId ?? 'local'}>
      <ReleaseNotesHandler />
      <SequenceTrackerProvider>
        <SequenceIndicator />
        <KeyboardShortcutsHandler />
        <TerminalProvider>
          <SharedAppLayout />
        </TerminalProvider>
      </SequenceTrackerProvider>
    </AppRouteProviders>
  );
}

export const Route = createFileRoute('/_app')({
  component: AppLayoutRouteComponent,
});
