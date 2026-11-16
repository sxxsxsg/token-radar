# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar radar-4 builds a 192-row board covering all 40/40 watchlist entries, plus 152 other rankable pre-token protocols at any TVL — there is no floor gate. Another 150 pre-token protocols are set aside with a reason each (bridges, exchanges, liquid staking, wrapped BTC, version listings, siblings of traded tokens), and all 416 token-bearing protocols are shown apart with the market's own values. Every row carries a P10–P90 range and a costed farm plan, and the static offline dashboard has hash-routed protocol detail views, live capital/share levers, and a method-and-backtest tab with two charts.

## Model

The fitted log-log curve is `log10(mcap_usd) = a + b * log10(tvl_usd)` over 101 cleaned comparables (traded tokens minus exchanges, bridges and version listings, mcap/TVL trimmed to [1/500, 50]): `a ≈ 3.115`, `b ≈ 0.502`, `R² ≈ 0.208`; the overall median market-cap/TVL ratio is approximately 0.205. The fit is weak, so implied values are order-of-magnitude estimates, and the dashboard says so.

Multiply the curve estimate by these factors, then round to whole dollars with a $1 minimum:

- **Family:** group the snapshot's categories into families (Vaults, Lending, Trading, RWA, Staking, Infra). Each family's factor is its mean log-residual against the curve, shrunk toward 1 by `n/(n+6)` and clamped to [0.5, 2.5]. Examples: Trading ≈ 1.807, RWA ≈ 1.400, Vaults ≈ 0.702, Lending ≈ 0.629, Staking ≈ 0.574, Infra ≈ 1.366.
- **Growth:** TVL is carried two weeks at the 7d rate, clamped to ±30%, then through the curve — so the growth multiplier is `(1+g)^(2b)`, not a flat add-on.
- **Seasoning:** the fitted slope of log-residual on log10(age in days) is approximately −0.207; the multiplier is clamped to [0.67, 1.5] and unknown ages use 365 days.
- **Sibling:** a watchlist protocol sharing a traded token's first word is valued at half (×0.5); a non-watchlist sibling is set aside, not ranked.

## Backtest — tested blind

- **Leave-one-out** (n = 101): the full model misses by a median factor of **3.44×** (45% within 3×); one constant multiple (median mcap/TVL × TVL) misses by **4.89×** (37% within 3×).
- **Time split** (train 35 listed before 2024-01-01, test 66 on or after, undated included): the full model misses by **3.00×** (50% within 3×); the constant multiple misses by **4.84×** (33% within 3×).
- **Factor check** on leave-one-out residuals: correlation with 7d growth ≈ 0.05, with log age ≈ −0.11 — both near zero, so growth and seasoning add little on a random holdout and most of their value shows in the forward split.
- **Band calibration:** the central 50% band covers 50% of leave-one-out predictions, the 80% band 80%. The P10–P90 bars on the board come from these bands (log10 offsets −0.88 to +0.95).

## Farm plans and net verdicts

For a $1,000 position at a 10% airdrop share: `slice = capital / (TVL + capital) × share × implied`; `net = slice − fees − T-bill` (4% a year over the hold). Fees are the cheapest all-in cost of the protocol's first three chains (Ethereum $12, Solana $6, Polygon $7, Base $5, Arbitrum $5, Optimism $5, Binance $4, Avalanche $6, Sui $4, Tron $5, Ink $5, Hyperliquid L1 $5, any other chain $8). **FARM** if net > 0, **THIN** if slice > fees, else **SKIP**. Across the 192 rows: **156 farm / 25 thin / 11 skip**. Each detail view also shows net per active hour, the smallest net-positive position on a $100–$10,000 ladder, and a 3×3 sensitivity table (net at a 5/10/20% drop in implied value for $1K/$10K/$100K positions). The dashboard's capital and share levers recompute every verdict live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9wx9xbdw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
