const _KINDS = { get: ['reject', 'drop'], put: ['reject', 'after', 'null', 'drop'], delete: ['reject', 'drop'] }
const _never = () => new Promise(() => {})

export const createStore = () => {
        const objects = new Map()
        const log = []
        const totals = { get: 0, put: 0, delete: 0, getBytes: 0, putBytes: 0, push: 0, merge: 0 }
        let tags = 0
        let plan = { step: -1, faults: new Map(), count: 0, origin: 'main', onDrop: null }
        const raw = {
                get: (seq, offset = 0, length) => {
                        const o = objects.get(seq)
                        if (!o) return null
                        const end = length === undefined || length === null ? o.bytes.length : Math.min(o.bytes.length, offset + length)
                        return { bytes: o.bytes.slice(offset, end), tag: o.tag }
                },
                put: (seq, bytes, tag) => {
                        const cur = objects.get(seq)
                        if ((cur ? cur.tag : '') !== tag) return null
                        objects.set(seq, { bytes: bytes.slice(), tag: `t${++tags}` })
                        return objects.get(seq).tag
                },
                delete: (seqs) => seqs.forEach((s) => objects.delete(s)),
        }
        const facade = () => {
                const life = { dead: false }
                const call = (kind, args, run) => {
                        if (life.dead) return _never()
                        const wanted = plan.faults.get(plan.count++)
                        const fault = _KINDS[kind].includes(wanted) ? wanted : wanted && 'reject'
                        const entry = { step: plan.step, origin: plan.origin, kind, args, fault, wrote: false }
                        log.push(entry)
                        totals[kind]++
                        if (fault === 'reject') return Promise.reject(new Error(`injected ${kind} reject`))
                        if (fault === 'null') return Promise.resolve(null)
                        const result = run(entry)
                        if (fault === 'after') return Promise.reject(new Error('injected put after'))
                        if (fault !== 'drop') return Promise.resolve(result)
                        life.dead = true
                        plan.onDrop?.()
                        return _never()
                }
                return {
                        life,
                        get: (seq, offset, length) => call('get', [seq, offset ?? 0, length ?? null], () => {
                                const r = raw.get(seq, offset, length)
                                totals.getBytes += r ? r.bytes.length : 0
                                return r
                        }),
                        put: (seq, bytes, tag) => call('put', [seq, bytes.length, tag], (entry) => {
                                const r = raw.put(seq, bytes, tag)
                                entry.wrote = r !== null
                                totals[seq > 0 ? 'push' : 'merge'] += entry.wrote ? 1 : 0
                                entry.bytes = entry.wrote && seq > 0 ? bytes.slice() : undefined
                                totals.putBytes += entry.wrote ? bytes.length : 0
                                return r
                        }),
                        delete: (seqs) => call('delete', [[...seqs]], (entry) => {
                                raw.delete(seqs)
                                entry.wrote = true
                        }),
                }
        }
        const begin = (step, faults = [], origin = 'main', onDrop = null) => {
                plan = { step, faults: new Map(faults.map((f) => [f.call, f.kind])), count: 0, origin, onDrop }
                return log.length
        }
        const tagsOf = () => [...objects].map(([k, v]) => [k, v.tag]).sort((a, b) => a[0] - b[0])
        return { objects, log, totals, raw, facade, begin, tagsOf }
}
