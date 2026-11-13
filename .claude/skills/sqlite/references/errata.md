# 確かめたこと

設計が寄りかかっている外部の事実を、確かめ方と一緒に並べる。「source」は `node_modules` の実物を読んだもの、「binary」は wasm の中の文字列を調べたもの、「一次資料」は公式の仕様書の記述で、この repository では実行して確かめていないものである。

## 1. wa-sqlite 1.0.0

| 事実                                                                                                              | 確かめ方 |
| ----------------------------------------------------------------------------------------------------------------- | -------- |
| 同梱の SQLite は 3.44.0                                                                                           | binary   |
| JSON 関数 (`json_each`、`->>` の実体の `json_extract`) が入っている                                               | binary   |
| `dbstat`、`sqlite_dbpage`、fts5、rtree は入っていない                                                             | binary   |
| compile option に `ENABLE_BATCH_ATOMIC_WRITE`、`OMIT_AUTOINIT`、`OMIT_DECLTYPE`、`OMIT_DEPRECATED`、`OMIT_LOAD_EXTENSION`、`OMIT_SHARED_CACHE` がある | binary |
| build は `wa-sqlite.mjs` (同期) と `wa-sqlite-async.mjs` (Asyncify) の 2 つ。JSPI の build は無い                 | source   |
| `step` `prepare_v2` `open_v2` `finalize` `reset` `close` はどちらの build でも `async` 関数                       | source   |
| VFS は class でなくてよい。`name` と `x…` method を持つ object を `vfs_register` に渡せば呼ばれる                 | source   |
| `xRead` / `xWrite` に渡る buffer は wasm の heap の一部で、呼び出しの後は別の内容になる。持ち続けるなら copy する | source   |
| `xFileSize` の出力先は `setBigInt64(0, n, true)`、`xOpen` / `xAccess` / `xCheckReservedLock` は `setInt32(0, n, true)` | source |
| async build は登録時に VFS へ `handleAsync` を差し込む。中身は `f().then(wakeUp)` で、`f` が reject すると wasm は二度と再開しない。VFS の非同期処理は必ず resolve させ、失敗は `SQLITE_IOERR` を返り値にする | source |
| `instantiateWasm(imports, receive)` は `receive(instance)` の返り値を返さなければならない。`instance.exports` を返すと Asyncify の包みが外れる | source |
| Asyncify は再開のとき、中断した JS の関数 (`xRead`) を頭からもう一度呼ぶ。2 度目も `handleAsync` を呼ぶ経路を通らないと wasm が `unreachable` で落ちる。「cache にあれば同期、無ければ非同期」と分ける VFS は、非同期を始めたことを覚えておき、再入のときも `handleAsync` を呼ぶ | 実行 (simulation で観測) |
| `set_authorizer(db, f, userData)` の `f` は `(userData, actionCode, …)` で呼ばれ、`f` に null を渡すと外れる     | source   |
| `get_autocommit(db)` がある                                                                                       | source   |
| `statements(db, text)` は text の中の文を 1 つずつ返す。行を 1 つの配列に溜めると、複数文の結果が混ざる。文ごとに配列を作り直す | 実行 (simulation で観測) |

## 2. SQLite

| 事実                                                                                                         | 確かめ方 |
| ------------------------------------------------------------------------------------------------------------ | -------- |
| database header の offset 16 に page size、24 に change counter、28 に page 数                               | 一次資料 |
| `journal_mode = MEMORY` と `temp_store = MEMORY` では、main の database file 以外を VFS に開かせない          | 一次資料 |
| `max_page_count` を超える書き込みは `SQLITE_FULL` で失敗する                                                 | 一次資料 |
| `ADD COLUMN` と `RENAME COLUMN` は既存の行に触れない。`DROP COLUMN` は table の内容を書き直す (3.35 から)    | 一次資料 |
| `RETURNING` は 3.35 から、`->>` は 3.38 から                                                                 | 一次資料 |
| `insert … select … where … on conflict (…) do update` は、select に where があれば構文が曖昧にならない       | 一次資料 |
| authorizer は prepare の時点で呼ばれ、`SQLITE_DENY` を返すとその文は prepare に失敗する                      | 一次資料 |
| `pragma_table_info(?)` は table 値関数で、引数を bind できる                                                 | 一次資料 |
| `AUTOINCREMENT` の無い `INTEGER PRIMARY KEY` は「今ある最大の rowid + 1」を振る。末尾の行を消すと同じ番号が次の行に付く。`AUTOINCREMENT` は振った最大値を `sqlite_sequence` に持ち、使い回さない | 実行 (simulation で観測) と一次資料 |

