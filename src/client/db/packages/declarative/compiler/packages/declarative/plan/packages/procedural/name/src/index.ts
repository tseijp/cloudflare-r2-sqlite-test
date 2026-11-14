const _isFree = (name: string, taken: string[]) => !taken.some((used) => used.toLowerCase() === name.toLowerCase())

export const toName = (text: string) => {
        const name = text.replace(/[\u0000-\u001f]/g, '').replace(/^_+/, '').trim().slice(0, 48)
        return /^(rowid|oid|sqlite_.*)$/i.test(name) ? '' : name
}

export const toNext = (base: string, taken: string[]): string => {
        for (let count = taken.length + 1; ; count++) if (_isFree(`${base} ${count}`, taken)) return `${base} ${count}`
}

export const toUnique = (base: string, taken: string[]): string => {
        if (_isFree(base, taken)) return base
        for (let count = 2; ; count++) if (_isFree(`${base} (${count})`, taken)) return `${base} (${count})`
}

export const toNames = (names: string[]) => names.reduce<string[]>((found, name, index) => [...found, toUnique(toName(name) || `列 ${index + 1}`, found)], [])
