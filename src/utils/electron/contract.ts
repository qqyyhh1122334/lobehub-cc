import type * as Shared from '@lobechat/electron-client-ipc';
import type { SuperJSONResult } from 'superjson';

/**
 * Renderer wire contract pinned to upstream 049c81d53b0c2282eabf1edca2d90d58ad1f60f0.
 *
 * This intranet web distribution does not ship Electron. Keep only serializable
 * payload/result types here; importing the desktop controller registry pulls
 * Electron, subprocess launchers and desktop-only path aliases into the web build.
 * The companion bridge always rejects. These declarations preserve type checking
 * for shared UI code without making any desktop capability available at runtime.
 */
interface OperationResult {
  error?: string;
  success: boolean;
}

interface ProxyTestResult {
  message?: string;
  responseTime?: number;
  success: boolean;
}

type WindowTemplateIdentifiers = 'chatSingle' | 'topicPopup';
type OverlaySnapshotPayload = Pick<
  Shared.ScreenCaptureSession,
  'agents' | 'defaultAgentId' | 'defaultModelId' | 'defaultProvider' | 'models' | 'theme'
>;

interface StartSessionParams {
  /** Agent type key (e.g., 'claude-code'). Defaults to 'claude-code'. */
  agentType?: string;
  /** Additional CLI arguments */
  args?: string[];
  /** Command to execute */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Session ID to resume (for multi-turn) */
  resumeSessionId?: string;
}

interface StartSessionResult {
  sessionId: string;
}

interface SendPromptParams {
  /** Image attachments to include in the prompt (downloaded from url, cached by id) */
  imageList?: Array<{ id: string; url: string }>;
  /**
   * Renderer-side operation id stamped onto every emitted `AgentStreamEvent`.
   * Required: producer-side conversion is the V3 contract — by the time events
   * reach the renderer they must already carry the operation they belong to.
   */
  operationId: string;
  prompt: string;
  sessionId: string;
}

interface CancelSessionParams {
  sessionId: string;
}

interface SubmitInterventionParams {
  cancelled?: boolean;
  /** When set, signals user-cancelled or timeout — the bridge resolves with isError. */
  cancelReason?: 'timeout' | 'user_cancelled';
  /** Operation id stamped on the request the renderer is responding to. */
  operationId: string;
  /** Structured user answer; ignored when `cancelled` is true. */
  result?: unknown;
  /** Correlation key carried on the original `agent_intervention_request`. */
  toolCallId: string;
}

interface StopSessionParams {
  sessionId: string;
}

interface GetSessionInfoParams {
  sessionId: string;
}

interface SessionInfo {
  agentSessionId?: string;
}

