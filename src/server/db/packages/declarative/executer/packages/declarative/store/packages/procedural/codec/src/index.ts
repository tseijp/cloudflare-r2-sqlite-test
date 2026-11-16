import { PAGE } from '@db/server-share'
import type { Delta } from '@db/server-share'

const _IMAGE = 0x53514c49

const _DELTA = 0x53514c44

const _FRAME = 4 + PAGE

const _flow = async (bytes: Uint8Array, stream: any) => new Uint8Array(await new Response(new Blob([bytes as any]).stream().pipeThrough(stream)).arrayBuffer())

export const pack = (bytes: Uint8Array) => _flow(bytes, new CompressionStream('gzip'))

export const unpack = (bytes: Uint8Array) => _flow(bytes, new DecompressionStream('gzip'))

export const encodeImage = (pages: number, parts: Uint8Array[]) => {
        const head = 12 + parts.length * 4
        const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, head))
        const view = new DataView(out.buffer)
        view.setUint32(0, _IMAGE)
        view.setUint32(4, pages)
        view.setUint32(8, parts.length)
        parts.reduce((at, part, index) => {
                view.setUint32(12 + index * 4, part.length)
                out.set(part, at)
                return at + part.length
        }, head)
        return out
}

export const decodeImage = (bytes: Uint8Array) => {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const isImage = bytes.length >= 12 && view.getUint32(0) === _IMAGE
        if (!isImage) return null
        return { pages: view.getUint32(4), sizes: Array.from({ length: view.getUint32(8) }, (_, index) => view.getUint32(12 + index * 4)) }
}

export const encodeDelta = ({ prev, commit, pages }: Delta) => {
        const tag = new TextEncoder().encode(prev)
        const head = 16 + tag.length
        const out = new Uint8Array(head + pages.length * _FRAME)
        const view = new DataView(out.buffer)
        view.setUint32(0, _DELTA)
        view.setUint32(4, commit)
        view.setUint32(8, pages.length)
        view.setUint32(12, tag.length)
        out.set(tag, 16)
        pages.forEach(([pgno, bytes], index) => {
                view.setUint32(head + index * _FRAME, pgno)
                out.set(bytes, head + index * _FRAME + 4)
        })
        return pack(out)
}

export const decodeDelta = async (packed: Uint8Array): Promise<Delta | null> => {
        const bytes = await unpack(packed)
        const view = new DataView(bytes.buffer)
        const isDelta = bytes.length >= 16 && view.getUint32(0) === _DELTA
        if (!isDelta) return null
        const head = 16 + view.getUint32(12)
        const count = view.getUint32(8)
        const frame = (index: number): [number, Uint8Array] => [view.getUint32(head + index * _FRAME), bytes.subarray(head + index * _FRAME + 4, head + (index + 1) * _FRAME)]
        if (bytes.length !== head + count * _FRAME) return null
        return { prev: new TextDecoder().decode(bytes.subarray(16, head)), commit: view.getUint32(4), pages: Array.from({ length: count }, (_, index) => frame(index)) }
}
