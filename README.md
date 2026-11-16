# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar radar-4-codex ranks every rankable pre-token protocol at any TVL: a **195-row board** covering all 40/40 watchlist entries, plus **147 set-aside rows** (each with a stated reason) and **416 live-token rows**, all from the 2026-11-14 snapshot. Every board row carries a netted farm plan, and the static offline dashboard has four tabs, live capital/share levers, P10–P90 range bars, and hash-routed detail views with a recompute check.

## Model

The fitted log-log curve is `log10(mcap_usd) = a + b * log10(tvl_usd)` over **101 cleaned live comparables** (CEX, bridges and version-marked listings dropped; mcap/TVL trimmed to [1/500, 50]): `a ≈ 3.115`, `b ≈ 0.502`, `R² ≈ 0.208`. The fit is weak, so implied values are order-of-magnitude estimates, not prices.

Multiply the curve estimate by these factors, then round to whole dollars with a $1 minimum:

- **Family:** raw categories are grouped into families by economic role. Each family's factor is the mean log-residual of its comparables against the curve, shrunk `n / (n + 6)` and clamped to [0.5, 2.5]. A family with fewer than 3 comparables gets exactly 1.0 — no factor from a single token. Fitted factors: Trading ≈ 1.777 (21), Infra ≈ 1.731 (12), Consumer ≈ 1.454 (5), RWA ≈ 1.221 (9), Vaults ≈ 0.736 (20), Lending ≈ 0.629 (18), Staking ≈ 0.574 (14), Stablecoins 1.0 (1), Other 1.0 (1).
- **Growth:** TVL carried two weeks at the 7d rate, clamped to ±30%, then through the slope: the multiplier is `(1 + g) ^ (2 * b)`.
- **Seasoning:** the slope is fitted on the comparables (log-residual against log10 age in days, centred): ≈ −0.026 per log10 day — older comparables sit slightly below the curve, so the data, not a prior, sets the sign. The multiplier is clamped to [0.67, 1.5]; unknown ages use 365 days.
- **Sibling:** a pre-token protocol sharing a leading word with a traded token's name is a sibling. Watchlist siblings stay on the board at ×0.5; other siblings are set aside with that reason.

Watchlist membership is an explicit inclusion: a watchlist slug stays on the board even when its category would otherwise exclude it.

## Backtest

Computed at runtime from the same 101 comparables; the full model (curve + family + seasoning) is refit for every test, never just the curve:

| Test | Model median miss | Flat baseline (median mcap/TVL) | Within 3× |
|---|---:|---:|---:|
| Leave-one-out (n=101) | **3.52×** | 4.89× | 47.5% vs 36.6% flat |
| Time split (train 35 listed before 2024, test 66) | **3.01×** | 4.85× | 50.0% vs 33.3% flat |

Factor check on blind residuals: growth correlation ≈ −0.045, age correlation ≈ −0.161 — both adjustments add little signal, and they stay small. Band calibration from the leave-one-out errors: the 50% band covers 50.5%, the 80% band 80.2%; the per-row P10–P90 bars use log offsets −0.900 / +0.963. Out-of-sample log10 RMSE on the time split is ≈ 0.816.

## Farm economics

For a position of capital `C` at airdrop share `s` (defaults $1,000 and 10%): `slice = C / (TVL + C) * s * implied`; `fees` from a per-chain table (typical gas plus one bridge plus one action, November 2026; Ethereum $11.20, default $6.50, cheapest of the protocol's first three chains); `T-bill = C * 4% * hold / 365` with a 90/60/45-day hold by age; `net = slice − fees − T-bill`. A row is **FARM** if net > 0, **THIN** if slice > fees, otherwise **SKIP**. Across the 195 rows: **154 farm / 28 thin / 13 skip**. Each row also shows dollars per active hour, the smallest deposit with a positive net, and a 3×3 sensitivity table (net at a 5%/10%/20% implied-value drop × $1K/$10K/$100K). The dashboard's capital and share levers recompute every slice, net and verdict live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

The build is deterministic (two runs are byte-identical) and uses only the Node standard library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9wx9xbdw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
