import { isHit, isStale, isWrite, NONE, settle } from '@test/server-executer-share'
import type { Code, Db } from '@test/server-share'
import type { Outcome, Replica, Roster, Shelf, World } from '@test/server-executer-share'

const _HELD: Outcome = { ok: false, held: true, value: undefined, error: '' }

// 製品の instance と twin に命令を送る装置。twin に送るかどうかは、製品が compile した命令列と、store の記録で決まる
export const createPilot = (fleet: Roster, depot: Shelf, world: World, reach: (key: string) => void) => {
        const _log = depot.log
        // 命令の結果か、put が保留されたことの、早いほうを取る
        const _race = async (replica: Replica, work: Promise<unknown>) => {
                const done = settle(work)
                replica.out = await Promise.race([done, depot.parked(replica.name).then(() => _HELD)])
                replica.pending = replica.out.held ? done : null
        }
        const _live = (on: string) => {
                const replica = fleet.of(on)
                const isBusy = !replica.db || !!replica.pending
                if (isBusy) throw new Error(`${on} は命令を受けられない (止まっているか、put が保留中)`)
                return replica as Replica & { db: Db }
        }
        // twin が製品と同じ命令を受けてよいかを決め、受けたら結果を echo に置く
        const _echo = async (replica: Replica, isWriting: boolean, work: (db: Db) => Promise<unknown>) => {
                const isFault = isHit(_log, replica)
                replica.echo = null
                if (!replica.out.ok && isFault && isWriting) replica.isDoubt = true
                if (replica.out.held || replica.isDoubt || !replica.twin) return
                if (!replica.out.ok && (isFault || isStale(_log, replica))) return
                replica.echo = await settle(work(replica.twin.db))
                if (replica.echo.ok !== replica.out.ok && isWriting) replica.isDoubt = true
        }
        return {
                boot(on: string) {
                        fleet.boot(on)
                        const live = fleet.names().filter((name) => fleet.of(name).db)
                        world.most = Math.max(world.most, live.length)
                },
                kill(on: string) {
                        reach(depot.isHolding(on) ? 'restart/midcall' : 'restart/boundary')
                        fleet.kill(on)
                },
                send(on: string, op: { id?: string }) {
                        if (op.id) world.ids.add(op.id)
                        return _race(_live(on), _live(on).db.run(op))
                },
                pipe(on: string, codes: Code[]) {
                        return _race(_live(on), _live(on).db.execute(codes))
                },
                mirror(on: string, op: unknown) {
                        return _echo(fleet.of(on), isWrite(fleet.of(on).codes), (db) => db.run(op))
                },
                relay(on: string, codes: Code[]) {
                        return _echo(fleet.of(on), true, (db) => db.execute(codes))
                },
                // open が解決したら、twin を今の store の写しから開き直し、作り直しで消える印を戻す
                async seed(on: string) {
                        const replica = _live(on)
                        if (!replica.out.ok) return
                        const out = await settle(fleet.seed(on))
                        const marks = { isDoubt: !out.ok, isSoiled: false, isWrote: false, isRolled: false }
                        const writes = replica.db.stat().dirty > 0 ? 1 : 0
                        Object.assign(replica, marks, { seen: _log.length, unsaved: -1, writes })
                        replica.edits.clear()
                },
                // 保留した put の行き先が決まった後、待っていた命令の結果を受け取る
                async resume(on: string) {
                        const replica = fleet.of(on)
                        replica.out = replica.pending ? await replica.pending : { ...NONE, error: 'instance stopped' }
                        replica.pending = null
                },
        }
}
