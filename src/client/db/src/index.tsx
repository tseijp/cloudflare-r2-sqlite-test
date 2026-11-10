import { useSyncExternalStore } from 'react'
import { compile } from '@db/client-compiler'
import { View, createExecuter } from '@db/client-executer'
import type { Event, Input } from '@db/client-share'

export const createGrid = (input: Input) => {
        const _executer = createExecuter(input)
        const dispatch = (event: Event) => {
                const codes = compile(event, _executer.snap())
                _executer.run(codes)
                return codes.length > 0
        }
        _executer.subscribe(() => void dispatch({ type: 'boot' }))
        dispatch({ type: 'boot' })
        return {
                compile,
                dispatch,
                Grid: () => <View snap={useSyncExternalStore(_executer.subscribe, _executer.snap)} dispatch={dispatch} />,
        }
}

export type { Code, Event, Input, Snap, State } from '@db/client-share'
