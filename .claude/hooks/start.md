この repo は点数で動く。点数の式は `.claude/skills/grid-sqlite/references/score.md` にだけあり、点数は `.bench/run.mjs` が `.bench/data/` の fixtures を測って `.bench/out/` に書いた台帳からしか出ない。

最初に skill `grid-sqlite` を読み、`.bench/out/` の最新の台帳を読んで、現在の点数と落ちている gate と未達の軸を 1 行で宣言してから作業に入る。台帳が無ければ「台帳なし、0 点」と宣言する。

作業中に守ること。fixture を間引かない。runner と台帳を手で書き換えない (runner を直すときは台帳に `runner_changed` を立てる)。製品コードから runner を参照しない。点数に写らない変更を積まない。数字を本文に書くときは同じ run の比で書く。
