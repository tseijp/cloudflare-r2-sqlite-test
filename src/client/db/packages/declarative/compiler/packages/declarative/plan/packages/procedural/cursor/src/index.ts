import type { Snap } from '@db/client-share'

const _clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export const toTarget = (snap: Snap) => {
        const [slot, index] = snap.sel ?? [-2, -1]
        const col: string | undefined = snap.cols[index]?.[0]
        const row: number | undefined = slot === -1 ? 0 : snap.rows[slot]?.[0]
        if (col === undefined || row === undefined) return null
        return { slot, index, row, col }
}

export const toText = (snap: Snap): string => {
        const target = toTarget(snap)
        if (!target) return ''
        if (target.row === 0) return target.col
        return snap.rows[target.slot][target.index + 1] ?? ''
}

export const toMarks = (snap: Snap): any[][] => {
        const target = toTarget(snap)
        return (target && snap.marks[`${target.row}/${target.col}`]) || []
}

export const toMoved = (snap: Snap, dx: number, dy: number): [slot: number, index: number] | null => {
        if (!snap.sel) return null
        return [_clamp(snap.sel[0] + dy, -1, snap.rows.length - 1), _clamp(snap.sel[1] + dx, 0, snap.cols.length - 1)]
}

export const toToggled = (marks: any[][], start: number, stop: number): any[][] => {
        const rest = marks.filter((mark) => !(mark[2] === 'bold' && mark[0] === start))
        return rest.length === marks.length ? [...marks, [start, stop, 'bold', '1']] : rest
}
