import type { Consts } from '@db/test-share'

export interface Bill {
        kind: string
        get: number
        put: number
        bytes: number
        fGet: number
        fPut: number
        fPages: number
        wGet: number
        wPut: number
        wPages: number
        ratio: number
        base: number
        deltas: number
        patch: number
        dirty: number
        pages: number
        isChange: boolean
}

interface Path {
        base: number
        deltas: number
        patch: number
        cost: number
}

const _PUT = 12.5

const _open = (path: Path, ratio: number, K: Consts) => {
        if (path.base <= K.CHUNK) return 1 + (path.base * ratio) / K.SWAP
        return 2 + path.deltas + ((K.CHUNK + path.patch) * ratio) / K.SWAP
}

const _merge = (path: Path, bill: Bill, K: Consts) => {
        if (path.base <= K.CHUNK) return path.cost + _PUT + (bill.pages * bill.ratio) / K.SWAP
        return path.cost + 1 + _PUT + ((path.base + bill.pages) * bill.ratio) / K.SWAP
}

const _save = (paths: Path[], bill: Bill, K: Consts): Path[] => {
        const pushable = paths.filter((path) => path.base > K.CHUNK && path.deltas < K.SLOTS && path.patch + bill.dirty < K.CHUNK)
        const pushed = pushable.map((path) => ({ ...path, deltas: path.deltas + 1, patch: path.patch + bill.dirty, cost: path.cost + _PUT + (bill.dirty * bill.ratio) / K.SWAP }))
        return [...pushed, { base: bill.pages, deltas: 0, patch: 0, cost: Math.min(...paths.map((path) => _merge(path, bill, K))) }]
}

const _best = (bills: Bill[], K: Consts) => {
        const first = bills.find((bill) => bill.kind !== 'read')
        if (!first) return 0
        let paths: Path[] = [{ base: first.base, deltas: first.deltas, patch: first.patch, cost: 0 }]
        for (const bill of bills) {
                if (bill.kind === 'open') paths = paths.map((path) => ({ ...path, cost: path.cost + _open(path, bill.ratio, K) }))
                if (bill.kind === 'save' && bill.isChange) paths = _save(paths, bill, K)
        }
        return Math.min(...paths.map((path) => path.cost))
}

export const costOf = (bills: Bill[], K: Consts) => {
        const sum = (of: (bill: Bill) => number) => bills.reduce((total, bill) => total + of(bill), 0)
        const read = sum((bill) => (bill.kind === 'read' ? bill.get + bill.bytes / K.PAGE / K.SWAP : 0))
        return {
                observed: sum((bill) => bill.get + _PUT * bill.put + bill.bytes / K.PAGE / K.SWAP),
                formula: sum((bill) => bill.fGet + _PUT * bill.fPut + (bill.fPages * bill.ratio) / K.SWAP),
                whole: sum((bill) => bill.wGet + _PUT * bill.wPut + (bill.wPages * bill.ratio) / K.SWAP),
                best: _best(bills, K) + read,
                read,
                opens: bills.filter((bill) => bill.kind === 'open').length,
                saves: bills.filter((bill) => bill.kind === 'save' && bill.isChange).length,
        }
}
