import { YServer } from 'y-partyserver'
import wasm from 'wa-sqlite/dist/wa-sqlite-async.wasm'
import { createDb } from '@db/server'
import type { Connection } from 'partyserver'
import type { Op, Store } from '@db/server'

const _PUT = 4.5

const _SECOND = 0.128 * 12.5

const _SHARE = 0.05

const _PACE = (_PUT / _SECOND / _SHARE) * 1000

const _FIRST = 'ページ 1'

const _part = async (object: R2ObjectBody | null) => (object ? { bytes: new Uint8Array(await object.arrayBuffer()), tag: object.httpEtag } : null)

const _createStore = (bucket: R2Bucket, name: string): Store => {
        const _key = (seq: number) => (seq ? `${name}.${seq}` : name)
        return {
                get: (seq, offset = 0, length) => bucket.get(_key(seq), { range: { offset, length } }).then(_part),
                put: async (seq, bytes, tag) => (await bucket.put(_key(seq), bytes, { onlyIf: new Headers(tag ? { 'if-match': tag } : { 'if-none-match': '*' }) }))?.httpEtag ?? null,
                delete: (seqs) => bucket.delete(seqs.map((seq) => _key(seq))),
        }
}

export class PartyServer extends YServer {
        static callbackOptions = { debounceWait: _PACE / 2, debounceMaxWait: _PACE }
        db = createDb({ wasm, store: _createStore((this.env as any).r2, this.name), doc: this.document })
        async onLoad() {
                await this.db.run({ type: 'open' })
                if (!this.document.getMap('view').has('pages/0')) await this.db.run({ type: 'page.add', page: _FIRST })
        }
        onSave() {
                return this.db.run({ type: 'save' })
        }
        async onRequest(request: Request) {
                const op: Op = await request.json()
                const done = (value: any) => ({ value: value ?? null })
                const fail = (error: any) => ({ error: String(error?.message ?? error) })
                return Response.json(await this.db.run(op).then(done, fail))
        }
        onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
                super.onClose(connection, code, reason, wasClean)
                if ([...this.getConnections()].every((other) => other === connection)) void this.db.run({ type: 'save' })
        }
}
