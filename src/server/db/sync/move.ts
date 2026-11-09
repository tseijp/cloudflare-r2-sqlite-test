import { ORIGIN } from './utils/const/const.ts'
import { swap } from './swap.ts'
import type * as Y from 'yjs'
import type { Req } from '../utils/share/types.ts'
import type { Run, Tree } from './utils/types/types.ts'

export const createMove = (doc: Y.Doc, tree: Tree, run: Run, onSwap: (ids: number[]) => void) => {
        let current: Req | null = null
        let seq = 0
        const move = async (req: Req) => {
                const mine = ++seq
                const res = await run.query(req)
                if (mine !== seq) return
                current = req
                let ids: number[] = []
                doc.transact(() => void (ids = swap(tree, req, res)), ORIGIN.win)
                onSwap(ids)
        }
        const refresh = () => (current ? move(current) : Promise.resolve())
        return { move, refresh }
}
