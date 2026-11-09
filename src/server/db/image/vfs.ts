import { VFS } from './utils/config/config.ts'

export interface File {
        data: Uint8Array
        size: number
        dirty: Set<number>
        isMain: boolean
}

const OK = 0

const SHORT_READ = 522

const NOT_FOUND = 12

const ok = (..._: unknown[]) => OK

const createFile = (bytes: Uint8Array | null, isMain: boolean): File => ({
        data: bytes ? bytes.slice() : new Uint8Array(0),
        size: bytes ? bytes.length : 0,
        dirty: new Set(),
        isMain,
})

const grow = (file: File, need: number) => {
        if (need <= file.data.length) return
        const next = new Uint8Array(Math.max(need, file.data.length * 2))
        next.set(file.data.subarray(0, file.size))
        file.data = next
}

const isSame = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i])

const keepCounter = (file: File, old: Uint8Array) => {
        file.data.set(old.subarray(24, 28), 24)
        file.data.set(old.subarray(92, 96), 92)
}

const write = (file: File, src: Uint8Array, offset: number) => {
        const old = file.isMain && offset === 0 && file.size > 0 ? file.data.slice(0, src.length) : null
        grow(file, offset + src.length)
        file.data.set(src, offset)
        file.size = Math.max(file.size, offset + src.length)
        if (old) keepCounter(file, old)
        if (old && isSame(old, file.data.subarray(0, src.length))) return
        if (file.isMain) file.dirty.add(offset / src.length + 1)
}

const read = (file: File, dest: Uint8Array, offset: number) => {
        const got = Math.max(0, Math.min(dest.length, file.size - offset))
        dest.set(file.data.subarray(offset, offset + got))
        dest.fill(0, got)
        return got < dest.length ? SHORT_READ : OK
}

export const createVfs = (module: any) => {
        const files = new Map<string, File>()
        const handles = new Map<number, string>()
        const at = (id: number) => files.get(handles.get(id)!)!
        const open = (name: string | null, id: number, flags: number, out: DataView) => {
                const key = name ?? `temp-${id}`
                if (!files.has(key)) files.set(key, createFile(null, false))
                handles.set(id, key)
                return ok(out.setInt32(0, flags, true))
        }
        const close = (id: number) => {
                const key = handles.get(id)!
                const isMain = files.get(key)?.isMain
                handles.delete(id)
                if (!isMain) files.delete(key)
                return OK
        }
        const vfs = {
                name: VFS,
                xOpen: open,
                xClose: close,
                xRead: (id: number, dest: Uint8Array, offset: number) => read(at(id), dest, offset),
                xWrite: (id: number, src: Uint8Array, offset: number) => ok(write(at(id), src, offset)),
                xTruncate: (id: number, size: number) => ok((at(id).size = Math.min(at(id).size, size))),
                xSync: ok,
                xFileSize: (id: number, out: DataView) => ok(out.setBigInt64(0, BigInt(at(id).size), true)),
                xLock: ok,
                xUnlock: ok,
                xCheckReservedLock: (_: number, out: DataView) => ok(out.setInt32(0, 0, true)),
                xFileControl: () => NOT_FOUND,
                xSectorSize: () => 4096,
                xDeviceCharacteristics: ok,
                xDelete: (name: string) => ok(files.delete(name)),
                xAccess: (name: string, _: number, out: DataView) => ok(out.setInt32(0, files.has(name) ? 1 : 0, true)),
        }
        module.registerVFS(vfs, false)
        const put = (name: string, bytes: Uint8Array | null) => files.set(name, createFile(bytes, true)).get(name)!
        const drop = (name: string) => void files.delete(name)
        return { put, drop }
}
