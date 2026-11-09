export interface Target {
        closest(selector: string): { dataset: Record<string, string | undefined> } | null
}

export interface Pointer {
        target: Target | EventTarget | null
        clientX: number
        shiftKey: boolean
        buttons: number
}

export interface Keys {
        key: string
        shiftKey: boolean
        ctrlKey: boolean
        metaKey: boolean
        altKey: boolean
        preventDefault(): void
        stopPropagation(): void
        nativeEvent: { isComposing: boolean }
}

export interface Typed extends Keys {
        currentTarget: { value: string }
}

export interface Blurred {
        currentTarget: { value: string }
}

export interface Scrolled {
        currentTarget: { scrollTop: number; clientHeight: number }
}
