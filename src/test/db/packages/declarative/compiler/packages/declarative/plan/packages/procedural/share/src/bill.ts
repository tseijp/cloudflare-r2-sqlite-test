import { bill, key } from './code.ts'
import type { Code, Facts, Stat, Step } from '@db/test-share'
import type { View } from './view.ts'

export const openBill = ({ K, io, stat, ratio }: View): Code => {
        const isSmall = stat.base <= K.CHUNK
        return bill('open', { get: io.get, put: io.put, bytes: io.bytes, fGet: isSmall ? 1 : 2 + stat.deltas, fPages: isSmall ? stat.base : K.CHUNK + stat.patch, wGet: 1, wPages: stat.base, ratio, base: stat.base, deltas: stat.deltas, patch: stat.patch, pages: stat.pages })
}

export const saveBill = ({ K, io, ratio, isDone }: View, kind: string, was: Stat): Code => {
        const isBig = was.base > K.CHUNK
        const isChange = was.dirty > 0
        const pages = kind === 'push' ? was.dirty : kind === 'merge' ? (isBig ? was.base : 0) + was.pages : 0
        return bill('save', { get: io.get, put: io.put, bytes: io.bytes, fGet: kind === 'merge' && isBig ? 1 : 0, fPut: kind === 'none' ? 0 : 1, fPages: pages, wPut: isChange ? 1 : 0, wPages: isChange ? was.pages : 0, ratio, base: was.base, deltas: was.deltas, patch: was.patch, dirty: was.dirty, pages: was.pages, isChange: isChange && isDone && io.wrote > 0 })
}

export const readBill = ({ K, io }: View): Code => bill('read', { get: io.get, bytes: io.bytes, fGet: io.get, fPages: io.bytes / K.PAGE })

export const winsOf = (wins: Record<string, any>, payload: any, isDone: boolean) => {
        const { [payload.id]: _left, ...rest } = wins
        if (isDone && payload.type === 'window') return { ...wins, [payload.id]: payload }
        if (isDone && payload.type === 'leave') return rest
        return wins
}

export const dueOf = ({ alive, reg }: Facts, seconds: number): Step[] => {
        const end = reg.now + seconds
        const nodes = alive.filter((name) => /^[A-H]$/.test(name))
        const isSet = (node: string, name: string) => reg[key(node, name)] !== null && reg[key(node, name)] !== undefined
        if (!reg.policy) return [['clock', end]]
        const saves = nodes.filter((node) => isSet(node, 'edit')).map((node) => ({ at: Math.min(reg[key(node, 'edit')] + reg.policy.every / 2, reg[key(node, 'first')] + reg.policy.every), step: ['save', node] as Step }))
        const stops = nodes.filter((node) => isSet(node, 'gone')).map((node) => ({ at: reg[key(node, 'gone')] + reg.policy.idle, step: ['stop', node] as Step }))
        const due = [...saves, ...stops].filter((item) => item.at <= end).sort((a, b) => a.at - b.at)
        return [...due.flatMap((item): Step[] => [['clock', Math.max(reg.now, item.at)], item.step]), ['clock', end]]
}
