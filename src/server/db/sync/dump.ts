import { KEY } from './utils/share/const.ts'
import { decoKey } from './utils/keys/keys.ts'
import { readRow } from './row.ts'
import type { Dump, Layout, Tree, Win } from './utils/share/types.ts'

export const dump = (tree: Tree, layout: Layout): Dump => {
        const win = (tree.get(KEY.win) as Win | undefined) ?? null
        const pages = layout.pages().map((page) => ({ ...page, cols: layout.cols(page.id) }))
        const rows = (win?.ids ?? []).map((id) => ({ ...readRow(tree, id), deco: tree.get(decoKey(id)) ?? null }))
        return { pages, win, rows, sel: tree.get(KEY.sel) ?? null, editing: tree.get(KEY.editing) ?? null, view: tree.get(KEY.view) ?? null }
}
