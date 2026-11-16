import { BUILD, MAIN } from '@db/test-share'
import { quote } from '@db/test-compiler-share'
import { json, key } from './code.ts'
import type { Code, Facts } from '@db/test-share'

const _touch = (table: any, at: number, per: number): Code => {
        const text = `update ${quote(table.page)} set ${quote(table.col)} = ? where "_id" in (select "_id" from ${quote(table.page)} where "_id" % 97 = ? limit ?)`
        return ['call', BUILD, 'execute', json([['sql', text, [`d${at}`, at % 97, per]]]), key(BUILD, 'out')]
}

export const fillOf = ({ tables, page = 'p', cols = ['a'], chunks = 1, bytes = 2000, seed = 1 }: any, { K }: Facts): Code[] => {
        const out = key(BUILD, 'out')
        const rows = Math.round(((chunks - 0.5) * K.CHUNK * (K.PAGE - 96)) / (bytes + 16))
        if (tables) return tables.map((table: any) => ['csv', BUILD, table.file, table.bytes, out])
        return [
                ['call', BUILD, 'run', json({ type: 'page.add', page }), out],
                ...cols.map((col: string): Code => ['call', BUILD, 'run', json({ type: 'col.add', page, col }), out]),
                ['feed', BUILD, json({ type: 'import', page, names: cols }), 'rows', cols.length, rows, bytes, seed, 2000, out],
        ]
}

export const chainOf = ({ tables, page = 'p', cols = ['a'], deltas = 0, patch = 0, residue = false }: any, f: Facts): Code[] => {
        const out = key(BUILD, 'out')
        const table = tables ? tables[0] : { page, col: cols[0] }
        const per = Math.max(1, Math.min(Math.round(patch / Math.max(deltas, 1)), Math.floor((f.K.CHUNK - 16) / Math.max(deltas, 1))))
        const pushes = Array.from({ length: deltas }).flatMap((_, at): Code[] => [_touch(table, at, per), ['call', BUILD, 'execute', json([['push']]), out]])
        const residues: Code[] = [['fail', MAIN, 'delete', 0, -1], _touch(table, deltas, per), ['call', BUILD, 'execute', json([['merge']]), out]]
        if ((f.reg[key(BUILD, 'stat')]?.base ?? 0) <= f.K.CHUNK) return []
        return [...pushes, ...(residue ? residues : [])]
}
