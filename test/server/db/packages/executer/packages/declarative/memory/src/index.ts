import { find, isWrite, same, settle } from '@test/server-executer-share'
import type { Replica, World } from '@test/server-executer-share'

// 命令の間で覚えるものを持つ装置。登録済みの問い合わせ、client ごとの直前の編集、編集の時刻と回数。
// 分岐の鍵は、製品が compile した命令列 (contract.md 7 節) だけである
export const createMemory = (of: (name: string) => Replica, world: World) => {
        // 製品の問い合わせ (fill の命令のもの) を twin で実行する。実行できなければ値は無い
        const _ask = async (replica: Replica, text: unknown, params: unknown) => {
                if (!replica.twin || replica.isDoubt) return undefined
                const out = await settle(replica.twin.db.execute([['sql', text, params]]))
                return out.ok ? out.value : undefined
        }
        return {
                // 解決した命令の view と drop を、登録済みの問い合わせの表に写す。消した view の名前を覚える
                views(on: string, id: string, size: number) {
                        const replica = of(on)
                        const dropped: string[] = []
                        if (!replica.out.ok) return
                        if (id && size) replica.sizes.set(id, size)
                        for (const [code, name, text, params, tags] of replica.codes ?? []) {
                                const isGone = (tags: string[]) => code === 'drop' && tags.includes(name as string)
                                const gone = [...replica.views].filter(([, view]) => isGone(view.tags))
                                for (const [key] of gone) dropped.push(key) && replica.views.delete(key)
                                if (code === 'view') replica.views.set(name as string, { text, params, tags } as never)
                        }
                        replica.slots.dropped = dropped
                },
                // SQL に書く命令が解決したら、編集の時刻と回数を進める。reject なら rollback の印を付ける
                touch(on: string, type: string) {
                        const replica = of(on)
                        if (replica.out.held || (type !== 'exec' && !isWrite(replica.codes))) return
                        if (!replica.out.ok) return (replica.isRolled = true)
                        const since = replica.unsaved < 0 ? world.clock : replica.unsaved
                        Object.assign(replica, { edited: world.clock, unsaved: since, writes: replica.writes + 1 })
                        replica.types.add(type)
                },
                // 命令の前の値を取る。fill があればその問い合わせ、undo / redo ならその client の直前の編集の問い合わせ
                async recall(on: string) {
                        const replica = of(on)
                        const fill = find(replica.codes, ['fill'])
                        const edit = replica.edits.get(find(replica.codes, ['undo', 'redo'])?.[1] as string)
                        const ask = fill ? [fill[2], fill[3]] : edit ? [edit.text, edit.params] : undefined
                        replica.slots.was = ask && (await _ask(replica, ask[0], ask[1]))
                },
                // forget があれば全員の編集を捨てる。
                // set があれば、fill の問い合わせの前後の値を、その origin の直前の編集として覚える
                async learn(on: string) {
                        const replica = of(on)
                        const { was } = replica.slots
                        const fill = find(replica.codes, ['fill'])
                        const origin = find(replica.codes, ['set'])?.[3] as string
                        if (!replica.out.ok) return
                        if (find(replica.codes, ['forget'])) replica.edits.clear()
                        if (!fill || !origin || !Array.isArray(was)) return
                        const [, key, text, params] = fill as [string, string, string, unknown[]]
                        const now = await _ask(replica, text, params)
                        if (!Array.isArray(now)) return
                        const isGhost = !was.length && !now.length
                        const edit = { key, text, params, was, now, isGhost, isUndone: false }
                        const stale = [...replica.edits].filter(([id, old]) => id === origin || old.key === key)
                        for (const [id] of stale) replica.edits.delete(id)
                        if (isGhost || !same(was, now)) replica.edits.set(origin, edit)
                },
        }
}
