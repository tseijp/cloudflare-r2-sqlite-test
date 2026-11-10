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
