import { useSyncExternalStore } from 'react'
import type { WorkbenchState, WorkbenchStore } from './store'

export function useWorkbenchStore(store: WorkbenchStore): WorkbenchState {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}
