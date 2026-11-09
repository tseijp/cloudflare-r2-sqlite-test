import type { Storage } from '../../../utils/share/types.ts'
import type { ObjectRef } from '../share/types.ts'

const KEY_PATTERN = /^([0-9a-f]{16})-([0-9a-f]{16})\.ltx$/

const hex16 = (n: number) => n.toString(16).padStart(16, '0')

const levelPrefix = (prefix: string, level: number) => `${prefix}ltx/${level.toString().padStart(4, '0')}/`

export const formatKey = (prefix: string, level: number, min: number, max: number) => {
        return `${levelPrefix(prefix, level)}${hex16(min)}-${hex16(max)}.ltx`
}

const parseKey = (key: string) => {
        const name = key.slice(key.lastIndexOf('/') + 1)
        const match = KEY_PATTERN.exec(name)
        if (!match) return null
        return { min: parseInt(match[1], 16), max: parseInt(match[2], 16) }
}

export const listLevel = async (storage: Storage, prefix: string, level: number) => {
        const items = await storage.list(levelPrefix(prefix, level))
        const refs: ObjectRef[] = []
        for (const { key, size } of items) {
                const range = parseKey(key)
                if (!range) continue
                refs.push({ key, level, min: range.min, max: range.max, size })
        }
        return refs.sort((a, b) => a.min - b.min || a.max - b.max)
}

export const selectChain = (refs: ObjectRef[], after: number) => {
        const selected: ObjectRef[] = []
        let max = after
        for (const ref of refs) {
                if (ref.max <= max) continue
                if (ref.min > max + 1) return selected
                selected.push(ref)
                max = ref.max
        }
        return selected
}

export const maxOf = (refs: ObjectRef[], base = 0) => refs.reduce((n, ref) => Math.max(n, ref.max), base)
