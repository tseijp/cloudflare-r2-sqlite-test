# コスト model

採点表の閾値はすべてこの model から導かれる。数値は一次資料 (file format と複製器の仕様) と手元の実測の傾きから取り、絶対値ではなく式と比で表す。

## 1. page と行

page size を S、末尾の予約を除いた usable size を U とすると、table の leaf 1 枚に行内で置ける payload の上限 X は U − 35 である。行の payload P が X を超えると、M = ((U − 12) × 32 ÷ 255) − 23 を下限に残りが overflow page (1 枚に U − 4 byte) へ出る。record は header の varint 列と serial type で決まり、NULL と整数 0 と 1 は 0 byte、小さな整数は 1 から 8 byte、REAL は常に 8 byte、TEXT は本文 L byte と header の 1 から 2 byte である。したがって短い小数は TEXT のほうが REAL より小さく、長い小数と整数は REAL と INTEGER のほうが小さい。空 cell は NULL (0 byte) が最小であり、空文字列はそれより 1 byte 大きい。

行の平均 byte を r とすると leaf 1 枚の行数 f は U ÷ (r + cell pointer 2 + header) で、手元の fixtures では数値列中心で 40 から 65、幅広 float で 27、短文 12 列で 46、長文で 5 から 7 になった。interior page の扇出は 350 から 400 なので、N が 10^6 以下で f が 5 以上なら木の深さは 3 以下に収まる。窓 w 行の読みは leaf ceil(w ÷ f) 枚と interior (深さ − 1) 枚であり、N には対数でしか依存しない。

image byte ÷ CSV byte は 0.7 から 1.3 の幅に入り、float 多列が小さく、短い小数と日付文字列が多い file が大きい。1 行 1 JSON 列は typed 横持ちの 1.3 から 3.4 倍、1 cell 1 行 (EAV) は 1.2 から 2.8 倍、page size 1024 は 4096 より 5 から 25% 大きく page 数が 4 倍になる。

## 2. WAL frame

WAL は 32 byte の header に、24 byte の frame header と page 1 枚を 1 組とする frame が続く。1 transaction が生む frame 数は汚した distinct page 数であり、leaf の分割が起きると interior が足され、schema を触ると page 1 が足される。同じ page を同じ transaction 内で何度書いても 1 frame だが、transaction を分ければその回数だけ frame になる。無変更の page は書かれないので、同じ値を再確定しても frame は 0 である。

| 操作 | frame 数 | 根拠 |
| --- | --- | --- |
| 1 cell の確定 (1 transaction) | 1 | leaf 1 枚 |
| 同値の再確定 | 0 | 無変更 page は書かれない |
| 隣接 k 行を 1 transaction で | ceil(k ÷ f) + 0 から 1 | leaf の連続 |
| 乱択 k 行を 1 transaction で | k 前後 | 行ごとに別 leaf |
| 隣接 k 行を k transaction で | k | transaction ごとに同じ page を書き直す |
| 行の追加 (index 無し) | 1 から 2 | 末尾 leaf と分割時の interior |
| 行の追加 (index 1 本) | 2 から 11 | index の leaf と分割 |
| index の作成 | file の 8 から 30% | 全行の走査と index page の生成 |
| checkpoint | 0 (image へ写すだけ) | 既定で 1000 frame 到達時に自動 |

複製は frame を単位にするので、frame 数がそのまま送る page 数である。

## 3. schema 変更の階級

| 変更 | frame | 所要時間 | 備考 |
| --- | --- | --- | --- |
| ADD COLUMN | 1 | 定数 | 既存行に触れない。PRIMARY KEY / UNIQUE 付きは不可、NOT NULL には既定値が要る |
| RENAME COLUMN | 1 | 定数 | index / trigger / view の中の名前も書き換わる |
| ALTER COLUMN SET / DROP NOT NULL | 1 | N に比例 | 3.53.0 から。既存行に NULL があれば拒否される |
| DROP COLUMN | file の全 leaf 相当 | file に比例 | 空列でも全量になり得る。index / PK / UNIQUE / CHECK / FK / generated / trigger / view が参照する列は不可 |
| 型の変更 | file の 2 倍 (VACUUM まで) | file に比例 | 文が無く 12 手順の table 再作成になる |

したがって操作のたびに走ってよいのは ADD と RENAME だけであり、DROP と型変更は snapshot (全 page を書く契機) に相乗りさせる。

