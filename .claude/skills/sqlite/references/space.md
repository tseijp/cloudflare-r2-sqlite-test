# 状態空間と scenario

deterministic simulation が探索する範囲の定義である。seed 1 つが、開始時の state と、そこから time 順に実行する step の並び (scenario) を決める。この文書は、seed が決める値の境界と、scenario の種類を一覧にする。判定と点は score.md、製品の API は contract.md にある。

## 1. 構成要素

| 名前    | 実体                                                        | DST API                 |
| ------- | ----------------------------------------------------------- | ----------------------- |
| store   | 1 つの database を保存する object storage                   | `t.store`               |
| replica | store の object。番号 0 が image、1 〜 `SLOTS` が delta     | `t.replica(番号)`       |
| node    | `createDb` が返す instance (Durable Object の memory)       | `t.node('A')`           |
| client  | 1 つの node に `Op` を送る `id` (user)                      | `t.client('u1', a)`     |
| data    | `.bench/data/` の CSV の先頭から取った行 (fixtures.md)      | `a.load(file, bytes)`   |
| time    | simulation 内の秒。実時間は使わない                         | `t.tick(秒)`            |
| shadow  | node と同じ `Op` を受け取る別の instance。障害を受けず、内容の期待値になる | `a.shadow`  |
| probe   | store の copy を開いて内容を読む instance                   | 内部で使う (`P`)        |

## 2. state の境界

seed が決める値と、その下限と上限である。値は製品の定数名で書く (contract.md 10 節)。利用統計はまだ無いので、範囲内の値は seed から作った擬似乱数で一様に選ぶ。値の範囲を持つ表は `space` package の 1 か所だけにある。

### 2.1. data

| 値                    | 下限                   | 上限                                               | 決め方                                        |
| --------------------- | ---------------------- | -------------------------------------------------- | --------------------------------------------- |
| table の数            | 1                      | 3                                                  | 擬似乱数                                      |
| CSV の file           | fixtures.md の 17 file |                                                    | 擬似乱数。1 file が 1 table になる            |
| CSV から使う byte 数  | 4 KiB                  | file 全体、または下の size の上限                  | 擬似乱数。最後の行が途中で切れたら、その行は使わない |
| size 0 (1 chunk)      | 合計 4 KiB             | 合計 1.2 MiB                                       | seed の巡回                                   |
| size 1 (2 〜 `ROOM` chunk) | 合計 2.5 MiB      | 合計 6 MiB                                         | seed の巡回                                   |
| size 2 (`ROOM` chunk 超)   | 合計 9 MiB        | 合計 24 MiB。`LIMIT` page を超える import は reject される | seed の巡回                           |
| 列                    | CSV の 1 行目          |                                                    | 製品の client が読んだ列名                    |
| 名前と本文の種類      | `ascii` `日本語` `記号` `長文` |                                            | 擬似乱数。step が追加する page、列、本文に使う |

### 2.2. replica

| 値                        | 下限 | 上限                         | 決め方                                                        |
| ------------------------- | ---- | ---------------------------- | ------------------------------------------------------------- |
| image の page 数          | 0    | `LIMIT`                      | data の size で決まる                                         |
| image の chunk 数         | 1    | `LIMIT ÷ CHUNK`              | 同上                                                          |
| chain の delta 数         | 0    | `SLOTS`                      | seed の巡回 (0、1 〜 2、3 〜 4、5 〜 `SLOTS`)。1 chunk の image では 0 |
| delta 1 つの page 数      | 1    | `(CHUNK − 16) ÷ delta 数`    | 擬似乱数                                                      |
| delta の page 数の合計    | 0    | `CHUNK − 1`                  | 上の合計                                                      |
| chain の外の delta 数     | 0    | `SLOTS`                      | 擬似乱数 (4 回に 1 回、delete を失敗させて残す)               |
| 実行途中の put            | 0    | 1                            | scenario の step が作る                                       |

object 1 つの状態は「無い」「chain に繋がっている」「存在するが chain の外」「put が実行途中」の 4 つである。

### 2.3. node と client

| 値                    | 下限 | 上限             | 決め方                                 |
| --------------------- | ---- | ---------------- | -------------------------------------- |
| node の数             | 1    | 2                | scenario の step が作る (`rival` だけが 2) |
| 未保存の page 数      | 0    | `CHUNK − 1`      | scenario の step が作る                |
| client の数           | 1    | 10               | 擬似乱数 (`crowd` は 2 以上)           |
| window の `top`       | 0    | 最大の `_id` + 1 | 擬似乱数                               |
| window の `size`      | 1    | 200              | 擬似乱数                               |
| scenario の step 数   | 指定 (既定 60) |        | `steps` の指定                         |

### 2.4. time

| 値                               | 下限  | 上限   | 決め方                 |
| -------------------------------- | ----- | ------ | ---------------------- |
| 編集と編集の間隔                 | 1 秒  | 120 秒 | 擬似乱数               |
| session と session の間隔        | 10 分 | 1 日   | 擬似乱数               |
| save の間隔 `every`              | 56 秒 | 56 秒  | cost.md 5 節の値で固定 |
| node が消えるまでの時間 `idle`   | 70 秒 | 70 秒  | 固定                   |

