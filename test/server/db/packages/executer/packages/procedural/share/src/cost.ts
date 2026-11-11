import { canPush, PUT } from '@test/server-share'
import type { Bill, Limits } from '@test/server-share'

// 費用の出来事 1 つ。open は開いた store の状態、save は命令の前の状態を持つ
export interface Event {
        kind: string
        plan: string
        gets: number
        puts: number
        bytes: number
        ratio: number
        pages: number
        base: number
        dirty: number
        deltas: number
        patch: number
}

type State = [base: number, deltas: number, patch: number, cost: number]

type Row = [gets: number, puts: number, pages: number]

// cost.md 9 節の表。この方式の回数と転送 page。store の状態は、最良の探索では仮の値になる
const _row = (limits: Limits, event: Event, plan: string, [base, deltas, patch]: number[]): Row => {
        if (event.kind === 'open') return base <= limits.CHUNK ? [1, 0, base] : [2 + deltas, 0, limits.CHUNK + patch]
        if (plan === 'push') return [0, 1, event.dirty]
        if (plan === 'merge') return base <= limits.CHUNK ? [0, 1, event.pages] : [1, 1, base + event.pages]
        return [0, 0, 0]
}

// GET 1 回を 1 とする。転送は、圧縮比を掛けた page を SWAP で割る
const _unit = (limits: Limits, event: Event, [gets, puts, pages]: Row) =>
        gets + PUT * puts + (pages * event.ratio) / limits.SWAP

const _cost = (limits: Limits, event: Event, plan: string, state: number[]) =>
        _unit(limits, event, _row(limits, event, plan, state))

const _observed = (limits: Limits, event: Event) =>
        event.gets + PUT * event.puts + event.bytes / limits.PAGE / limits.SWAP

const _formula = (limits: Limits, event: Event) => {
        if (event.kind === 'read') return _observed(limits, event)
        return _cost(limits, event, event.plan, [event.base, event.deltas, event.patch])
}

// 丸ごと保存。open で全体を get し、変化のある save で全体を put する
const _whole = (limits: Limits, event: Event) => {
        if (event.kind === 'open') return _unit(limits, event, [1, 0, event.pages])
        if (event.kind === 'save' && event.dirty > 0) return _unit(limits, event, [0, 1, event.pages])
        return 0
}

// 出来事 1 つの後に取り得る状態を並べる。open は費用を足すだけ、変化のある save は push か merge かで分かれる
const _next = (limits: Limits, event: Event, state: State): State[] => {
        const [base, deltas, patch, cost] = state
        const isSave = event.kind === 'save' && event.dirty > 0
        if (event.kind === 'open') return [[base, deltas, patch, cost + _cost(limits, event, '', state)]]
        if (!isSave) return [state]
        const merged: State = [event.pages, 0, 0, cost + _cost(limits, event, 'merge', state)]
        if (!canPush(limits, base, deltas, patch + event.dirty)) return [merged]
        return [merged, [base, deltas + 1, patch + event.dirty, cost + _cost(limits, event, 'push', state)]]
}

// 同じ状態に着く列のうち、費用が小さいほうだけを残す
const _prune = (states: State[]) => {
        const best = new Map<string, State>()
        for (const state of states) {
                const key = state.slice(0, 3).join()
                if ((best.get(key)?.[3] ?? Infinity) > state[3]) best.set(key, state)
        }
        return [...best.values()]
}

// 変化のある save ごとに push か merge かを後から選び、合計が最も小さい列の費用を返す。SQL の読みは除く
const _best = (limits: Limits, events: Event[]) => {
        let states: State[] = [[events[0].base, events[0].deltas, events[0].patch, 0]]
        for (const event of events) states = _prune(states.flatMap((state) => _next(limits, event, state)))
        return Math.min(...states.map((state) => state[3]))
}

const _sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

// 命令 1 つの、式の get と put の回数
export const quota = (limits: Limits, event: Event) => {
        const [gets, puts] = _row(limits, event, event.plan, [event.base, event.deltas, event.patch])
        return { gets, puts }
}

// scenario の費用。観測、式、丸ごと保存、最良、SQL の読み
export const bill = (limits: Limits, events: Event[]): Bill => ({
        observed: _sum(events.map((event) => _observed(limits, event))),
        formula: _sum(events.map((event) => _formula(limits, event))),
        whole: _sum(events.map((event) => _whole(limits, event))),
        best: events.length ? _best(limits, events) : 0,
        reads: _sum(events.filter((event) => event.kind === 'read').map((event) => _observed(limits, event))),
})
