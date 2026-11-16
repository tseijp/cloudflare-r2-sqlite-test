import { space } from '@db/test-compiler-parse-space'
import { story } from '@db/test-compiler-parse-story'
import { storm } from '@db/test-compiler-parse-storm'
import { SHAPES } from '@db/test-share'
import type { Step } from '@db/test-share'
import type { Script, Spec } from '@db/test-compiler-share'

type Shape = (args: any[]) => any[]

const _FAULTS = ['get', 'put', 'put.after', 'delete']

const _MODES = ['arrive', 'lose']

const _node: Shape = ([node]) => [node]

const _must = (isValid: boolean, name: string) => {
        if (!isValid) throw new Error(`invalid ${name}`)
}

const _STEP: Record<string, Shape> = {
        open: _node,
        stop: _node,
        save: _node,
        push: _node,
        merge: _node,
        stat: _node,
        audit: _node,
        run: ([node, op]) => (_must(typeof op?.type === 'string', 'run.op'), [node, op]),
        exec: ([node, codes]) => (_must(Array.isArray(codes), 'exec.codes'), [node, codes]),
        fill: ([node, page, names, rows, bytes = 100, seed = 1, batch = rows]) => (_must(rows > 0 && bytes > 0 && batch > 0, 'fill.rows'), [node, page, [names].flat(), rows, bytes, seed, batch]),
        load: ([node, file, bytes = 65536]) => (_must(typeof file === 'string' && bytes > 0, 'load.file'), [node, file, bytes]),
        peek: ([node, name, text]) => (_must(typeof name === 'string' && typeof text === 'string', 'peek.name'), [node, name, text]),
        expect: ([node, want]) => (_must(typeof want === 'object', 'expect.want'), [node, want]),
        fail: ([kind, nth = 0, seq = -1]) => (_must(_FAULTS.includes(kind) && nth >= 0, 'fail.kind'), [kind, nth, seq]),
        hold: ([kind = 'put', seq = -1]) => (_must(_FAULTS.includes(kind), 'hold.kind'), [kind, seq]),
        release: ([mode = 'arrive']) => (_must(_MODES.includes(mode), 'release.mode'), [mode]),
        copy: ([name]) => (_must(typeof name === 'string', 'copy.name'), [name]),
        paste: ([name, seqs = null]) => (_must(typeof name === 'string', 'paste.name'), [name, seqs]),
        see: ([seq, want]) => (_must(typeof seq === 'number' && typeof want === 'object', 'see.seq'), [seq, want]),
        state: ([spec = {}]) => [spec],
        tick: ([seconds]) => (_must(seconds >= 0, 'tick.seconds'), [seconds]),
        policy: ([spec = { every: 56, idle: 70 }]) => (_must(spec.every > 0 && spec.idle > 0, 'policy.every'), [spec]),
        note: ([text]) => [String(text)],
        mark: ([name, isHit = true]) => [name, isHit],
        done: () => [],
}

export const parse = ([kind, ...args]: Step): Step => {
        const isInner = kind.includes(':') || kind === 'clock'
        if (isInner) return [kind, ...args]
        _must(kind in _STEP, `step ${kind}`)
        _must(SHAPES[kind]?.[0] !== 'node' || /^[A-H]'?$/.test(args[0]), `${kind}.node`)
        return [kind, ..._STEP[kind](args)]
}

export const script = (spec: Spec) => {
        const { region, turns }: Script = storm(story(space(spec)))
        return { region, steps: turns.flat() }
}
