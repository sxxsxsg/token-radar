// Radar-4 prices pre-token protocols off the tokens that already trade.
//
// The board ranks every watchlist slug plus every other rankable pre-token protocol at any TVL;
// nothing is gated on the snapshot's $50M floor. A protocol is pre-token when its record carries no
// token (no market cap, no CoinGecko id, no symbol). Live-token protocols are kept apart and shown
// with the market's own values, never mixed into the ranked board.
//
// Implied value comes only from the snapshot's own figures, fitted at runtime:
//
//   comps     = traded tokens with mcap>0 and tvl>0, minus exchanges, bridges and version listings,
//               minus mcap/TVL ratios outside [1/500, 50]
//   curve     = log10(mcap) = a + b*log10(tvl), OLS over the comps
//   family    = mean log-residual of the protocol's family, shrunk n/(n+6), clamped [0.5, 2.5]
//   growth    = TVL carried two weeks at the 7d rate, clamped to +/-30%, through the slope:
//               effective TVL = tvl * (1+g)^2, then through the curve
//   seasoning = fitted slope of log-residual on log10(age in days), clamped [0.67, 1.5]
//   sibling   = a watchlist protocol sharing a traded token's first word stays at half value;
//               a non-watchlist sibling is set aside, not ranked
//   implied   = max(1, round(10^(a + b*log10(effective TVL)) * family * seasoning * sibling))
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One family's factor: how many comps support it and the factor itself. */
export interface FamilyFactor {
  n: number;
  factor: number;
}

/** Backtest results: leave-one-out, time split, factor check and band calibration. */
export interface Backtest {
  loo_n: number;
  loo_median_miss: number | null;
  loo_within_3x: number | null;
  loo_flat_median_miss: number | null;
  loo_flat_within_3x: number | null;
  train_n: number;
  test_n: number;
  ts_median_miss: number | null;
  ts_within_3x: number | null;
  ts_flat_median_miss: number | null;
  ts_flat_within_3x: number | null;
  growth_corr: number | null;
  age_corr: number | null;
  band50_coverage: number | null;
  band80_coverage: number | null;
  p10_log: number | null;
  p90_log: number | null;
}

/** Runtime fit and structural adjustments carried to the dashboard. */
export interface ModelConstants {
  a: number;
  b: number;
  r2: number;
  n_comps: number;
  median_ratio: number;
  family_factors: Record<string, FamilyFactor>;
  seasoning_slope: number;
  seasoning_mean_log_age: number;
  diagnostics: Backtest;
  growth_clamp: number;
  sibling_factor: number;
  unknown_age_days: number;
}

