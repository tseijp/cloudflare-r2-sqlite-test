// import { createRoot } from 'react-dom/client'
// import YProvider from 'y-partyserver/provider'
// import * as Y from 'yjs'
// import { createGrid } from './client/db/index'
// import type { Send } from './client/db/index'
// import './style.css'
// import { Kind, Reply } from './types'

// const room = new URLSearchParams(location.search).get('room') ?? 'default'

// const doc = new Y.Doc()

// new YProvider(location.host, room, doc, { party: 'v1' })

// const createSend = (url: string): Send => {
//         let _id = 0
//         const _post = async (kind: Kind, body?: unknown) => {
//                 const res = await fetch(url, { method: 'POST', body: JSON.stringify({ id: ++_id, kind, body }) })
//                 const reply: Reply = await res.json()
//                 if (reply.error !== undefined) return Promise.reject(new Error(reply.error))
//                 return reply.value
//         }
//         return {
//                 act: (op) => _post('act', op),
//                 move: (req) => _post('move', req),
//                 undo: () => _post('undo'),
//                 redo: () => _post('redo'),
//                 load: (sheets) => _post('load', sheets),
//         }
// }

// const { Grid } = createGrid(doc, createSend(`/parties/v1/${room}`))

// createRoot(document.getElementById('root')!).render(<Grid />)

import { createRoot } from 'react-dom/client'
import YProvider from 'y-partyserver/provider'
import * as Y from 'yjs'
import { createGrid } from '@db/client'
import './style.css'

const _room = new URLSearchParams(location.search).get('room') ?? 'default'

const _url = `/parties/v1/${_room}`

const _doc = new Y.Doc()

const _id = String(_doc.clientID)

const _send = async (op: object) => {
        const res = await fetch(_url, { method: 'POST', body: JSON.stringify(op) })
        const { value, error } = await res.json()
        if (error !== undefined) return Promise.reject(new Error(error))
        return value
}

const { Grid, dispatch } = createGrid({ doc: _doc, id: _id, send: _send })

new YProvider(location.host, _room, _doc, { party: 'v1' }).on('sync', (isSynced: boolean) => isSynced && dispatch({ type: 'sync' }))

addEventListener('pagehide', () => navigator.sendBeacon(_url, JSON.stringify({ type: 'leave', id: _id })))

createRoot(document.getElementById('root')!).render(<Grid />)
