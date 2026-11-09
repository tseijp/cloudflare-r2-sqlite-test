import { flatFile, isPaged, OK, readFile, truncateFile, writeFile } from '../procedural/vfs/index'
import type { File } from '../procedural/share/types'

const _NOT_FOUND = 12

export const createVfs = (files: Map<string, File>) => {
        const _open = new Map<number, File>()
        const _temps = new Set<number>()
        const _ok = () => OK
        return {
                name: 'grid',
                mxPathName: 64,
                xOpen(name: string | null, id: number, flags: number, out: DataView) {
                        const key = name ?? `#${id}`
                        if (!files.has(key)) files.set(key, flatFile())
                        if (!name) _temps.add(id)
                        _open.set(id, files.get(key)!)
                        out.setInt32(0, flags, true)
                        return OK
                },
                xClose(id: number) {
                        _open.delete(id)
                        if (_temps.delete(id)) files.delete(`#${id}`)
                        return OK
                },
                xRead(id: number, dest: Uint8Array, offset: number) {
                        return readFile(_open.get(id)!, dest, offset)
                },
                xWrite(id: number, src: Uint8Array, offset: number) {
                        return writeFile(_open.get(id)!, src, offset)
                },
                xTruncate(id: number, size: number) {
                        return truncateFile(_open.get(id)!, size)
                },
                xFileSize(id: number, out: DataView) {
                        out.setBigInt64(0, BigInt(_open.get(id)!.size), true)
                        return OK
                },
                xSync: _ok,
                xLock: _ok,
                xUnlock: _ok,
                xCheckReservedLock(_: number, out: DataView) {
                        out.setInt32(0, 0, true)
                        return OK
                },
                xFileControl() {
                        return _NOT_FOUND
                },
                xSectorSize() {
                        return 4096
                },
                xDeviceCharacteristics() {
                        return 0
                },
                xDelete(name: string) {
                        const file = files.get(name)
                        const isKept = !!file && !isPaged(file) && !!file.onReset
                        if (isKept) return truncateFile(file, 0)
                        files.delete(name)
                        return OK
                },
                xAccess(name: string, _: number, out: DataView) {
                        out.setInt32(0, files.has(name) ? 1 : 0, true)
                        return OK
                },
        }
}
