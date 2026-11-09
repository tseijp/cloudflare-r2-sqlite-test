import { MOVES } from '../share/config.ts'
import type { Keys } from './events.ts'

interface Parts {
        gesture: { step(dr: number, dc: number, isExtend: boolean): void; start(text?: string): void; isMine(): boolean }
        commit: { clear(): unknown; toggle(): unknown }
}

export const createKeyboard = ({ gesture, commit }: Parts) => {
        return {
                onKeyDown: (e: Keys) => {
                        if (gesture.isMine() || e.nativeEvent.isComposing) return
                        const move = MOVES[e.key]
                        const isTab = e.key === 'Tab'
                        const isEdit = e.key === 'Enter' || e.key === 'F2'
                        const isClear = e.key === 'Delete' || e.key === 'Backspace'
                        const isChar = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
                        if (move || isEdit || isClear || isChar) e.preventDefault()
                        if (isTab) return gesture.step(0, e.shiftKey ? -1 : 1, false)
                        if (move) return gesture.step(move[0], move[1], e.shiftKey)
                        if (isEdit) return gesture.start()
                        if (isClear) return void commit.clear()
                        if (e.key === ' ' && commit.toggle()) return
                        if (isChar) gesture.start(e.key)
                },
        }
}
