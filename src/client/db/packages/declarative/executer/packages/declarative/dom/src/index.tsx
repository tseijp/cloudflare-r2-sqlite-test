import { Band } from './band.tsx'
import { Console } from './console.tsx'
import { Sheet } from './sheet.tsx'
import type { Dispatch, Snap } from '@db/client-share'

export const View = ({ snap, dispatch }: { snap: Snap; dispatch: Dispatch }) => (
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-6 text-[13px] text-[#1f1f21]">
                <Band snap={snap} dispatch={dispatch} />
                <Sheet snap={snap} dispatch={dispatch} />
                <Console snap={snap} dispatch={dispatch} />
        </div>
)
