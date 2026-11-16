# 公開 API

製品 (`@db/server`、`@db/client`、`src/server.tsx`) が外に見せる API と、その観測できる振る舞いである。検証 code はこの文書の API だけを使う。

## 1. 入口

| package      | 入口 file                     | export                                             |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `@db/server` | `src/server/db/src/index.ts`  | `createDb(input)`、10 節の定数、型 `Input / Op / Code / Stat / Store / Part` |
| `@db/client` | `src/client/db/src/index.tsx` | `createGrid(input)` と型 `Input / Event / Code / Snap / State`   |

package 名から file への対応は各 `package.json` の `name` と `exports` で決まる。package 内の相対 import は拡張子 `.ts` / `.tsx` 付きで書かれている。

| `packages.mjs` の export | 内容                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanPackages()`         | `src/` の全 package の `{ name, dir, entry, deps }`                                                                                          |
| `topPackages(packages)`  | 他の package の中に無い package (`@db/server`、`@db/client`、`@db/test`)                                                                     |
| `packages()`             | vite の plugin。package 名を入口 file に解決し、`dependencies` に無い package の import と、相対 path で他の package の中へ入る import を拒む |

`node packages.mjs` は、`package.json` を持つ全 package の `tsconfig.json` と、root の `tsconfig.json` の `paths` を書く。`src/test/db` の `package.json` は書かない (`test/*/db` だけを対象にしている)。package の外の file (`.bench/` の file) は `topPackages` の 3 つだけを import できる。

## 2. `createDb({ wasm, store, doc })`

| 引数    | 型                   | 渡すもの                                                                 |
| ------- | -------------------- | ------------------------------------------------------------------------ |
| `wasm`  | `WebAssembly.Module` | `node_modules/wa-sqlite/dist/wa-sqlite-async.wasm` を compile したもの   |
| `store` | 3 節の `Store`       | object storage。1 つの `store` が 1 つの database                        |
| `doc`   | `Y.Doc`              | 表示用の tree を書き込む doc。製品と同じ `yjs` の module で作る          |

| 関数                | 振る舞い                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `run(op)`           | logical な命令 1 つを compile して実行する。Promise。呼び出しは 1 列に並び、前の命令が終わってから実行される     |
| `compile(op, stat)` | logical な命令を physical な命令の配列に変える純関数。何も実行しない。不正な命令は例外を投げる。`open` の前でも呼べる |
| `execute(codes)`    | physical な命令の配列を順に実行する。Promise。`run` と同じ列に並ぶ。返り値は、結果が undefined でない最後の命令の結果である |
| `stat()`            | 6 節の `Stat` を同期で返す。`open` の前は全て 0 である                                                           |

| 性質       | 内容                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 起動       | `createDb` は何も読まない。最初の `run({ type: 'open' })` で wasm の instance を 1 つ作り、store から読み込む。instance 1 つが wasm の memory を 1 つ持つ |
| 終了       | instance を閉じる関数は無い。instance は、命令を実行している間だけ store を呼ぶ                                                                   |
| 空の store | 空の store を開くと system table を作るので `dirty` は 0 でなく、最初の `save` は image を put する                                                  |
| 永続       | 同じ `store` に対して新しい `createDb` を作り `open` すると、最後に成功した `save` の状態が開く。`save` していない変更は memory にしか無い           |
| 失敗       | 命令の配列の途中で失敗すると、開いている transaction は rollback され、`run` / `execute` は reject する。tree は rollback されない                   |
| 時刻と乱数 | `@db/server` と `@db/client` は時刻も乱数も読まない                                                                                                  |

## 3. Store

```ts
interface Store {
        get(seq: number, offset?: number, length?: number): Promise<{ bytes: Uint8Array; tag: string } | null>
        put(seq: number, bytes: Uint8Array, tag: string): Promise<string | null>
        delete(seqs: number[]): Promise<unknown>
}
```

`seq` は database の中の object 番号で、0 が image、1 以上が delta である。key への対応は store の実装が決める。

| method   | 契約                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`    | object が無ければ `null`。`offset` 省略は 0、`length` 省略は末尾まで。範囲が object の末尾を越えたら末尾で切る。`tag` はその object の版を表す文字列 (R2 の etag)      |
| `put`    | 引数 `tag` は「今そこにあるはずの版」。空文字列は「object が無いこと」を表す。一致すれば書いて新しい `tag` を返し、一致しなければ何も書かずに `null` を返す (compare-and-swap) |
| `delete` | 無い番号を含んでもよい                                                                                                                                                 |

製品が store を呼ぶ場面は次の 4 つだけである。

| 場面             | 呼び出し (この順)                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`           | `get(0, 0, CHUNK × PAGE)`。image が 2 chunk 以上のときだけ、続けて `get(1)`、`get(2)` … を `null` が返るか chain が切れるまで                  |
| SQL の page 読み | memory に無い chunk ごとに `get(0, offset, length)` を 1 回。返った `tag` が覚えている image の `tag` と違えば `disk I/O error` になる         |
| `save` (push)    | `put(deltas + 1, bytes, '')`                                                                                                                   |
| `save` (merge)   | image が 2 chunk 以上なら `get(0)` (全体)、`put(0, bytes, image の tag)`、merge の前の image が 2 chunk 以上だったなら `delete([1..SLOTS])`    |

memory には、最近使った chunk を `ROOM` 個まで、delta の page、未保存の page を持つ。`ROOM` を超えた chunk は古い順に破棄され、次に必要になったときに `get` し直す。

失敗の後と、writer が 2 つのときの振る舞い。

| 場面                                                  | 呼び出しと結果                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `open` で chain に繋がらない delta を見つけた         | その番号から `SLOTS` までを `delete` で 1 回消し、そこで読むのを止める                                           |
| `put` が `null` を返した                              | `store conflict` で reject する                                                                                  |
| merge の `get(0)` の tag が、覚えている tag と違う    | `image changed` で reject する。`put` は呼ばない                                                                 |
| `put` が reject した後の `save`                       | 最初に、その番号を `get(seq, 0, 1)` で 1 回確かめる。store が変わっていなければ続行する。変わっていれば `store diverged` で reject し、`put` は呼ばない |
| `put` が書き込んだ後に reject した                    | 以後の `save` は毎回 `get(seq, 0, 1)` を 1 回呼んで `store diverged` で reject する。image の `put` だった場合は、memory に無い chunk を読む SQL も `disk I/O error` で失敗する。`open` し直すと store の内容で続行できる (`.bench/issues/003.ts`) |
| merge の `put` が成功した後の `delete` が reject した | その `save` は resolve する。次に store を呼ぶ `save` (`dirty` が 0 でない) の最初に、もう 1 回 `delete` する    |
| 起動した直後の instance の `open` が reject した      | その instance は開いていない。`open` 以外の `Op` は reject し (`Cannot read properties of null …`)、`save` は store を呼ばずに resolve する。`open` をやり直すと store の内容で開く |
| 開いていた instance の `open` が delta の `get` の失敗で reject した | SQL の内容は `open` の前のままで、`stat()` の `deltas` と `patch` だけが 0 に戻る。次の push は `store conflict` で reject する。`open` をやり直すと続行できる (`.bench/hand/halfopen.ts`) |
| 別の writer が同じ番号を先に書いた (merge と merge、push と push) | 後から書いた側の `put` が `null` になり、`store conflict` で reject する                             |
| 別の writer が image を書き直した                     | 古い側の instance は、`open` し直すまで、memory に無い chunk を読む SQL が `disk I/O error` で失敗する。古い側の merge は `image changed` で reject する |
| 別の writer の push を知らない merge、別の writer の merge を知らない push | どちらの `put` も成功する。片方の delta が chain の外になり、次の `open` で消える (`.bench/issues/001.ts`) |

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

image の chunk を全て伸長して繋ぐと、page size 4096 の SQLite database file になる。delta は「その save で書き換わった page」の集合で、番号順に適用する。delta の `tag` が 1 つ前の object の今の tag と一致しない delta は chain の外であり、適用されない。検証 code は object を decode せず、不透明な byte として copy する。

## 5. logical な命令 (`Op`)

`{ type, ...field }` の plain object。表に無い field は無視される。返り値は `run(op)` が resolve する値である。

| type       | field                             | 意味                                                                                              | 返り値          |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| `open`     |                                   | store から開き直す。保存していない変更は破棄する。system table を用意し、全 client の `window` の登録を消し、`pages` の view を登録し、undo の履歴を消す | `[]` |
| `save`     |                                   | 前回の save から変わった page を保存する。変化が無ければ store を呼ばない                         | undefined       |
| `page.add` | `page`                            | page (= table) を作る                                                                             | `[]`            |
| `page.del` | `page`                            | table と、その page の装飾を同じ transaction で消す                                               | `[]`            |
| `row.add`  | `page`                            | 末尾に空の行を足す                                                                                | `[[_id]]`       |
| `row.del`  | `page, row`                       | 行と、その行の装飾を同じ transaction で消す                                                       | `[]`            |
| `col.add`  | `page, col`                       | TEXT の列を右端に足す                                                                             | `[]`            |
| `col.del`  | `page, col`                       | 列と、その列の装飾を同じ transaction で消す                                                       | `[]`            |
| `col.name` | `page, col, name`                 | 列名を変え、装飾の列名も同じ transaction で変える                                                 | `[]`            |
| `cell`     | `id, page, row, col, text, marks` | cell の本文と文字区間の装飾を置き換える。`text` は文字列か null。同じ本文なら本文の page を書かない | `[]`          |
| `style`    | `id, page, row, col, name, value` | cell の装飾 1 項目。`value` が null なら外す。`row` が 0 なら列見出し (`name: 'width'` が列幅)    | `[]`            |
| `window`   | `id, page, top, size`             | `id` の表示範囲を「`_id >= top` の先頭 `size` 行」にする。SQL へは書かない                        | undefined       |
| `import`   | `page, names, rows`               | page が無ければ `names` の列で作り、`rows` (文字列か null の配列の配列) を末尾に足す。1 transaction。行は `names` の位置で読まれ、足りない位置は NULL、余った位置は無視される | `[]` |
| `undo`     | `id`                              | `id` が行った直前の `cell` / `style` を戻す                                                       | undefined       |
| `redo`     | `id`                              | 戻したものをやり直す                                                                              | undefined       |
| `sql`      | `text`                            | 読み取り専用で実行する。行は `ROWS` まで。複数の文は順に実行され、最後の文の結果が返る            | `[列名の配列, ...行]` |
| `leave`    | `id`                              | `id` の view の登録と結果を消す                                                                   | undefined       |

field の制約。外れた `Op` は `compile` が `invalid <type>.<field>` を投げ、無い `type` は `unknown op: <type>` を投げる。

| field                 | 制約                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `page` `col` `name` (列名) | 1 〜 64 文字。小文字にして `_` か `sqlite_` で始まらず、`rowid` / `oid` でない。制御文字 (U+0000 〜 U+001F、U+007F 〜 U+009F) を含まない |
| `names`               | 上の制約を満たす名前の、空でない配列。大文字小文字を無視して重複しない                                                                |
| `id`、装飾の `name`   | `[A-Za-z0-9_-]{1,32}`                                                                                                                 |
| `row` `top`           | 0 以上 2147483647 以下の整数                                                                                                          |
| `size`                | 1 〜 200 の整数                                                                                                                       |
| `text` `value`、`rows` の要素 | 文字列か null                                                                                                                 |
| `marks`               | `[start, stop, name, value]` の配列。`start` `stop` は整数、`name` は `id` と同じ制約、`value` は文字列。`stop` は本文の長さに切り詰められ、空になった区間は入らない |
| `sql` の `text`       | 1 〜 4096 文字                                                                                                                        |

位置が無いとき、名前が重なるとき、上限に達したときの結果。reject した `Op` は SQL を変えない。

| 命令                                       | 結果                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 無い page への命令                         | reject する (`no such table: <page>`)。例外は `import` (page を作る) と、`value` が null の `style` (何も変えずに resolve) |
| 無い列への `cell` / `col.del` / `col.name` | reject する                                                                                            |
| 無い列への `style`                         | 何も変えずに resolve する                                                                              |
| 無い行への `cell` / `style` / `row.del`    | 何も変えずに resolve する。`style` の `row` 0 は列見出しで、行が無くても書ける。無い行への `cell` / `style` も undo の履歴には入る (`.bench/issues/002.ts`) |
| 同名の `page.add` / `col.add`、既にある別の列名への `col.name` | reject する                                                                        |
| 今と同じ名前への `col.name`                | resolve する。SQLite が schema の page を書き直すので `dirty` が増え、次の `save` は put する          |
| 大文字と小文字だけが違う名前への `col.name` (`a` → `A`) | resolve する。装飾の列名も変わる                                                          |
| 存在する page への `import`                | `names` が全てその page の列名なら末尾に足す。1 つでも違えば reject する                               |
| `LIMIT` page を超える書き込み              | `database or disk is full` で reject し、その transaction は rollback される                           |
| rollback された書き込みの後の `save`       | rollback の前に file へ書かれた page が `dirty` に残り、内容が同じ page を put する (`.bench/issues/004.ts`) |
| `top` が最大の `_id` より大きい `window`   | 行が 0 件の window になる                                                                              |
| 同じ `(start, name)` の区間が 2 つある `cell` | 主キーの重複で reject する。本文も書かれない                                                        |
| window が登録されている page の `page.del` | その page を見ていた全員の window の登録と `<id>/…` の key も消える。page 名の大文字小文字が違っていても消える |
| `row.del` / `col.del` / `col.name` / `page.del` | 全員の undo の履歴を消す                                                                          |
| 書き込みを含む `sql`、`pragma`             | `not authorized` で reject する                                                                        |
| 終わらない、または重い `sql`               | 止める仕組みは無い。実行の間、他の命令は全て待たされる (`.bench/issues/005.ts`)                        |

## 6. `Stat`

| field    | 意味                                                |
| -------- | --------------------------------------------------- |
| `pages`  | 今の database の page 数                            |
| `base`   | store にある image の page 数 (無ければ 0)          |
| `dirty`  | 前回の save から SQLite が file に書いた page 数    |
| `deltas` | store にある、chain に繋がる delta の数             |
| `patch`  | その delta に入っている page 数の合計               |

`save` の compile は `stat` だけで決まる。`dirty = 0` なら `[]`。`base <= CHUNK`、`patch + dirty >= CHUNK`、`deltas × (deltas + 1) ÷ 2 >= 1 + 2 × pages ÷ SWAP` のどれかなら `[['merge']]`。それ以外は `[['push']]`。

## 7. physical な命令 (`Code`)

`[code, ...operand]` の配列。operand は文字列、数値、配列だけである。

| code      | operand                    | 装置             | 動作と結果                                                                             |
| --------- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `pull`    |                            | store → page 層  | image の先頭と delta の chain を読み、page 層を置き換える                              |
| `open`    |                            | sqlite           | 接続を開き直す                                                                         |
| `sql`     | `text, params`             | sqlite           | 文を実行し、行の配列を返す。書き込みも `pragma` も実行できる。`?1` 形式の番号付き parameter を使える |
| `read`    | `text, limit`              | sqlite           | 読み取りしか許さない状態で実行し、`[列名, ...行]` を返す。行は `limit` まで。`sqlite_master` も読める |
| `view`    | `name, text, params, tags` | sqlite → tree    | query を登録し、結果を tree に書く                                                     |
| `refresh` |                            | sqlite → tree    | 登録済みの query を全て実行し直し、変わった行だけ tree に書く                          |
| `drop`    | `tag`                      | tree             | その tag を持つ query の登録と結果を消す                                               |
| `fill`    | `key, text, params`        | sqlite → tree    | 編集 key が無ければ、query の結果を JSON にして置く (変更前の値)                       |
| `set`     | `key, value, origin`       | tree             | 編集 key を書く。`origin` ごとの履歴に入る                                             |
| `undo`    | `origin`                   | tree             | その `origin` の履歴を 1 つ戻す                                                        |
| `redo`    | `origin`                   | tree             | 1 つやり直す                                                                           |
| `forget`  |                            | tree             | 編集 key と全員の履歴を消す                                                            |
| `push`    |                            | page 層 → store  | `dirty` な page を delta 1 つにして put する                                           |
| `merge`   |                            | page 層 → store  | 全 page を image 1 つにして put し、delta を消す                                       |

`push` を直接送ってよいのは `base > CHUNK`、`deltas < SLOTS`、`patch + dirty < CHUNK` のときである。それ以外は save の式が作らない並びである。

logical な命令から physical な命令への対応。

| `Op`                              | 命令の並び                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `open`                            | `pull`、`open`、`sql` (pragma 3 つと system table の作成 2 つ)、`drop` (`window`)、`view` (`pages`)、`refresh`、`forget` |
| `save`                            | 6 節                                                                                               |
| `page.add` `col.add` `row.add`    | `sql` 1 つ、`refresh`                                                                              |
| `page.del` `col.del` `col.name` `row.del` | `sql` (begin、本体、`_style`、`_mark`、commit)、`refresh`、`forget`。`page.del` は commit の後に `drop` (`page:<小文字の page 名>`) |
| `cell` `style`                    | `fill`、書き込みの `sql`、`set`、`refresh`                                                         |
| `import`                          | `sql` (begin、`create table if not exists`、`insert … from json_each(?)`、commit)、`refresh`       |
| `window`                          | `view` を rows、cols、styles、marks、last の順に 5 つ。tags は `window`、`id:<id>`、`page:<小文字の page 名>` |
| `sql`                             | `read` (`text`、`ROWS`)                                                                            |
| `leave`                           | `drop` (`id:<id>`)                                                                                 |
| `undo` `redo`                     | `undo` / `redo`。tree の編集 key が戻ると、その key と値から作った `cell` / `style` が、書き込みの `sql` と `refresh` の並びで続けて実行される |

失敗したときに残るもの。

| 命令              | 残るもの                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| `window`          | page が無ければ最初の rows で失敗し、登録も tree も変わらない                      |
| `cell` / `style`  | 書き込みが失敗すると `set` に届かず、その編集は履歴に入らない。`fill` の結果は残る |
| commit の後の `refresh` の失敗 (page の読みの失敗) | SQL の変更は残り、命令は reject する。次に成功した `refresh` が、登録済みの view を全て合わせ直す |

## 8. tree

`doc.getMap('view')` の key は `<view 名>/<0 始まりの連番>`、値は query 結果の 1 行 (配列)。

| view 名       | 1 行の形                               | 登録する命令 |
| ------------- | -------------------------------------- | ------------ |
| `pages`       | `[page 名]` (作成順)                   | `open`       |
| `<id>/cols`   | `[列名, 幅]` (幅は文字列。既定 `'4'`)  | `window`     |
| `<id>/rows`   | `[_id, 列 1 の本文, 列 2 の本文, …]`   | `window`     |
| `<id>/styles` | `[row, col, name, value]`              | `window`     |
| `<id>/marks`  | `[row, col, start, stop, name, value]` | `window`     |
| `<id>/last`   | `[最大の _id]` (行が無ければ null)     | `window`     |

`doc.getMap('edit')` は undo のための map で、key は `JSON.stringify(['cell', page, row, col])` か `JSON.stringify(['style', page, row, col, name])`、値は JSON 文字列である。履歴は `id` ごとの `Y.UndoManager` (`captureTimeout: 0`) で、他の `id` が後から書いた key は戻らない。

## 9. image の中の table

| table       | 列                                                  | 主キー                          |
| ----------- | --------------------------------------------------- | ------------------------------- |
| `<page 名>` | `_id INTEGER PRIMARY KEY AUTOINCREMENT` と user の列 (全て TEXT)。消した行の `_id` は再利用されない | `_id` |
| `_style`    | `page, row, col, name, value`                       | `(page, row, col, name)`        |
| `_mark`     | `page, row, col, start, name, stop, value`          | `(page, row, col, start, name)` |
| `sqlite_sequence` | SQLite が `AUTOINCREMENT` のために持つ table  |                                 |

`_style` と `_mark` は `WITHOUT ROWID`。`row` は page table の `_id`、`col` は列名である。`row = 0` は列見出しを指す。`page` と `col` の列は `COLLATE NOCASE` で、SQLite の table 名と列名と同じく、ASCII の大文字と小文字を区別しない。装飾の行には渡された綴りがそのまま入る。編集の履歴の key は綴りを区別する。table 名は Unicode の正規化をしないので、NFC と NFD の同じ見た目の名前は別の table である (fixtures.md 5 節)。

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

`send(op)` は 5 節の `Op` を server に届けて返り値を返す関数、`id` は client の識別子である。返り値は `{ Grid, dispatch, compile }`。`send` は 1 列に並び、前の `send` が終わってから次が呼ばれる。

| 関数                   | 振る舞い                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| `compile(event, snap)` | user の操作 1 つを physical な命令の配列に変える純関数                       |
| `dispatch(event)`      | compile して実行する。命令が 1 つ以上あれば true                             |
| `Grid`                 | react component。`doc` の `view` と局所状態を描く                            |

physical な命令は 2 種で、`['state', patch]` は局所状態 (`page, top, sel, edit, result, note`) を書き換え、`['send', op, key?]` は `send(op)` を呼ぶ (`key` があれば返り値を局所状態のその key に置く)。

| event (`type`) | field                        | 命令                                                                 |
| -------------- | ---------------------------- | -------------------------------------------------------------------- |
| `key`          | `key, shift, meta, composing` | 矢印 / Tab / Enter / F2 / Escape / Delete / 文字 / Mod+Z / Mod+Y を下の操作に読み替える |
| `wheel`        | `dy`                         | `scroll` (3 行)                                                      |
| `file`         | `name, text`                 | CSV を読み、`load`                                                   |
| `pick`         | `slot, index`                | 選択。`slot` は window の中の行位置 (-1 が列名の行)、`index` は列位置 |
| `edit`         | `text?`                      | 編集の開始                                                           |
| `type`         | `text, start, stop`          | 編集中の文字列と選択範囲                                             |
| `commit`       | `dx, dy`                     | 確定。変化があれば `cell` か `col.name` を send                      |
| `cancel`       |                              | 編集の破棄                                                           |
| `move`         | `dx, dy`                     | 選択の移動。window の端では `scroll`                                 |
| `scroll`       | `dy`                         | `top` を動かして `window` を send                                    |
| `page`         | `page`                       | page を切り替えて `window` を send                                   |
| `add`          | `kind` (`page / row / col`)  | `page.add` / `row.add` / `col.add` を send                           |
| `remove`       | `kind`                       | `page.del` / `row.del` / `col.del` を send                           |
| `resize`       | `index, width`               | `style` (`row: 0, name: 'width'`) を send。幅は 1 〜 12              |
| `fill`         | `value`                      | `style` (`name: 'fill'`) を send                                     |
| `bold`         |                              | 編集中は選択範囲、そうでなければ cell 全体の `bold` を付け外す       |
| `load`         | `name, names, rows`          | `import` を 2000 行ずつ send し、最後に `window` を send             |
| `undo` `redo` `save` `open` `sql` |           | 同名の `Op` を send                                                  |

`file` event の読み方。

| 対象     | 規則                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV      | 先頭の BOM を除く。`"` で囲まれた中の `,` と改行は値になり、`""` は `"` になる。囲みの外の CR と、空行 (全ての値が空の行) は無視する        |
| 列名     | 1 行目。制御文字と先頭の `_` を除き、前後の空白を除き、48 文字で切る。空、`rowid`、`oid`、`sqlite_` 始まりは `列 N` になる。重複は `名前 (2)` になる |
| page 名  | file 名から拡張子を除き、列名と同じ規則で直した名前。空なら `ページ`。その `doc` の `pages` に同じ名前があれば `名前 (2)` になる              |
| 命令     | 列が 1 つも無ければ何も送らない。行が 0 件でも `import` を 1 つ送る                                                                          |

## 12. アプリ (`src/server.tsx`)

| 場面               | 振る舞い                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| store の key       | image は room 名、delta は `<room 名>.<番号>`。`put` は `if-match` (tag あり) か `if-none-match: *` (tag が空) の条件付き |
| 起動               | `open` を実行し、page が 1 つも無ければ `page.add` (`ページ 1`) を実行する                                           |
| `Op` の受け取り    | HTTP POST の body を `run` に渡し、`{ value }` か `{ error }` を返す                                                 |
| save を呼ぶ時点    | doc の更新から 28.125 秒 (更新が続いても 56.25 秒) 後と、最後の接続が閉じたとき (cost.md 5 節)                       |

## 13. error の一覧

| message                               | 出る場面                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `unknown op: <type>`                  | `compile` に無い `type` を渡した                                         |
| `invalid <type>.<field>`              | field が 5 節の制約の外                                                  |
| `no such table: <名前>` など SQLite の message | 無い page、無い列、重複する名前、主キーの重複                   |
| `database or disk is full`            | `LIMIT` page を超える書き込み                                            |
| `not authorized`                      | `sql` に書き込みか `pragma` を渡した                                     |
| `disk I/O error`                      | chunk の `get` が reject した、または image の tag が変わっていた        |
| `store conflict`                      | `put` が `null` を返した                                                 |
| `store diverged`                      | reject した `put` の番号の object が、覚えている状態と違う               |
| `image changed`                       | merge の `get(0)` の tag が、覚えている tag と違う                       |
| `image corrupt` / `delta corrupt`     | object の先頭 4 byte が `SQLI` / `SQLD` でない、または delta の長さが合わない |
| `Cannot read properties of null …`    | `open` が成功していない instance に `open` 以外の `Op` を送った          |
