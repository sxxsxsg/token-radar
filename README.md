# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sxxsxsg/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar radar-3 builds a 198-row board covering all 40/40 watchlist entries, plus 158 early pre-token rows below the $50M TVL floor. It sets aside 24 live-token protocols with market caps. Every row includes a costed farm plan, and the static offline dashboard has hash-routed protocol detail views.

## Model

The fitted log-log curve is `log10(mcap_usd) = a + b * log10(tvl_usd)` over 128 live comparables: `a ≈ 3.025`, `b ≈ 0.522`, `R² ≈ 0.194`; the overall median market-cap/TVL ratio is approximately 0.214. The fit is weak, so implied values are order-of-magnitude estimates.

Multiply the curve estimate by these factors, then round to whole dollars with a $1 minimum:

- **Category:** `1 + (category_median_ratio / overall_median_ratio - 1) * n / (n + 5)`, where `n` is the category's comparable count. Clamp to [0.25, 4]; unseen categories use 1. Examples: Lending ≈ 0.714, Dexs ≈ 1.414.
- **Growth:** `1 + 0.7 * clamp(change_7d, -80, 200) / 100`, using the seven-day TVL percentage change.
- **Maturity:** `0.55 + 0.45 * sqrt(clamp(age_days, 0, 1460) / 1460)`; unknown ages use 365 days.
- **Chains:** `1 + 0.04 * min(max(chain_count - 1, 0), 4)`.

The backtest trains on 64 comparables listed before 2025-01-01 and tests on 31 listed on or after that date; undated comparables enter neither split. Out-of-sample log10 RMSE is approximately 0.977, and the median absolute error factor is approximately 3.078×.

## Net verdict

Let `effort = total_cost_usd * total_time_minutes`. A row is **farm** if `implied_value_usd >= effort`, **thin** if it reaches at least half of `effort`, otherwise **skip**. Across the 198 rows in `out/board.json`: **89 farm / 75 thin / 34 skip**. This is a value/effort heuristic.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=9wx9xbdw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
