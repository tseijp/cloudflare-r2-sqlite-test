import type { KeyboardEvent } from 'react'
import type { Dispatch, Snap } from '@db/client-share'

const _CELL = 'border border-[#d9d9d9] px-2 py-1 text-left'

export const Console = ({ snap, dispatch }: { snap: Snap; dispatch: Dispatch }) => {
        const [names = [], ...rows] = snap.result ?? []
        const onKey = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && dispatch({ type: 'sql', text: e.currentTarget.value })
        return (
                <div className="flex flex-col gap-2">
                        <input placeholder="select name from sqlite_master" onKeyDown={onKey} className="h-9 rounded-md border border-[#d9d9d9] px-3 font-mono outline-none focus:border-[#4185f4]" />
                        {snap.note && <div className="text-[#c5221f]">{snap.note}</div>}
                        {snap.result && (
                                <table className="border-collapse font-mono text-[12px]">
                                        <thead>
                                                <tr>
                                                        {names.map((name: string, order: number) => (
                                                                <th key={order} className={_CELL + ' bg-[#f1f1f1]'}>
                                                                        {name}
                                                                </th>
                                                        ))}
                                                </tr>
                                        </thead>
                                        <tbody>
                                                {rows.map((row, line) => (
                                                        <tr key={line}>
                                                                {row.map((value: any, order: number) => (
                                                                        <td key={order} className={_CELL}>
                                                                                {String(value ?? '')}
                                                                        </td>
                                                                ))}
                                                        </tr>
                                                ))}
                                        </tbody>
                                </table>
                        )}
                </div>
        )
}
