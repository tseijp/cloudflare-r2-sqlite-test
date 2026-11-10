import { YServer } from 'y-partyserver'
import wasm from 'wa-sqlite/dist/wa-sqlite.wasm?module'
import { openDb } from './server/db/index'
import type * as Y from 'yjs'
import type { Db, Op, Req, Sheet } from './server/db/index'
import type { Envelope } from './types'
import type { Storage } from './server/db/index'

const _bytes = async (body: R2ObjectBody | null) => (body ? new Uint8Array(await body.arrayBuffer()) : null)

const _list = async (bucket: R2Bucket, prefix: string, cursor?: string): Promise<{ key: string; size: number }[]> => {
        const page = await bucket.list({ prefix, cursor, limit: 1000 })
        const found = page.objects.map((o) => ({ key: o.key, size: o.size }))
        if (!page.truncated) return found
        return [...found, ...(await _list(bucket, prefix, page.cursor))]
}

export const createStorage = (bucket: R2Bucket): Storage => ({
        put: async (key, bytes, opts) => {
                const onlyIf = opts?.ifNoneMatch ? new Headers({ 'if-none-match': '*' }) : undefined
                const put = await bucket.put(key, bytes, { onlyIf })
                return put ? { etag: put.etag } : null
        },
        get: (key, range) => bucket.get(key, { range }).then(_bytes),
        list: (prefix) => _list(bucket, prefix),
        delete: (keys) => bucket.delete(keys),
})

const _run = (db: Db, { kind, body }: Envelope): Promise<unknown> => {
        if (kind === 'act') return db.act(body as Op)
        if (kind === 'move') return db.move(body as Req)
        if (kind === 'undo') return db.undo()
        if (kind === 'redo') return db.redo()
        if (kind === 'load') return db.load(body as Sheet[])
        return Promise.reject(new Error(`unknown kind: ${kind}`))
}

export const createRoom = (doc: Y.Doc, bucket: R2Bucket, name: () => string) => {
        let _db: Db | null = null
        return {
                open: async () => void (_db = await openDb({ storage: createStorage(bucket), doc, prefix: `grid/${name()}/`, wasm })),
                save: async () => void (await _db?.save()),
                serve: async (request: Request) => {
                        const envelope: Envelope = await request.json()
                        const done = (value: unknown) => ({ id: envelope.id, value: value ?? null })
                        const fail = (error: unknown) => ({ id: envelope.id, error: String(error) })
                        return Response.json(await _run(_db!, envelope).then(done, fail))
                },
        }
}

export class PartyServer extends YServer {
        _room = createRoom(this.document, this.env.r2, () => this.name)
        onLoad() {
                return this._room.open()
        }
        onSave() {
                return this._room.save()
        }
        onRequest(request: Request) {
                return this._room.serve(request)
        }
}
