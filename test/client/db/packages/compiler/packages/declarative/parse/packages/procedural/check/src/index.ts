export const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

// 1 命令あたりの重み。0 以上 1 以下
export const isRate = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1

export const isText = (value: unknown) => typeof value === 'string' && value.length > 0

export const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

export const isList = (value: unknown) => Array.isArray(value)

export const isPlain = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)
