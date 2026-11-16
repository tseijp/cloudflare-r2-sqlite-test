import { SHAPES } from '@db/test-share'
import type { Consts, Step } from '@db/test-share'

export interface Fixture {
        file: string
        size: number
        line: number
        page: string
        names: string[]
}

export interface Spec {
        seed: number
        steps?: number
        fixtures: Fixture[]
        K: Consts
}

export interface Table {
        file: string
        bytes: number
        page: string
        col: string
        names: string[]
        rows: number
}

export interface Region {
        seed: number
        steps: number
        use: string
        event: string
        size: number
        tables: Table[]
        deltas: number
        patch: number
        residue: boolean
        clients: string[]
        text: string
}

export interface Script {
        region: Region
        turns: Step[][]
}

const _js = (value: any) => JSON.stringify(value)

const _nameOf = (node: string) => (node.endsWith("'") ? `${node.slice(0, -1).toLowerCase()}.shadow` : node.toLowerCase())

const _lineOf = ([kind, ...args]: Step) => {
        const [on, method] = SHAPES[kind]
        if (kind === 'see' && args[0] >= 0) return `await t.replica(${args[0]}).expect(${_js(args[1])})`
        if (kind === 'see') return `await t.store.expect(${_js(args[1])})`
        if (on === 'node') return `await ${_nameOf(args[0])}.${method}(${args.slice(1).map(_js).join(', ')})`
        if (on === 'store') return `await t.store.${method}(${args.map(_js).join(', ')})`
        return `await t.${method}(${args.map(_js).join(', ')})`
}

export const quote = (name: string) => `"${name.replace(/"/g, '""')}"`

export const print = (steps: Step[], title: string) => {
        const nodes = [...new Set(steps.filter(([kind]) => SHAPES[kind][0] === 'node').map(([, node]) => node.replace("'", '')))].sort()
        return [`import { sim } from '../sim.ts'`, '', `const t = sim(${_js({ title })})`, ...nodes.map((node) => `const ${node.toLowerCase()} = t.node('${node}')`), '', ...steps.map(_lineOf), '', 'export default await t.done()', ''].join('\n')
}
