# コスト model

設計の分岐は全てこの model の式から出る。単価は Cloudflare の料金表の値で、変わったら 1 節の表だけを直す。

## 1. 課金の単位

| 対象                         | 単価 (100 万あたり $)        | Durable Object の秒に換算 |
| ---------------------------- | ---------------------------- | ------------------------- |
| R2 class A (put / list)      | 4.50                         | 2.8 秒                    |
| R2 class B (get / head)      | 0.36                         | 0.225 秒                  |
| R2 delete                    | 0                            | 0                         |
| R2 の転送量                  | 0                            | 0                         |
| R2 の保管 (1 GB · 月)        | 0.015 ($ / GB · 月)          | PUT 3,333 回ぶん          |
| Durable Object の稼働 1 秒   | 0.128 GB × 12.5 = 1.6        | 1 秒                      |

R2 は byte ではなく回数に課金する。1 KB の put も 30 MB の put も同じ 1 回である。byte が費用になる経路は 2 つだけで、保管の GB · 月と、転送を待つ間の Durable Object の稼働秒である。

## 2. 1 回の利用の費用

利用 1 回を「開く → 編集 → save を s 回 → 閉じる」とすると、費用は次の和になる。

```
費用 = B × (開くときの GET 数 + SQL が取り寄せた chunk 数)
     + A × (save のうち変化があった回数)
     + D × (転送と圧縮を待った秒)
     + 保管 × (image と delta の byte) × 時間
```

A の項は「変化があった save の回数」でしか減らせない。1 回の save を複数の put に分けない、変化が無ければ put しない、save の間隔を空ける、の 3 つがそのまま製品の規則になっている。

## 3. chunk

image は CHUNK 枚 (512 page = 2 MiB) ごとに独立に圧縮して並べ、先頭に各 chunk の長さの表を置く。range GET の単位は chunk である。

| image の大きさ   | 開くときの GET      | 窓 1 つを読む GET        | save                      |
| ---------------- | ------------------- | ------------------------ | ------------------------- |
| 1 chunk 以内     | 1 (全体が手に入る)  | 0                        | 毎回 image を 1 PUT       |
| 2 chunk 以上     | 1 + delta 数 + 1    | 触れた chunk のうち未取得の数 | delta を 1 PUT。溜まったら image を 1 PUT |

chunk を大きくすると GET は減り、memory は増える。memory に置く chunk は ROOM 個までで、古い順に捨てる。捨てた chunk は必要になったときに取り直す。page 層が持つ memory は「ROOM × chunk + 保存前の page + delta の page」で、最後の 2 つは次節の規則で 1 chunk ぶん未満に抑える。

rowid 順に追記した table の page は確保した順に file に並ぶ (leaf が続き、溢れた時点で interior が挟まる)。`_id` の範囲読みが触れるのは root から leaf までの経路と連続する leaf で、触れる chunk 数は測っていない。並べ替えや集計は全 leaf を読むので、image の chunk 数だけ GET する。chunk 数が ROOM を超える database では、読み終えた時点で先頭側の chunk を捨てているので、同じ走査を繰り返すたびに (chunk 数 − 1) 回 GET する。6 chunk の database で、全走査 1 回につき 5 回を観測した (`.bench/issues/006.md`)。稼働秒の単価は 128 MB ぶんで固定で、使った memory の量には依らないので、ROOM を増やしても請求は増えない。増えるのは memory の上限 (128 MB) までの距離である。

## 4. delta を持ち越すか、image に畳むか

delta を 1 つ持ち越すと、以後の open のたびに GET が 1 回増える。image に畳む (merge) と、古い image 全体の GET 1 回と、image 全体の転送が要る。どちらを選んでも PUT は 1 回なので、比べるのは GET と転送だけである。

```
持ち越しの累計 (GET 換算)   = 1 + 2 + … + N = N(N + 1) ÷ 2        N は今ある delta の数
畳む費用 (GET 換算)         = 1 + 2 × pages ÷ SWAP                SWAP は GET 1 回と等価な page 数
```

累計が畳む費用に並んだ save で畳む。先の利用回数を知らずに決める規則としては、最良の決め方の 2 倍以内に収まる (ski rental)。累計の式は、save 1 回につき open が 1 回ある利用での値である。save が続く利用と open が続く利用での比は測っていない (9 節の「最良」で測る)。

| pages             | 畳むまでの delta 数 |
| ----------------- | ------------------- |
| 600               | 2                   |
| 2,048             | 2                   |
| 8,192 (上限)      | 4                   |

加えて、delta の page と保存前の page の合計が 1 chunk ぶんに達したら畳む。これは費用ではなく memory の上限のための規則である。

SWAP = 2048 は「GET 1 回 = 0.225 秒 = 転送 8 MiB ぶん」と置いた値で、転送速度は測っていない。測ったらこの定数だけを直す。

## 5. save の間隔

Durable Object は接続がある間ずっと稼働秒を払っている。save を T 秒に 1 回行うと、put の費用は稼働の費用の 2.8 ÷ T 倍になる。

```
T = PUT ÷ (稼働 1 秒 × 許す割合)        割合 5% なら T = 56 秒
```

アプリは「最後の編集から T ÷ 2 秒、編集が続いても T 秒」で save を呼び、最後の接続が閉じたときにも呼ぶ。異常終了で失うのは最後の save 以後の編集で、最大 T 秒ぶんである。

