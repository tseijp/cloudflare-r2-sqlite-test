import { EDIT_LIMITS } from './ops.mjs'
import { attempt, txidOf } from './product.mjs'

const productFrames = async (image, op, since) => {
        await attempt(() => image.checkpoint())
        const edited = await attempt(() => image.edit(op))
        const got = await attempt(() => image.frames(since))
        const frames = (got.value ?? []).filter((fr) => Number(fr.txid) > since)
        const fallback = Number(edited.value?.txid) || Number(image.txid) || since
        return {
                ok: edited.ok && got.ok,
                frames,
                txid: txidOf(frames, fallback),
                error: edited.error ?? got.error ?? null,
        }
}

const judge = (name, n, f) => (n == null ? null : EDIT_LIMITS[name](n, f))

export const measureEdit = async ({ image, base, ops, f, fBase, txid0, onFrames }) => {
        const items = {}
        let since = txid0
        for (const item of ops) {
                const ref = await base.frames(item.sql)
                const baseline = {
                        baseline: ref.frames,
                        baseline_pass: judge(item.name, ref.frames, fBase),
                        baseline_error: ref.error,
                }
                if (!image) {
                        items[item.name] = { op: item.op.kind, product: null, pass: false, mismatch: null, ...baseline }
                        continue
                }
                const got = await productFrames(image, item.op, since)
                if (onFrames) await onFrames({ name: item.name, frames: got.frames, txid: got.txid })
                since = Math.max(since, got.txid)
                const count = got.ok ? got.frames.length : null
                items[item.name] = {
                        op: item.op.kind,
                        product: count,
                        pass: judge(item.name, count, f) === true,
                        mismatch: count != null && ref.frames != null ? count !== ref.frames : null,
                        ...baseline,
                        txid: got.txid,
                        pages: got.frames.map((fr) => fr.pgno),
                        error: got.error,
                }
        }
        const mismatched = Object.keys(items).filter((k) => items[k].mismatch === true)
        return {
                ok: Boolean(image) && Object.values(items).every((i) => i.error == null),
                f,
                f_baseline: fBase,
                batch_limit: f > 0 ? Math.ceil(50 / f) + 3 : null,
                batch_limit_baseline: fBase > 0 ? Math.ceil(50 / fBase) + 3 : null,
                baseline_source: base.source,
                frames_mismatch: mismatched,
                items,
                last_txid: since,
        }
}
