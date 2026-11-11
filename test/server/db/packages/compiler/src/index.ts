import { fields, parse } from '@test/server-compiler-parse'
import { plan } from '@test/server-compiler-plan'
import type { Summary } from '@test/server-share'

// scenario の 1 手を、装置への命令の列に変える純関数
export const compile = (move: Record<string, unknown>, stat: Summary) => plan(parse(move), stat)

export { fields }
