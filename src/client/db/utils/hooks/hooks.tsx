import { useSyncExternalStore } from 'react'

interface _Store {
        subscribe(notify: () => void): () => void
        get(): number
}

export const useTree = (store: _Store) => useSyncExternalStore(store.subscribe, store.get)
