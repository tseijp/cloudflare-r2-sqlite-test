// 行、列、語の位置から決まる 32 bit の値。同じ引数は同じ値を返す
const _mix = (salt: number, row: number, col: number, word: number) =>
        Math.imul((salt + 1) * 0x9e3779b1 + row * 131 + col * 31 + word, 2654435761) >>> 0

// 取込の行を作る。count 行 × width 列で、1 cell は size 文字の英数字の語の並び
export const rows = (count: number, width: number, size: number, salt: number) => {
        const cell = (row: number, col: number) => {
                let text = ''
                for (let word = 0; text.length < size; word++) text += `${_mix(salt, row, col, word).toString(36)} `
                return text.slice(0, size)
        }
        return Array.from({ length: count }, (_, row) => Array.from({ length: width }, (_, col) => cell(row, col)))
}
