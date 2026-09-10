import { invoke } from '@tauri-apps/api/core'
import type { DashboardSnapshot, DensityKey, RangeKey } from '../types'

/** Optional bridge when this UI is embedded in an existing Heartbeat Tauri shell. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
export function fetchDashboardSnapshot(range: RangeKey, density: DensityKey): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) return Promise.reject(new Error('Local telemetry requires the Heartbeat desktop shell.'))
  return invoke<DashboardSnapshot>('get_dashboard_snapshot', { range, density })
}
