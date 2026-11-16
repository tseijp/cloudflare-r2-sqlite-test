import { MAIN, twinOf } from '@db/test-share'
import { LOST, SCHEMA, digest, isOk, json, key, lintOf, pagesOf, probe } from '@db/test-compiler-plan-share'
import type { Code } from '@db/test-share'
import type { Draft } from '@db/test-compiler-plan-share'

interface Watched {
        pre?: Code[]
        post?: Code[]
}

type Watch = (draft: Draft) => Watched

const _span = (node: string): Code => ['span', MAIN, node]

const _seen = (node: string): Code[] => [
        ['tally', MAIN, node, key(node, 'io')],
        ['stat', node, key(node, 'stat')],
        ['list', MAIN, 'seqs'],
]

const _isSync = ({ node, facts }: Draft) => !!facts.reg[key(node, 'sync')]

const _twin = (node: string, codes: Code[]): Code[] => codes.map((code) => code.map((operand) => (operand === node ? twinOf(node) : operand === key(node, 'out') ? key(twinOf(node), 'out') : operand)) as Code)

const _anchor = ({ node, facts }: Draft): Code[] => {
        const twin = twinOf(node)
        if (!isOk(facts.reg[key(node, 'out')])) return []
        return [['fork', MAIN, twin, null], ...(facts.alive.includes(twin) ? [] : ([['boot', twin, twin]] as Code[])), ['call', twin, 'run', json({ type: 'open' }), key(twin, 'out')], digest(twin, key(twin, 'sum'))]
}

const _relist = ({ node, facts }: Draft): Code[] => {
        const twin = twinOf(node)
        const wins: any[] = Object.values(facts.reg[key(node, 'win')] ?? {})
        const pages = Object.entries(pagesOf(facts.reg[key(twin, 'schema')]?.ok ?? []))
        return [
                ...wins.flatMap((op): Code[] => [
                        ['call', twin, 'run', json({ type: 'leave', id: op.id }), key(twin, 'tmp')],
                        ['call', twin, 'run', json(op), key(twin, 'tmp')],
                ]),
                ['tree', node, key(node, 'tree')],
                ['tree', twin, key(twin, 'tree')],
                ['call', twin, 'execute', json([['sql', LOST, []]]), key(twin, 'lint.0')],
                ...pages.map(([page, cols], at): Code => ['call', twin, 'execute', json([['sql', ...lintOf(page, cols)]]), key(twin, `lint.${at + 1}`)]),
        ]
}

const _WATCH: Record<string, Watch> = {
        open: ({ node }) => ({ pre: [_span(node)], post: _seen(node) }),
        'open:2': (draft) => ({ post: _anchor(draft) }),
        run: (draft) => {
                const { node, args } = draft
                const [payload, via] = args
                const plans: Code[] = [1, 2].map((at) => ['call', node, 'compile', json(payload), key(node, `c${at}`)])
                const mirror: Code[] = [['call', twinOf(node), via, json(payload), key(twinOf(node), 'out')]]
                return { pre: [...(via === 'run' ? plans : []), _span(node)], post: [['tally', MAIN, node, key(node, 'io')], ...(_isSync(draft) ? mirror : [])] }
        },
        save: (draft) => ({ pre: [...(_isSync(draft) ? [digest(twinOf(draft.node), key(draft.node, 'pend'))] : []), _span(draft.node)], post: _seen(draft.node) }),
        'save:2': ({ node, facts }) => ({ post: isOk(facts.reg[key(node, 'out')]) && facts.reg[key(node, 'io')].wrote > 0 ? probe(facts) : [] }),
        load: (draft) => ({
                pre: [...(_isSync(draft) ? [digest(twinOf(draft.node), key(draft.node, 'was'))] : []), _span(draft.node)],
                post: [['tally', MAIN, draft.node, key(draft.node, 'io')], ...(_isSync(draft) ? _twin(draft.node, draft.act) : [])],
        }),
        'load:2': (draft) => ({ post: !isOk(draft.facts.reg[key(draft.node, 'out')]) && _isSync(draft) && draft.args[3] <= draft.args[6] ? [digest(twinOf(draft.node), key(draft.node, 'now'))] : [] }),
        peek: ({ node, args }) => ({ post: [['call', node, 'run', json({ type: 'sql', text: args[1] }), key(node, 'peek')]] }),
        stat: ({ node }) => ({ post: [['stat', node, key(node, 'stat')]] }),
        expect: ({ node, args: [want] }) => ({
                post: [
                        ...(want.stat || want.chunks !== undefined ? ([['stat', node, key(node, 'stat')]] as Code[]) : []),
                        ...(want.sql ? ([['call', node, 'run', json({ type: 'sql', text: want.sql }), key(node, 'see')]] as Code[]) : []),
                        ...(want.store ? ([['list', MAIN, 'seqs']] as Code[]) : []),
                ],
        }),
        see: ({ args: [, want], facts }) => ({ post: [['list', MAIN, 'seqs'], ...(want.linked === undefined ? [] : probe(facts))] }),
        audit: (draft) => ({ post: _isSync(draft) ? [['call', twinOf(draft.node), 'execute', json([['sql', SCHEMA, []]]), key(twinOf(draft.node), 'schema')]] : [] }),
        'audit:2': (draft) => ({ post: _relist(draft) }),
        state: ({ node }) => ({ post: [['stat', node, key(node, 'stat')]] }),
        'state:2': ({ node }) => ({ post: [['stat', node, key(node, 'stat')], ['list', MAIN, 'seqs'], ['kill', node]] }),
        release: () => ({ post: [['list', MAIN, 'seqs']] }),
        'release:2': ({ facts }) => ({ post: facts.reg.freed?.isApplied ? probe(facts) : [] }),
}

export const watch = (draft: Draft): Draft => ({ ...draft, ..._WATCH[draft.kind]?.(draft) })
