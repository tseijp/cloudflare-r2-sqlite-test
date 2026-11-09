import { createImage } from './image/index.ts'
import { createReplica } from './replica/index.ts'
import { createWindow } from './sync/index.ts'
import type { Replica } from './replica/index.ts'
import type { Run } from './sync/index.ts'
import type { Image, Input } from './utils/share/types.ts'

export type * from './utils/share/types.ts'

const _sourceOf = (input: Input, replica: Replica | null) => {
        if (input.bytes) return Promise.resolve(input.bytes)
        if (replica) return replica.restore(input.txid)
        return Promise.resolve(null)
}

const _runOf = (image: Image): Run => ({
        query: async (req) => image.window(req),
        edit: async (op) => image.edit(op),
        schema: async () => image.schema(),
})

const _syncOf = (image: Image, replica: Replica) => ({ sync: () => replica.push(image.frames(replica.txid), image.txid) })

export const openDb = async (input?: Input | null) => {
        const { storage: _storage, doc: _doc, txid: _txid } = input ?? {}
        const _replica = _storage ? createReplica(_storage) : null
        const image = await createImage(await _sourceOf(input ?? {}, _replica), _txid ?? _replica?.txid ?? 0)
        return {
                image,
                ...(_replica && { replica: Object.assign(_replica, _syncOf(image, _replica)) }),
                ...(_doc && { window: createWindow(_doc, _runOf(image)) }),
        }
}

export type Db = Awaited<ReturnType<typeof openDb>>
