import { blank, fresh } from '@test/server-executer-fleet-state'
import { settle } from '@test/server-executer-share'
import type { Input, Part } from '@test/server-share'
import type { Depot, Replica } from '@test/server-executer-share'

// 製品の instance、その twin、観測用の instance を持つ。作るのは、渡された make である
export const createFleet = (input: Input, main: Depot, spare: () => Depot) => {
        const _replicas = new Map<string, Replica>()
        const _make = (depot: Depot, who: string) => ({ depot, ...input.make(depot.handle(who)) })
        let _scout: ReturnType<typeof _make> | null = null
        const of = (name: string) => _replicas.get(name) ?? _replicas.set(name, blank(name)).get(name)!
        return {
                of,
                names() {
                        return [..._replicas.keys()]
                },
                // 製品の instance を作り直す。store は同じ
                boot(name: string) {
                        const { db, view } = _make(main, name)
                        Object.assign(of(name), fresh(), { db, view })
                },
                kill(name: string) {
                        Object.assign(of(name), { db: null, pending: null })
                },
                // twin を、今の store の写しから開き直す
                seed(name: string) {
                        const twin = (of(name).twin ??= _make(spare(), `${name}'`))
                        twin.depot.paste(main.copy())
                        return twin.db.run({ type: 'open' })
                },
                // 観測用の instance を、渡された写しで開き直す。store は変えない
                async look(parts: Map<number, Part>) {
                        _scout ??= _make(spare(), '?')
                        _scout.depot.paste(parts)
                        return { db: _scout.db, view: _scout.view, out: await settle(_scout.db.run({ type: 'open' })) }
                },
        }
}