## 4. 丸ごと保存と frame 単位の交点

image を丸ごと保存する 1 回のコストは file byte に比例し (VACUUM INTO の所要時間は file に比例、PUT も file byte)、frame 単位の保存は frames × (S + page header 10) × 圧縮比に比例する。丸ごとが得になるのは frames × S が file を超えるとき、つまり 1 回の保存の間に全 page を汚したときだけである。対話編集でそれは起きないので、file が数 MB を超えた時点で frame 単位が常に小さい。読みも frame 単位側は page index (1 page あたり varint 3 本、おおむね 8 byte) と窓の page だけで済み、index byte は file の 1% 未満である。

手元の fixtures はすべて image が 7MB から 58MB になるので、丸ごと保存の階級は 1 件も満たさない。丸ごと経路は空に近い file の初回保存にだけ残し、採点は frame 単位の経路で行う。

## 5. 複製器と差分 object

採用する複製器 (litestream) は WAL を一定周期 (既定 1 秒) で読み、新しい frame を 1 つの差分 object にして object storage へ送る。差分 object は 100 byte の header (magic、flags、page size、適用後の page 数、TXID の最小と最大、時刻、適用前 checksum、WAL の offset と size と salt、node id) に、page ごとの 6 byte header (page 番号と flags) と 4 byte の圧縮後 size と lz4 block が続き、6 byte の零終端、page 番号と絶対 offset と frame size の varint 3 本 × page 数と 8 byte の index size からなる page index、16 byte の trailer (適用後 checksum と file 全体の CRC-64) で終わる。file は不変であり、名前が TXID の範囲を表す。

差分 object は圧縮段階を持つ。毎 sync で L0 が生まれ、30 秒ごとに L1、5 分ごとに L2、1 時間ごとに L3 へまとめられ、上位では同じ page 番号の最新だけが残る。snapshot は 24 時間ごとの全 page であり、L0 は 5 分で消える。読み側は index だけを memory に持ち (page 番号 → object 内 offset)、page は要求時に取得して LRU (既定 10MB) に置き、1 秒ごとに新しい object を見に行く。読み側は既定で read-only で、書き込み mode は単一 writer を前提に衝突を検出だけする。1GB 境界の lock page は決して object に含めない。

これらから複製のコストは次の式になる。object 数は編集のあった秒数に比例し、総 byte は汚れた page の延べ数 × (S + 10) × lz4 比に比例し、復元の読みは snapshot + 各段階の最新 object の index と窓の page だけである。PoC では writer (WAL → 差分 object) を container の複製器に任せるか同じ format を自前で書くかを選べるが、runner が見るのは送った byte と復元の同値と index 先読みだけであり、どちらでも採点は同じである。

## 6. object storage の操作

put は object 単位で、etag 一致を条件にした put で別 writer の書き込みを検出できる。get は offset と length、または末尾からの suffix で range を取れるので、差分 object の index は末尾の 24 byte (index size 8 と trailer 16) を 1 回読んでから index 本体を 1 回読む 2 回の range で得られる。list は prefix で 1 回 1000 件までなので、object 数が list のコストになり、圧縮段階が object 数を抑える。multipart は均等な part でなければならず、未完了は 7 日で破棄される。

## 7. yjs

doc の snapshot byte は載せた JSON の byte とほぼ同じ (比 1.0) で、V2 encoding は新規 doc では差が出ない。1 行を object ごと set し直す wire は行 byte に等しく、窓 w 行の入れ替えは w × 行 byte である。上書きは tombstone として残り、全行を 100 回上書きすると V1 snapshot は 2.4 倍になるが V2 は 1.0 倍のままであり、mergeUpdates は削除済み内容を回収しないので update の和のままになる。縮めるには live な key を新しい doc に set し直す。

文字列 cell を string のまま持つと overhead は 1 割強、Y.Text は 2 割、paragraph 属性付きの XmlFragment は 1 cell あたり本文 100 byte 相当の固定 overhead を足すので短文ほど比が悪い。1 文字の挿入は Y.Text と XmlText で数十 byte、3 文字の太字化も同程度だが、string の再 set は cell 全体を送る。UndoManager は origin の集合で追跡対象を選べるので、窓の入れ替えを別 origin にすれば undo stack に積まれない。tree snapshot が N に依存しないのは、窓の key を snapshot から除く設計でだけ成立する。
