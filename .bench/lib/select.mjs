export const CONTENTS = ['細長 numeric', '幅広 numeric', '短文 categorical', '長文']

const contentOf = (stat, leafLimit) => {
        const isNumeric = stat.numeric >= 0.7
        if (isNumeric && stat.cols <= 10) return '細長 numeric'
        if (isNumeric) return '幅広 numeric'
        if (stat.max_cell <= leafLimit) return '短文 categorical'
        return '長文'
}

const scaleOf = (stat, w) => {
        if (stat.rows < w * 100) return '小'
        if (stat.rows < w * 2000) return '中'
        return '大'
}

export const classify = (stat, leafLimit, w) => {
        if (stat.excluded) return stat
        const content = contentOf(stat, leafLimit)
        return {
                ...stat,
                class: { content, container: stat.container, scale: scaleOf(stat, w) },
                label: `${content} / ${stat.container} / ${scaleOf(stat, w)}`,
        }
}

const larger = (a, b) => {
        if (!a) return b
        if (b.rows !== a.rows) return b.rows > a.rows ? b : a
        return b.bytes > a.bytes ? b : a
}

const pick = (list) => list.reduce((best, s) => larger(best, s), null)

export const selectTargets = (classified) => {
        const live = classified.filter((s) => !s.excluded)
        const singles = live.filter((s) => s.class.container === '単一')
        const multis = live.filter((s) => s.class.container === '複数')
        const targets = []
        const missing = []
        for (const content of CONTENTS) {
                const best = pick(singles.filter((s) => s.class.content === content))
                if (!best) missing.push(content)
                if (best) targets.push({ ...best, role: content })
        }
        const multi = pick(multis)
        if (!multi) missing.push('複数')
        if (multi) targets.push({ ...multi, role: '複数' })
        return { targets, missing }
}
