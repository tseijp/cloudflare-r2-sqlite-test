import { check, isOk, isSame, json } from './code.ts'
import type { Code } from '@db/test-share'
import type { View } from './view.ts'

export const sqlOf = (codes: any[]) => codes.map((code) => (code[0] === 'sql' || code[0] === 'read' ? code[1] : code[0] === 'view' || code[0] === 'fill' ? code[2] : '')).join('\n')

export const soundOf = (reg: Record<string, any>): Code[] => [check('integrity', isOk(reg['P.out']), 'store の copy を別の instance で開ける'), check('integrity', json(reg['P.fit']?.ok) === '[["ok"]]', 'integrity_check が ok を返す')]

export const expectOf = ({ K, reg, out, io, stat, at }: View, want: any): Code[] => {
        const [axis, known] = [want.axis ?? '期待', want.known ?? '']
        const rows = at('see')?.ok?.slice(1) ?? at('see')?.error
        const calls: Record<string, number> = typeof want.calls === 'number' ? { calls: want.calls } : (want.calls ?? {})
        const isError = want.error === '' ? isOk(out) : want.error === true ? !isOk(out) : String(out?.error ?? '').includes(want.error)
        return [
                ...(want.error === undefined ? [] : [check(axis, isError, `error は ${json(want.error)}。観測 ${json(out?.error ?? '')}`, known)]),
                ...Object.entries(want.stat ?? {}).map(([name, value]) => check(axis, (stat as any)[name] === value, `stat.${name} は ${value}。観測 ${(stat as any)[name]}`, known)),
                ...(want.sql ? [check(axis, isSame(rows, want.rows ?? reg[`peek.${want.same}`]), `${want.sql} の結果。観測 ${json(rows).slice(0, 200)}`, known)] : []),
                ...Object.entries(calls).map(([name, value]) => check(axis, (io as any)[name] === value, `store の ${name} は ${value} 回。観測 ${(io as any)[name]}`, known)),
                ...(want.store ? [check(axis, isSame(reg.seqs.seqs, want.store), `store の object は ${json(want.store)}。観測 ${json(reg.seqs.seqs)}`, known)] : []),
                ...(want.chunks === undefined ? [] : [check(axis, Math.ceil(stat.base / K.CHUNK) === want.chunks, `image は ${want.chunks} chunk。観測 ${Math.ceil(stat.base / K.CHUNK)}`, known)]),
        ]
}

export const seeOf = (reg: Record<string, any>, seq: number, want: any): Code[] => {
        const seqs: number[] = reg.seqs.seqs
        const [axis, known] = [want.axis ?? '期待', want.known ?? '']
        const isLinked = seqs.includes(seq) && isOk(reg['P.out']) && seq <= (reg['P.stat']?.deltas ?? 0)
        return [
                ...(want.exists === undefined ? [] : [check(axis, seqs.includes(seq) === want.exists, `object ${seq} は${want.exists ? '在る' : '無い'}。観測 ${json(seqs)}`, known)]),
                ...(want.linked === undefined ? [] : [check(axis, isLinked === want.linked, `object ${seq} はchain に${want.linked ? '繋がる' : '繋がらない'}。観測 deltas ${reg['P.stat']?.deltas}`, known)]),
                ...(want.seqs ? [check(axis, isSame(seqs, want.seqs), `store の object は ${json(want.seqs)}。観測 ${json(seqs)}`, known)] : []),
        ]
}
