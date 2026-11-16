import { WRITES, ZERO, count, dueOf, isFresh, isOk, isSame, json, key, next, openBill, readBill, regionsOf, ret, saveBill, seen, set, winsOf } from '@db/test-compiler-plan-share'
import type { Code } from '@db/test-share'
import type { Draft } from '@db/test-compiler-plan-share'

type Book = (draft: Draft) => Code[]

const _NEXT: Record<string, string> = {
        open: 'open:2',
        'open:2': 'open:3',
        run: 'run:2',
        save: 'save:2',
        'save:2': 'save:3',
        load: 'load:2',
        peek: 'peek:2',
        stat: 'stat:2',
        expect: 'expect:2',
        see: 'see:2',
        'audit:2': 'audit:3',
        state: 'state:2',
        'state:2': 'state:3',
        'release:2': 'release:3',
}

const _sets = (node: string, values: Record<string, any>): Code[] => Object.entries(values).map(([name, value]) => set(key(node, name), value))

const _won = (reg: Record<string, any>, node: string): Code[] => [set('writes', reg.writes + 1), set('stamp', reg.writes + 1), set('writer', node), ..._sets(node, { seen: reg.writes + 1 })]

const _ran: Book = (draft) => {
        const view = seen(draft)
        const { reg, twin, out, io, at, isDone, isSync } = view
        const { node, facts } = draft
        const [payload, via] = draft.kind === 'run:2' ? draft.args : [{}, 'load']
        const isWrite = via !== 'run' || WRITES.includes(payload.type)
        const wins = winsOf(at('win') ?? {}, payload, isDone)
        const isLast = !!reg.policy && payload.type === 'leave' && isDone && Object.keys(at('win') ?? {}).length === 1 && Object.keys(wins).length === 0
        if (out === null) return []
        return [
                ...(isSync ? _sets(node, { sync: isSame(out, reg[key(twin, 'out')]) }) : []),
                ...(io.fail > 0 ? [..._sets(node, { hurt: true }), count(facts, 'regions', io.faults.map((fault) => `fault:${fault}`))] : []),
                ...(io.get > 0 ? [readBill(view)] : []),
                ...(isWrite && isDone ? _sets(node, { wrote: (at('wrote') ?? 0) + 1, edit: reg.now, first: at('first') ?? reg.now }) : []),
                ...(isWrite && !isDone ? _sets(node, { void: (at('void') ?? 0) + 1 }) : []),
                ..._sets(node, { win: wins, ...(payload.type === 'window' && isDone ? { gone: null } : {}) }),
                ...(isLast ? [next(['save', node]), next([':gone', node])] : []),
                ...(draft.kind === 'load:2' && !isDone && isSync && draft.args[3] <= draft.args[6] ? [next(['load:3', node])] : []),
                ret(out),
        ]
}

