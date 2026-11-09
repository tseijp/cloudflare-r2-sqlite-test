import { createImage } from './image/index.ts'
import { createReplica } from './replica/index.ts'
import { createWindow } from './sync/index.ts'
import type { Replica } from './replica/index.ts'
import type { Run } from './sync/index.ts'
import type { Image, Input } from './utils/share/types.ts'

export type * from './utils/share/types.ts'

const sourceOf = (input: Input, replica: Replica | null) => {
        if (input.bytes) return Promise.resolve(input.bytes)
        if (replica) return replica.restore(input.txid)
        return Promise.resolve(null)
}

const runOf = (image: Image): Run => ({
        query: async (req) => image.window(req),
        edit: async (op) => image.edit(op),
        schema: async () => image.schema(),
})

const syncOf = (image: Image, replica: Replica) => ({ sync: () => replica.push(image.frames(replica.txid), image.txid) })

export const openDb = async (input?: Input | null) => {
        const { storage, doc, txid } = input ?? {}
        const replica = storage ? createReplica(storage) : null
        const image = await createImage(await sourceOf(input ?? {}, replica), txid ?? replica?.txid ?? 0)
        return {
                image,
                ...(replica && { replica: Object.assign(replica, syncOf(image, replica)) }),
                ...(doc && { window: createWindow(doc, runOf(image)) }),
        }
}

export type Db = Awaited<ReturnType<typeof openDb>>