## 3. drizzle-orm 0.45.2

| 事実                                                                                                   | 確かめ方 |
| ------------------------------------------------------------------------------------------------------ | -------- |
| SQLite の dialect は識別子を `"` で囲み、中の `"` を `""` にする                                       | source   |
| `sql` template に入れた文字列、数値、null は `?` と params になる。配列は `(a, b)` の並びになる        | source   |
| `sql.identifier(名前)` は識別子、`sql.raw(文字列)` はそのままの文になる                                | source   |
| `drizzle-orm/sqlite-proxy` の `drizzle(callback)` で作った builder は、`toSQL()` を呼ぶだけなら何も実行しない | source |
| `sqliteTable` に `WITHOUT ROWID` を付ける指定は無い。DDL は `getTableConfig` から自分で組む            | source   |
| zod → drizzle の変換は無い。zod はこの repository に入っていない                                       | source   |

## 4. R2 と partyserver

| 事実                                                                                                                 | 確かめ方           |
| -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `range: { offset, length }` が object の末尾を越えると末尾で切られる。`offset` が大きさを越えると失敗する            | source (miniflare) |
| `put` の `onlyIf` に `if-match` / `if-none-match: *` の Headers を渡せる。条件が外れると `null` が返る               | source (miniflare、型定義) |
| `delete` は key の配列を受ける                                                                                       | 型定義             |
| `@cloudflare/vite-plugin` は `.wasm` の import を `WebAssembly.Module` にする                                        | source             |
| partyserver の `hibernate` の既定は false                                                                            | source             |
| y-partyserver 2.2.0 の `onSave` は doc の update から debounce して呼ばれるだけで、接続が閉じたときには呼ばれない     | source             |
| YProvider は同期が済むたびに `sync` を emit する                                                                     | source             |

miniflare は R2 の模擬で、本物の R2 で確かめたものではない。

## 5. yjs 13.6

| 事実                                                                                                   | 確かめ方 |
| ------------------------------------------------------------------------------------------------------ | -------- |
| `UndoManager` は `trackedOrigins` と `captureTimeout` を受け、`clear()` を持つ                          | 型定義   |
| 既定では、他が上書きした map の key を undo で戻さない (`ignoreRemoteMapChanges` の説明)               | 型定義   |
| undo / redo の transaction の origin は UndoManager 自身である                                         | source   |
| 既定で戻さないのは、自分の履歴に無い書き込みが同じ key の後ろに続いているときである (`redoItem` の条件) | source   |

## 6. 先行案からの訂正

| 先行案の主張                                             | 判定                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 同期 server は room が空になったときに保存 hook を呼ぶ   | 誤り。y-partyserver 2.2.0 は呼ばない。アプリが `onClose` で save を呼ぶ                |
| 変更 page を知るには WAL が要る                          | 不要。VFS の `xWrite` が書かれた page 番号をそのまま受け取る                            |
| 小さい file は丸ごと、大きい file は差分のほうが PUT が安い | 誤り。R2 の PUT は大きさに依らず 1 回。分かれ目は memory と開くときの GET で決まる     |
| 開くには object の一覧 (list) が要る                     | 不要。delta は番号で辿れ、前の object の etag を持つので順に GET すれば鎖が分かる       |
| page 単位の索引を object の末尾に置く                    | 不要。image は chunk の長さの表を先頭に持ち、delta は丸ごと読む                         |
| lz4 を自前で持つ                                         | 不要。`CompressionStream('gzip')` が workerd、node、browser にある                      |

## 7. 確かめていないこと

workerd の上での起動、本物の R2 での条件付き put、転送速度 (SWAP の根拠)、gzip の圧縮比、範囲読みが触れる chunk 数、Asyncify の stack の深さの余裕、同じ room の Durable Object が 2 つ同時に動く条件と頻度、reject を返した put が store に入っている頻度、Durable Object の memory の合計。
