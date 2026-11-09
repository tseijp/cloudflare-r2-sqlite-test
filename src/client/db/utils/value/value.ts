import type { ColType, Mark, Value } from '../types/types.ts'

export const parse = (type: ColType, text: string): Value => {
        if (text === '') return null
        const isNumeric = type === 'number' || type === 'int'
        if (isNumeric) return Number.isNaN(Number(text)) ? text : Number(text)
        if (type === 'bool') return /^(1|true|yes|x)$/i.test(text) ? 1 : 0
        return text
}

export const format = (value: Value | undefined) => (value === null || value === undefined ? '' : String(value))

export const isSame = (a: Value | undefined, b: Value | undefined) => (a ?? null) === (b ?? null)

export const fitMarks = (marks: Mark[], length: number) => {
        const kept = marks.filter((mark) => mark.from < length)
        return kept.map((mark) => ({ ...mark, to: Math.min(mark.to, length) }))
}

export const styleOf = (json: string | undefined) => {
        if (!json) return {}
        const style = JSON.parse(json) as Record<string, string>
        return { background: style.fill, color: style.color, textAlign: style.align as any, fontWeight: style.bold ? 700 : undefined }
}