/** Structural assumptions only; fitModel adds every snapshot-derived coefficient. */
export const MODEL = {
  // Growth is carried two weeks at the 7d rate, clamped to +/-30%.
  growth_clamp: 30,
  // A watchlist sibling of a traded token is valued at half.
  sibling_factor: 0.5,
  // Unknown listing age is treated as one year.
  unknown_age_days: 365,
  // Family shrinkage: a family behaves as if 6 extra tokens sat exactly on the curve.
  family_shrink: 6,
  // Family factors are clamped to [0.5, 2.5]; seasoning to [0.67, 1.5].
  family_floor: 0.5,
  family_cap: 2.5,
  seasoning_floor: 0.67,
  seasoning_cap: 1.5,
  // Time-split cutoff: comps listed before 2024 train, everything else tests.
  split_cutoff: '2024-01-01',
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** Farm economics for one row, at the dashboard's default capital and share. */
export interface FarmEconomics {
  capital_usd: number;
  share: number;
  slice_usd: number;
  fees_usd: number;
  tbill_usd: number;
  net_usd: number;
  per_hour_usd: number;
  min_deposit_usd: number | null;
  net_verdict: 'farm' | 'thin' | 'skip';
  hold_days: number;
  active_minutes: number;
  sensitivity: number[][];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  p10_usd: number;
  p90_usd: number;
  model: {
    base_value_usd: number;
    family_factor: number;
    family: string;
    growth_pct: number;
    growth_multiplier: number;
    seasoning_multiplier: number;
    sibling_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_economics: FarmEconomics;
}

/** A protocol set aside from the board, with the reason it was not ranked. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  reason: string;
}

/** Dashboard row, including the exact plan and economics carried by board.json. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  p10_usd: number;
  p90_usd: number;
  base_value_usd: number;
  family_factor: number;
  growth_multiplier: number;
  seasoning_multiplier: number;
  sibling_multiplier: number;
  farm_steps: string[];
  farm_economics: FarmEconomics;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One out-of-sample point for the scatter chart: predicted vs actual market cap. */
export interface OosPoint {
  slug: string;
  name: string;
  predicted_usd: number;
  actual_usd: number;
}

/** Everything the dashboard needs: the board, the live set, the set-aside list and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  backtest: Backtest;
  watchlist_size: number;
  board_size: number;
  set_aside_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  set_aside: SetAsideRow[];
  comparables: { slug: string; name: string; category: string | null; family: string; tvl_usd: number; mcap_usd: number }[];
  family_summary: { family: string; n: number; factor: number }[];
  oos_points: OosPoint[];
  watchlist: string[];
  fee_table: Record<string, number>;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of observed values, averaging the middle pair for even-sized samples. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile by linear interpolation; null when the sample is empty. */
function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Pearson correlation, or null when either side has no variance. */
function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < xs.length; i++) {
    xy += (xs[i]! - mx) * (ys[i]! - my);
    xx += (xs[i]! - mx) ** 2;
    yy += (ys[i]! - my) ** 2;
  }
  if (xx === 0 || yy === 0) return null;
  return xy / Math.sqrt(xx * yy);
}

/** Plain centered OLS of log10 market cap on log10 TVL; no fitted constants are stored. */
function ols(points: { x: number; y: number }[]): { n: number; a: number; b: number; r2: number } {
  if (points.length < 2) throw new SnapshotError('OLS needs at least two live comparables');
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    xx += (p.x - meanX) ** 2;
    xy += (p.x - meanX) * (p.y - meanY);
    yy += (p.y - meanY) ** 2;
  }
  if (xx === 0) throw new SnapshotError('OLS needs variation in comparable TVL');
  const b = xy / xx;
  const a = meanY - b * meanX;
  const sse = points.reduce((sum, p) => sum + (a + b * p.x - p.y) ** 2, 0);
  return { n, a, b, r2: yy === 0 ? 1 : 1 - sse / yy };
}

/** The snapshot's raw categories grouped into families for the family factor. */
export function familyOf(category: string | null): string {
  const c = category ?? '';
  if (['Risk Curators', 'Yield Aggregator', 'Yield', 'Onchain Capital Allocator', 'Liquidity Manager', 'Leveraged Farming', 'Farm'].includes(c)) return 'Vaults';
  if (['Lending', 'CDP', 'CDP Manager', 'Collateral Management'].includes(c)) return 'Lending';
  if (['Dexs', 'Derivatives', 'Basis Trading', 'Options', 'Synthetics', 'Prediction Market', 'Launchpad', 'NFT Marketplace'].includes(c)) return 'Trading';
  if (['RWA', 'Token Locker', 'Anchor BTC', 'Decentralized BTC', 'Restaked BTC'].includes(c)) return 'RWA';
  if (['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool'].includes(c)) return 'Staking';
  return 'Infra';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories dropped from the comparables fit: exchanges and bridges price off other things. */
const FIT_DROP_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The comparables the curve is fitted on: traded, cleaned, never a bridge or an exchange. */
export function cleanComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
    if (p.category !== null && FIT_DROP_CATEGORIES.has(p.category)) return false;
    if (VERSIONED.test(p.name)) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return ratio >= 1 / 500 && ratio <= 50;
  });
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Log-residual of one comparable against a fitted curve: log10(actual) minus log10(predicted). */
function logResidual(p: SnapshotProtocol, a: number, b: number): number {
  return Math.log10(p.mcap_usd!) - (a + b * Math.log10(p.tvl_usd));
}

