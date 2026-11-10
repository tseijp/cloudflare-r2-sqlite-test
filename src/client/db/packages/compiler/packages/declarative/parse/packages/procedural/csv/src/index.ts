export const toRows = (text: string): string[][] => {
        const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
        const rows: string[][] = [[]]
        let cell = ''
        let isQuoted = false
        for (let at = 0; at < body.length; at++) {
                const char = body[at]
                const isPair = isQuoted && char === '"' && body[at + 1] === '"'
                const isBreak = !isQuoted && (char === ',' || char === '\n')
                if (isPair) at++
                if (char === '"' && !isPair) isQuoted = !isQuoted
                if (char === '\r' && !isQuoted) continue
                if (char !== '"' && !isBreak) cell += char
                if (isPair) cell += '"'
                if (!isBreak) continue
                rows[rows.length - 1].push(cell)
                cell = ''
                if (char === '\n') rows.push([])
        }
        if (cell !== '' || rows[rows.length - 1].length > 0) rows[rows.length - 1].push(cell)
        return rows.filter((row) => row.length > 0)
}
