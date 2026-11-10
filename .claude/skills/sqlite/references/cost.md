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

rowid 順に追記した table の page は確保した順に file に並ぶ (leaf が続き、溢れた時点で interior が挟まる)。`_id` の範囲読みが触れるのは root から leaf までの経路と連続する leaf で、触れる chunk 数は測っていない。並べ替えや集計は全 leaf を読むので、image の chunk 数だけ GET する。

## 4. delta を持ち越すか、image に畳むか

delta を 1 つ持ち越すと、以後の open のたびに GET が 1 回増える。image に畳む (merge) と、古い image 全体の GET 1 回と、image 全体の転送が要る。どちらを選んでも PUT は 1 回なので、比べるのは GET と転送だけである。

```
持ち越しの累計 (GET 換算)   = 1 + 2 + … + N = N(N + 1) ÷ 2        N は今ある delta の数
畳む費用 (GET 換算)         = 1 + 2 × pages ÷ SWAP                SWAP は GET 1 回と等価な page 数
```

累計が畳む費用に並んだ save で畳む。先の利用回数を知らずに決める規則としては、最良の決め方の 2 倍以内に収まる (ski rental)。

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
| 行の追加                | 末尾の leaf と page 1。分割時は interior    |
| `ADD COLUMN`            | page 1 (schema) だけ                        |
| `RENAME COLUMN`         | page 1 だけ                                 |
| `DROP COLUMN`           | その table の全 leaf                        |
| `DROP TABLE`            | page 1 と freelist                          |

`DROP COLUMN` は table を丸ごと書き直すので、直後の save は 4 節の規則で merge になりやすい。PUT は 1 回のままである。

## 8. yjs

view は問い合わせ結果を 1 行 1 key で持つ。key は `<view 名>/<連番>` で、scroll しても key は増えない (同じ連番を上書きする)。行の `_id` を key にすると、通り過ぎた行の数だけ削除済みの key が doc に残る。1 cell の編集で送られるのは、その行の key 1 つの上書きである。undo の履歴は `edit` map だけを対象にするので、窓の入れ替えは履歴に入らない。
