export type RangeKey = '1H' | '2H' | '4H' | '8H' | 'TODAY' | 'WEEK' | 'MONTH'
export type DensityKey = '1S' | '5S' | '30S' | '1M'
export type ActivityMode = 'apps' | 'breakdown' | 'agents'
export type StatsPeriod = 'today' | 'week'
export type RecallSearchMode = 'hybrid' | 'semantic' | 'keyword'
export type RecallSearchWindow = '24h' | '7d' | '30d' | 'all'

export type TimelinePoint = {
  timeLabel: string
  bucketStartTs: number
  bucketEndTs: number
  bpm: number
  // Live RMSSD (ms) for this bucket; the backend always sends it (null where no
  // estimate exists). Optional so mock/fixture builders need not supply it.
  hrv?: number | null
  keystrokes: number
  clickCount: number
  pointerDistance: number
  appIntensity: number
  agentActivity: number
  agentNames: string
  appName: string
  appIconData: string | null
  secondaryLabel: string
  focusLabel: string
}

export type ActivityRow = {
  name: string
  kindLabel: string
  timeLabel: string
  avgHr: number | null
  delta: number | null
  accent: string
  iconData: string | null
  tokensLabel: string | null
}

export type ActivityGroups = {
  apps: ActivityRow[]
  breakdown: ActivityRow[]
  agents: ActivityRow[]
}

export type Insight = {
  icon: string
  label: string
  value: string
  detail: string
  tone: 'up' | 'down' | 'flat'
}

export type Summary = {
  appCount: number
  keystrokesLabel: string
  mouseLabel: string
  musicLabel: string
  hrvLabel: string
  dictationLabel: string
}

export type WorkoutBlock = {
  startTs: number
  endTs: number
  kind: string
  sportName: string
  strain: number | null
  avgHr: number | null
  maxHr: number | null
}

// Agent sessions + "Agent Tax" (#6). Mirrors src-tauri storage::AgentSession etc.
export type AgentSession = {
  startTs: number
  endTs: number
  durationSeconds: number
  agentNames: string
  tokenDelta: number
  avgHr: number | null
  maxHr: number | null
  hrvStart: number | null
  hrvEnd: number | null
  keystrokes: number
}

export type AgentTaxBucket = {
  label: string
  activeAvgHr: number | null
  idleAvgHr: number | null
  hrDeltaBpm: number | null
  activeAvgHrv: number | null
  idleAvgHrv: number | null
  hrvDeltaPct: number | null
  activeSeconds: number
}

export type AgentTax = {
  overall: AgentTaxBucket
  perAgent: AgentTaxBucket[]
  sessionCount: number
  verdict: string
  hasData: boolean
}

export type AgentSessionsReport = {
  sessions: AgentSession[]
  tax: AgentTax
}

// Flashpoints + correlated-moment inspector (#5). Mirrors src-tauri
// storage::Flashpoint / storage::MomentContext.
export type FlashpointTrigger = 'hr_spike' | 'hrv_drop'

export type Flashpoint = {
  ts: number
  hr: number | null
  hrv: number | null
  trigger: FlashpointTrigger
  // Detection strength in sigmas over the rolling baseline (z-score); ranks the feed.
  severity: number
  windowTitle: string | null
  app: string | null
  // Normalized context (#219): browser domain or app-class slug, plus the
  // finer detail (GitHub repo, Slack channel, terminal cwd). Null when the
  // window's context could not be extracted with confidence.
  contextDomain: string | null
  contextDetail: string | null
  agents: string[]
  // Nearest screen_capture id at this moment. Feed into
  // fetchRecallCaptureDetail(captureId) to load the snapshot in the inspector.
  // Null when no capture is near.
  captureId: number | null
  // Rule-based likely cause (#220), pre-phrased with confidence wording
  // ("likely: …" / "possibly: …"). Null = no obvious trigger.
  likelyCause: string | null
}

export type MomentContext = {
  ts: number
  hr: number | null
  hrv: number | null
  windowTitle: string | null
  app: string | null
  // Normalized context (#219) of the nearest window sample; see Flashpoint.
  contextDomain: string | null
  contextDetail: string | null
  agents: string[]
  // Nearest capture id (+ its own app/title/url for an inspector header). Load the
  // full snapshot via fetchRecallCaptureDetail(captureId).
  captureId: number | null
  captureApp: string | null
  captureWindowTitle: string | null
  browserUrl: string | null
  // Rule-based likely cause (#220); see Flashpoint.likelyCause.
  likelyCause: string | null
}