### 2.5. region

到達回数を数える区分である。ledger の `regions` は同じ名前で数える。

| axis      | 測る値                               | 区分                                        |
| --------- | ------------------------------------ | ------------------------------------------- |
| `chunks`  | `⌈base ÷ CHUNK⌉`                     | `1`、`2-ROOM`、`ROOM+`                      |
| `deltas`  | `stat().deltas`                      | `0`、`1-2`、`3-4`、`5-SLOTS`                |
| `load`    | `patch + dirty`                      | `0`、`low` (`CHUNK ÷ 2` 以下)、`high`       |
| `residue` | chain の外の delta 数                | `0`、`1+`                                   |
| `writers` | 同じ store を開いている node の数    | `1`、`2`                                    |
| `save`    | save が選んだ命令                    | `none`、`push`、`merge`、`forced` (直接送った) |
| `stop`    | node を kill した時点                | `clean`、`dirty`、`held` (put の実行途中)   |
| `fault`   | 発生した障害                         | `get`、`put`、`put.after`、`delete`         |
| `use`     | 4 節の利用の種類                     | 5 種                                        |
| `event`   | 4 節の出来事の種類                   | 5 種                                        |

seed は `use`、`event`、size、delta 数の 4 つを順に巡回し、300 個で全ての組み合わせを 1 回ずつ通る。

## 3. 長期利用後の state を作る

長く使った後の store を、`Op` を最初から送り直さずに作る。`t.state(指定)` は作業用の node を 1 つ起動し、製品の API だけで store を作ってから、その node を kill する。

| 指定      | 意味                                                      | 作り方                                                         |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `tables`  | `{ file, bytes, page, col }` の配列。CSV の先頭を import する | 製品の client の `file` event が作る `import` を送り、`save`   |
| `chunks`  | `tables` が無いときの image の chunk 数                   | 生成した行の `import` を繰り返し、`save`                       |
| `deltas`  | chain の delta 数                                         | 行の一部を書き換えて physical な `push` を直接送る、を繰り返す |
| `patch`   | delta の page 数の合計                                    | 1 回の書き換えが触る leaf の数                                 |
| `residue` | chain の外の delta を残す                                 | delete を失敗させて physical な `merge` を送る                 |

`push` を直接送るのは `base > CHUNK`、`deltas < SLOTS`、`patch + dirty < CHUNK` のときだけである。save の式が選ばない並び (`forced`) はこの方法でだけ作られる。壊れた object と途中で切れた object は作らない。node 側の状態 (未保存の page、window、undo の履歴、障害の後の状態) は、`t.state` の後の step で作る。

## 4. scenario

scenario は、3 節の state から始まり、time 順に実行する step の並びである。サービスの運用で起きることを、利用 (`use`) と出来事 (`event`) に分ける。`story` package が利用の step を作り、`storm` package がその間に出来事の step を挿入する。

| `use`    | 利用の内容                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| `life`   | 数日にわたる利用。client が接続し、間隔を空けて cell を確定し、切断する。save と node の kill は `policy` が起こす |
| `crowd`  | 複数の client が window を動かし、編集、装飾、undo、redo を送る                                  |
| `churn`  | 行、列、page の追加と削除、列名の変更を、装飾の付いた table に送る                               |
| `ingest` | CSV の import を繰り返す。size 2 では `LIMIT` を超える import も送る                             |
| `scan`   | open し直しと読み取り (`_id` の範囲、集計の全走査) を繰り返し、ときどき編集する                  |

| `event`  | 挿入する出来事                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------ |
| `calm`   | 何も起きない                                                                                     |
| `crash`  | 未保存の page を持ったまま、または put の実行途中 (届く / 届かない) で node を kill し、open し直す |
| `fault`  | get、put、delete の失敗と、書き込んだ後に reject する put を起こし、同じ node で続ける           |
| `rival`  | 古い node の put が実行途中のまま、新しい node が同じ store を open して書き込む                 |
| `chain`  | `push` を直接送って delta を `SLOTS` 個まで増やし、delete の失敗で chain の外の delta を残してから merge する |

time は `t.tick(秒)` だけが進め、製品は time を読まない。time が影響するのは次の 3 つである。

| 影響するもの             | 規則                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| アプリが save を呼ぶ時点 | `t.policy({ every, idle })` を指定すると、最後の編集から `every ÷ 2` 秒後、編集が続く場合は最初の未保存の編集から `every` 秒後に save が走る。最後の client が `leave` したときにも走る (cost.md 5 節) |
| node が消える時点        | 最後の client が `leave` してから `idle` 秒後に node が kill される。`a.stop()` は任意の時点で kill する     |
| store の呼び出しの順序   | `hold` で止めた put は、`release('arrive')` の時点で store に届き、`release('lose')` では届かない            |

## 5. 同時実行が起きる条件

