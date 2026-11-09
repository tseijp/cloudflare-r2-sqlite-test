import { VFS } from './utils/config/config.ts'

export interface File {
        data: Uint8Array
        size: number
        dirty: Set<number>
        isMain: boolean
}

const _OK = 0

const _SHORT_READ = 522

const _NOT_FOUND = 12

const _ok = (..._: unknown[]) => _OK

const _createFile = (bytes: Uint8Array | null, isMain: boolean): File => ({
        data: bytes ? bytes.slice() : new Uint8Array(0),
        size: bytes ? bytes.length : 0,
        dirty: new Set(),
        isMain,
})

const _grow = (file: File, need: number) => {
        if (need <= file.data.length) return
        const next = new Uint8Array(Math.max(need, file.data.length * 2))
        next.set(file.data.subarray(0, file.size))
        file.data = next
}

const _isSame = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i])

const _keepCounter = (file: File, old: Uint8Array) => {
        file.data.set(old.subarray(24, 28), 24)
        file.data.set(old.subarray(92, 96), 92)
}

const _write = (file: File, src: Uint8Array, offset: number) => {
        const old = file.isMain && offset === 0 && file.size > 0 ? file.data.slice(0, src.length) : null
        _grow(file, offset + src.length)
        file.data.set(src, offset)
        file.size = Math.max(file.size, offset + src.length)
        if (old) _keepCounter(file, old)
        if (old && _isSame(old, file.data.subarray(0, src.length))) return
        if (file.isMain) file.dirty.add(offset / src.length + 1)
}

const _read = (file: File, dest: Uint8Array, offset: number) => {
        const got = Math.max(0, Math.min(dest.length, file.size - offset))
        dest.set(file.data.subarray(offset, offset + got))
        dest.fill(0, got)
        return got < dest.length ? _SHORT_READ : _OK
}

export const createVfs = (module: any) => {
        const _files = new Map<string, File>()
        const _handles = new Map<number, string>()
        const _at = (id: number) => _files.get(_handles.get(id)!)!
        const _vfs = {
                name: VFS,
                xOpen: (name: string | null, id: number, flags: number, out: DataView) => {
                        const key = name ?? `temp-${id}`
                        if (!_files.has(key)) _files.set(key, _createFile(null, false))
                        _handles.set(id, key)
                        return _ok(out.setInt32(0, flags, true))
                },
                xClose: (id: number) => {
                        const key = _handles.get(id)!
                        const isMain = _files.get(key)?.isMain
                        _handles.delete(id)
                        if (!isMain) _files.delete(key)
                        return _OK
                },
                xRead: (id: number, dest: Uint8Array, offset: number) => _read(_at(id), dest, offset),
                xWrite: (id: number, src: Uint8Array, offset: number) => _ok(_write(_at(id), src, offset)),
                xTruncate: (id: number, size: number) => _ok((_at(id).size = Math.min(_at(id).size, size))),
                xSync: _ok,
                xFileSize: (id: number, out: DataView) => _ok(out.setBigInt64(0, BigInt(_at(id).size), true)),
                xLock: _ok,
                xUnlock: _ok,
                xCheckReservedLock: (_: number, out: DataView) => _ok(out.setInt32(0, 0, true)),
                xFileControl: () => _NOT_FOUND,
                xSectorSize: () => 4096,
                xDeviceCharacteristics: _ok,
                xDelete: (name: string) => _ok(_files.delete(name)),
                xAccess: (name: string, _: number, out: DataView) => _ok(out.setInt32(0, _files.has(name) ? 1 : 0, true)),
        }
        module.registerVFS(_vfs, false)
        return {
                put: (name: string, bytes: Uint8Array | null) => _files.set(name, _createFile(bytes, true)).get(name)!,
                drop: (name: string) => void _files.delete(name),
        }
}
