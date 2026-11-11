export const signature = (f) => `${f.axis}|${f.what}`

// 崩れた判定の signature が残る範囲で、操作列を半分ずつ削る (replay の回数は runs まで)
export const shrink = async (script, failure, replay, runs) => {
        const target = signature(failure)
        let [steps, found, used] = [script.steps.slice(0, failure.index + 1), failure, 0]
        const test = async (candidate) => (used++, (await replay({ ...script, steps: candidate })).failures.find((f) => signature(f) === target))
        for (let n = 2; steps.length >= 2 && used < runs; ) {
                const size = Math.ceil(steps.length / n)
                let reduced = false
                for (let i = 0; i < steps.length && !reduced && used < runs; i += size) {
                        const f = await test([...steps.slice(0, i), ...steps.slice(i + size)])
                        if (f) ((steps = [...steps.slice(0, i), ...steps.slice(i + size)]), (found = f), (n = Math.max(n - 1, 2)), (reduced = true))
                }
                if (!reduced && n >= steps.length) break
                if (!reduced) n = Math.min(n * 2, steps.length)
        }
        return { steps, failure: found, runs: used }
}
