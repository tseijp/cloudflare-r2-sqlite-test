import { AFTER } from './utils/config/config.ts'
import type { Blurred, Typed } from './utils/events/events.ts'
import type { Editing } from './utils/types/types.ts'

interface Parts {
        gesture: { stop(): void; step(dr: number, dc: number, isExtend: boolean): void; target(): Editing | null }
        commit: { confirm(editing: Editing | null, text: string): unknown }
        focus(): void
}

export const createEditor = ({ gesture, commit, focus }: Parts) => {
        let isComposing = false
        const onCompositionStart = () => void (isComposing = true)
        const onCompositionEnd = () => void (isComposing = false)
        const close = () => {
                gesture.stop()
                focus()
        }
        const onKeyDown = (e: Typed) => {
                e.stopPropagation()
                if (isComposing || e.nativeEvent.isComposing) return
                if (e.key === 'Escape') return close()
                const after = AFTER[e.key]
                if (!after) return
                e.preventDefault()
                commit.confirm(gesture.target(), e.currentTarget.value)
                close()
                gesture.step(after[0], after[1], false)
        }
        const onBlur = (e: Blurred) => {
                if (isComposing) return
                commit.confirm(gesture.target(), e.currentTarget.value)
                gesture.stop()
        }
        return { onKeyDown, onBlur, onCompositionStart, onCompositionEnd }
}
