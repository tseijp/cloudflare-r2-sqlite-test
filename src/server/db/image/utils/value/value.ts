import { TRUE } from '../const/const.ts'
import type { ColType, Value } from '../../../utils/share/types.ts'

const DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/

const pad = (text: string) => text.padStart(2, '0')

const toNumber = (value: string | number) => {
        const n = Number(value)
        return Number.isFinite(n) ? n : value
}

const toTime = (value: string | number) => {
        const ms = typeof value === 'number' ? value : Date.parse(value)
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

const toDate = (value: string | number) => {
        const m = DATE.exec(String(value).trim())
        if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
        return toTime(value)?.slice(0, 10) ?? value
}

const toInt = (value: string | number) => {
        const n = toNumber(value)
        return typeof n === 'number' ? Math.trunc(n) : n
}

const NORMALIZE: Record<ColType, (value: string | number) => Value> = {
        text: (value) => String(value),
        number: toNumber,
        int: toInt,
        bool: (value) => (TRUE.includes(String(value).toLowerCase()) ? 1 : 0),
        date: toDate,
        datetime: (value) => toTime(value) ?? value,
        json: (value) => String(value),
}

export const normalize = (kind: ColType, value: Value | undefined) => {
        if (value == null || value === '') return null
        return NORMALIZE[kind](value)
}
