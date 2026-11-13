import { note, order, save } from '@test/server-compiler-plan-share'
import type { Plan } from '@test/server-compiler-plan-share'
import type { Seat } from '@test/server-share'

const _OPEN = { type: 'open' }

// cost.md 5 節。最後の編集から every ÷ 2 秒、編集が続いても every 秒で save する
const _isDue = (seat: Seat, clock: number) => {
        const isWaiting = seat.isLive && !seat.isHeld && seat.every > 0 && seat.unsaved >= 0
        return isWaiting && Math.min(seat.edited + seat.every / 2, seat.unsaved + seat.every) <= clock
}

// instance の生き死にと、時計の手
export const life: Record<string, Plan> = {
        // 止まっていれば新しい doc で作り直してから、store から開く
        open: ({ on }, stat) => [
                ...(stat.seats[on]?.isLive ? [] : [['boot', on] as [string, string]]),
                ['begin', on],
                ['judge', 'compile', on, _OPEN, []],
                ['send', on, _OPEN],
                ['seed', on],
                ['views', on, '', 0],
                ['account', on, 'open'],
                ['judge', 'calls', on, 0],
                ['judge', 'unique'],
                ['judge', 'atomic', on],
                ['judge', 'chain', on],
                ['judge', 'bound', on, 0],
                ['trace', on, 'open'],
        ],
        stop: ({ on }) => note(on, `${on} stop`, [['kill', on]]),
        every: ({ on, seconds }) => note(on, `${on} every ${seconds}s`, [['every', on, seconds]]),
        // 時計を進め、save の間隔に達した instance に save を送る
        tick: ({ seconds }, stat) => [
                ...note('', `tick ${seconds}s`, [['tick', seconds]]),
                ...Object.keys(stat.seats)
                        .filter((on) => _isDue(stat.seats[on], stat.clock + (seconds as number)))
                        .flatMap((on) => save(on, 'save', order(on))),
        ],
        limit: ({ seconds }) => [['limit', seconds]],
        measure: () => note('', 'measure', [['measure']]),
        mark: ({ key }) => [['mark', key]],
        done: () => [['begin', ''], ['judge', 'unique'], ['done']],
}