const _BOOK: Record<string, Book> = {
        'open:3': (draft) => {
                const view = seen(draft)
                const { reg, twin, out, stat, seqs } = view
                const { node, facts } = draft
                const sum = reg[key(twin, 'sum')]
                const fresh = { open: true, sync: isOk(reg[key(twin, 'out')]), hurt: false, after: false, limbo: false, win: {}, edit: null, first: null, gone: null, seen: reg.writes, wrote: 0, void: 0, base0: stat.base }
                if (out === null) return []
                if (!isOk(out)) return [..._sets(node, { limbo: true }), count(facts, 'marks', [`open:${out.error}`]), ret(out)]
                return [..._sets(node, fresh), set('saved', typeof sum === 'number' ? sum : null), set('maybe', facts.held ? reg.maybe : []), set('torn', false), openBill(view), count(facts, 'regions', regionsOf(facts, stat, seqs, node)), ret(out)]
        },
        'run:2': _ran,
        'load:2': _ran,
        'save:3': (draft) => {
                const view = seen(draft)
                const { reg, out, io, stat, seqs, at, isDone, isSync, isOpen, isFresh } = view
                const { node, facts } = draft
                const [kind, isForced, was] = draft.args
                const sum = isSync ? at('pend') : reg['P.sum']
                const unsure = isSync ? set('maybe', [...reg.maybe, at('pend')]) : set('saved', null)
                const regions = [...regionsOf(facts, stat, seqs, node), `save:${isForced ? 'forced' : kind}`, ...io.faults.map((fault) => `fault:${fault}`)]
                if (out === null) return [unsure]
                if (!isOpen) return [ret(out)]
                return [
                        ...(isDone && io.wrote > 0 ? [set('saved', typeof sum === 'number' ? sum : null), set('maybe', facts.held ? reg.maybe : []), set('torn', !!reg.torn || !isFresh), ..._won(reg, node)] : []),
                        ...(isDone ? _sets(node, { wrote: 0, void: 0, edit: null, first: null }) : [unsure]),
                        ...(io.fail > 0 ? _sets(node, { hurt: true }) : []),
                        ...(io.after > 0 ? _sets(node, { after: true }) : []),
                        saveBill(view, kind, was),
                        count(facts, 'regions', regions),
                        ...(isDone ? [] : [count(facts, 'marks', [`save:${out.error}`])]),
                        ret(out),
                ]
        },
        stop: ({ node, facts }) => {
                const how = facts.held === node ? 'held' : (facts.nodes[node]?.stat.dirty ?? 0) > 0 ? 'dirty' : 'clean'
                return [..._sets(node, { open: false, sync: false, edit: null, first: null, gone: null }), count(facts, 'regions', [`stop:${how}`])]
        },
        tick: ({ args: [seconds], facts }) => dueOf(facts, seconds).map(next),
        release: ({ args: [mode], facts }) => [next(['release:2', facts.held ?? '', mode])],
        'release:3': ({ node, args: [mode], facts }) => {
                const { reg } = facts
                const pend = reg[key(node, 'pend')]
                const isSaved = !!reg.freed?.isAlive && reg.freed.isApplied && isOk(reg[key(node, 'out')])
                const isKept = isSaved && isFresh(reg, node) && typeof pend === 'number'
                return [
                        ...(isSaved ? [..._won(reg, node), set('torn', !!reg.torn || !isFresh(reg, node)), ..._sets(node, { wrote: 0, void: 0, edit: null, first: null })] : []),
                        ...(isKept ? [set('saved', pend), set('maybe', [])] : []),
                        ...(reg.freed?.isApplied ? [] : [set('maybe', reg.maybe.filter((sum: number) => sum !== pend))]),
                        count(facts, 'marks', [`release:${mode}`]),
                ]
        },
        'peek:2': ({ node, args: [name], facts }) => {
                const got = facts.reg[key(node, 'peek')]
                const rows = got?.ok?.slice(1) ?? got?.error ?? null
                return [set(`peek.${name}`, rows), ret(rows)]
        },
        'stat:2': ({ node, facts }) => [ret(facts.reg[key(node, 'stat')])],
        audit: ({ node, facts }) => (facts.reg[key(node, 'sync')] ? [next(['audit:2', node])] : [['say', `${node} は shadow と一致していないので audit を送らない`]]),
        'state:3': ({ node, facts }) => {
                const stat = facts.reg[key(node, 'stat')] ?? ZERO
                return [set('saved', null), set('maybe', []), count(facts, 'regions', regionsOf(facts, stat, facts.reg.seqs.seqs).slice(0, 4)), ret(stat)]
        },
        ':gone': ({ node, facts }) => _sets(node, { gone: facts.reg.now }),
        paste: () => [set('saved', null), set('maybe', [])],
        done: ({ facts }) => [['close', json({ regions: facts.reg.regions, marks: facts.reg.marks }), '$ret']],
}

export const book = (draft: Draft): Code[] => {
        const { kind, node, args, pre, act, post, rule } = draft
        return [...pre, ...act, ...post, ...rule, ...(_BOOK[kind]?.(draft) ?? []), ...(_NEXT[kind] ? [next([_NEXT[kind], node, ...args])] : [])]
}
