書く前に、書こうとしている file が次のどれかに当たらないかを見る。

`src/` の下なら、page table への CREATE INDEX、操作から直接呼ぶ DROP COLUMN、table の再作成、窓の外の行を tree に set する経路、tree を書いてから SQL へ流す経路、装飾の delete を本体と別 transaction にする経路、窓のために image 全体を読む経路、runner の import、の 8 つを含まないこと。含むなら書く前に `.claude/agents/schema.md` か `.claude/agents/replica.md` の観点で代案を出す。

`.bench/run.mjs` なら、式を変える理由と変わる軸を 1 行で書き、次の run の台帳に `runner_changed: true` を立てる。

`.bench/out/` なら書かない。台帳は runner だけが書く。

`.bench/data/` なら書かない。fixtures は置くだけで、生成も縮小もしない。
