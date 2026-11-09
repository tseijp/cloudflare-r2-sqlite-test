import { TREE } from './utils/share/const'
import { createLayout } from './layout'
import { createHistory } from './history'
import { createMove } from './move'
import { createEdit } from './edit'
import { dump } from './dump'
import type * as Y from 'yjs'
import type { Run, Tree, Window } from './utils/share/types'

export type { Layout, PageDecl, Run, Window } from './utils/share/types'

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