export interface DesktopIpcServices {
  readonly auth: Readonly<{
    requestAuthorization(config: Shared.DataSyncConfig): Promise<OperationResult>;
    cancelAuthorization(): Promise<OperationResult>;
    requestMarketAuthorization(params: Shared.MarketAuthorizationParams): Promise<OperationResult>;
  }>;
  readonly windows: Readonly<{
    openSettingsWindow(
      options?: string | Shared.OpenSettingsWindowOptions,
    ): Promise<OperationResult>;
    closeWindow(): Promise<void>;
    minimizeWindow(): Promise<void>;
    maximizeWindow(): Promise<void>;
    isWindowMaximized(): Promise<boolean>;
    setWindowAlwaysOnTop(flag: boolean): Promise<void>;
    isWindowAlwaysOnTop(): Promise<boolean>;
    listTopicPopups(): Promise<Shared.TopicPopupInfo[]>;
    focusTopicPopup(params: Shared.FocusTopicPopupParams): Promise<boolean>;
    setWindowSize(params: Shared.WindowSizeParams): Promise<void>;
    setWindowMinimumSize(params: Shared.WindowMinimumSizeParams): Promise<void>;
    interceptRoute(params: Shared.InterceptRouteParams): Promise<Shared.InterceptRouteResponse>;
    createMultiInstanceWindow(params: {
      path: string;
      templateId: WindowTemplateIdentifiers;
      uniqueId?: string;
    }): Promise<OperationResult & { windowId?: string }>;
    getWindowsByTemplate(templateId: string): Promise<OperationResult & { windowIds?: string[] }>;
    closeWindowsByTemplate(templateId: string): Promise<OperationResult>;
  }>;
  readonly cli: Readonly<{
    runCliCommand(args: string): Promise<{ exitCode: number; stderr: string; stdout: string }>;
  }>;
  readonly devtools: Readonly<{
    openDevtools(): Promise<void>;
  }>;
  readonly gatewayConnection: Readonly<{
    connect(): Promise<{ error?: string; success: boolean }>;
    disconnect(): Promise<{ success: boolean }>;
    getConnectionStatus(): Promise<{ status: Shared.GatewayConnectionStatus }>;
    getDeviceInfo(): Promise<{
      description: string;
      deviceId: string;
      hostname: string;
      name: string;
      platform: string;
    }>;
    setDeviceName(params: { name: string }): Promise<{ success: boolean }>;
    setDeviceDescription(params: { description: string }): Promise<{ success: boolean }>;
  }>;
  readonly git: Readonly<{
    detectRepoType(dirPath: string): Promise<'git' | 'github' | undefined>;
    getGitBranch(dirPath: string): Promise<Shared.GitBranchInfo>;
    getLinkedPullRequest(payload: {
      branch: string;
      path: string;
    }): Promise<Shared.GitLinkedPullRequestResult>;
    listGitBranches(dirPath: string): Promise<Shared.GitBranchListItem[]>;
    listGitRemoteBranches(dirPath: string): Promise<Shared.GitRemoteBranchListItem[]>;
    getGitWorkingTreeStatus(dirPath: string): Promise<Shared.GitWorkingTreeStatus>;
    getGitWorkingTreeFiles(dirPath: string): Promise<Shared.GitWorkingTreeFiles>;
    getGitWorkingTreePatches(dirPath: string): Promise<Shared.GitWorkingTreePatches>;
    getGitBranchDiff(payload: Shared.GetGitBranchDiffPayload): Promise<Shared.GitBranchDiffPatches>;
    getGitAheadBehind(dirPath: string): Promise<Shared.GitAheadBehind>;
    checkoutGitBranch(payload: {
      branch: string;
      create?: boolean;
      path: string;
    }): Promise<Shared.GitCheckoutResult>;
    pullGitBranch(payload: { path: string }): Promise<Shared.GitPullResult>;
    pushGitBranch(payload: { path: string }): Promise<Shared.GitPushResult>;
    revertGitFile(payload: { filePath: string; path: string }): Promise<Shared.GitFileRevertResult>;
  }>;
  readonly heterogeneousAgent: Readonly<{
    startSession(params: StartSessionParams): Promise<StartSessionResult>;
    sendPrompt(params: SendPromptParams): Promise<void>;
    getSessionInfo(params: GetSessionInfoParams): Promise<SessionInfo>;
    cancelSession(params: CancelSessionParams): Promise<void>;
    stopSession(params: StopSessionParams): Promise<void>;
    respondPermission(): Promise<void>;
    submitIntervention(params: SubmitInterventionParams): Promise<void>;
  }>;
  readonly imessageBridge: Readonly<{
    getStatus(): Promise<Shared.ImessageBridgeStatus>;
    upsertConfig(config: Shared.ImessageBridgeConfig): Promise<Shared.ImessageBridgeSaveResult>;
    removeConfig(params: { applicationId: string }): Promise<{ success: boolean }>;
    start(): Promise<Shared.ImessageBridgeStatus>;
    stop(): Promise<{ success: boolean }>;
    testConfig(config: Shared.ImessageBridgeConfig): Promise<{ success: boolean }>;
  }>;
  readonly localSystem: Readonly<{
    handleOpenLocalFile(params: Shared.OpenLocalFileParams): Promise<{
      error?: string;
      success: boolean;
    }>;
    handleOpenLocalFolder(params: Shared.OpenLocalFolderParams): Promise<{
      error?: string;
      success: boolean;
    }>;
    handleShowOpenDialog(params: Shared.ShowOpenDialogParams): Promise<Shared.ShowOpenDialogResult>;
    handlePickFile(params: Shared.PickFileParams): Promise<Shared.PickFileResult>;
    handleShowSaveDialog(params: Shared.ShowSaveDialogParams): Promise<Shared.ShowSaveDialogResult>;
    readFiles(params: Shared.LocalReadFilesParams): Promise<Shared.LocalReadFileResult[]>;
    readFile(params: Shared.LocalReadFileParams): Promise<Shared.LocalReadFileResult>;
    listLocalFiles(
      params: Shared.ListLocalFileParams,
    ): Promise<{ files: Shared.LocalFileItem[]; totalCount: number }>;
    handleMoveFiles(
      params: Shared.MoveLocalFilesParams,
    ): Promise<Shared.LocalMoveFilesResultItem[]>;
    handleRenameFile(params: {
      newName: string;
      path: string;
    }): Promise<Shared.RenameLocalFileResult>;
    handleWriteFile(params: Shared.WriteLocalFileParams): Promise<OperationResult>;
    auditSafePaths(params: Shared.AuditSafePathsParams): Promise<Shared.AuditSafePathsResult>;
    getLocalFilePreviewUrl(
      params: Shared.LocalFilePreviewUrlParams,
    ): Promise<Shared.LocalFilePreviewUrlResult>;
    handlePrepareSkillDirectory(
      params: Shared.PrepareSkillDirectoryParams,
    ): Promise<Shared.PrepareSkillDirectoryResult>;
    handleResolveSkillResourcePath(
      params: Shared.ResolveSkillResourcePathParams,
    ): Promise<Shared.ResolveSkillResourcePathResult>;
    getProjectFileIndex(
      params?: Shared.ProjectFileIndexParams,
    ): Promise<Shared.ProjectFileIndexResult>;
    listProjectSkills(
      params: Shared.ListProjectSkillsParams,
    ): Promise<Shared.ListProjectSkillsResult>;
    handleLocalFilesSearch(params: Shared.LocalSearchFilesParams): Promise<Shared.LocalFileItem[]>;
    handleGrepContent(params: Shared.GrepContentParams): Promise<Shared.GrepContentResult>;
    handleGlobFiles(params: Shared.GlobFilesParams): Promise<Shared.GlobFilesResult>;
    handleEditFile(params: Shared.EditLocalFileParams): Promise<Shared.EditLocalFileResult>;
  }>;
  readonly mcp: Readonly<{
    getStdioMcpServerManifest(payload: SuperJSONResult): Promise<SuperJSONResult>;
    getStreamableMcpServerManifest(payload: SuperJSONResult): Promise<SuperJSONResult>;
    callTool(payload: SuperJSONResult): Promise<SuperJSONResult>;
    validMcpServerInstallable(payload: SuperJSONResult): Promise<SuperJSONResult>;
  }>;
  readonly menu: Readonly<{
    refreshAppMenu(): Promise<void>;
    showContextMenu(params: { data?: unknown; type: string }): Promise<void>;
    setDevMenuVisibility(visible: boolean): Promise<void>;
  }>;
  readonly networkProxy: Readonly<{
    getDesktopSettings(): Promise<Shared.NetworkProxySettings>;
    setProxySettings(config: Partial<Shared.NetworkProxySettings>): Promise<void>;
    testProxyConnection(url: string): Promise<{ message?: string; success: boolean }>;
    testProxyConfig(params: {
      config: Shared.NetworkProxySettings;
      testUrl?: string;
    }): Promise<ProxyTestResult>;
  }>;
  readonly notification: Readonly<{
    getNotificationPermissionStatus(): Promise<string>;
    requestNotificationPermission(): Promise<void>;
    showDesktopNotification(
      params: Shared.ShowDesktopNotificationParams,
    ): Promise<Shared.DesktopNotificationResult>;
    setBadgeCount(count: number): Promise<void>;
    isMainWindowHidden(): Promise<boolean>;
  }>;
  readonly openInApp: Readonly<{
    detectApps(): Promise<Shared.DetectAppsResult>;
    openInApp(params: Shared.OpenInAppParams): Promise<Shared.OpenInAppResult>;
  }>;
  readonly remoteServer: Readonly<{
    getRemoteServerConfig(): Promise<Shared.DataSyncConfig>;
    setRemoteServerConfig(config: Partial<Shared.DataSyncConfig>): Promise<boolean>;
    clearRemoteServerConfig(): Promise<boolean>;
    setupSubscriptionWebviewSession(params: { partition: string }): Promise<{ success: boolean }>;
  }>;
  readonly screenCapture: Readonly<{
    traceOverlayEvent(payload: { data?: unknown; event: string }): Promise<void>;
    previewWindow(windowId: number): Promise<Shared.CapturePreviewResult>;
    previewRect(params: Shared.CaptureRectParams): Promise<Shared.CapturePreviewResult>;
    submit(params: Shared.ScreenCaptureSubmitParams): Promise<void>;
    reportUploadStatus(payload: Shared.OverlayCaptureUploadStatusPayload): Promise<void>;
    close(): Promise<void>;
    publishOverlaySnapshot(payload: OverlaySnapshotPayload): Promise<void>;
  }>;
  readonly shellCommand: Readonly<{
    handleRunCommand(params: Shared.RunCommandParams): Promise<Shared.RunCommandResult>;
    handleGetCommandOutput(
      params: Shared.GetCommandOutputParams,
    ): Promise<Shared.GetCommandOutputResult>;
    handleKillCommand(params: Shared.KillCommandParams): Promise<Shared.KillCommandResult>;
  }>;
  readonly shortcut: Readonly<{
    getShortcutsConfig(): Promise<Record<string, string>>;
    updateShortcutConfig(params: {
      accelerator: string;
      id: string;
    }): Promise<Shared.ShortcutUpdateResult>;
  }>;
  readonly system: Readonly<{
    getAppState(): Promise<Shared.ElectronAppState>;
    requestAccessibilityAccess(): Promise<boolean>;
    getAccessibilityStatus(): Promise<boolean>;
    getFullDiskAccessStatus(): Promise<boolean>;
    promptFullDiskAccessIfNotGranted(options?: {
      message?: string;
      openSettingsButtonText?: string;
      skipButtonText?: string;
      title?: string;
    }): Promise<'cancelled' | 'granted' | 'opened_settings' | 'skipped'>;
    getMediaAccessStatus(mediaType: 'microphone' | 'screen'): Promise<string>;
    requestMicrophoneAccess(): Promise<boolean>;
    requestScreenAccess(): Promise<boolean>;
    openFullDiskAccessSettings(): Promise<void>;
    openExternalLink(url: string): Promise<void>;
    selectFolder(payload?: {
      defaultPath?: string;
      title?: string;
    }): Promise<{ path: string; repoType?: 'git' | 'github' } | undefined>;
    getSystemLocale(): Promise<string>;
    updateLocale(locale: string): Promise<{ success: boolean }>;
    updateThemeModeHandler(themeMode: Shared.ThemeMode): Promise<void>;
    getSystemThemeMode(): Promise<Shared.ThemeMode>;
    hasLegacyLocalDb(): Promise<boolean>;
  }>;
  readonly toolDetector: Readonly<{
    detectTool(name: string, force?: boolean): Promise<Shared.ToolStatus>;
    detectHeterogeneousAgentCommand(
      params: Shared.DetectHeterogeneousAgentCommandParams,
    ): Promise<Shared.ToolStatus>;
    detectAllTools(force?: boolean): Promise<Record<string, Shared.ToolStatus>>;
    detectCategory(
      category: Shared.ToolCategory,
      force?: boolean,
    ): Promise<Record<string, Shared.ToolStatus>>;
    getBestTool(category: Shared.ToolCategory): Promise<string | null>;
    getToolStatus(name: string): Promise<Shared.ToolStatus | null>;
    getAllToolStatus(): Promise<Record<string, Shared.ToolStatus>>;
    clearToolCache(name?: string): Promise<void>;
    getRegisteredTools(): Promise<string[]>;
    getCategories(): Promise<Shared.ToolCategory[]>;
    getToolsInCategory(category: Shared.ToolCategory): Promise<
      Array<{
        description?: string;
        name: string;
        priority?: number;
      }>
    >;
    getClaudeAuthStatus(command?: string): Promise<Shared.ClaudeAuthStatus | null>;
  }>;
  readonly tray: Readonly<{
    getAppTrayVisible(): Promise<boolean>;
    setAppTrayVisible(visible: boolean): Promise<{ success: boolean }>;
    showNotification(options: Shared.ShowTrayNotificationParams): Promise<OperationResult>;
    updateTrayIcon(options: Shared.UpdateTrayIconParams): Promise<OperationResult>;
    updateTrayTooltip(options: Shared.UpdateTrayTooltipParams): Promise<OperationResult>;
  }>;
  readonly autoUpdate: Readonly<{
    checkForUpdates(): Promise<void>;
    downloadUpdate(): Promise<void>;
    quitAndInstallUpdate(): Promise<void>;
    installLater(): Promise<void>;
    getUpdateChannel(): Promise<Shared.UpdateChannel>;
    getBuildChannel(): Promise<string>;
    setUpdateChannel(channel: Shared.UpdateChannel): Promise<void>;
    getUpdaterState(): Promise<Shared.UpdaterState>;
  }>;
}
