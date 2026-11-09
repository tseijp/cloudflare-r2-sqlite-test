import { TRUE } from '../share/const'
import type { ColType, Value } from '../../../utils/share/types'

const _DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/

const _pad = (text: string) => text.padStart(2, '0')

const _toNumber = (value: string | number) => {
        const n = Number(value)
        return Number.isFinite(n) ? n : value
}

const _toTime = (value: string | number) => {
        const ms = typeof value === 'number' ? value : Date.parse(value)
        return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

const _toDate = (value: string | number) => {
        const m = _DATE.exec(String(value).trim())
        if (m) return `${m[1]}-${_pad(m[2])}-${_pad(m[3])}`
        return _toTime(value)?.slice(0, 10) ?? value
}

const _toInt = (value: string | number) => {
        const n = _toNumber(value)
        return typeof n === 'number' ? Math.trunc(n) : n
}

const _NORMALIZE: Record<ColType, (value: string | number) => Value> = {
        text: (value) => String(value),
        number: _toNumber,
        int: _toInt,
        bool: (value) => (TRUE.includes(String(value).toLowerCase()) ? 1 : 0),
        date: _toDate,
        datetime: (value) => _toTime(value) ?? value,
        json: (value) => String(value),
}

export const normalize = (kind: ColType, value: Value | undefined) => {
        if (value == null || value === '') return null
        return _NORMALIZE[kind](value)
}
