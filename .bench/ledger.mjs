const _REGIONS = ['chunks:1', 'chunks:2-ROOM', 'chunks:ROOM+', 'deltas:0', 'deltas:1-2', 'deltas:3-4', 'deltas:5-SLOTS', 'load:0', 'load:low', 'load:high', 'residue:0', 'residue:1+', 'writers:1', 'writers:2', 'save:none', 'save:push', 'save:merge', 'save:forced', 'stop:clean', 'stop:dirty', 'stop:held', 'fault:get', 'fault:put', 'fault:put.after', 'fault:delete']

const _COSTS = [
        ['式', 'formula', 1],
        ['丸ごと保存', 'whole', 1],
        ['最良', 'best', 2],
]

const _sum = (all, part) => Object.entries(part).forEach(([name, value]) => (all[name] = (all[name] ?? 0) + value))

const _total = (records, partOf) => {
        const all = {}
        for (const record of records) _sum(all, partOf(record))
        return all
}

const _group = (records, keyOf, partOf) => {
        const all = {}
        for (const record of records) _sum((all[keyOf(record)] ??= {}), partOf(record))
        return all
}

export const ledgerOf = (records, spec, seconds) => {
        const axes = [...new Set(records.flatMap((record) => Object.keys(record.axes)))]
        const judged = (axis) => records.filter((record) => record.axes[axis])
        const clean = (axis) => judged(axis).filter((record) => record.axes[axis].fail + record.axes[axis].known === 0)
        const priced = records.filter((record) => record.cost.observed > 0)
        const ratio = (record, name, slack) => Math.min(1, (slack * record.cost[name]) / record.cost.observed)
        const safety = axes.map((axis) => [axis, { judged: judged(axis).length, clean: clean(axis).length, point: Math.floor((clean(axis).length / judged(axis).length) * 100) }])
        const cost = _COSTS.map(([axis, name, slack]) => [axis, { judged: priced.length, point: priced.length ? Math.floor((priced.reduce((total, record) => total + ratio(record, name, slack), 0) / priced.length) * 100) : 0 }])
        const regions = _total(records, (record) => ({ ...record.regions, [`use:${record.region.use}`]: 1, [`event:${record.region.event}`]: 1 }))
        return {
                at: new Date().toISOString(),
                spec,
                bounds: { K: records[0]?.K, regions: _REGIONS },
                regions,
                axes: Object.fromEntries([...safety, ...cost]),
                score: [...safety, ...cost].reduce((total, [, { point }]) => total + point, 0),
                cost: _group(records, (record) => `${record.region.use}/${record.region.event}/size ${record.region.size}`, (record) => ({ n: 1, ...record.cost })),
                known: _total(records, (record) => Object.fromEntries([...new Set(record.fails.filter((fail) => fail.known).map((fail) => fail.known))].map((id) => [id, 1]))),
                failures: records.flatMap((record) => record.fails.map((fail) => ({ seed: record.seed, file: record.file, ...fail }))),
                store: _total(records, (record) => record.store),
                unmeasured: _REGIONS.filter((name) => !regions[name]),
                seconds,
        }
}
