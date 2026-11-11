import { parse } from '@test/client-compiler-parse'
import { plan } from '@test/client-compiler-plan'

// 指定 (seed と設定) を、scenario の code を作る命令の列に変える純関数
export const compile = (spec: Record<string, unknown>) => plan(parse(spec))
