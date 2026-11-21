# csv-reader drop-in — fast

A faster drop-in for make.fun's own csv-reader 1.0.0, entered in [Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121): same answers on every case, less CPU time.

![Competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)
![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/andruu21/csv-fast-dropin/rank.svg)
![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/andruu21/csv-fast-dropin/reward.svg)

`solve.js` re-implements csv-reader 1.0.0's reading of `{text, header}` — one pass with
charCodeAt, fields collected as char codes (or text segments on the fast path) and joined
once — and returns csv-reader's exact `{columns, rows, errors}` under its broken-row policy.
`main.ts` answers every case from `/input/cases.json` and writes `/output/answers.json`.
