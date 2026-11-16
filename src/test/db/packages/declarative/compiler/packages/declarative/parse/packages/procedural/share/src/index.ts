import { quote } from '@db/test-compiler-share'
import type { Step } from '@db/test-share'
import type { Region, Table } from '@db/test-compiler-share'

const _hash = (text: string) => {
        let high = 0xdeadbeef
        let low = 0x41c6ce57
        for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i)
                high = Math.imul(high ^ code, 2654435761)
                low = Math.imul(low ^ code, 1597334677)
        }
        high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909)
        low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909)
        return 4294967296 * (2097151 & low) + (high >>> 0)
}

export const roll = (seed: number, ...salts: (string | number)[]) => _hash(`${seed}/${salts.join('/')}`) / 9007199254740992

export const intOf = (value: number, from: number, to: number) => from + Math.floor(value * (to - from + 1))

export const pickOf = <T>(value: number, list: T[]): T => list[Math.floor(value * list.length)]


type Make = (region: Region, at: number, tables?: Table[]) => any

const _STYLES = ['fill', 'color', 'border-top', 'width']

const _VALUES = ['#ffee00', 'red', '3', null]

const _roll = (region: Region, at: number, salt: string) => roll(region.seed, at, salt)

const _tableOf: Make = (region, at, tables = region.tables) => pickOf(_roll(region, at, 'table'), tables)

const _colOf = (region: Region, at: number, table: Table) => pickOf(_roll(region, at, 'col'), table.names)

const _rowOf = (region: Region, at: number, table: Table) => intOf(_roll(region, at, 'row'), 1, Math.max(1, table.rows))

const _idOf = (region: Region, at: number) => pickOf(_roll(region, at, 'id'), region.clients)

const _BODY: Record<string, (token: string, at: number) => string> = {
        ascii: (token) => token,
        日本語: (token, at) => `受注 ${at} 件 ${token}`,
        記号: (token) => `q"c 50% it's _/ ${token}`,
        長文: (token) => `${token} `.repeat(400),
}

const _NAME: Record<string, (at: number) => string> = {
        ascii: (at) => `col${at}`,
        日本語: (at) => `列${at}`,
        記号: (at) => `q"c ${at}%`,
        長文: (at) => `name ${at} ${'x'.repeat(40)}`,
}

export const textOf = (region: Region, at: number) => {
        const draw = _roll(region, at, 'text')
        if (draw < 0.1) return null
        if (draw < 0.2) return ''
        return _BODY[region.text](`v${region.seed}-${at}-token`, at)
}

export const nameOf = (region: Region, at: number) => _NAME[region.text](at)

export const OPS: Record<string, Make> = {
        cell(region, at, tables) {
                const table = _tableOf(region, at, tables)
                const text = textOf(region, at)
                const marks = text && _roll(region, at, 'mark') < 0.3 ? [[0, Math.min(2, text.length), 'bold', '1']] : []
                return { type: 'cell', id: _idOf(region, at), page: table.page, row: _rowOf(region, at, table), col: _colOf(region, at, table), text, marks }
        },
        style(region, at, tables) {
                const table = _tableOf(region, at, tables)
                const row = intOf(_roll(region, at, 'row'), 0, Math.max(1, table.rows))
                const name = pickOf(_roll(region, at, 'style'), _STYLES)
                return { type: 'style', id: _idOf(region, at), page: table.page, row, col: _colOf(region, at, table), name, value: pickOf(_roll(region, at, 'value'), _VALUES) }
        },
        window(region, at, tables) {
                const table = _tableOf(region, at, tables)
                return { type: 'window', id: _idOf(region, at), page: table.page, top: intOf(_roll(region, at, 'top'), 0, table.rows + 1), size: intOf(_roll(region, at, 'size'), 1, 200) }
        },
        undo: (region, at) => ({ type: 'undo', id: _idOf(region, at) }),
        redo: (region, at) => ({ type: 'redo', id: _idOf(region, at) }),
        rowAdd: (region, at, tables) => ({ type: 'row.add', page: _tableOf(region, at, tables).page }),
        rowDel(region, at, tables) {
                const table = _tableOf(region, at, tables)
                return { type: 'row.del', page: table.page, row: _rowOf(region, at, table) }
        },
        colAdd: (region, at, tables) => ({ type: 'col.add', page: _tableOf(region, at, tables).page, col: nameOf(region, at) }),
        range(region, at, tables) {
                const table = _tableOf(region, at, tables)
                return { type: 'sql', text: `select * from ${quote(table.page)} where "_id" >= ${_rowOf(region, at, table)} order by "_id" limit 20` }
        },
        scan(region, at, tables) {
                const table = _tableOf(region, at, tables)
                return { type: 'sql', text: `select count(*), max(length(${quote(_colOf(region, at, table))})) from ${quote(table.page)}` }
        },
        bad: (region, at) => ({ type: 'cell', id: 'u 1', page: `_${nameOf(region, at)}`, row: 1, col: 'a', text: 'x', marks: [] }),
}

export const rowSql = (op: { page: string; row: number }) => `select * from ${quote(op.page)} where "_id" = ${op.row}`

const _EDITS = ['cell', 'cell', 'cell', 'style', 'rowAdd', 'range']

const _run = (op: any): Step => ['run', 'A', op]

export const trioOf = (region: Region, at: number): Step[] => {
        const op = OPS.cell(region, at)
        const twin = "A'"
        return [['peek', twin, `h${at}a`, rowSql(op)], _run(op), ['peek', twin, `h${at}b`, rowSql(op)], _run({ type: 'undo', id: op.id }), ['expect', twin, { axis: '履歴', sql: rowSql(op), same: `h${at}a` }], _run({ type: 'redo', id: op.id }), ['expect', twin, { axis: '履歴', sql: rowSql(op), same: `h${at}b` }]]
}

export const sessionOf = (region: Region, at: number): Step[][] => {
        const base = at * 100
        const alone = { ...region, clients: region.clients.slice(0, 1) }
        const edits = Array.from({ length: intOf(roll(region.seed, base, 'edits'), 2, 8) }).flatMap((_, k): Step[] => [['tick', intOf(roll(region.seed, base + k, 'think'), 1, 120)], _run(OPS[pickOf(roll(region.seed, base + k, 'edit'), _EDITS)](alone, base + k))])
        const steps: Step[] = [_run(OPS.window(alone, base)), ...edits, _run({ type: 'leave', id: alone.clients[0] }), ['tick', intOf(roll(region.seed, base, 'gap'), 600, 86400)], ['open', 'A']]
        return steps.map((step) => [step])
}
