import { KEY } from './utils/const/const.ts'
import { decoKey, isWindowKey, rowKey } from './utils/keys/keys.ts'
import { keysOf, put } from './utils/tree/tree.ts'
import { decosOf, putDeco } from './deco.ts'
import { idOf, rowsOf, writeRow } from './row.ts'
import type { Queried, Req } from '../utils/share/types.ts'
import type { Tree, View } from './utils/types/types.ts'

const viewOf = (req: Req) => {
        const view: View = {}
        if (req.order) view.order = req.order
        if (req.filter) view.filter = req.filter
        if (req.search) view.search = req.search
        return view
}

export const swap = (tree: Tree, req: Req, res: Queried) => {
        const rows = rowsOf(res)
        const ids = rows.map(idOf)
        const decoOf = decosOf(res)
        const keep = new Set(ids.flatMap((id) => [rowKey(id), decoKey(id)]))
        keysOf(tree, (key) => isWindowKey(key) && !keep.has(key)).forEach((key) => tree.delete(key))
        rows.forEach((row) => writeRow(tree, row))
        ids.forEach((id) => putDeco(tree, id, decoOf(id)))
        put(tree, KEY.win, { page: req.page, from: req.from, to: req.to, ids })
        put(tree, KEY.view, viewOf(req))
        return ids
}
