import { crowd, every, kinds, state } from '@test/server-executer-report-region'
import { applied, brief, calls, isHit, mine, shape, ZERO } from '@test/server-executer-share'
import type { Limits, Stat, Tally } from '@test/server-share'
import type { Call, Event, Replica, Shelf, World } from '@test/server-executer-share'

// 記録の置き場 (book) のうち、この装置が使う操作
interface Notes {
        next(): void
        line(text: string): void
        zero(keys: string[]): void
        reach(key: string): void
        spend(event: Event): void
        done(log: Call[]): Tally
}

const _seen = (call: Call) => (call.hit ? [...shape(call), call.hit] : shape(call))

// 手ごとの記録を取る装置。始まりの印、費用の出来事、到達した領域、1 行の出力
type Of = (name: string) => Replica

export const createReport = (limits: Limits, of: Of, depot: Shelf, book: Notes, world: World) => {
        const _log = depot.log
        const _image = () => depot.list().find(([seq]) => seq === 0)
        // 式の外: delta が 1 つ少ない状態で、製品の save の式が merge を選ぶ
        const _isOutside = (replica: Replica, stat: Stat) => {
                const less = { ...stat, deltas: stat.deltas - 1, patch: 0, dirty: 1 }
                return !!replica.db && stat.deltas > 0 && replica.db.compile({ type: 'save' }, less)[0]?.[0] === 'merge'
        }
        // 到達した領域。open と save の時点の状態と、save までに解決した命令の種類
        const _reach = (replica: Replica, stat: Stat, plan: string) => {
                for (const key of state(limits, stat, _isOutside(replica, stat))) book.reach(key)
                if (!plan) return
                for (const type of replica.types) book.reach(`change/${type}`)
                if (stat.pages >= limits.LIMIT - limits.CHUNK) book.reach('change/near')
        }
        book.zero(every(limits))
        return {
                // 手の始まり。store の記録の位置と、命令の前の stat を覚える
                begin(on: string) {
                        book.next()
                        if (!on) return
                        const replica = of(on)
                        Object.assign(replica, { at: _log.length, before: replica.db?.stat() ?? ZERO })
                        replica.slots.tag = _image()?.[1] ?? ''
                        replica.slots.event = undefined
                },
                // 費用の出来事を 1 つ残す。open は開いた store の状態 (twin の stat)、save は前の stat で数える。
                // reject した命令と、障害が入った命令は、費用にも領域にも数えない
                account(on: string, kind: string) {
                        const replica = of(on)
                        const seen = calls(_log, replica)
                        const count = (op: string) => seen.filter((call) => call.op === op).length
                        const stat = kind === 'open' ? (replica.twin?.db.stat() ?? ZERO) : replica.before
                        const plan = kind === 'save' ? ((replica.codes?.[0]?.[0] as string) ?? '') : kind
                        const base = replica.db?.stat().base ?? 0
                        const ratio = base > 0 ? ((_image()?.[2] as number) ?? 0) / (base * limits.PAGE) : 1
                        const bytes = seen.reduce((total, call) => total + call.bytes, 0)
                        const used = { ratio, bytes, gets: count('get'), puts: count('put') }
                        const isSave = kind !== 'open' && kind !== 'read'
                        const event = { ...stat, ...used, plan, kind: isSave ? 'save' : kind }
                        for (const call of seen) if (call.hit) book.reach(`fault/${call.hit}`)
                        if (!replica.out.ok || isHit(_log, replica) || (kind === 'read' && !seen.length)) return
                        book.spend(event)
                        if (kind === 'read') return
                        replica.slots.event = event
                        _reach(replica, stat, plan === 'open' ? '' : plan)
                },
                // save の後、store と揃った位置と、編集の印を戻す
                sync(on: string) {
                        const replica = of(on)
                        if (applied(_log, replica).length) replica.seen = _log.length
                        if (!replica.out.ok) return
                        Object.assign(replica, { unsaved: -1, writes: 0, isRolled: false })
                        replica.types.clear()
                },
                // 1 手を 1 行で出す。命令の結果を返す
                trace(on: string, label: string) {
                        const replica = of(on)
                        const seen = mine(_log, replica)
                        const { out } = replica
                        const bad = out.held ? 'held' : `reject: ${out.error}`
                        const result = out.ok ? `ok ${brief(out.value, 60)}` : bad
                        const tail = seen.length ? ` calls ${brief(seen.map(_seen), 240)}` : ''
                        replica.slots.calls = calls(_log, replica).map((call) => [call.op, call.seq])
                        replica.isSoiled ||= isHit(_log, replica)
                        replica.isWrote ||= seen.some((call) => call.hit === 'put.after')
                        const store = brief(depot.list(), 200)
                        book.line(`${world.clock}s ${on} ${label} -> ${result}${tail} store ${store}`)
                        return out.ok ? out.value : undefined
                },
                // 本文と名前の種類を、到達した領域として数える
                text(texts: (string | null)[]) {
                        for (const key of kinds(limits, texts)) book.reach(key)
                },
                done() {
                        book.reach(`instance/${world.most}`)
                        book.reach(crowd(world.ids.size))
                        return book.done(_log)
                },
        }
}
