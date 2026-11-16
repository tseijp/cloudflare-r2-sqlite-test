import { BUILD, MAIN, SHAPES } from '@db/test-share'
import { ZERO, call, canPush, chainOf, fillOf, json, key, set } from '@db/test-compiler-plan-share'
import type { Code, Facts, Step } from '@db/test-share'
import type { Draft } from '@db/test-compiler-plan-share'

type Lower = (args: any[], f: Facts) => Step

type Act = (node: string, args: any[], f: Facts) => Code[]

const _saveOf = (node: string, f: Facts): Step => ['save', node, f.nodes[node]?.save ?? 'none', false, f.nodes[node]?.stat ?? ZERO]

const _force = (node: string, kind: string, f: Facts): Step => {
        const stat = f.nodes[node]?.stat
        const isAllowed = !!stat && (kind === 'merge' || canPush(stat, f.K))
        if (!isAllowed) return ['note', '', `${kind} は範囲の外なので送らない`]
        return ['save', node, kind, true, stat]
}

const _LOWER: Record<string, Lower> = {
        run: ([node, op], f) => (op.type === 'save' ? _saveOf(node, f) : op.type === 'open' ? ['open', node] : ['run', node, op, 'run']),
        exec: ([node, codes]) => ['run', node, codes, 'execute'],
        save: ([node], f) => _saveOf(node, f),
        push: ([node], f) => _force(node, 'push', f),
        merge: ([node], f) => _force(node, 'merge', f),
        fill: ([node, page, names, rows, bytes, seed, batch]) => ['load', node, 'feed', page, names, rows, bytes, seed, batch],
        load: ([node, file, bytes]) => ['load', node, 'csv', file, bytes],
        state: ([spec]) => ['state', BUILD, spec],
}

const _ACT: Record<string, Act> = {
        open: (node, _, f) => [...(f.alive.includes(node) ? [] : ([['boot', node, MAIN]] as Code[])), ...call(f, node, 'run', { type: 'open' })],
        stop: (node) => [['kill', node]],
        run: (node, [payload, via], f) => call(f, node, via, payload),
        save: (node, [kind, isForced], f) => (isForced ? call(f, node, 'execute', [[kind]]) : call(f, node, 'run', { type: 'save' })),
        load: (node, [how, ...rest]) => {
                const [page, names, rows, bytes, seed, batch] = rest
                if (how === 'csv') return [['csv', node, rest[0], rest[1], key(node, 'out')]]
                return [['feed', node, json({ type: 'import', page, names }), 'rows', names.length, rows, bytes, seed, batch, key(node, 'out')]]
        },
        fail: (_, [kind, nth, seq]) => [['fail', MAIN, kind, nth, seq]],
        hold: (_, [kind, seq]) => [['hold', MAIN, kind, seq]],
        release: (_, [mode]) => [['free', mode, 'freed']],
        copy: (_, [name]) => [['fork', MAIN, name, null]],
        paste: (_, [name, seqs]) => [['fork', name, MAIN, seqs]],
        state: (node, [spec], f) => [['boot', node, MAIN], ['call', node, 'run', json({ type: 'open' }), key(node, 'out')], ...fillOf(spec, f), ['call', node, 'run', json({ type: 'save' }), key(node, 'out')]],
        'state:2': (_, [spec], f) => chainOf(spec, f),
        clock: (_, [at]) => [set('now', at)],
        policy: (_, [spec]) => [set('policy', spec)],
        note: (_, [text]) => [['say', text]],
}

export const act = (step: Step, facts: Facts): Draft => {
        const [name, ...rest] = step
        const isNode = SHAPES[name.split(':')[0]]?.[0] === 'node'
        const [kind, node, ...args] = _LOWER[name]?.(rest, facts) ?? (isNode || name.includes(':') ? step : [name, '', ...rest])
        const isHeld = facts.held !== null && facts.held === node && kind !== 'stop' && !kind.includes(':')
        if (isHeld) return { kind: 'note', node: '', args: [], facts, pre: [], act: [['say', `${node} は put の途中なので ${kind} を送らない`]], post: [], rule: [] }
        return { kind, node, args, facts, pre: [], act: _ACT[kind]?.(node, args, facts) ?? [], post: [], rule: [] }
}
