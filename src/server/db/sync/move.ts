import { ORIGIN } from './utils/share/const.ts'
import { swap } from './swap.ts'
import type * as Y from 'yjs'
import type { Req } from '../utils/share/types.ts'
import type { Run, Tree } from './utils/share/types.ts'

export const createMove = (doc: Y.Doc, tree: Tree, run: Run, onSwap: (ids: number[]) => void) => {
        let _current: Req | null = null
        let _seq = 0
        const move = async (req: Req) => {
                const mine = ++_seq
                const res = await run.query(req)
                if (mine !== _seq) return
                _current = req
                let ids: number[] = []
                doc.transact(() => void (ids = swap(tree, req, res)), ORIGIN.win)
                onSwap(ids)
        }
        return {
                move,
                refresh: () => (_current ? move(_current) : Promise.resolve()),
        }
}
