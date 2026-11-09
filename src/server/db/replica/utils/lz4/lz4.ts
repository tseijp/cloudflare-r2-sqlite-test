import { LZ4_HASH_BITS, LZ4_HASH_MUL, LZ4_LAST_LITERALS, LZ4_MAX_DISTANCE, LZ4_MF_LIMIT, LZ4_MIN_MATCH } from '../share/const.ts'

export const compressBound = (n: number) => n + Math.floor(n / 255) + 16

const _readU32LE = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

const _hashOf = (v: number) => Math.imul(v, LZ4_HASH_MUL) >>> (32 - LZ4_HASH_BITS)

const _writeLength = (dst: Uint8Array, di: number, length: number) => {
        let n = length
        let pos = di
        while (n >= 255) {
                dst[pos++] = 255
                n -= 255
        }
        dst[pos++] = n
        return pos
}

interface _Sequence {
        anchor: number
        ip: number
        offset: number
        matchLen: number
}

const _writeSequence = (src: Uint8Array, dst: Uint8Array, di: number, seq: _Sequence) => {
        const { anchor, ip, offset, matchLen } = seq
        const litLen = ip - anchor
        const tokenPos = di
        let pos = di + 1
        if (litLen >= 15) pos = _writeLength(dst, pos, litLen - 15)
        dst.set(src.subarray(anchor, ip), pos)
        pos += litLen
        const litToken = Math.min(litLen, 15) << 4
        if (matchLen < LZ4_MIN_MATCH) {
                dst[tokenPos] = litToken
                return pos
        }
        dst[pos++] = offset & 0xff
        dst[pos++] = offset >>> 8
        const ml = matchLen - LZ4_MIN_MATCH
        if (ml >= 15) pos = _writeLength(dst, pos, ml - 15)
        dst[tokenPos] = litToken | Math.min(ml, 15)
        return pos
}

export const compress = (src: Uint8Array) => {
        const dst = new Uint8Array(compressBound(src.length))
        const table = new Int32Array(1 << LZ4_HASH_BITS).fill(-1)
        const limit = src.length - LZ4_MF_LIMIT
        const matchEnd = src.length - LZ4_LAST_LITERALS
        let ip = 0
        let anchor = 0
        let di = 0
        while (ip < limit) {
                const v = _readU32LE(src, ip)
                const h = _hashOf(v)
                const ref = table[h]
                table[h] = ip
                const isMatch = ref >= 0 && ip - ref <= LZ4_MAX_DISTANCE && _readU32LE(src, ref) === v
                if (!isMatch) {
                        ip++
                        continue
                }
                let len = LZ4_MIN_MATCH
                while (ip + len < matchEnd && src[ref + len] === src[ip + len]) len++
                di = _writeSequence(src, dst, di, { anchor, ip, offset: ip - ref, matchLen: len })
                ip += len
                anchor = ip
        }
        di = _writeSequence(src, dst, di, { anchor, ip: src.length, offset: 0, matchLen: 0 })
        return dst.slice(0, di)
}

const _readLength = (src: Uint8Array, ip: number, base: number) => {
        let length = base
        let pos = ip
        let b = 255
        while (b === 255) {
                b = src[pos++]
                length += b
        }
        return { length, pos }
}

export const decompress = (src: Uint8Array, dst: Uint8Array) => {
        let ip = 0
        let op = 0
        while (ip < src.length) {
                const token = src[ip++]
                let litLen = token >>> 4
                if (litLen === 15) ({ length: litLen, pos: ip } = _readLength(src, ip, litLen))
                dst.set(src.subarray(ip, ip + litLen), op)
                ip += litLen
                op += litLen
                if (ip >= src.length) return op
                const offset = src[ip] | (src[ip + 1] << 8)
                ip += 2
                let matchLen = token & 15
                if (matchLen === 15) ({ length: matchLen, pos: ip } = _readLength(src, ip, matchLen))
                matchLen += LZ4_MIN_MATCH
                let ref = op - offset
                for (let i = 0; i < matchLen; i++) dst[op++] = dst[ref++]
        }
        return op
}
