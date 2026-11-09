import { useSyncExternalStore } from 'react'

interface Store {
        subscribe(notify: () => void): () => void
        get(): number
}

export const useTree = (store: Store) => useSyncExternalStore(store.subscribe, store.get)
