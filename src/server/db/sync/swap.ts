import { decoKey, isWindowKey, rowKey } from './utils/keys/keys'
import { KEY } from './utils/share/const'
import { keysOf, put } from './utils/tree/tree'
import { decosOf, putDeco } from './deco'
import { idOf, rowsOf, writeRow } from './row'
import type { Tree, View } from './utils/share/types'
import type { Queried, Req } from '../utils/share/types'

const _viewOf = (req: Req) => {
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
        put(tree, KEY.view, _viewOf(req))
        return ids
}
