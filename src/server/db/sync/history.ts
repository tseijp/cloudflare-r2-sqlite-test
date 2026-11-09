import * as Y from 'yjs'
import { ORIGIN } from './utils/share/const.ts'
import { isLayoutKey } from './utils/keys/keys.ts'
import { UNDO } from './utils/config/config.ts'
import type { Side, Step, Tree } from './utils/share/types.ts'

export const createHistory = (doc: Y.Doc, tree: Tree) => {
        const _isLayout = (tr: Y.Transaction) => [...(tr.changed.get(tree as any) ?? [])].some(isLayoutKey)
        const _manager = new Y.UndoManager(tree, { ...UNDO, trackedOrigins: new Set([ORIGIN.user]), captureTransaction: _isLayout })
        const _stacks: Record<Side, Step[]> = { undo: [], redo: [] }
        let _pending: Step | null = null
        _manager.on('stack-item-added', (event: { stackItem: unknown }) => {
                if (_pending) _pending.item = event.stackItem
        })
        const _track = (step: Step, write: () => void) => {
                _pending = step
                step.item = null
                write()
                _pending = null
        }
        return {
                record: (step: Step | null, write: () => void) => {
                        if (!step) return doc.transact(write, ORIGIN.user)
                        _track(step, () => doc.transact(write, ORIGIN.user))
                        _stacks.undo.push(step)
                        _stacks.redo = []
                        _manager.clear(false, true)
                },
                peek: (side: Side) => _stacks[side][_stacks[side].length - 1] ?? null,
                flip: (side: Side, write: () => void) => {
                        const step = _stacks[side].pop()
                        if (!step) return
                        const isUndo = side === 'undo'
                        const items = isUndo ? _manager.undoStack : _manager.redoStack
                        const isTracked = !!step.item && items[items.length - 1] === step.item
                        const replay = () => (isUndo ? _manager.undo() : _manager.redo())
                        _track(step, () => (isTracked ? replay() : doc.transact(write, ORIGIN.user)))
                        _stacks[isUndo ? 'redo' : 'undo'].push(step)
                },
                prune: (ids: number[]) => {
                        const alive = new Set(ids)
                        const isAlive = (step: Step) => step.rows.every((id) => alive.has(id))
                        _stacks.undo = _stacks.undo.filter(isAlive)
                        _stacks.redo = _stacks.redo.filter(isAlive)
                },
        }
}
