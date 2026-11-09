import { WINDOW } from './utils/share/const'
import { readPages, readWin } from './tree'
import type { Provider, Send, Tree } from './utils/share/types'

export const createBoot = (tree: Tree, send: Send) => (provider: Provider) => {
        const _onSync = (isSynced: boolean) => {
                const page = readPages(tree)[0]
                const isReady = isSynced && !readWin(tree) && !!page
                if (!isReady) return
                send.move({ page: page.id, from: 1, to: WINDOW })
        }
        provider.on('sync', _onSync)
        return () => provider.off('sync', _onSync)
}
