import * as Y from 'yjs'
import { ORIGIN } from './utils/const/const.ts'
import { isLayoutKey } from './utils/keys/keys.ts'
import { UNDO } from './config.ts'
import type { Side, Step, Tree } from './utils/types/types.ts'

export const createHistory = (doc: Y.Doc, tree: Tree) => {
        const isLayout = (tr: Y.Transaction) => [...(tr.changed.get(tree as any) ?? [])].some(isLayoutKey)
        const manager = new Y.UndoManager(tree, { ...UNDO, trackedOrigins: new Set([ORIGIN.user]), captureTransaction: isLayout })
        const stacks: Record<Side, Step[]> = { undo: [], redo: [] }
        let pending: Step | null = null
        manager.on('stack-item-added', (event: { stackItem: unknown }) => {
                if (pending) pending.item = event.stackItem
        })
        const track = (step: Step, write: () => void) => {
                pending = step
                step.item = null
                write()
                pending = null
        }
        const record = (step: Step | null, write: () => void) => {
                if (!step) return doc.transact(write, ORIGIN.user)
                track(step, () => doc.transact(write, ORIGIN.user))
                stacks.undo.push(step)
                stacks.redo = []
                manager.clear(false, true)
        }
        const peek = (side: Side) => stacks[side][stacks[side].length - 1] ?? null
        const flip = (side: Side, write: () => void) => {
                const step = stacks[side].pop()
                if (!step) return
                const isUndo = side === 'undo'
                const items = isUndo ? manager.undoStack : manager.redoStack
                const isTracked = !!step.item && items[items.length - 1] === step.item
                const replay = () => (isUndo ? manager.undo() : manager.redo())
                track(step, () => (isTracked ? replay() : doc.transact(write, ORIGIN.user)))
                stacks[isUndo ? 'redo' : 'undo'].push(step)
        }
        const prune = (ids: number[]) => {
                const alive = new Set(ids)
                const isAlive = (step: Step) => step.rows.every((id) => alive.has(id))
                stacks.undo = stacks.undo.filter(isAlive)
                stacks.redo = stacks.redo.filter(isAlive)
        }
        return { record, peek, flip, prune }
}
