import { note, settle } from '@test/server-compiler-plan-share'
import type { Plan } from '@test/server-compiler-plan-share'

// 障害、保留、store の写しの手
export const chaos: Record<string, Plan> = {
        // その instance の、その method への次の呼び出し (skip 回を飛ばした後) に障害を予約する
        fault: ({ on, kind, skip }) => note(on, `${on} fault ${kind} skip ${skip}`, [['fault', on, kind, skip]]),
        // 次の put を、store に届く前で止める
        hold: ({ on }) => note(on, `${on} hold`, [['fault', on, 'put.hold', 0]]),
        // 止めた put を届けるか失い、待っていた save の結果を判定する
        // 止まった put が無ければ、予約を取り消して記録だけを残す
        release: ({ on, fate }, stat) => {
                if (!stat.seats[on]?.isHeld) return note(on, `${on} release: 保留した put は無い`, [['calm', on]])
                return [['begin', on], ['release', on, fate], ...settle(on, 'read', `release ${fate}`)]
        },
        copy: ({ label }) => note('', `copy ${label}`, [['copy', label]]),
        // 写しを戻す。seqs があれば、その番号の object だけを今の store の横に置く
        paste: ({ label, seqs }) => {
                const text = `paste ${label} ${JSON.stringify(seqs)}`
                return note('', text, [['paste', label, seqs], ['judge', 'unique']])
        },
}
