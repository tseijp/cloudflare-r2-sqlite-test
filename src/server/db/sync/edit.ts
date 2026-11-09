import { capture, isRefresh } from './capture.ts'
import { inWindow } from './row.ts'
import { patch } from './patch.ts'
import type { Op } from '../utils/share/types.ts'
import type { Ctx, History, Run, Side, Step } from './utils/share/types.ts'

export const createEdit = (ctx: Ctx, run: Run, history: History, refresh: () => Promise<void>) => {
        const _write = (ops: Op[]) => () => ops.forEach((op) => patch(ctx, op))
        const _isLive = (step: Step | null) => !!step && inWindow(ctx.tree, step.rows).length === step.rows.length
        const _replay = async (side: Side, key: 'apply' | 'revert') => {
                const step = history.peek(side)
                if (!step) return
                for (const op of step[key]) await run.edit(op)
                history.flip(side, _write(step[key]))
                if (step[key].some(isRefresh)) await refresh()
        }
        return {
                act: async (op: Op) => {
                        const step = capture(ctx, op)
                        const res = await run.edit(op)
                        history.record(_isLive(step) ? step : null, _write([op]))
                        if (isRefresh(op)) await refresh()
                        return res
                },
                undo: () => _replay('undo', 'revert'),
                redo: () => _replay('redo', 'apply'),
        }
}
