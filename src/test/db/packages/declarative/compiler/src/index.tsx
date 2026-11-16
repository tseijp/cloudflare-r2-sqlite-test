import { parse, script } from '@db/test-compiler-parse'
import { plan } from '@db/test-compiler-plan'
import { print } from '@db/test-compiler-share'
import type { Code, Facts, Step } from '@db/test-share'
import type { Spec } from '@db/test-compiler-share'

export const compile = (step: Step, facts: Facts): Code[] => plan(parse(step), facts)

export const explore = (spec: Spec) => script(spec)

export { print }

export type { Fixture, Region, Script, Spec } from '@db/test-compiler-share'
