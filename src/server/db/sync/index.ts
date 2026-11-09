import { TREE } from './utils/share/const.ts'
import { createLayout } from './layout.ts'
import { createHistory } from './history.ts'
import { createMove } from './move.ts'
import { createEdit } from './edit.ts'
import { dump } from './dump.ts'
import type * as Y from 'yjs'
import type { Run, Tree, Window } from './utils/share/types.ts'

export type { Layout, PageDecl, Run, Window } from './utils/share/types.ts'

export const createWindow = (doc: Y.Doc, run: Run): Window => {
        const _tree = doc.getMap(TREE) as Tree
        const layout = createLayout(doc, _tree)
        const _history = createHistory(doc, _tree)
        const _range = createMove(doc, _tree, run, _history.prune)
        const _edit = createEdit({ tree: _tree, layout }, run, _history, _range.refresh)
        return {
                move: _range.move,
                act: _edit.act,
                undo: _edit.undo,
                redo: _edit.redo,
                dump: () => dump(_tree, layout),
                layout,
        }
}
