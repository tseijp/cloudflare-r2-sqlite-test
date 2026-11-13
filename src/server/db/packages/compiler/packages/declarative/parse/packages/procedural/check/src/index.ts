const _RESERVED = ['rowid', 'oid']

export const isCount = (value: any) => Number.isInteger(value) && value >= 0 && value <= 0x7fffffff

export const isSpan = (value: any) => isCount(value) && value > 0 && value <= 200

export const isText = (value: any) => value === null || typeof value === 'string'

export const isQuery = (value: any) => typeof value === 'string' && value.length > 0 && value.length <= 4096

export const isWord = (value: any) => typeof value === 'string' && /^[\w-]{1,32}$/.test(value)

export const isName = (value: any) => {
        const isString = typeof value === 'string' && value.length > 0 && value.length <= 64
        if (!isString) return false
        const lower = value.toLowerCase()
        const isSystem = lower.startsWith('_') || lower.startsWith('sqlite_') || _RESERVED.includes(lower)
        return !isSystem && !/\p{Cc}/u.test(value)
}

export const isNames = (value: any) => Array.isArray(value) && value.length > 0 && value.every(isName) && new Set(value.map((name: string) => name.toLowerCase())).size === value.length

export const isMarks = (value: any) => Array.isArray(value) && value.every((mark) => Array.isArray(mark) && mark.length === 4 && isCount(mark[0]) && isCount(mark[1]) && isWord(mark[2]) && typeof mark[3] === 'string')

export const isRows = (value: any) => Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every(isText))
