const _r = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)

const _worst = (axis) => {
        const per = [...axis.per].sort((a, b) => a.score - b.score)[0]
        const misses = per.items.filter((i) => !i.ok).map((i) => `${i.key} ${JSON.stringify(_r(i.value))}`)
        return { per, misses }
}

export const RULES = [
        '各軸の点数は対象 fixture ごとに score.md の式で減点し、最も低い fixture の点を軸の点とする',
        '取込は取り込めない fixture 1 件ごとに 50 点を引き、ρ と時間比は fixture ごとの減点の最大を取る',
        '取込の時間は N/10 と N を交互に 3 回ずつ取り込み、中央値どうしの比とする',
        '計測できなかった gate は pass と見なさず FAIL とする',
        'style の json は JSON 文字列、mark の val は文字列、cells の value は文字列で渡す',
        '窓の P は開き直した db で最初の窓を出すまでに range GET で取り寄せた page 数 (byte ÷ page size) とし、式 ceil(50 ÷ f) + 深さ − 1 を併記する',
        '行 byte は CSV の byte ÷ record 数、窓 JSON は win/ row/ deco/ で始まる key の JSON byte とする',
        'N/10 は CSV の先頭 ceil(record 数 ÷ 10) record を同じ手順で取り込んだ image とし、snapshot と dump の比は取り込み直後に測る',
        '窓の読みの gate は、窓の軸の開き直しと保存の軸の開き直しの両方に掛ける',
        'xlsx は利用者の指示で試験外とし、対象は CSV の内容 4 値の 4 件とする',
]

export const summarize = (ledger) => {
        const parts = Object.entries(ledger.axes).map(([name, axis]) => {
                const { per, misses } = _worst(axis)
                const tail = misses.length ? ` 未達 [${per.file}: ${misses.join(', ')}]` : ''
                return `${name} ${axis.score}/${axis.max}${tail}`
        })
        const gates = ledger.gates.map((g) => `${g.name} ${g.ok ? 'pass' : 'FAIL'}`).join('、')
        return [
                `score ${ledger.score} (gate 前 ${ledger.score_before_gates})。${parts.join('。')}。`,
                `gate: ${gates}。`,
                `runner_changed: true (旧 runner から式を作り直した: ${RULES.join('。')})。`,
                ledger.diff,
        ].join('\n')
}