| 組み合わせ                                  | 起きる条件                                                                   | simulation での作り方                            |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| 複数の client の `Op`                       | 同時には実行されない。1 つの node の中で 1 列に並ぶ                          | 同じ node に複数の `id` で送る                   |
| 重い `sql` と他の `Op`                      | 同時には実行されない。`sql` が終わるまで他の `Op` が待つ                     | 手書きの scenario だけ (issue 005)               |
| 古い node の put と、新しい node の open / save | 古い Durable Object が消える前に、同じ room の新しい Durable Object が起動する | `hold`、別の node の `open` と `save`、`release` |
| put の reject と、store への書き込み        | put が失敗を返したが、store には書き込まれている                             | `fail('put.after')`                              |
| save の実行途中の kill                      | put の呼び出し中に node が消える                                             | `hold`、`stop`、`release`                        |
| 1 つの store に node を 2 つ作るアプリ      | 1 room 1 Durable Object の前提の外                                           | 作らない                                         |

platform 上で起きる頻度は確かめていない (errata.md 7 節)。

## 6. DST API

seed が生成する scenario と手書きの scenario は同じ形式で、`.bench/` の file である。1 step は 1 つの呼び出しで、compiler が physical な命令の配列に変換し、executer が順に実行する (score.md 8 節)。

| 対象                 | step                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `t`                  | `state(指定)` `tick(秒)` `policy(指定)` `note(文)` `mark(名前, hit するか)` `play(step の配列)` `explain(step)` `done()` |
| `t.node(名前)`       | `open()` `stop()` `run(op)` `save()` `push()` `merge()` `exec(codes)` `fill(page, cols, 行数, bytes)` `load(file, bytes)` `peek(名前, sql)` `stat()` `audit()` `expect(期待)` |
| `t.client(id, node)` | `window` `cell` `style` `undo` `redo` `leave` `run`。`id` を付けて node に送る                       |
| `t.replica(番号)`    | `fail(種類, 何回目)` `hold()` `expect({ exists, linked })`                                           |
| `t.store`            | `fail(種類, 何回目)` `hold(種類)` `release('arrive' か 'lose')` `copy(名前)` `paste(名前, 番号)` `expect({ seqs })` |

`expect` に書ける期待は `error` (空文字列は resolve、`true` は reject)、`stat`、`sql` と `rows` か `same` (`peek` で保存した名前)、`calls`、`store`、`chunks` である。`axis` に判定の axis、`known` に保留中の issue の番号を書ける。`t.explain(step)` は、その step の physical な命令を実行せずに返す。

```ts
import { sim } from '../sim.ts'

const t = sim({ title: 'delete の失敗で残った delta は内容に現れない' })
const a = t.node('A')
const u = t.client('u1', a)

await t.state({ chunks: 3, deltas: 2, patch: 40 })
await a.open()
await u.cell('p', 1, 'a', 'kept')
await t.replica(1).fail('delete')
await a.merge()
await t.replica(1).expect({ exists: true, linked: false })
await a.stop()
await a.open()
await t.store.expect({ seqs: [0] })
await a.expect({ axis: 'chain', sql: 'select "a" from "p" where "_id" = 1', rows: [['kept']] })

export default await t.done()
```

## 7. step ごとに自動で行う判定

`expect` を書かなくても、step ごとに次の観測と判定を行う。判定の定義は score.md 5 節にある。

| step                  | 観測                                                              | 判定する axis                                          |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `open`                | store の呼び出し、`stat`、store の copy を開いた shadow の内容    | 可用、回数、chain、integrity、原子、式                 |
| `run`                 | 製品の `compile` 2 回、store の呼び出し、shadow の結果            | compile、回数、一致、式                                |
| `save` `push` `merge` | shadow の内容、store の呼び出し、`stat`、store の copy を開いた probe の内容 | 回数、可用、writer、上限、chain、integrity、永続、式 |
| `audit`               | window を登録し直した shadow の tree、shadow の装飾の検査         | window、装飾                                           |
| `done`                | 費用の合計 (観測、式、丸ごと保存、最良)                           | 式、丸ごと保存、最良                                   |

shadow を使う判定は、node と shadow の結果が一致している間だけ行う。観測のための読み取りは shadow と probe に対して行うので、node の memory と store の呼び出しは変わらない。`peek` と `expect` の `sql` を node に送ったときだけ、node が chunk を読む。

## 8. 保留中の issue

score.md 10 節の issue は、判定を緩めずに `known` として別に数える。seed が生成する scenario での扱いは次のとおり。

| 番号 | `known` と数える条件                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ |
| 001  | 他の node の save を知らない node が store に書き込めたとき、およびその後の open までの判定の失敗 |
| 002  | seed からは生成しない。`.bench/issues/002.ts` だけが持つ                                         |
| 003  | 書き込んだ後に reject した put の後、その node を open し直すまでの、可用と一致の失敗            |
| 004  | reject した書き込みの後で、resolve した書き込みが 1 つも無い save の put                         |
| 005  | seed からは生成しない。終わらない文は `.bench/issues/005.ts` と `005b.ts` だけが持つ             |
| 006  | 判定には現れない。読み取りの get として費用に入る                                                |
| 007  | open が失敗した後、その node を open し直すまでの、可用の失敗 (contract.md 3 節)                 |
