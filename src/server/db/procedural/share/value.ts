import type { ColType, Mark, Value } from './types'

const _NUM = /^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/

const _DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

const _TRUE = /^(1|true|yes|on)$/i

const _pad = (text: string) => text.padStart(2, '0')

const _date = (text: string, isDay: boolean) => {
        const m = text.match(_DATE)
        if (!m) return text
        const day = `${m[1]}-${_pad(m[2])}-${_pad(m[3])}`
        if (isDay || !m[4]) return day
        return `${day}T${_pad(m[4])}:${m[5]}${m[6] ? `:${m[6]}` : ''}`
}

export const isNumeric = (text: string) => _NUM.test(text)

export const normalize = (type: ColType, value: Value | undefined): Value => {
        const text = value === undefined || value === null ? '' : String(value).trim()
        const isNumber = (type === 'number' || type === 'int') && _NUM.test(text)
        if (!text) return null
        if (isNumber) return Number(text)
        if (type === 'bool') return _TRUE.test(text) ? 1 : 0
        if (type === 'date' || type === 'datetime') return _date(text, type === 'date')
        return value as Value
}

export const clamp = (marks: Mark[], value: Value) => {
        const length = value === null ? 0 : String(value).length
        return marks.map((m) => ({ from: Math.max(0, m.from), to: Math.min(length, m.to), attr: m.attr, val: m.val })).filter((m) => m.from < m.to)
}
