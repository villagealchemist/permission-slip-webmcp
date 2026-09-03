import { useSyncExternalStore } from 'react'
import {
  getDefaultPermissionSlipStore,
  type PermissionSlipStore,
} from './permissionSlipStore'

/**
 * Bridges the immutable shared store into React without creating UI-owned state,
 * preserving one consent workflow for human and WebMCP callers.
 */
export function usePermissionSlipStore(
  store: PermissionSlipStore = getDefaultPermissionSlipStore(),
) {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )
}
