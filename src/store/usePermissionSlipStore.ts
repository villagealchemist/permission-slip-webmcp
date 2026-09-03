import { useSyncExternalStore } from 'react'
import {
  getDefaultPermissionSlipStore,
  type PermissionSlipStore,
} from './permissionSlipStore'

export function usePermissionSlipStore(
  store: PermissionSlipStore = getDefaultPermissionSlipStore(),
) {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )
}