/** Mean log-residual per family, shrunk toward zero and turned into a factor. */
function familyFactors(comps: SnapshotProtocol[], a: number, b: number): Record<string, FamilyFactor> {
  const groups = new Map<string, number[]>();
  for (const p of comps) {
    const key = familyOf(p.category);
    const list = groups.get(key) ?? [];
    list.push(logResidual(p, a, b));
    groups.set(key, list);
  }
  const out: Record<string, FamilyFactor> = Object.create(null);
  for (const [family, residuals] of groups) {
    const mean = residuals.reduce((s, r) => s + r, 0) / residuals.length;
    const shrunk = mean * residuals.length / (residuals.length + MODEL.family_shrink);
    const factor = Math.min(MODEL.family_cap, Math.max(MODEL.family_floor, 10 ** shrunk));
    out[family] = { n: residuals.length, factor };
  }
  return out;
}

/** The seasoning slope: log-residual regressed on log10(age in days), centred. */
function seasoningFit(comps: SnapshotProtocol[], asOf: string, a: number, b: number): { slope: number; meanLogAge: number } {
  const points: { d: number; r: number }[] = [];
  for (const p of comps) {
    const age = ageDays(asOf, p.listed_at);
    if (age === null) continue;
    points.push({ d: Math.log10(Math.max(1, age)), r: logResidual(p, a, b) });
  }
  if (points.length < 2) return { slope: 0, meanLogAge: Math.log10(MODEL.unknown_age_days) };
  const meanLogAge = points.reduce((s, p) => s + p.d, 0) / points.length;
  let dd = 0, dr = 0;
  for (const p of points) {
    dd += (p.d - meanLogAge) ** 2;
    dr += (p.d - meanLogAge) * p.r;
  }
  return { slope: dd === 0 ? 0 : dr / dd, meanLogAge };
}

/** The full model on a set of comparables: curve, family factors and seasoning slope. */
function fitOn(comps: SnapshotProtocol[], asOf: string): { a: number; b: number; r2: number; factors: Record<string, FamilyFactor>; slope: number; meanLogAge: number } {
  const fit = ols(comps.map((p) => ({ x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd!) })));
  const factors = familyFactors(comps, fit.a, fit.b);
  const season = seasoningFit(comps, asOf, fit.a, fit.b);
  return { a: fit.a, b: fit.b, r2: fit.r2, factors, slope: season.slope, meanLogAge: season.meanLogAge };
}

/** The seasoning multiplier for an age in days under a fitted slope. */
function seasoningMult(age: number | null, slope: number, meanLogAge: number): number {
  const days = age ?? MODEL.unknown_age_days;
  const raw = 10 ** (slope * (Math.log10(Math.max(1, days)) - meanLogAge));
  return Math.min(MODEL.seasoning_cap, Math.max(MODEL.seasoning_floor, raw));
}

/** Predict a traded token's market cap with a fitted full model (growth and seasoning included). */
function predictFull(p: SnapshotProtocol, asOf: string, fit: { a: number; b: number; factors: Record<string, FamilyFactor>; slope: number; meanLogAge: number }): number {
  const g = Math.min(MODEL.growth_clamp, Math.max(-MODEL.growth_clamp, finite(p.change_7d, 0))) / 100;
  const effTvl = p.tvl_usd * (1 + g) ** 2;
  const base = effTvl > 0 ? 10 ** (fit.a + fit.b * Math.log10(effTvl)) : 0;
  const fam = fit.factors[familyOf(p.category)]?.factor ?? 1;
  return base * fam * seasoningMult(ageDays(asOf, p.listed_at), fit.slope, fit.meanLogAge);
}

/** Median miss factor and within-3x share of log10 residuals; null when empty. */
function missStats(residuals: number[]): { medianMiss: number | null; within3: number | null } {
  if (residuals.length === 0) return { medianMiss: null, within3: null };
  const abs = residuals.map(Math.abs);
  return {
    medianMiss: 10 ** median(abs),
    within3: abs.filter((r) => r <= Math.log10(3)).length / abs.length,
  };
}