## 6. 圧縮

gzip は保管の byte と転送の秒を減らす。回数は減らさない。圧縮比は測っていない。image を chunk ごとに圧縮するのは、range GET で 1 chunk だけ取り出せるようにするためである。gzip の末尾には CRC-32 があり、壊れた object は伸長で失敗する。

## 7. SQLite の page と行

page size を S、予約領域を除いた大きさを U とする。table の leaf に行内で置ける payload の上限は X = U − 35 で、超えた分は下限 M = ((U − 12) × 32 ÷ 255) − 23 を残して overflow page (1 枚に U − 4 byte) に出る。record は header の varint 列と値で、NULL は 0 byte、TEXT は本文 byte と header 1 〜 2 byte である。

1 transaction が書く page は「変えた行の leaf、分割が起きた interior、schema を変えたら page 1」で、同じ page は transaction の中で何度変えても 1 枚である。rollback journal の mode では、書き込み transaction のたびに page 1 の change counter が増えるので、page 1 は毎回書かれる。

| 操作                    | 書く page                                   |
| ----------------------- | ------------------------------------------- |
| cell 1 つの確定         | leaf 1 枚と page 1                          |
| 同じ本文の再確定        | 0 枚 (`WHERE … IS NOT ?` で行に触れない)    |
| 行の追加                | 末尾の leaf、`sqlite_sequence` の leaf、page 1。分割時は interior |
| `ADD COLUMN`            | page 1 (schema) だけ                        |
| `RENAME COLUMN`         | page 1 だけ                                 |
| `DROP COLUMN`           | その table の全 leaf                        |
| `DROP TABLE`            | page 1 と freelist                          |

`DROP COLUMN` は table を丸ごと書き直すので、直後の save は 4 節の規則で merge になりやすい。PUT は 1 回のままである。

## 8. yjs

view は問い合わせ結果を 1 行 1 key で持つ。key は `<view 名>/<連番>` で、scroll しても key は増えない (同じ連番を上書きする)。行の `_id` を key にすると、通り過ぎた行の数だけ削除済みの key が doc に残る。1 cell の編集で送られるのは、その行の key 1 つの上書きである。undo の履歴は `edit` map だけを対象にするので、窓の入れ替えは履歴に入らない。

## 9. 丸ごと保存、最良との比較

検証 (score.md 5 節) が scenario の費用を比べるための単位と式である。GET 1 回を 1 として数える。

```
費用 (GET 換算) = get の回数 + 12.5 × put の回数 + 転送 page ÷ SWAP
```

PUT は GET の 12.5 倍 (4.50 ÷ 0.36)、delete は 0、転送は SWAP page で GET 1 回ぶんである (4 節と同じ置き方)。稼働秒と memory は入れない。

比べる相手は 2 つある。

| 相手       | 中身                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 丸ごと保存 | 変化のある save のたびに database 全体を 1 つの object として put し、open で全体を get する方式                 |
| 最良       | 同じ scenario で、変化のある save ごとの push / merge の選び方を、後から見て合計が最も小さくなるように決めたもの |

命令 1 つの式は、命令の前の `Stat` (contract.md 6 節) から決まる。

| 命令                           | この方式の回数             | この方式の転送 page    | 丸ごと保存の回数 | 丸ごと保存の転送 page |
| ------------------------------ | -------------------------- | ---------------------- | ---------------- | --------------------- |
| `open` (`base` ≤ CHUNK)        | get 1                      | `base`                 | get 1            | `base`                |
| `open` (`base` > CHUNK)        | get 2 + `deltas`           | CHUNK + `patch`        | get 1            | `base`                |
| SQL の読み                     | memory に無い chunk ごとに get 1 | その chunk の page 数 | 0               | 0                     |
| `save` (`dirty` = 0)           | 0                          | 0                      | 0                | 0                     |
| `save` (push)                  | put 1                      | `dirty`                | put 1            | `pages`               |
| `save` (merge、`base` ≤ CHUNK) | put 1                      | `pages`                | put 1            | `pages`               |
| `save` (merge、`base` > CHUNK) | get 1、put 1               | `base` + `pages`       | put 1            | `pages`               |

| 規則         | 内容                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 観測の転送   | get で受けた byte と put で送った byte の合計 ÷ PAGE。圧縮後の値である                                                                                            |
| 式の転送     | 表の転送 page は圧縮前の値である。観測と比べるときは、この方式、丸ごと保存、最良のどれにも、その時点の store の image の圧縮比 (image の byte ÷ (`base` × PAGE)) を掛ける |
| SQL の読み   | どの chunk が memory にあるかは公開面から見えないので、式の値には観測した get をそのまま入れる。丸ごと保存では 0 である                                           |
| 最良の制約   | 製品と同じ。delta は `base` > CHUNK のときだけ、save の後の `patch + dirty` は CHUNK 未満、delta は SLOTS 個まで。SQL の読みは選び方に依らないものとして除く      |
| 4 節との関係 | 4 節の「最良の 2 倍以内」は、この最良に対する比で確かめる                                                                                                         |
| 入れないもの | memory の差 (この方式は ROOM × CHUNK + 保存前の page + delta の page、丸ごと保存は全 page) と稼働秒                                                               |
