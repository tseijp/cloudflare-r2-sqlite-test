import { vec2 } from './utils'
export const EVENT_FOR_DROP = {
        start: 'dragenter',
        move: 'dragover',
        leave: 'dragleave',
        end: 'drop',
}
export const dropEvent = <El extends Element = Element>(onDrop?: () => void, canStart: (event: DragEvent) => boolean = () => true) => {
        const drop = () => {
                const wasActive = self._active
                self.isDropStart = self.active && !wasActive
                self.isDropping = self.active && wasActive
                self.isDropEnd = !self.active && wasActive
                onDrop?.()
                self._active = self.active
        }
        const dropStart = (e: DragEvent) => {
                self.depth++
                if (self.active) return
                if (!canStart(e)) return
                e.preventDefault()
                self.event = e
                self._active = false
                self.active = true
                vec2(e.clientX, e.clientY, self.value)
                self.drop(self)
        }
        const dropping = (e: DragEvent) => {
                if (!self.active) return
                e.preventDefault()
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
                self.event = e
                vec2(e.clientX, e.clientY, self.value)
                self.drop(self)
        }
        const dropLeave = (e: DragEvent) => {
                if (self.depth > 0) self.depth--
                if (self.depth > 0 || !self.active) return
                self.event = e
                self.active = false
                self.drop(self)
        }
        const dropEnd = (e: DragEvent) => {
                self.depth = 0
                if (!self.active) return
                e.preventDefault()
                self.event = e
                self.active = false
                vec2(e.clientX, e.clientY, self.value)
                self.drop(self)
        }
        const mount = (target: El) => {
                self.target = target
                const { start, move, leave, end } = EVENT_FOR_DROP
                target.addEventListener(start, self.dropStart)
                target.addEventListener(move, self.dropping)
                target.addEventListener(leave, self.dropLeave)
                target.addEventListener(end, self.dropEnd)
        }
        const clean = () => {
                const target = self.target
                if (!target) return
                const { start, move, leave, end } = EVENT_FOR_DROP
                target.removeEventListener(start, self.dropStart)
                target.removeEventListener(move, self.dropping)
                target.removeEventListener(leave, self.dropLeave)
                target.removeEventListener(end, self.dropEnd)
                self.depth = 0
                self.active = false
        }
        const self = {
                _active: false,
                active: false,
                depth: 0,
                value: vec2(0, 0),
                target: null,
                event: null,
                memo: {},
                isDropStart: false,
                isDropping: false,
                isDropEnd: false,
                drop,
                dropStart,
                dropping,
                dropLeave,
                dropEnd,
                mount,
                clean,
                ref: (el: El) => {
                        if (el) return void self.mount(el)
                        self.clean()
                },
        } as any
        return self
}
export type DropState = ReturnType<typeof dropEvent>
