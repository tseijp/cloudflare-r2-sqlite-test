import { WINDOW } from './utils/const/const.ts'
import { readPages, readWin } from './tree.ts'
import type { Provider, Send, Tree } from './utils/types/types.ts'

export const createBoot = (tree: Tree, send: Send) => (provider: Provider) => {
        const onSync = (isSynced: boolean) => {
                const page = readPages(tree)[0]
                const isReady = isSynced && !readWin(tree) && !!page
                if (!isReady) return
                send.move({ page: page.id, from: 1, to: WINDOW })
        }
        provider.on('sync', onSync)
        return () => provider.off('sync', onSync)
}
