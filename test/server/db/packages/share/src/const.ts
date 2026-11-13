// score.md 5 節の 12 軸。安全性 10 と費用 2 (回数、式)
export const AXES = ['一意', '永続', '原子', '鎖', '単一書き', '上限', 'compile', '装飾', '窓', '履歴', '回数', '式']

// contract.md 7 節で、SQL の文が入る operand の位置
export const TEXTS: Record<string, number> = { sql: 1, read: 1, view: 2, fill: 2 }

// cost.md 9 節。PUT は GET の 12.5 倍 (4.50 ÷ 0.36)
export const PUT = 12.5

// 模擬 store に予約できる障害
export const FAULTS = ['get', 'put', 'put.after', 'put.null', 'delete']

// 保留した put の行き先
export const FATES = ['arrive', 'lose']

// plan が到達として数える領域の名前。行の出どころと、制約の外の入力
export const MARK = { generated: 'rows/generated', filled: 'rows/filled', csv: 'rows/csv', outside: 'text/outside' }

export const MARKS = Object.values(MARK)
