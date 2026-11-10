export const signature = (f) => `${f.axis}|${f.what}`

export const shrink = async (script, failure, replay, runs) => {
        const target = signature(failure)
        let steps = script.steps.slice(0, failure.index + 1)
        let found = failure
        let used = 0
        const test = async (candidate) => {
                used++
                const r = await replay({ ...script, steps: candidate })
                return r.failures.find((f) => signature(f) === target)
        }
        for (let n = 2; steps.length >= 2 && used < runs; ) {
                const size = Math.ceil(steps.length / n)
                let reduced = false
                for (let i = 0; i < steps.length && !reduced && used < runs; i += size) {
                        const f = await test([...steps.slice(0, i), ...steps.slice(i + size)])
                        if (!f) continue
                        steps = [...steps.slice(0, i), ...steps.slice(i + size)]
                        found = f
                        n = Math.max(n - 1, 2)
                        reduced = true
                }
                if (reduced) continue
                if (n >= steps.length) break
                n = Math.min(n * 2, steps.length)
        }
        return { steps, failure: found, runs: used }
}
