# 採点表

点数は 1000 点満点の整数で、7 つの軸の和から gate の減点を引いたものである。
各軸は runner が同じ run で測った比だけから決まり、人が書いた数字や推定は点数に入らない。
軸は R2 の費用 (操作回数と byte) と SQLite の操作の速さ (page 数と frame 数) を測るためにあり、災害復旧や任意の時点への復元は測らない。
runner が製品に触れてよい面は `contract.md` に限る。

## 1. 軸と配点

| 軸   | 配点 | 測るもの                                                            | 満点の条件                                                                                                                                                                                       | 減点の式                                                                                                  |
| ---- | ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 取込 | 150  | fixtures 全件の取り込みと image の大きさ                            | 対象 class の全 fixture が取り込め、image byte ÷ CSV byte (ρ) が 1.3 以下、取り込み時間の N ÷ N/10 比が 8 以上 12 以下                                                                           | ρ が 1.3 を超えた分 0.1 ごとに 10 点減、取り込めない fixture 1 件ごとに 50 点減、時間比が外れたら 30 点減 |
| 窓   | 150  | 表示範囲 (既定 50 行) を読むときの page 数 P と返した byte          | P(N) ÷ P(N/10) が 1.1 以下、返す byte が 行 byte × 行数 × 1.5 以下                                                                                                                               | 比が 0.1 超えるごとに 15 点減、byte 超過は超過率 10% ごとに 10 点減                                       |
| 編集 | 200  | 1 操作が生む WAL frame 数                                           | 1 cell 確定 1 frame、同値再確定 0 frame、行追加 2 frame 以下、列追加と改名 1 frame、50 cell の一括確定が ceil(50 ÷ f) + 3 以下 (f は leaf 1 枚の行数)                                            | 1 cell が 2 frame なら半分、3 以上は 0。他の項目は 1 つ外れるごとに 40 点減                               |
| 保存 | 200  | R2 の操作回数と byte、開き直しの読み                                | 差分の save で送った byte ÷ (汚れた page 数 × page size) が 1.5 以下、1 save の put が 1 回、1 cell の save を 100 回続けた後の object 数が 20 以下、開き直して最初の窓を出すまでの GET が 20 回以下で byte が image の 5% 以下、開き直した image の integrity が ok で行数と全 page の checksum が最後の save と一致 | 比が 0.5 超えるごとに 20 点減、他の項目は 1 つ外れるごとに 40 点減。整合しなければ gate                    |
| 装飾 | 100  | 行削除・列削除・並べ替え後の孤児数、本文を空にした後の style の残存 | 孤児 0、style 残存、run の to が本文長以下                                                                                                                                                       | 孤児 1 件以上で gate、残存しない場合 50 点減、run 位置不正 1 件ごとに 10 点減                             |
| 同期 | 100  | yjs update の byte と tree snapshot の大きさ                        | 1 cell 編集の wire が 行 byte × 1.5 以下、窓入替の wire が 窓 JSON × 1.3 以下、tree snapshot byte が N と N/10 で比 1.1 以下、窓入替が undo stack に積まれない                                   | 各項目 25 点、外れた項目は 0                                                                              |
| 観測 | 100  | LLM に返る面の大きさ                                                | 状態 dump byte が N と N/10 で比 1.1 以下、SQL の返答が窓の行数を超えない、schema 一覧が列名と型と既定値を返す                                                                                   | 各項目 1 つ外れるごとに 35 点減                                                                           |

## 2. gate

- 対象 class (fixtures.md の 4 件) の fixture を 1 件でも取り込めない
- 復元 image が元と整合しない、孤児が 1 件以上ある
- 窓を満たすために image の 50% 以上の byte を読んだ
- 台帳の hash が最新の `src/` と一致しない
- runner が製品コードから参照されている

のいずれかで点数を 0 にする。

## 3. 測り方

| 量                  | 測り方                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAL frame 数        | 操作の前に `wal_checkpoint(TRUNCATE)` で WAL を 0 にし、操作後の `wal_checkpoint(PASSIVE)` が返す log の frame 数を読む                              |
| 汚れた page 数      | 上の frame 数そのもの                                                                                                                                |
| f (leaf 1 枚の行数) | `bytes()` の page を file format に従って読み、table b-tree の leaf の cell 数の平均を取る                                                           |
| 窓の page 数        | storage adapter を包む wrapper が数えた range GET の回数と byte。memory 上の image を読む経路では leaf 数 = ceil(行数 ÷ f) + 木の深さ − 1 を代用する |
| 送った byte         | storage adapter を数える wrapper で包み、put に渡った byte の和                                                                                      |
| R2 の操作回数       | 同じ wrapper が数えた put / list / delete (class A) と get (class B) の回数                                                                          |
| 復元の整合          | 同じ storage と prefix で開き直した db の `integrity_check`、行数、`bytes()` の全 page の checksum を、最後の save の直後の元の image と比べる          |
| 孤児                | 装飾 table の (row, col) のうち page table に存在しない位置の件数                                                                                    |
| yjs wire            | doc の update event の byte                                                                                                                          |
| tree snapshot       | 窓の key を除いた doc の encodeStateAsUpdate の byte                                                                                                 |
| 状態 dump           | LLM 向け観測 API の返答 byte                                                                                                                         |

N と N/10 の比較は同じ fixture の先頭 N/10 行だけを取り込んだ image を別に作って測る。

## 4. 台帳

`.bench/out/` に 1 run 1 file の JSON を追記する

- `at` (ISO 時刻)
- `runner_hash`
- `src_hash`
- `fixtures` (測った file 名と class)
- 各軸の原値と比
- `score`、`gates`

stop hook はこの最新 file を読む。

- 手で書いた file
- hash の欠けた file
- fixtures が対象 class を満たさない file

は無効である。

## 5. 不正の扱い

- fixture を小さくして測る、軸の一部を飛ばす
- runner の式を緩める
- 計測結果を cache して再利用する
- assertion を消して通す

のどれも点数ではなく gate に写る。
