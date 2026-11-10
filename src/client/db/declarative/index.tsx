import { useSyncExternalStore } from 'react'
import { Bar, Editor, Frame, Head, Lines, Ruler } from './cells'
import { CSS, SQ, SQUARES } from './const'
import { createGesture } from './gesture'
import { createQueue } from './queue'
import { createStore } from './store'
import { offsets } from '../procedural/paint/index'
import type * as Y from 'yjs'
import type { Send } from '../procedural/share/types'

export type * from '../procedural/share/types'

export const createGrid = (doc: Y.Doc, send: Send) => {
        const _view = String(doc.clientID)
        const _store = createStore(doc, _view)
        const _gesture = createGesture(_store, createQueue(send, _view))
        const Grid = () => {
                useSyncExternalStore(_store.subscribe, _store.version, _store.version)
                const win = _store.win()
                const fields = _store.fields()
                const { sel, edit } = _store.ui()
                const xs = offsets(fields.map((field) => field.width))
                const squares = Math.max(SQUARES, xs[xs.length - 1])
                return (
                        <div style={CSS.root}>
                                <Bar pages={_store.pages()} page={win?.page} bar={_gesture.bar} />
                                <div ref={_gesture.ref} tabIndex={0} onKeyDown={_gesture.onKeyDown} onDoubleClick={_gesture.onDoubleClick} onScroll={_gesture.onScroll} style={CSS.sheet}>
                                        <div style={{ ...CSS.sticky, width: squares * SQ }}>
                                                <Ruler squares={squares} />
                                                <Head fields={fields} xs={xs} order={win?.order} onSort={_gesture.sort} />
                                                {edit?.row === 0 && <Editor edit={edit} xs={xs} fields={fields} editor={_gesture.editor} />}
                                        </div>
                                        <div style={{ ...CSS.paper, width: squares * SQ, height: ((win?.rows ?? 0) + SQUARES) * SQ }}>
                                                <Lines lines={_store.lines()} fields={fields} xs={xs} />
                                                {sel && <Frame sel={sel} xs={xs} />}
                                                {!!edit?.row && <Editor edit={edit} xs={xs} fields={fields} editor={_gesture.editor} />}
                                        </div>
                                </div>
                        </div>
                )
        }
        return { Grid }
}
