import { AXES, FATES, FAULTS } from '@test/server-share'

type Plain = Record<string, unknown>

const _isPlain = (value: unknown): value is Plain =>
        typeof value === 'object' && value !== null && !Array.isArray(value)

const _isCode = (value: unknown) => Array.isArray(value) && typeof value[0] === 'string'

export const isName = (value: unknown) => typeof value === 'string' && /^[A-Z][A-Za-z0-9]{0,7}$/.test(value)

export const isText = (value: unknown) => typeof value === 'string' && value.length > 0

export const isTexts = (value: unknown) => Array.isArray(value) && value.every(isText)

export const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

export const isOp = (value: unknown) => _isPlain(value) && typeof value.type === 'string'

export const isCodes = (value: unknown) => Array.isArray(value) && value.every(_isCode)

export const isFault = (value: unknown) => FAULTS.includes(value as string)

export const isFate = (value: unknown) => FATES.includes(value as string)

export const isSeqs = (value: unknown) => value === null || (Array.isArray(value) && value.every(isCount))

// 手で書いた期待値。axis は 12 軸のどれか
export const isWant = (value: unknown) => _isPlain(value) && AXES.includes(value.axis as string)
