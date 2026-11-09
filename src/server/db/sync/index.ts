import { TREE } from './utils/const/const.ts'
import { createLayout } from './layout.ts'
import { createHistory } from './history.ts'
import { createMove } from './move.ts'
import { createEdit } from './edit.ts'
import { dump } from './dump.ts'
import type * as Y from 'yjs'
import type { Run, Tree, Window } from './utils/types/types.ts'

export type { Layout, PageDecl, Run, Window } from './utils/types/types.ts'

export const createWindow = (doc: Y.Doc, run: Run): Window => {
        const tree = doc.getMap(TREE) as Tree
        const layout = createLayout(doc, tree)
        const history = createHistory(doc, tree)
        const range = createMove(doc, tree, run, history.prune)
        const edit = createEdit({ tree, layout }, run, history, range.refresh)
        return { move: range.move, act: edit.act, undo: edit.undo, redo: edit.redo, dump: () => dump(tree, layout), layout }
}
