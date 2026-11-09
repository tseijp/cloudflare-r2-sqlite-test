import { AFTER } from '../share/config.ts'
import type { Blurred, Typed } from './events.ts'
import type { Editing } from '../share/types.ts'

interface _Parts {
        gesture: { stop(): void; step(dr: number, dc: number, isExtend: boolean): void; target(): Editing | null }
        commit: { confirm(editing: Editing | null, text: string): unknown }
        focus(): void
}

export const createEditor = ({ gesture, commit, focus }: _Parts) => {
        let _isComposing = false
        const _close = () => {
                gesture.stop()
                focus()
        }
        return {
                onKeyDown: (e: Typed) => {
                        e.stopPropagation()
                        if (_isComposing || e.nativeEvent.isComposing) return
                        if (e.key === 'Escape') return _close()
                        const after = AFTER[e.key]
                        if (!after) return
                        e.preventDefault()
                        commit.confirm(gesture.target(), e.currentTarget.value)
                        _close()
                        gesture.step(after[0], after[1], false)
                },
                onBlur: (e: Blurred) => {
                        if (_isComposing) return
                        commit.confirm(gesture.target(), e.currentTarget.value)
                        gesture.stop()
                },
                onCompositionStart: () => void (_isComposing = true),
                onCompositionEnd: () => void (_isComposing = false),
        }
}
