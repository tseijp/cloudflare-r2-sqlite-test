export type Kind = 'act' | 'move' | 'undo' | 'redo' | 'load'

export interface Envelope {
        id: number
        kind: Kind
        body?: unknown
}

export interface Reply {
        id: number
        value?: unknown
        error?: string
}