/** Fit the curve, the family factors and the seasoning slope, and backtest the full model. */
export function fitModel(snapshot: Snapshot): ModelConstants {
  const comps = cleanComps(snapshot);
  const full = fitOn(comps, snapshot.as_of);
  const medianRatio = median(comps.map((p) => p.mcap_usd! / p.tvl_usd));

  // Leave-one-out: refit everything per token, predict it, compare with the flat baseline
  // (one constant multiple: the median mcap/TVL of the other tokens, times TVL).
  const looResiduals: number[] = [];
  const looFlatResiduals: number[] = [];
  const looGrowth: number[] = [];
  const looAge: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    if (rest.length < 2) continue;
    const refit = fitOn(rest, snapshot.as_of);
    const pred = predictFull(held, snapshot.as_of, refit);
    if (pred <= 0) continue;
    looResiduals.push(Math.log10(pred) - Math.log10(held.mcap_usd!));
    looFlatResiduals.push(Math.log10(median(rest.map((p) => p.mcap_usd! / p.tvl_usd)) * held.tvl_usd) - Math.log10(held.mcap_usd!));
    looGrowth.push(finite(held.change_7d, 0));
    const age = ageDays(snapshot.as_of, held.listed_at);
    looAge.push(Math.log10(Math.max(1, age ?? MODEL.unknown_age_days)));
  }
  const loo = missStats(looResiduals);
  const looFlat = missStats(looFlatResiduals);
  const growthCorr = pearson(looResiduals, looGrowth);
  const ageCorr = pearson(looResiduals, looAge);

  // Band calibration from the leave-one-out residuals.
  const p10 = quantile(looResiduals, 0.1);
  const p90 = quantile(looResiduals, 0.9);
  const q25 = quantile(looResiduals, 0.25);
  const q75 = quantile(looResiduals, 0.75);
  const band50 = q25 !== null && q75 !== null ? looResiduals.filter((r) => r >= q25 && r <= q75).length / looResiduals.length : null;
  const band80 = p10 !== null && p90 !== null ? looResiduals.filter((r) => r >= p10 && r <= p90).length / looResiduals.length : null;

  // Time split: fit before 2024, test everything else (undated included), full model vs flat.
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < MODEL.split_cutoff);
  const test = comps.filter((p) => !(p.listed_at !== null && p.listed_at < MODEL.split_cutoff));
  let tsResiduals: number[] = [];
  let tsFlatResiduals: number[] = [];
  const oos: OosPoint[] = [];
  if (train.length >= 2 && test.length > 0) {
    const trainFit = fitOn(train, snapshot.as_of);
    const flatMultiple = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    for (const p of test) {
      const pred = predictFull(p, snapshot.as_of, trainFit);
      if (pred <= 0) continue;
      tsResiduals.push(Math.log10(pred) - Math.log10(p.mcap_usd!));
      tsFlatResiduals.push(Math.log10(flatMultiple * p.tvl_usd) - Math.log10(p.mcap_usd!));
      oos.push({ slug: p.slug, name: p.name, predicted_usd: Math.round(pred), actual_usd: p.mcap_usd! });
    }
  }
  const ts = missStats(tsResiduals);
  const tsFlat = missStats(tsFlatResiduals);

  const diagnostics: Backtest = {
    loo_n: looResiduals.length,
    loo_median_miss: loo.medianMiss,
    loo_within_3x: loo.within3,
    loo_flat_median_miss: looFlat.medianMiss,
    loo_flat_within_3x: looFlat.within3,
    train_n: train.length,
    test_n: tsResiduals.length,
    ts_median_miss: ts.medianMiss,
    ts_within_3x: ts.within3,
    ts_flat_median_miss: tsFlat.medianMiss,
    ts_flat_within_3x: tsFlat.within3,
    growth_corr: growthCorr,
    age_corr: ageCorr,
    band50_coverage: band50,
    band80_coverage: band80,
    p10_log: p10,
    p90_log: p90,
  };
  return {
    a: full.a,
    b: full.b,
    r2: full.r2,
    n_comps: comps.length,
    median_ratio: medianRatio,
    family_factors: full.factors,
    seasoning_slope: full.slope,
    seasoning_mean_log_age: full.meanLogAge,
    diagnostics,
    growth_clamp: MODEL.growth_clamp,
    sibling_factor: MODEL.sibling_factor,
    unknown_age_days: MODEL.unknown_age_days,
  };
}

