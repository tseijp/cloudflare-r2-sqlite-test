# 公開面

検証 code が製品に触れてよい面はこの文書だけである。`src/` の file は読まない。ここに無い振る舞いは測らない。

## 1. 入口

| package      | 入口 file                     | export                                             |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `@db/server` | `src/server/db/src/index.ts`  | `createDb(input)`、10 節の定数 (`PAGE` `CHUNK` `ROOM` `LIMIT` `SWAP` `SLOTS` `ROWS`)、型 `Input / Op / Code / Stat / Store / Part` |
| `@db/client` | `src/client/db/src/index.tsx` | `createGrid(input)` と型 `Input / Event / Code / Snap / State`   |

package 名から file への対応は各 `package.json` の `name` と `exports` で決まる。package 内の相対 import は拡張子 `.ts` / `.tsx` 付きで書かれている。

| `packages.mjs` の export | 中身                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanPackages()`         | `src/` と `test/` の全 package の `{ name, dir, entry, deps }`                                                                               |
| `topPackages(packages)`  | 他の package の中に無い package (`@db/server`、`@db/client`、`@test/server`、`@test/client`)                                                 |
| `packages()`             | vite の plugin。package 名を入口 file に解決し、`dependencies` に無い package の import と、相対 path で他の package の中へ入る import を拒む |

`node packages.mjs` は、`test/*/db` から下の directory (`packages/<名前>` と `packages/{declarative,procedural}/<名前>`) を package として `package.json` を書き、`src/index.ts` が無ければ空の入口を置き、全 package の `tsconfig.json` と root の `tsconfig.json` の `paths` を書く。`test/` の package 名は `@test/<client か server>-<途中の package 名>` で、`dependencies` は「祖先の `share` と自分の子」だけになり、実行のたびに directory から書き直される。`src/` の `package.json` は書き換えない。

`test/` の package は `@db/*` を `dependencies` に持てないので、製品を import できない。製品と検証を結ぶのは package の外の file (`.bench/` の scenario) で、`topPackages` の 4 つを import できる。

`node .bench/run.mjs <file …>` は、file ごとに子 process を起こし、`test/vite.config.ts` (`packages()` だけを plugin に持つ) の vite の module runner で file を import して、default export (scenario の記録) を 1 行にまとめて出す。未知の崩れか異常終了があれば exit 1、打ち切りは exit 124 である。`node .bench/run.mjs .bench/seed.ts <from>-<to> [steps] [shrink]` は、seed の範囲について scenario の書き出し、実行、縮め、台帳までを行う。`node_modules/.bin` に `vite` (8.1.3)、`tsx`、`esbuild` がある。vitest は入っていない。

## 2. `createDb({ wasm, store, doc })`

| 引数    | 型                   | 渡すもの                                                                 |
| ------- | -------------------- | ------------------------------------------------------------------------ |
| `wasm`  | `WebAssembly.Module` | `node_modules/wa-sqlite/dist/wa-sqlite-async.wasm` を compile したもの   |
| `store` | 3 節の `Store`       | object storage。1 つの `store` が 1 つの database                        |
| `doc`   | `Y.Doc`              | 表示用の tree を書き込む doc                                             |

返り値は 4 つの関数である。

| 関数               | 振る舞い                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `run(op)`          | logical な命令 1 つを compile して実行する。Promise。呼び出しは 1 本の列に並び、前の命令が終わってから走る |
| `compile(op, stat)` | logical な命令を physical な命令の配列に変える純関数。何も実行しない。不正な命令は例外を投げる             |
| `execute(codes)`   | physical な命令の配列を上から順に実行する。Promise。`run` と同じ列に並ぶ                                   |
| `stat()`           | 6 節の `Stat` を同期で返す                                                                                 |

`createDb` は何も読まない。最初に `run({ type: 'open' })` を呼ぶと store から読み込む。空の store を開くと system table を作るので `dirty` は 0 でなく、最初の `save` は image を put する。`sql` に複数の文を渡すと順に実行され、最後の文の結果が返る。無い行への `cell` / `style` / `row.del` は何も変えずに解決する。同じ `store` に対して新しい `createDb` を作り `open` すると、最後に成功した `save` の状態が開く。`save` していない変更は memory にしか無い。

## 3. Store

```ts
interface Store {
        get(seq: number, offset?: number, length?: number): Promise<{ bytes: Uint8Array; tag: string } | null>
        put(seq: number, bytes: Uint8Array, tag: string): Promise<string | null>
        delete(seqs: number[]): Promise<unknown>
}
```

`seq` は database の中の object 番号で、0 が image、1 以上が delta である。key への写像は store の実装が決める。

| method   | 契約                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`    | object が無ければ `null`。`offset` 省略は 0、`length` 省略は末尾まで。範囲が object の末尾を越えたら末尾で切る。`tag` はその object の版を表す文字列 (R2 の etag)      |
| `put`    | 引数 `tag` は「今そこにあるはずの版」。空文字列は「object が無いこと」を表す。一致すれば書いて新しい `tag` を返し、一致しなければ何も書かずに `null` を返す (compare-and-swap) |
| `delete` | 無い番号を含んでもよい                                                                                                                                                 |

製品が store を呼ぶ場面は次の 4 つだけである。

| 場面                 | 呼び出し                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `open`               | `get(0, 0, CHUNK × PAGE)` を 1 回。image が 2 chunk 以上のときだけ `get(1)`、`get(2)` … を `null` か鎖の切れ目まで |
| SQL の page 読み     | memory に無い chunk ごとに `get(0, offset, length)` を 1 回                                                  |
| `save` (push)        | `put(deltas + 1, bytes, '')` を 1 回                                                                         |
| `save` (merge)       | image が 2 chunk 以上なら `get(0)` を 1 回、`put(0, bytes, image の tag)` を 1 回、image が 2 chunk 以上だったなら `delete([1..SLOTS])` を 1 回 |

merge の `delete` は、製品が知っている delta の数に依らず、番号 1 から `SLOTS` までを全て消す。image を書き直した後に残る delta は、誰が書いたものでも鎖の外だからである。

表から外れる場面は次のとおり。

| 場面                                              | 呼び出しと結果                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `open` で鎖に繋がらない delta を見つけた          | その番号から `SLOTS` までを `delete` で 1 回消す                                                                 |
| `put` が `null` を返した (別の writer が先に書いた) | `store conflict` で reject する                                                                                  |
| merge の `get(0)` の tag が、覚えている tag と違う | `image changed` で reject する。`put` は呼ばない                                                                 |
| `put` が reject した後の `save`                   | 最初に、その番号を `get(seq, 0, 1)` で 1 回確かめる。store が変わっていなければ続行する。変わっていれば `store diverged` で reject し、`put` は呼ばない。別の writer が書いていた場合も同じである |
| `store diverged` の後の `save`                    | 毎回 `get(seq, 0, 1)` を 1 回だけ呼んで reject する。`open` し直すと store の内容で続行できる                    |
| image の `put` が書いた後に reject した           | `open` し直すまで、memory に無い chunk を読む SQL が `disk I/O error` で失敗する (image の tag が覚えている tag と違うため。`.bench/issues/003.md`) |
| 別の writer が image を書き直した                 | 古い側の instance は、`open` し直すまで、memory に無い chunk を読む SQL が `disk I/O error` で失敗する (同じ理由)。古い側の merge は `image changed` で reject する |
| merge の `put` が成功した後の `delete` が reject した | その `save` は成功として解決する。次に store を呼ぶ `save` (`dirty` が 0 でない) の最初に、もう 1 回 `delete` する。`dirty` が 0 の `save` は store を呼ばないので、それまで delta は残る |
| 作り直した直後の instance の `open` が `get` の失敗で reject した | その instance は開いていない。`open` 以外の命令は reject し (`Cannot read properties of null`)、`save` は store を呼ばずに解決する。`open` をやり直すと store の内容で開く |
| 開いていた instance の `open` が delta の `get` の失敗で reject した | SQL の内容は `open` の前のままで、`stat()` の `deltas` と `patch` だけが 0 に戻る。次の push は `store conflict` で reject する。`open` をやり直すと続行できる (`.bench/issues/007.md`) |

writer が 2 つになったときに止まるのは、同じ object を書く save 同士だけである。merge は image の tag だけを、push はその delta 番号が空であることだけを条件にする。別の writer の push を知らない merge と、別の writer の merge を知らない push は通り、片方の delta が鎖の外になって次の `open` で消える。store は開ける状態のままである (`.bench/issues/001.md`)。

## 4. object の形

整数は全て big-endian の u32。圧縮は gzip (`CompressionStream('gzip')`)。

```
image (seq 0)
┌────────┬───────┬─────────┬──────────────────┬───────────────────────────┐
│ "SQLI" │ pages │ chunk 数 │ 圧縮後の長さ × n  │ gzip(chunk 0) gzip(chunk 1) … │
└────────┴───────┴─────────┴──────────────────┴───────────────────────────┘
chunk i は sqlite file の page (i × CHUNK + 1) から CHUNK 枚ぶん。最後の chunk は端数

delta (seq 1..) = gzip( 次の並び )
┌────────┬────────┬───────┬────────┬─────┬──────────────────────┐
│ "SQLD" │ commit │ count │ tag 長 │ tag │ (pgno, page) × count │
└────────┴────────┴───────┴────────┴─────┴──────────────────────┘
commit は適用後の page 数。tag は 1 つ前の object (delta 1 なら image) の tag
```

image の chunk を全て伸長して繋ぐと、page size 4096 の SQLite database file になる。delta は「その save で書き換わった page」の集合で、番号順に適用する。delta の `tag` が 1 つ前の object の今の tag と一致しない delta は鎖の外であり、適用されない。

## 5. logical な命令 (`Op`)

`{ type, ...field }` の plain object。表に無い field は捨てられる。

| type       | field                                                  | 意味                                                                                              |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `open`     |                                                        | store から開き直す。保存していない変更は捨てる。system table を用意し、全 client の `window` の登録を消し、`pages` の view を載せ、undo 履歴を捨てる |
| `save`     |                                                        | 前回の save から変わった page を保存する。変化が無ければ store を呼ばない                         |
| `page.add` | `page`                                                 | page (= table) を作る                                                                             |
| `page.del` | `page`                                                 | table と、その page の装飾を同じ transaction で消す                                               |
| `row.add`  | `page`                                                 | 末尾に空の行を足す。返り値は `[[_id]]`                                                            |
| `row.del`  | `page, row`                                            | 行と、その行の装飾を同じ transaction で消す                                                       |
| `col.add`  | `page, col`                                            | TEXT の列を右端に足す                                                                             |
| `col.del`  | `page, col`                                            | 列と、その列の装飾を同じ transaction で消す                                                       |
| `col.name` | `page, col, name`                                      | 列名を変え、装飾の列名も同じ transaction で変える                                                 |
| `cell`     | `id, page, row, col, text, marks`                      | cell の本文と文字区間の装飾を置き換える。`text` は文字列か null。同じ本文なら本文の page を書かない |
| `style`    | `id, page, row, col, name, value`                      | cell の装飾 1 項目。`value` が null なら外す。`row` が 0 なら列見出し (`name: 'width'` が列幅)    |
| `window`   | `id, page, top, size`                                  | `id` の表示範囲を「`_id >= top` の先頭 `size` 行」にする。SQL へは書かない                        |
| `import`   | `page, names, rows`                                    | page が無ければ `names` の列で作り、`rows` (文字列か null の配列の配列) を末尾に足す。1 transaction |
| `undo`     | `id`                                                   | `id` が行った直前の `cell` / `style` を戻す                                                       |
| `redo`     | `id`                                                   | 戻したものをやり直す                                                                              |
| `sql`      | `text`                                                 | 読み取り専用で実行する。返り値は `[列名の配列, ...行]` で、行は `ROWS` まで                       |
| `leave`    | `id`                                                   | `id` の view を消す                                                                               |

field の制約。`page` / `col` / `name` は 1 〜 64 文字で、`_` と `sqlite_` で始まらず、`rowid` / `oid` でなく、制御文字 (U+0000 〜 U+001F と U+007F 〜 U+009F) を含まない。`id` と装飾の `name` は `[A-Za-z0-9_-]{1,32}`。`row` と `top` は 0 以上の整数、`size` は 1 〜 200。`marks` は `[start, stop, name, value]` の配列で、`stop` は本文の長さに切り詰められ、空になった区間は捨てられる。`row.del` / `col.del` / `col.name` / `page.del` は全員の undo 履歴を捨てる。

位置が無いとき、または名前が重なるときの結果。reject した命令は SQL を変えない。

| 命令                          | 結果                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| 無い page への命令            | reject する。例外は `import` (page を作る) と、`value` が null の `style` (何も変えずに解決) |
| 無い列への `cell` / `col.del` / `col.name` | reject する                                                                 |
| 無い列への `style`            | 何も変えずに解決する                                                                     |
| 無い行への `cell` / `style` / `row.del` | 何も変えずに解決する。`style` の `row` 0 は列見出しで、行が無くても書ける        |
| 同名の `page.add` / `col.add`、既にある別の列名への `col.name` | reject する                                           |
| 今と同じ名前への `col.name`   | 解決する。SQLite が schema の page を書き直すので `dirty` が増え、次の `save` は put する。履歴も捨てる |
| 在る page への `import`       | `names` が全てその page の列名なら末尾に足す。1 つでも違えば reject する                 |
| `top` が最大の `_id` より大きい `window` | 行が 0 件の窓になる                                                           |
| 同じ `(start, name)` の区間が 2 つある `cell` | 主キーの重複で reject する。本文も書かれない                              |
| 窓が登録されている page の `page.del` | その page を見ていた全員の窓の登録と `<id>/…` の key も消える。窓と `page.del` で page 名の大文字小文字が違っていても消える |
| 大文字と小文字だけが違う名前への `col.name` (`a` → `A`) | 解決する。装飾の列名も変わる                                   |
| rollback された書き込みの後の `save` | rollback の前に file へ書かれた page が `dirty` に残り、内容が同じ page を put する (`.bench/issues/004.md`) |
| 終わらない、または重い `sql`  | 止める仕組みは無い。実行の間、他の命令は全て待たされる (`.bench/issues/005.md`)          |

## 6. `Stat`

| field    | 意味                                                |
| -------- | --------------------------------------------------- |
| `pages`  | 今の database の page 数                            |
| `base`   | store にある image の page 数 (無ければ 0)          |
| `dirty`  | 前回の save から書き換わった page 数                |
| `deltas` | store にある有効な delta の数                       |
| `patch`  | delta に入っている page 数の合計                    |

`save` の compile は `stat` だけから決まる。`dirty = 0` なら `[]`。`base <= CHUNK`、`patch + dirty >= CHUNK`、`deltas × (deltas + 1) ÷ 2 >= 1 + 2 × pages ÷ SWAP` のどれかなら `[['merge']]`。それ以外は `[['push']]`。

## 7. physical な命令 (`Code`)

`[code, ...operand]` の配列。operand は文字列、数値、配列だけである。

| code      | operand                    | 装置             | 動作                                                                                   |
| --------- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `pull`    |                            | store → page 層  | image の先頭と delta の鎖を読み、page 層を置き換える                                   |
| `open`    |                            | sqlite           | 接続を開き直す                                                                         |
| `sql`     | `text, params`             | sqlite           | 文を実行し、行の配列を返す                                                             |
| `read`    | `text, limit`              | sqlite           | 読み取りしか許さない状態で実行し、`[列名, ...行]` を返す                               |
| `view`    | `name, text, params, tags` | sqlite → tree    | 問い合わせを登録し、結果を tree に載せる                                               |
| `refresh` |                            | sqlite → tree    | 登録済みの問い合わせを全て実行し直し、変わった行だけ tree に書く                       |
| `drop`    | `tag`                      | tree             | その tag を持つ問い合わせの登録と結果を消す                                            |
| `fill`    | `key, text, params`        | sqlite → tree    | 編集 key が無ければ、問い合わせの結果を JSON にして置く (変更前の値)                   |
| `set`     | `key, value, origin`       | tree             | 編集 key を書く。`origin` ごとの履歴に積まれる                                         |
| `undo`    | `origin`                   | tree             | その `origin` の履歴を 1 つ戻す                                                        |
| `redo`    | `origin`                   | tree             | 1 つやり直す                                                                           |
| `forget`  |                            | tree             | 編集 key と全員の履歴を消す                                                            |
| `push`    |                            | page 層 → store  | 汚れた page を delta 1 つにして put する                                               |
| `merge`   |                            | page 層 → store  | 全 page を image 1 つにして put し、delta を消す                                       |

命令の配列の途中で失敗すると、開いている transaction は rollback され、`run` / `execute` は reject する。tree は rollback されない。失敗より前に実行された `view` / `fill` / `set` の結果は残る。そのため命令の並びを次のように決めてある。

| 命令              | 並び                                                  | 失敗したときに残るもの                                         |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `window`          | `view` を rows、cols、styles、marks、last の順に 5 つ | page が無ければ最初の rows で失敗し、登録も tree も変わらない  |
| `cell` / `style`  | `fill`、書き込み、`set`、`refresh`                    | 書き込みが失敗すると `set` に届かず、その編集は履歴に入らない  |
| undo / redo の反映 | 書き込み、`refresh`                                   | 無し                                                           |

commit の後の `refresh` が失敗したとき (page の読みの失敗) は、SQL の変更は残り、命令は reject する。次に成功した `refresh` が、登録済みの view を全て合わせ直す。

## 8. tree

`doc.getMap('view')` の key は `<view 名>/<0 始まりの連番>`、値は問い合わせ結果の 1 行 (配列)。

| view 名       | 1 行の形                               | 登録する命令 |
| ------------- | -------------------------------------- | ------------ |
| `pages`       | `[page 名]` (作成順)                   | `open`       |
| `<id>/cols`   | `[列名, 幅]` (幅は文字列。既定 `'4'`)  | `window`     |
| `<id>/rows`   | `[_id, 列 1 の本文, 列 2 の本文, …]`   | `window`     |
| `<id>/styles` | `[row, col, name, value]`              | `window`     |
| `<id>/marks`  | `[row, col, start, stop, name, value]` | `window`     |
| `<id>/last`   | `[最大の _id]` (行が無ければ null)     | `window`     |

`doc.getMap('edit')` は undo のための map で、key は `JSON.stringify(['cell', page, row, col])` か `JSON.stringify(['style', page, row, col, name])`、値は JSON 文字列である。

## 9. image の中の table

| table       | 列                                                  | 主キー                          |
| ----------- | --------------------------------------------------- | ------------------------------- |
| `<page 名>` | `_id INTEGER PRIMARY KEY AUTOINCREMENT` と利用者の列 (全て TEXT)。消した行の `_id` は再利用されない | `_id` |
| `_style`    | `page, row, col, name, value`                       | `(page, row, col, name)`        |
| `_mark`     | `page, row, col, start, name, stop, value`          | `(page, row, col, start, name)` |

`_style` と `_mark` は `WITHOUT ROWID`。`row` は page table の `_id`、`col` は列名である。`row = 0` は列見出しを指す。`page` と `col` の列は `COLLATE NOCASE` で、SQLite の table 名と列名と同じく、ASCII の大文字と小文字を区別しない。命令の `page` / `col` に大文字小文字だけ違う名前 (`a` と `A`) を渡しても、本文と装飾は同じ位置に当たる。装飾の行には渡された綴りがそのまま入る。編集の履歴の key は綴りを区別する。

## 10. 定数

| 名前    | 値   | 意味                                                         |
| ------- | ---- | ------------------------------------------------------------ |
| `PAGE`  | 4096 | page size (byte)                                             |
| `CHUNK` | 512  | image の 1 chunk の page 数。range GET の単位                 |
| `ROOM`  | 4    | memory に置く chunk の数                                     |
| `LIMIT` | 8192 | database の page 数の上限 (`max_page_count`)                 |
| `SWAP`  | 2048 | GET 1 回と同じ費用とみなす page 数                           |
| `SLOTS` | 8    | delta の番号の上限                                           |
| `ROWS`  | 100  | `sql` が返す行数の上限                                       |

## 11. `createGrid({ doc, id, send })`

`send(op)` は 5 節の `Op` を server に届けて返り値を返す関数、`id` は client の識別子である。返り値は `{ Grid, dispatch, compile }`。

| 関数                   | 振る舞い                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| `compile(event, snap)` | 利用者の操作 1 つを physical な命令の配列に変える純関数                      |
| `dispatch(event)`      | compile して実行する。命令が 1 つ以上あれば true                             |
| `Grid`                 | react component。`doc` の `view` と局所状態を描く                            |

physical な命令は 2 種で、`['state', patch]` は局所状態 (`page, top, sel, edit, result, note`) を書き換え、`['send', op, key?]` は `send(op)` を呼ぶ (`key` があれば返り値を局所状態のその key に置く)。

| event (`type`) | field                        | 命令                                                                 |
| -------------- | ---------------------------- | -------------------------------------------------------------------- |
| `key`          | `key, shift, meta, composing` | 矢印 / Tab / Enter / F2 / Escape / Delete / 文字 / Mod+Z / Mod+Y を下の操作に読み替える |
| `wheel`        | `dy`                         | `scroll` (3 行)                                                      |
| `file`         | `name, text`                 | CSV を読み、`load`                                                   |
| `pick`         | `slot, index`                | 選択。`slot` は窓の中の行位置 (-1 が列名の行)、`index` は列位置      |
| `edit`         | `text?`                      | 編集の開始                                                           |
| `type`         | `text, start, stop`          | 編集中の文字列と選択範囲                                             |
| `commit`       | `dx, dy`                     | 確定。変化があれば `cell` か `col.name` を send                      |
| `cancel`       |                              | 編集の破棄                                                           |
| `move`         | `dx, dy`                     | 選択の移動。窓の端では `scroll`                                      |
| `scroll`       | `dy`                         | `top` を動かして `window` を send                                    |
| `page`         | `page`                       | page を切り替えて `window` を send                                   |
| `add`          | `kind` (`page / row / col`)  | `page.add` / `row.add` / `col.add` を send                           |
| `remove`       | `kind`                       | `page.del` / `row.del` / `col.del` を send                           |
| `resize`       | `index, width`               | `style` (`row: 0, name: 'width'`) を send。幅は 1 〜 12              |
| `fill`         | `value`                      | `style` (`name: 'fill'`) を send                                     |
| `bold`         |                              | 編集中は選択範囲、そうでなければ cell 全体の `bold` を付け外す       |
| `load`         | `name, names, rows`          | `import` を `BATCH` (2000) 行ずつ send                               |
| `undo` `redo` `save` `open` `sql` |           | 同名の `Op` を send                                                  |
