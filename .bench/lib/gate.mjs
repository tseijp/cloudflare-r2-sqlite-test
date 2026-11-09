export const gatesOf = (results, flags) => {
        const isEmpty = results.length === 0
        return {
                product_missing: flags.productMissing.length > 0,
                missing_class: flags.missingClasses.length > 0,
                intake_failed: isEmpty || results.some((r) => !r.intake.ok),
                restore_mismatch: isEmpty || results.some((r) => !r.replica.ok || !r.replica.restore_match),
                orphans: isEmpty || results.some((r) => (r.style.orphans ?? 1) > 0),
                window_read_over_half: results.some((r) => (r.window.read_ratio ?? 0) >= 0.5),
                src_hash_mismatch: flags.srcChanged,
                runner_referenced: flags.runnerReferenced.length > 0,
        }
}
