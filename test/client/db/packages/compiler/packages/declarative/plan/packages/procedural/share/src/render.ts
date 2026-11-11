type Plain = Record<string, unknown>

const _WIDTH = 120

const _isPlain = (value: unknown): value is Plain =>
        typeof value === 'object' && value !== null && !Array.isArray(value)

// escape が要らず、' を含まない文字列は ' で囲む
const _isBare = (text: string) => JSON.stringify(text) === `"${text}"` && !text.includes("'")

const _key = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : lit(key))

// 値を code の literal にする。{ $code: 式 } は式のまま、{ $repeat: [語, 回数] } は '語'.repeat(回数) になる
export const lit = (value: unknown): string => {
        if (typeof value === 'string') return _isBare(value) ? `'${value}'` : JSON.stringify(value)
        if (Array.isArray(value)) return `[${value.map(lit).join(', ')}]`
        if (!_isPlain(value)) return String(value)
        if (typeof value.$code === 'string') return value.$code
        if (Array.isArray(value.$repeat)) return `${lit(value.$repeat[0])}.repeat(${value.$repeat[1]})`
        const fields = Object.entries(value).map(([key, item]) => `${_key(key)}: ${lit(item)}`)
        return fields.length ? `{ ${fields.join(', ')} }` : '{}'
}

// 1 手を 1 文にする。幅を超える object の引数は、field ごとに改行する
export const say = (who: string, verb: string, args: unknown[], indent = '') => {
        const flat = `${indent}await ${who}.${verb}(${args.map(lit).join(', ')})`
        const [first] = args
        if (flat.length <= _WIDTH || args.length !== 1 || !_isPlain(first)) return flat
        const fields = Object.entries(first).map(([key, item]) => `${indent}        ${_key(key)}: ${lit(item)},`)
        return [`${indent}await ${who}.${verb}({`, ...fields, `${indent}})`].join('\n')
}
