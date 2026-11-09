import { pageHashes, quoteId } from './inspect.mjs'
import { attempt } from './product.mjs'

const isOrdered = (gets) => {
        const kinds = gets.map((g) => g.range?.suffix != null)
        const firstPage = kinds.indexOf(false)
        return kinds[0] === true && (firstPage < 0 || !kinds.slice(firstPage).includes(true))
}

const indexFirst = (log) => {
        const byKey = Map.groupBy(log, (g) => g.key)
        return byKey.size > 0 && [...byKey.values()].every(isOrdered)
}

export const inspectImage = async (image, table) => {
        await attempt(() => image.checkpoint())
        const checked = await attempt(() => image.sql('PRAGMA integrity_check').rows.map((r) => r.integrity_check))
        const counted = await attempt(() => image.sql(`SELECT count(*) AS n FROM ${quoteId(table)}`).rows[0].n)
        const bytes = await attempt(() => image.bytes())
        const hashes = bytes.ok ? pageHashes(bytes.value) : null
        const error = checked.error ?? counted.error ?? bytes.error
        return {
                integrity: checked.value?.join(';') ?? null,
                rows: counted.value,
                hashes,
                bytes: bytes.value?.length,
                error,
        }
}

const compare = (actual, expected) => {
        const diff =
                actual.hashes && expected.hashes
                        ? expected.hashes.filter((h, i) => actual.hashes[i] !== h).length
                        : null
        const pages = actual.hashes?.length ?? null
        const isSame = actual.integrity === 'ok' && actual.rows === expected.rows && pages === expected.hashes?.length
        const { integrity, rows, error } = actual
        return {
                match: isSame && diff === 0,
                integrity,
                rows,
                rows_expected: expected.rows,
                pages,
                pages_diff: diff,
                error,
        }
}

const missing = (error) => ({ push: async () => {}, mark: async () => {}, finish: async () => ({ ok: false, error }) })

export const createProbe = async ({ product, db, counter, pageSize, txid0, table }) => {
        if (!db?.replica) return missing('replica facet missing')
        const { image, replica } = db
        const pushes = []
        const marks = [{ label: 'snapshot', txid: txid0, expected: await inspectImage(image, table) }]
        counter.reset()
        const snap = await attempt(async () => replica.snapshot(await image.bytes(), txid0))
        const snapshot = { ok: snap.ok, error: snap.error, txid: txid0, ...counter.stats() }
        const push = async ({ name, frames, txid }) => {
                if (!frames.length) return pushes.push({ name, frames: 0, sent_bytes: 0, skipped: true })
                counter.reset()
                const r = await attempt(() => replica.push(frames, txid))
                const s = counter.stats()
                pushes.push({
                        name,
                        frames: frames.length,
                        txid,
                        ...s,
                        ratio: s.sent_bytes / (frames.length * pageSize),
                        ...r,
                })
        }
        const mark = async (label, txid) => marks.push({ label, txid, expected: await inspectImage(image, table) })
        const restoreAt = async (label, txid, expected) => {
                counter.reset()
                const r = await attempt(() => replica.restore(txid))
                const s = { ...counter.stats(), index_first: indexFirst(counter.log()) }
                const opened = r.ok ? await product.open({ bytes: r.value }) : r
                const actual = opened.ok ? await inspectImage(opened.value.image, table) : { error: opened.error }
                return {
                        label,
                        txid: txid ?? null,
                        ...compare(actual, expected),
                        ...s,
                        read_ratio: s.get_bytes / expected.bytes,
                }
        }
        const finish = async () => {
                const restores = []
                for (const m of marks) restores.push(await restoreAt(m.label, m.txid, m.expected))
                const latest = await inspectImage(image, table)
                restores.push(await restoreAt('latest', undefined, latest))
                counter.reset()
                const compacted = await attempt(() => replica.compact(1))
                const compact = {
                        ok: compacted.ok,
                        error: compacted.error,
                        result: compacted.value,
                        ...counter.stats(),
                }
                restores.push(await restoreAt('latest_after_compact', undefined, latest))
                const sent = pushes.reduce((n, p) => n + p.sent_bytes, 0)
                const dirty = pushes.reduce((n, p) => n + p.frames, 0)
                const objects = await counter.storage.list('')
                return {
                        ok: snapshot.ok && pushes.every((p) => p.skipped || p.ok),
                        error: snapshot.error ?? pushes.find((p) => p.error)?.error ?? null,
                        snapshot,
                        pushes,
                        sent_bytes: sent,
                        dirty_pages: dirty,
                        ratio: dirty ? sent / (dirty * pageSize) : null,
                        compact,
                        restores,
                        txid: replica.txid,
                        restore_match: restores.every((r) => r.match),
                        index_first: restores.every((r) => r.index_first),
                        objects,
                }
        }
        return { push, mark, finish }
}
