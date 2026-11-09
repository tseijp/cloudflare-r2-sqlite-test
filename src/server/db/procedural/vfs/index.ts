import type { File, Flat, Paged } from '../share/types'

export const OK = 0

const _IOERR_READ = 266

const _SHORT_READ = 522

export const isPaged = (file: File): file is Paged => 'pages' in file

const _grown = (file: Flat, need: number) => {
        const next = new Uint8Array(Math.max(need, file.data.length * 2))
        next.set(file.data.subarray(0, file.size))
        return next
}

const _readFlat = (file: Flat, dest: Uint8Array, offset: number) => {
        const got = Math.max(0, Math.min(dest.length, file.size - offset))
        dest.set(file.data.subarray(offset, offset + got))
        dest.fill(0, got)
        return got < dest.length ? _SHORT_READ : OK
}

const _readPaged = (file: Paged, dest: Uint8Array, offset: number) => {
        const pgno = Math.floor(offset / file.pageSize) + 1
        const page = file.pages.get(pgno)
        const at = offset % file.pageSize
        const isPast = offset >= file.size
        if (isPast) dest.fill(0)
        if (isPast) return _SHORT_READ
        if (!page) file.miss.add(pgno)
        if (!page) return _IOERR_READ
        dest.set(page.subarray(at, at + dest.length))
        return OK
}

const _writeFlat = (file: Flat, src: Uint8Array, offset: number) => {
        const end = offset + src.length
        if (end > file.data.length) file.data = _grown(file, end)
        file.data.set(src, offset)
        file.size = Math.max(file.size, end)
        if (offset === 0) file.onReset?.()
        return OK
}

const _writePaged = (file: Paged, src: Uint8Array, offset: number) => {
        const pgno = Math.floor(offset / file.pageSize) + 1
        const page = file.pages.get(pgno) ?? new Uint8Array(file.pageSize)
        page.set(src, offset % file.pageSize)
        file.pages.set(pgno, page)
        file.size = Math.max(file.size, offset + src.length)
        return OK
}

export const pagedFile = (pageSize: number, commit: number): Paged => ({ pages: new Map(), size: commit * pageSize, pageSize, miss: new Set() })

export const flatFile = (onReset?: () => void): Flat => ({ data: new Uint8Array(0), size: 0, onReset })

export const readFile = (file: File, dest: Uint8Array, offset: number) => (isPaged(file) ? _readPaged(file, dest, offset) : _readFlat(file, dest, offset))

export const writeFile = (file: File, src: Uint8Array, offset: number) => (isPaged(file) ? _writePaged(file, src, offset) : _writeFlat(file, src, offset))

export const truncateFile = (file: File, size: number) => {
        file.size = size
        if (!isPaged(file)) file.onReset?.()
        if (!isPaged(file)) return OK
        for (const pgno of [...file.pages.keys()]) if ((pgno - 1) * file.pageSize >= size) file.pages.delete(pgno)
        return OK
}
