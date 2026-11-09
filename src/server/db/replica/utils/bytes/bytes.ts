export const readU16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]

export const readU32 = (b: Uint8Array, o: number) => {
        return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}

export const readU64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o)

export const writeU16 = (b: Uint8Array, o: number, v: number) => {
        b[o] = v >>> 8
        b[o + 1] = v
}

export const writeU32 = (b: Uint8Array, o: number, v: number) => {
        b[o] = v >>> 24
        b[o + 1] = v >>> 16
        b[o + 2] = v >>> 8
        b[o + 3] = v
}

export const writeU64 = (b: Uint8Array, o: number, v: bigint) => {
        new DataView(b.buffer, b.byteOffset, b.byteLength).setBigUint64(o, v)
}

export const encodeVarint = (value: number) => {
        const out: number[] = []
        let v = value
        while (v >= 0x80) {
                out.push((v % 0x80) | 0x80)
                v = Math.floor(v / 0x80)
        }
        out.push(v)
        return out
}

export const decodeVarint = (b: Uint8Array, o: number) => {
        let value = 0
        let scale = 1
        let next = o
        while (b[next] >= 0x80) {
                value += (b[next] & 0x7f) * scale
                scale *= 0x80
                next++
        }
        value += b[next] * scale
        return { value, next: next + 1 }
}

export const encodeText = (text: string) => new TextEncoder().encode(text)

export const decodeText = (b: Uint8Array) => new TextDecoder().decode(b)