/** First words of traded token names: a pre-token protocol starting with one is a sibling. */
export function siblingWords(snapshot: Snapshot): Set<string> {
  const words = new Set<string>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    const first = (p.name.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (first.length >= 4) words.add(first);
  }
  return words;
}

/** Whether a pre-token protocol shares a traded token's first word. */
function isSibling(p: SnapshotProtocol, words: Set<string>): boolean {
  const first = (p.name.split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return first.length >= 4 && words.has(first);
}

/** Why a pre-token protocol is set aside instead of ranked, or null when it may rank. */
export function setAsideReason(p: SnapshotProtocol, words: Set<string>): string | null {
  if (p.category === 'CEX') return 'centralised exchange';
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge' || p.category === 'Cross Chain Bridge') return 'bridge';
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaking') return 'liquid staking or restaking';
  if (p.category === 'Anchor BTC' || p.category === 'Restaked BTC' || p.category === 'Decentralized BTC') return 'wrapped or restaked BTC';
  if (VERSIONED.test(p.name)) return 'version listing of another protocol';
  if (/wrapped/i.test(p.name)) return 'wrapped token';
  if (isSibling(p, words)) return 'sibling of a traded token';
  return null;
}

/** The snapshot-derived multipliers and implied value for one protocol under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, words: Set<string>): { implied: number; base: number; famFactor: number; family: string; growthPct: number; growthMult: number; seasonMult: number; sibMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_clamp, Math.max(-model.growth_clamp, finite(protocol.change_7d, 0)));
  const effTvl = protocol.tvl_usd * (1 + growthPct / 100) ** 2;
  const base = effTvl > 0 ? 10 ** (model.a + model.b * Math.log10(effTvl)) : 0;
  const family = familyOf(protocol.category);
  const famFactor = model.family_factors[family]?.factor ?? 1;
  const seasonMult = seasoningMult(age, model.seasoning_slope, model.seasoning_mean_log_age);
  const sibMult = isSibling(protocol, words) ? model.sibling_factor : 1;
  const growthMult = (1 + growthPct / 100) ** (2 * model.b);
  const implied = Math.max(1, Math.round(base * famFactor * seasonMult * sibMult));
  return { implied, base, famFactor, family, growthPct, growthMult, seasonMult, sibMult, age };
}

/** Typical all-in cost to open a farm position, November 2026: gas plus one bridge plus one action.
 *  These are this entry's own estimates, stated so the reader can argue with them; the cheapest of
 *  the protocol's first three chains is charged, so a multi-chain protocol is never billed Ethereum. */
export const FEE_TABLE: Record<string, number> = {
  Ethereum: 12,
  Solana: 6,
  Polygon: 7,
  Base: 5,
  Arbitrum: 5,
  Optimism: 5,
  Binance: 4,
  Avalanche: 6,
  Sui: 4,
  Tron: 5,
  Ink: 5,
  'Hyperliquid L1': 5,
};
const FEE_DEFAULT = 8;

/** The cheapest all-in fee of the protocol's first three chains. */
export function feeFor(chains: string[]): number {
  const fees = chains.slice(0, 3).map((c) => FEE_TABLE[c] ?? FEE_DEFAULT);
  return fees.length === 0 ? FEE_DEFAULT : Math.min(...fees);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): BoardRow[] {
  const words = siblingWords(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it ranks, whatever its TVL.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Everything else rankable: pre-token, not set aside, at any TVL. No floor gate.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isPreToken(p)) continue;
    if (setAsideReason(p, words) !== null) continue;
    chosen.set(p.slug, p);
  }
  const p10log = model.diagnostics.p10_log;
  const p90log = model.diagnostics.p90_log;
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, words);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const plan = farmPlan(s.p, s.age);
    const economics = farmEconomics(s.p, s.implied, plan.hold_days, plan.active_minutes);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      family: s.family,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      p10_usd: p10log === null ? s.implied : Math.max(1, Math.round(s.implied * 10 ** p10log)),
      p90_usd: p90log === null ? s.implied : Math.max(1, Math.round(s.implied * 10 ** p90log)),
      model: {
        base_value_usd: Math.round(s.base),
        family_factor: round4(s.famFactor),
        family: s.family,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        seasoning_multiplier: round4(s.seasonMult),
        sibling_multiplier: s.sibMult,
        age_days: s.age,
      },
      farm_steps: plan.steps.map(stepText),
      farm_economics: economics,
    };
  });
}

