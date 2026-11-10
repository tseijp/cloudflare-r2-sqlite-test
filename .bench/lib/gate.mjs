const _gate = (name, ok, detail) => ({ name, ok: !!ok, detail })

const _shares = (m) => [
        { file: m.file, at: '窓の軸 (save 直後に開き直し)', share: m.window?.readShare ?? null },
        { file: m.file, at: '保存の軸 (100 save 後に開き直し)', share: m.save?.restore?.open?.share ?? null },
]

export const gatesOf = (measured, { missing, refs, srcStart, srcEnd }) => {
        const failed = measured.filter((m) => !m.intake?.rho).map((m) => ({ file: m.file, error: m.error }))
        const restore = measured.map((m) => {
                const r = m.save?.restore
                return { file: m.file, isOk: r?.isOk ?? null, pages: r?.pages, integrity: r?.integrity }
        })
        const orphans = measured.map((m) => ({ file: m.file, orphans: m.style?.orphans ?? null }))
        const shares = measured.flatMap(_shares)
        return [
                _gate('対象 class の fixture が全て取り込める', failed.length === 0, failed),
                _gate('対象 class が内容の 4 値で揃う', missing.length === 0, missing),
                _gate('復元 image が元と整合する', restore.every((r) => r.isOk === true), restore),
                _gate('孤児が 0 件', orphans.every((o) => o.orphans === 0), orphans),
                _gate('窓を満たす読みが image の 50% 未満', shares.every((s) => s.share !== null && s.share < 0.5), shares),
                _gate('台帳の src hash が run の前後で同じ', srcStart === srcEnd, { srcStart, srcEnd }),
                _gate('製品コードが runner を参照しない', refs.length === 0, refs),
        ]
}
