import { explore } from '@test/client-compiler-plan-explore'
import { ledger } from '@test/client-compiler-plan-ledger'
import type { Code, Spec } from '@test/client-share'

// 指定の種類 → 指定 => file を書き、scenario を送る命令の列
const _TABLE: Record<string, (spec: Spec) => Code[]> = { explore, ledger }

export const plan = (spec: Spec) => _TABLE[spec.type](spec)
