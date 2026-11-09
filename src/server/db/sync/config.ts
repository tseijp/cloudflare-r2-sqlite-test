import type { ColType } from '../utils/share/types.ts'

export const WIDTH: Record<ColType, number> = { text: 4, number: 2, int: 2, bool: 1, date: 3, datetime: 4, json: 6 }

export const UNDO = { captureTimeout: 0, ignoreRemoteMapChanges: true } as const
