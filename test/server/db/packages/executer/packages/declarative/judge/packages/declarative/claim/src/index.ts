import { same, settle } from '@test/server-executer-share'
import type { Stat } from '@test/server-share'
import type { Env } from '@test/server-executer-judge-share'

interface Want {
        error?: string
        store?: number[]
        calls?: unknown[]
        stat?: Partial<Stat>
        chunks?: number
        sql?: string
        params?: unknown[]
        rows?: unknown[]
}

export const claim = (env: Env) => ({
        // 手で書いた期待値と比べる。error は直前の命令の結果、calls は直前の命令の store の呼び出し (種類と番号)
        async expect(on: string, axis: string, known: string, want: Want) {
                const replica = env.fleet.of(on)
                const { out, slots } = replica
                const check = (label: string, isHeld: boolean, expected: unknown, observed: unknown) =>
                        env.book.check(axis, label, isHeld, expected, observed, known)
                const seqs = env.depot.list().map(([seq]) => seq)
                const result = out.ok ? 'resolved' : out.error
                const isError = want.error === '' ? out.ok : !out.ok && out.error.includes(want.error ?? '')
                if ('error' in want) check('outcome', isError, want.error || 'resolved', result)
                if (want.store) check('store', same(seqs, want.store), want.store, seqs)
                if (want.calls) check('calls', same(slots.calls, want.calls), want.calls, slots.calls)
                if (!replica.db) return
                const stat = replica.db.stat()
                const chunks = Math.ceil(stat.base / env.limits.CHUNK)
                const isStat = Object.entries(want.stat ?? {}).every(([key, item]) => stat[key as keyof Stat] === item)
                if (want.stat) check('stat', isStat, want.stat, stat)
                if (want.chunks) check('chunks', chunks === want.chunks, want.chunks, chunks)
                if (!want.sql) return
                const rows = await settle(replica.db.execute([['sql', want.sql, want.params ?? []]]))
                check('rows', rows.ok && same(rows.value, want.rows), want.rows, rows.ok ? rows.value : rows.error)
        },
})
