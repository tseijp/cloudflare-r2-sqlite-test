import { addV, cpV, subV, vec2 } from './utils'
import type { Vec2 } from './utils'
const _isBrowser = typeof window !== 'undefined' && !!window.document && !!window.document.createElement
const _supportsTouchEvents = () => _isBrowser && 'ontouchstart' in window
const _isTouchScreen = () => _supportsTouchEvents() || (_isBrowser && window.navigator.maxTouchPoints > 1)
const _supportsPointerEvents = () => _isBrowser && 'onpointerdown' in window
const _supportsPointerLock = () => _isBrowser && 'exitPointerLock' in window.document
const _supportsGestureEvents = () => {
        try {
                // @ts-ignore eslint-disable-next-line
                return 'constructor' in GestureEvent
        } catch (e) {
                return false
        }
}
const _SUPPORT: Record<string, boolean> = {
        // Mac
        isBrowser: _isBrowser, // true
        get gesture() {
                return _SUPPORT._gesture ?? (_SUPPORT._gesture = _supportsGestureEvents())
        },
        get touch() {
                return _SUPPORT._touch ?? (_SUPPORT._touch = _supportsTouchEvents())
        },
        get touchscreen() {
                return _SUPPORT._touchscreen ?? (_SUPPORT._touchscreen = _isTouchScreen())
        },
        get pointer() {
                return _SUPPORT._pointer ?? (_SUPPORT._pointer = _supportsPointerEvents())
        },
        get pointerLock() {
                return _SUPPORT._pointerLock ?? (_SUPPORT._pointerLock = _supportsPointerLock())
        },
}
export const getDevice = (lock = false) => {
        const pointerLock = lock && _SUPPORT.pointerLock
        if (pointerLock) return 'mouse'
        if (_SUPPORT.pointer) return 'pointer'
        if (_SUPPORT.touch) return 'touch'
        return 'mouse'
}
export const getClientVec2 = (e: any, device: unknown, out: Vec2): Vec2 => {
        if (device !== 'touch') {
                return vec2(e.clientX, e.clientY, out)
        }
        const [touch] = e.changedTouches
        return vec2(touch.clientX, touch.clientY, out)
}
export const EVENT_FOR_DRAG = {
        touch: {
                start: 'touchstart',
                move: 'touchmove',
                end: 'touchend',
                up: 'touchcancel',
        },
        pointer: {
                start: 'pointerdown',
                move: 'pointermove',
                end: 'pointerup',
                up: 'pointercancel',
        },
        mouse: {
                start: 'mousedown',
                move: 'mousemove',
                end: 'mouseup',
                up: 'mousecancel',
        },
}
let _grabbing: any = null
export const dragEvent = <El extends Element = Element>(onDrag?: () => void, canStart: (event: Event) => boolean = () => true) => {
        const _initValues = () => {
                vec2(0, 0, self.value)
                vec2(0, 0, self._value)
                vec2(0, 0, self.delta)
                vec2(0, 0, self.movement)
        }
        const drag = () => {
                const wasActive = self._active
                self.isDragStart = self.active && !wasActive
                self.isDragging = self.active && wasActive
                self.isDragEnd = !self.active && wasActive
                onDrag?.()
                self._active = self.active
        }
        const dragStart = (e: Event) => {
                if (self.active) return
                if (_grabbing && _grabbing !== self) return
                if (!canStart(e)) return
                e.stopPropagation()
                _grabbing = self
                self.pointerId = (e as any).pointerId ?? null
                self.event = e
                self._active = false
                self.active = true
                _initValues()
                getClientVec2(e, self.device, self.value)
                if (self.target.setPointerCapture && 'pointerId' in e) self.target.setPointerCapture(e.pointerId)
                self.drag(self)
        }
        const dragging = (e: Event) => {
                self.event = e
                if (self.active && self.pointerId !== null && (e as any).pointerId !== self.pointerId) return
                if (self.active && (e as any).cancelable) e.preventDefault()
                if (self.active) e.stopPropagation()
                cpV(self.value, self._value)
                getClientVec2(e, self.device, self.value)
                if (self.active) {
                        subV(self.value, self._value, self.delta)
                        addV(self.offset, self.delta, self.offset)
                        addV(self.movement, self.delta, self.movement)
                }
                self.drag(self)
        }
        const dragEnd = (e: Event) => {
                if (self.active && self.pointerId !== null && (e as any).pointerId !== self.pointerId) return
                if (_grabbing === self) _grabbing = null
                self.event = e
                self.active = false
                _initValues()
                self.pointerId = null
                if (self.target.releasePointerCapture && 'pointerId' in e) self.target.releasePointerCapture(e.pointerId)
                self.drag(self)
        }
        const mount = (target: El) => {
                self.target = target
                const { start, move, end, up } = EVENT_FOR_DRAG[self.device as 'touch']
                target.addEventListener(start, self.dragStart)
                target.addEventListener(move, self.dragging, { passive: false })
                target.addEventListener(end, self.dragEnd)
                target.addEventListener(up, self.dragEnd)
        }
        const clean = () => {
                const target = self.target
                if (!target) return
                const { start, move, end, up } = EVENT_FOR_DRAG[self.device as 'touch']
                target.removeEventListener(start, self.dragStart)
                target.removeEventListener(move, self.dragging)
                target.removeEventListener(end, self.dragEnd)
                target.removeEventListener(up, self.dragEnd)
                if (_grabbing === self) _grabbing = null
        }
        const self = {
                _active: false,
                active: false,
                pointerId: null,
                device: getDevice(),
                _value: vec2(0, 0),
                value: vec2(0, 0),
                delta: vec2(0, 0),
                offset: vec2(0, 0),
                movement: vec2(0, 0),
                target: null,
                event: null,
                memo: {},
                isDragStart: false,
                isDragging: false,
                isDragEnd: false,
                drag,
                dragStart,
                dragging,
                dragEnd,
                mount,
                clean,
                ref: (el: El) => {
                        if (el) {
                                self.mount(el)
                        } else self.clean(null)
                },
        } as any
        return self
}
export type DragState = ReturnType<typeof dragEvent>
