import type { Db, Limits, Part } from '@test/server-share'
import type { Call, Outcome, Replica } from '@test/server-executer-share'

interface Look {
        db: Db
        view(): Record<string, unknown>
        out: Outcome
}

type Check = (axis: string, label: string, isHeld: boolean, want: unknown, seen: unknown, known?: string) => void

// 判定の規則が見る装置。executer が作って渡す
export interface Env {
        limits: Limits
        fleet: { of(name: string): Replica; look(parts: Map<number, Part>): Promise<Look> }
        depot: { log: Call[]; shots: Map<number, Part>[]; copy(): Map<number, Part>; list(): (string | number)[][] }
        book: { check: Check; skip(reason: string): void }
        // 1 手の始まりの写しの番号、最後に確かめた store の内容、種類の違う save の交差 (issue 001) が起きたか
        memo: { shot: number; good: unknown; isCrossed: boolean }
}
