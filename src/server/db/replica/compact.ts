import { formatKey, listLevel, selectChain } from './utils/keys/keys.ts'
import { COMPACT_LEVELS, FLAG_NO_CHECKSUM } from './utils/share/const.ts'
import { parseObject } from './decode.ts'
import { encodeObject } from './encode.ts'
import { ageOf, loadState } from './state.ts'
import type { Storage } from '../utils/share/types.ts'
import type { Block, Compacted, Context, ObjectHeader, ObjectRef, ParsedObject } from './utils/share/types.ts'

const readObjects = async (storage: Storage, refs: ObjectRef[]) => {
        const objects: ParsedObject[] = []
        for (const ref of refs) {
                const bytes = await storage.get(ref.key, { offset: 0, length: ref.size })
                const parsed = bytes && parseObject(bytes)
                if (!parsed || !parsed.isValid) return Promise.reject(new Error(`compact: broken object ${ref.key}`))
                objects.push(parsed)
        }
        return objects
}

const mergeBlocks = (objects: ParsedObject[], commit: number) => {
        const latest = new Map<number, Block>()
        for (const object of objects) for (const block of object.blocks) latest.set(block.pgno, block)
        const blocks = [...latest.values()].filter((block) => block.pgno <= commit)
        return blocks.sort((a, b) => a.pgno - b.pgno)
}

const mergeHeader = (objects: ParsedObject[]): ObjectHeader => {
        const first = objects[0].header
        const last = objects[objects.length - 1].header
        const flags = objects.reduce((f, object) => f | object.header.flags, 0)
        const isNoChecksum = (flags & FLAG_NO_CHECKSUM) !== 0
        const preApply = isNoChecksum ? 0n : first.preApply
        return { ...last, flags, minTxid: first.minTxid, preApply }
}

const mergeLevel = async (ctx: Context, level: number, candidates: ObjectRef[]) => {
        const { storage, config, state } = ctx
        if (!candidates.length) return 0
        const inputs = selectChain(candidates, candidates[0].min - 1)
        const objects = await readObjects(storage, inputs)
        const header = mergeHeader(objects)
        const isNoChecksum = (header.flags & FLAG_NO_CHECKSUM) !== 0
        const postApply = isNoChecksum ? 0n : objects[objects.length - 1].postApply
        const key = formatKey(config.prefix, level, header.minTxid, header.maxTxid)
        const put = await storage.put(key, encodeObject(header, mergeBlocks(objects, header.commit), postApply), { ifNoneMatch: true })
        if (!put) return Promise.reject(new Error(`compact: writer conflict on ${key}`))
        for (let lower = 0; lower <= level; lower++) state.tops[lower] = Math.max(state.tops[lower], header.maxTxid)
        state.born.set(key, state.now)
        return inputs.length
}

const expireLevel = async ({ storage, config, state }: Context, level: number, refs: ObjectRef[]) => {
        const keys: string[] = []
        for (const ref of refs) {
                const isExpired = ref.max <= state.tops[level + 1] && ageOf(state, ref.key) >= config.retentions[level]
                if (isExpired) keys.push(ref.key)
        }
        if (!keys.length) return 0
        await storage.delete(keys)
        for (const key of keys) state.born.delete(key)
        return keys.length
}

export const compactLevel = async (ctx: Context, level: number): Promise<Compacted> => {
        const state = await loadState(ctx)
        if (!COMPACT_LEVELS.includes(level)) return { merged: 0, deleted: 0 }
        const refs = await listLevel(ctx.storage, ctx.config.prefix, level - 1)
        const merged = await mergeLevel(
                ctx,
                level,
                refs.filter((ref) => ref.max > state.tops[level]),
        )
        const deleted = await expireLevel(ctx, level - 1, refs)
        return { merged, deleted }
}