/** The time-split out-of-sample points for the scatter chart, fitted on pre-2024 comps. */
export function timeSplitPoints(snapshot: Snapshot): OosPoint[] {
  const comps = cleanComps(snapshot);
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < MODEL.split_cutoff);
  const test = comps.filter((p) => !(p.listed_at !== null && p.listed_at < MODEL.split_cutoff));
  if (train.length < 2 || test.length === 0) return [];
  const fit = fitOn(train, snapshot.as_of);
  const points: OosPoint[] = [];
  for (const p of test) {
    const pred = predictFull(p, snapshot.as_of, fit);
    if (pred > 0) points.push({ slug: p.slug, name: p.name, predicted_usd: Math.round(pred), actual_usd: p.mcap_usd! });
  }
  return points;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const suffix = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const text = `${step.text.slice(0, Math.max(0, 600 - suffix.length))}${suffix}`;
  const s = text.length < 20 ? `${text} Review the protocol's own page.` : text;
  return s;
}

/** Net farm economics for one row: slice minus fees minus the T-bill cost of holding capital. */
export function farmEconomics(p: SnapshotProtocol, implied: number, holdDays: number, activeMinutes: number, capital = 1000, share = 0.1): FarmEconomics {
  const fees = feeFor(p.chains);
  const sliceFor = (cap: number): number => cap / (p.tvl_usd + cap) * share * implied;
  const tbillFor = (cap: number): number => cap * 0.04 * holdDays / 365;
  const netFor = (cap: number): number => sliceFor(cap) - fees - tbillFor(cap);
  const slice = sliceFor(capital);
  const tbill = tbillFor(capital);
  const net = slice - fees - tbill;
  const verdict = net > 0 ? 'farm' : slice > fees ? 'thin' : 'skip';
  let minDeposit: number | null = null;
  for (const cap of [100, 250, 500, 1000, 2500, 5000, 10000]) {
    if (netFor(cap) > 0) { minDeposit = cap; break; }
  }
  // Sensitivity: net at a 5/10/20% drop in implied value, for $1K / $10K / $100K positions.
  const sensitivity = [0.05, 0.1, 0.2].map((drop) =>
    [1000, 10000, 100000].map((cap) => round2(sliceFor(cap) * (1 - drop) - fees - tbillFor(cap))),
  );
  return {
    capital_usd: capital,
    share,
    slice_usd: round2(slice),
    fees_usd: fees,
    tbill_usd: round2(tbill),
    net_usd: round2(net),
    per_hour_usd: activeMinutes > 0 ? round2(net / (activeMinutes / 60)) : 0,
    min_deposit_usd: minDeposit,
    net_verdict: verdict,
    hold_days: holdDays,
    active_minutes: activeMinutes,
    sensitivity,
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then leave the lending or collateral position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the LP position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain}, then make one destination-chain swap.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} worth of ${chain}'s staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('options')) return `Use up to $${capital} of premium to open one small ${name} options position on ${chain} and record its expiry.`;
  if (c.includes('perp') || c.includes('derivative') || c.includes('basis trading') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small, hedged position.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} on ${chain} and take one small position in an open prediction market.`;
  if (c.includes('vault') || c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain}, review its strategy, and keep the vault shares.`;
  if (c.includes('stable') || c.includes('reserve currency')) return `Mint, borrow, or deposit $${capital} of ${name}'s stable asset on ${chain} and keep the position active.`;
  if (c.includes('rwa')) return `Use $${capital} to mint or subscribe to ${name}'s yield asset on ${chain}, then retain the receipt.`;
  if (c.includes('insurance')) return `Use up to $${capital} to buy an active policy from ${name} on ${chain} and save the coverage details.`;
  if (c.includes('gaming') || c.includes('game') || c.includes('nft marketplace') || c.includes('launchpad')) return `Fund ${name} with $${capital} on ${chain}, complete one game or asset action, and retain its onchain receipt.`;
  if (c.includes('social')) return `Fund a fresh ${name} profile with $${capital} on ${chain}, publish one onchain post, and interact with another account.`;
  return `Complete one $${capital} ${p.category ?? 'protocol'} action in ${name} on ${chain} and keep its onchain receipt.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus the hold length
 * and the active minutes the plan takes. The plan is derived from the protocol's own record
 * (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; hold_days: number; active_minutes: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Create a fresh wallet for ${p.name} on ${chain}; fund it only with the $${capital} tier plus gas and keep its seed phrase offline.`,
      cost: `$${capital} of capital plus about $4 of gas`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Repeat this qualifying action for ${p.name} on ${chain} once this week: ${action}`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the ${p.name} position on ${chain} open for at least ${hold} days so activity spans more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s official points or rewards page for task status and terms; use only the link published by the protocol before claiming.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the ${p.name} wallet, ${chain}, $${capital} position, dates, and transaction hashes so you can repeat or unwind the farm.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  // Active minutes: every step except the passive hold.
  let active = 0;
  for (const s of steps) {
    if (/day/.test(s.time)) continue;
    const m = /^(\d+)/.exec(s.time);
    if (m !== null) active += Number(m[1]);
  }
  return { steps, hold_days: hold, active_minutes: active };
}

/** The live-token protocols, by market cap, for the dashboard's Token trades view: every protocol
 *  that records a token, whether or not its market cap is published. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null)
    .sort((a, b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's dashboard form, sharing authoritative farm steps and economics. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    family: row.family,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    p10_usd: row.p10_usd,
    p90_usd: row.p90_usd,
    base_value_usd: row.model.base_value_usd,
    family_factor: row.model.family_factor,
    growth_multiplier: row.model.growth_multiplier,
    seasoning_multiplier: row.model.seasoning_multiplier,
    sibling_multiplier: row.model.sibling_multiplier,
    farm_steps: row.farm_steps,
    farm_economics: row.farm_economics,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const words = siblingWords(snapshot);
  const setAside: SetAsideRow[] = snapshot.protocols
    .filter((p) => isPreToken(p) && !board.some((r) => r.slug === p.slug))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, reason: setAsideReason(p, words) ?? 'not ranked' }))
    .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const comps = cleanComps(snapshot);
  const comparables = comps.map((p) => ({ slug: p.slug, name: p.name, category: p.category, family: familyOf(p.category), tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }));
  const familySummary = Object.entries(model.family_factors)
    .map(([family, f]) => ({ family, n: f.n, factor: round4(f.factor) }))
    .sort((a, b) => a.family < b.family ? -1 : a.family > b.family ? 1 : 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    backtest: model.diagnostics,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    set_aside_size: setAside.length,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    set_aside: setAside,
    comparables,
    family_summary: familySummary,
    oos_points: timeSplitPoints(snapshot),
    watchlist: [...snapshot.watchlist],
    fee_table: { ...FEE_TABLE },
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