export type DashboardSnapshot = {
  title: string
  bpmRangeLabel: string
  headline: string
  breakNotice: string
  timeline: TimelinePoint[]
  workouts: WorkoutBlock[]
  focusScore: number
  activities: ActivityGroups
  insights: Insight[]
  summary: Summary
}

export type StatsRow = {
  label: string
  value: string
  humanLabel: string
}

export type StatsRollup = {
  title: string
  subtitle: string
  rows: StatsRow[]
}

export type WindowSamplePreview = {
  appName: string
  windowTitle: string
  processPath: string
  sampledAtLabel: string
}

export type InputBucketPreview = {
  keystrokes: number
  clickCount: number
  pointerDistance: number
  appName: string
  windowTitle: string
  sampledAtLabel: string
}

export type HeartRatePreview = {
  bpm: number
  deviceName: string
  sampledAtLabel: string
  sampledAtTs: number
}

export type CollectorStatus = {
  platform: string
  mode: string
  running: boolean
  accessibilityTrusted: boolean | null
  inputMonitoringGranted: boolean | null
  bluetoothState: string
  bleReconnectAttempts: number
  bleAdapterResets: number
  bleConsecutiveFailures: number
  bleConsecutiveMisses: number
  bleLastDisconnectReason: string | null
  latestSample: WindowSamplePreview | null
  latestInput: InputBucketPreview | null
  latestHeartRate: HeartRatePreview | null
  latestHrvMs: number | null
  lastError: string | null
  note: string
}

export type WhoopStatus = {
  connected: boolean
  configured: boolean
  userName: string | null
  apiConnected: boolean
  apiNeedsReconnect: boolean
  apiHasRefreshToken: boolean
  apiExpiresAt: number | null
  backfillConnected: boolean
  pendingGapCount: number
  largestPendingGapMinutes: number | null
}

export type WhoopBody = {
  recoveryScore: number | null
  hrv: number | null
  restingHr: number | null
  spo2: number | null
  skinTemp: number | null
  sleepHours: number | null
  sleepPerformance: number | null
  sleepEfficiency: number | null
  strain: number | null
  kilojoules: number | null
  localRecoveryScore: number | null
  localStrain: number | null
  localStress: number | null
  recoveryLabel: string
}

export type ScreenSearchResult = {
  id: number
  capturedAt: number
  appName: string
  windowTitle: string
  browserUrl: string | null
  appIconData: string | null
  snippet: string
  rank: number
  // Search mode that produced the hit, or 'recent' for the entry-state strip.
  source: RecallSearchMode | 'recent'
}

export type RecallCaptureDetail = {
  id: number
  capturedAt: number
  appName: string
  windowTitle: string
  browserUrl: string | null
  appIconData: string | null
  textContent: string
}

export type RecallAppOption = {
  name: string
  count: number
  iconData: string | null
}

// Retention + VACUUM + Recall pruning (#2). Mirrors src-tauri
// storage::RetentionSettings / storage::CompactResult. Pruning is opt-in: while
// `enabled` is false nothing is ever deleted. Each `*Days` value is the max age
// (days) to keep that raw, high-volume data class; <= 0 means "never prune it".
export type RetentionSettings = {
  enabled: boolean
  heartRateDays: number
  inputBucketsDays: number
  screenCapturesDays: number
}

export type CompactResult = {
  // Whether retention pruning ran (settings enabled). When false the run only
  // VACUUMed / optimized and the *Removed counts are zero.
  pruned: boolean
  heartRateRemoved: number
  inputBucketsRemoved: number
  screenCapturesRemoved: number
  totalRowsRemoved: number
  bytesBefore: number
  bytesAfter: number
  bytesFreed: number
}

export type RecallStats = {
  total: number
  embedded: number
  pending: number
  embeddingCoverage: number
  latestCaptureAt: number | null
  oldestCaptureAt: number | null
  oldestPendingCaptureAt: number | null
  apps: RecallAppOption[]
}
