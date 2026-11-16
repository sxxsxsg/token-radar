// Radar-4 is a deterministic, snapshot-fitted launch radar. Every coefficient is derived at runtime.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface FamilyFactor { factor: number; n: number }
export interface ComparableRow { slug: string; name: string; category: string | null; family: string; tvl_usd: number; mcap_usd: number; log_residual: number }
export interface BandOffsets { p10_log: number; p90_log: number; q25_log: number; q75_log: number }
export interface BacktestSummary {
  loo: { n: number; median_miss_factor: number | null; within_3x_pct: number | null; flat_median_miss_factor: number | null; flat_within_3x_pct: number | null };
  time_split: { train_n: number; test_n: number; median_miss_factor: number | null; within_3x_pct: number | null; flat_median_miss_factor: number | null; flat_within_3x_pct: number | null };
  factor_check: { growth_correlation: number | null; age_correlation: number | null };
  bands: { coverage_50_pct: number | null; coverage_80_pct: number | null };
}

export interface ModelDiagnostics {
  n: number; a: number; b: number; r2: number; medianRatio: number;
  nTrain: number; nTest: number; seasoningSlope: number;
  looMedianMissFactor: number | null; timeMedianMissFactor: number | null;
  oosRmse: number | null; oosMeanErr: number | null; medianAbsFactor: number | null;
}

export interface ModelConstants {
  base_multiple: number; a: number; b: number;
  category_factors: Record<string, number>;
  family_factors: Record<string, FamilyFactor>;
  seasoning_slope: number; mean_log_age: number; unknown_age_days: number;
  sibling_words: string[]; band_offsets: BandOffsets;
  diagnostics: ModelDiagnostics; backtest: BacktestSummary;
  comparables: ComparableRow[]; fee_table: Record<string, number>;
}

export const MODEL_VERSION = 'radar-4-codex';
const DAY_MS = 86_400_000;
const UNKNOWN_AGE_DAYS = 365;
const VERSIONED = /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
const PLAN_ACTIVE_MINUTES = [5, 15, 10, 0, 10, 5];

// This is a planning table, not a quote: typical gas, one bridge and one action for November 2026.
// These fixed transaction budgets are quoted for a $1,000 position, with no capital-proportional fee.
const FEE_TABLE: Record<string, number> = {
  default: 6.5,
  Ethereum: 11.2, Arbitrum: 4.8, Base: 4.6, Optimism: 4.7, Polygon: 6.8,
  BNB: 4.5, Binance: 4.5, Avalanche: 5.6, Solana: 6.4, Sui: 5.8,
  Fantom: 5.2, zkSync: 4.9, Linea: 5.1, Scroll: 5.0, Blast: 4.8,
  Mantle: 4.7, Ink: 4.6, Unichain: 4.8, Berachain: 4.9,
};

export interface FarmStep { text: string; cost: string; time: string; active_minutes: number; passive_days: number }
export interface FarmSensitivity { implied_drop_pct: number; capital_usd: number; net_usd: number }
export interface FarmEconomics {
  capital_usd: number; airdrop_share: number; slice_usd: number; fees_usd: number;
  tbill_usd: number; net_usd: number; net_verdict: 'farm' | 'thin' | 'skip';
  hold_days: number; active_minutes: number; dollars_per_active_hour: number;
  min_deposit_usd: number | null; sensitivity: FarmSensitivity[];
  total_cost_usd: number; total_time_minutes: number;
}

export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; family: string; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null; token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number; p10_usd: number; p90_usd: number; sibling_multiplier: number;
  model: { base_multiple: number; base_value_usd: number; family_factor: number; growth_pct: number;
    growth_multiplier: number; seasoning_multiplier: number; age_days: number | null;
    category_factor: number; maturity_multiplier: number; chains_multiplier: number };
  farm_steps: string[]; farm_economics: FarmEconomics;
}

export interface SetAsideRow { slug: string; name: string; category: string | null; tvl_usd: number; reason: string }
export interface RadarRow extends BoardRow {
  growth_multiplier: number; maturity_multiplier: number; base_value_usd: number;
  category_factor: number; chains_multiplier: number;
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  mcap_usd: number | null; change_7d: number | null; symbol: string | null; gecko_id: string | null;
}

export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants; model_version: string;
  diagnostics: ModelDiagnostics; backtest: BacktestSummary; watchlist: string[]; watchlist_size: number;
  board_size: number; early_size: number; live_size: number; set_aside_size: number;
  rows: RadarRow[]; live: LiveRow[]; set_aside: SetAsideRow[]; comparables: ComparableRow[];
  time_split_points: { slug: string; name: string; predicted_usd: number; actual_usd: number }[];
  fee_table: Record<string, number>;
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}
function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}
function clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)); }
function round4(x: number): number { return Math.round(x * 1e4) / 1e4; }
function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function corr(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || ys.length !== xs.length) return null;
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length, my = ys.reduce((a, y) => a + y, 0) / ys.length;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i]! - mx, dy = ys[i]! - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}

function familyForCategory(category: string | null): string {
  // Families describe the economic role of a deposit, rather than the protocol's brand.
  const groups: Record<string, string[]> = {
    Vaults: ['Risk Curators', 'Onchain Capital Allocator', 'Yield Aggregator', 'Yield', 'Farm', 'Leveraged Farming', 'Liquidity Manager', 'Indexes', 'Options Vault', 'Governance Incentives', 'CDP Manager'],
    Lending: ['Lending', 'Uncollateralized Lending', 'CDP', 'Collateral Management', 'Collateral Markets'],
    Trading: ['Dexs', 'Derivatives', 'Basis Trading', 'Synthetics', 'Options', 'Interest Rate Derivatives', 'Prediction Market', 'OTC Marketplace'],
    RWA: ['RWA', 'CeDeFi'],
    Staking: ['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool', 'Restaked BTC'],
    Infra: ['Chain', 'Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Anchor BTC', 'Decentralized BTC', 'Payments', 'Privacy', 'Token Locker', 'Insurance', 'CEX'],
    Stablecoins: ['Algo-Stables', 'Dual-Token Stablecoin', 'Stablecoin Issuer', 'Stablecoin Wrapper', 'Reserve Currency'],
    Consumer: ['Launchpad', 'NFT Marketplace', 'Crypto Card Issuer', 'Decentralized AI', 'AI Agents'],
  };
  for (const [family, categories] of Object.entries(groups)) if (categories.includes(category ?? '')) return family;
  return 'Other';
}

function firstWord(name: string): string | null {
  const word = name.trim().split(/\s+/)[0]?.replace(/[^A-Za-z]/g, '') ?? '';
  return word.length >= 4 ? word.toLowerCase() : null;
}
function tokenBearing(p: SnapshotProtocol): boolean {
  return p.symbol !== null || p.gecko_id !== null || p.mcap_usd !== null;
}
export function isPreToken(p: SnapshotProtocol): boolean { return !tokenBearing(p); }
function siblingWords(protocols: SnapshotProtocol[]): string[] {
  return [...new Set(protocols.filter(tokenBearing).map((p) => firstWord(p.name)).filter((x): x is string => x !== null))].sort();
}
function isSibling(p: SnapshotProtocol, model: ModelConstants): boolean {
  const word = firstWord(p.name);
  return word !== null && model.sibling_words.includes(word);
}

function isCleanComp(p: SnapshotProtocol): boolean {
  const category = (p.category ?? '').toLowerCase();
  if (category === 'cex' || category === 'bridge' || category === 'canonical bridge') return false;
  if (VERSIONED.test(p.name)) return false;
  if (!(p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)) return false;
  const ratio = p.mcap_usd / p.tvl_usd;
  return ratio >= 1 / 500 && ratio <= 50;
}
function cleanComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(isCleanComp);
}

interface FitCore {
  a: number; b: number; r2: number; n: number; medianRatio: number;
  family_factors: Record<string, FamilyFactor>; seasoning_slope: number; mean_log_age: number;
}
function ols(comps: SnapshotProtocol[]): { a: number; b: number; r2: number; n: number } {
  if (comps.length < 2) throw new SnapshotError('at least two cleaned live comparables are required');
  const points = comps.map((p) => ({ x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd!) }));
  const n = points.length, mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) { const dx = p.x - mx, dy = p.y - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  if (xx === 0) throw new SnapshotError('comparables have no TVL variation');
  const b = xy / xx, a = my - b * mx;
  const sse = points.reduce((s, p) => s + (a + b * p.x - p.y) ** 2, 0);
  return { a, b, r2: yy ? 1 - sse / yy : 1, n };
}

function ageFrom(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((a - b) / DAY_MS)) : null;
}
export function ageDays(asOf: string, listedAt: string | null): number | null { return ageFrom(asOf, listedAt); }

function fitCore(comps: SnapshotProtocol[], asOf: string): FitCore {
  const curve = ols(comps), residuals = comps.map((p) => Math.log10(p.mcap_usd!) - (curve.a + curve.b * Math.log10(p.tvl_usd)));
  const byFamily = new Map<string, number[]>();
  comps.forEach((p, i) => { const f = familyForCategory(p.category), xs = byFamily.get(f) ?? []; xs.push(residuals[i]!); byFamily.set(f, xs); });
  const family_factors: Record<string, FamilyFactor> = Object.create(null);
  for (const [family, xs] of byFamily) {
    const n = xs.length;
    const meanResidual = xs.reduce((sum, x) => sum + x, 0) / n;
    family_factors[family] = n < 3 ? { factor: 1, n } : { factor: clamp(10 ** (meanResidual * n / (n + 6)), 0.5, 2.5), n };
  }
  const ages = comps.map((p) => Math.log10(Math.max(1, ageFrom(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS)));
  const mean_log_age = ages.length ? ages.reduce((s, x) => s + x, 0) / ages.length : Math.log10(UNKNOWN_AGE_DAYS);
  let seasoning_slope = 0;
  if (ages.length >= 2) {
    const pairs = comps.map((p, i) => ({ age: Math.max(1, ageFrom(asOf, p.listed_at) ?? UNKNOWN_AGE_DAYS), residual: residuals[i]! }));
    const my = pairs.reduce((s, x) => s + x.residual, 0) / pairs.length;
    let xx = 0, xy = 0;
    for (const pair of pairs) { const dx = Math.log10(pair.age) - mean_log_age, dy = pair.residual - my; xx += dx * dx; xy += dx * dy; }
    seasoning_slope = xx ? xy / xx : 0;
  }
  return { ...curve, medianRatio: median(comps.map((p) => p.mcap_usd! / p.tvl_usd)), family_factors, seasoning_slope, mean_log_age };
}

function familyFactor(family: string, fit: FitCore): number {
  return fit.family_factors[family]?.factor ?? 1;
}
function seasoningMultiplier(age: number | null, fit: FitCore): number {
  const days = age ?? UNKNOWN_AGE_DAYS;
  const raw = 10 ** (fit.seasoning_slope * (Math.log10(Math.max(1, days)) - fit.mean_log_age));
  return clamp(raw, 0.67, 1.5);
}
function growthRate(p: SnapshotProtocol): number { return clamp(finite(p.change_7d, 0), -30, 30) / 100; }
function scoreLog(p: SnapshotProtocol, asOf: string, fit: FitCore): number {
  const growth = growthRate(p), effectiveTvl = Math.max(1, p.tvl_usd * (1 + growth) ** 2);
  const age = ageFrom(asOf, p.listed_at), family = familyForCategory(p.category);
  const base = fit.a + fit.b * Math.log10(effectiveTvl);
  return base + Math.log10(familyFactor(family, fit)) + Math.log10(seasoningMultiplier(age, fit));
}
function missStats(errors: number[]): { median: number | null; within: number | null } {
  return errors.length ? { median: median(errors.map((x) => 10 ** Math.abs(x))), within: 100 * errors.filter((x) => Math.abs(x) <= Math.log10(3)).length / errors.length } : { median: null, within: null };
}
function backtest(snapshot: Snapshot, comps: SnapshotProtocol[]): { summary: BacktestSummary; band: BandOffsets; timeErrors: number[]; diagnostics: { nTrain: number; nTest: number } } {
  const looErrors: number[] = [], looFlat: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!, rest = comps.filter((_, j) => j !== i);
    if (rest.length < 2) continue;
    const fitted = fitCore(rest, snapshot.as_of);
    looErrors.push(Math.log10(held.mcap_usd!) - scoreLog(held, snapshot.as_of, fitted));
    const flat = median(rest.map((p) => p.mcap_usd! / p.tvl_usd));
    looFlat.push(Math.log10(held.mcap_usd!) - Math.log10(held.tvl_usd * flat));
  }
  const cutoff = '2024-01-01';
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = comps.filter((p) => !(p.listed_at !== null && p.listed_at < cutoff));
  const timeErrors: number[] = [], timeFlat: number[] = [], growth: number[] = [], ages: number[] = [];
  if (train.length >= 2 && test.length) {
    const trainFit = fitCore(train, snapshot.as_of), flat = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    for (const p of test) {
      const observed = Math.log10(p.mcap_usd!), predicted = scoreLog(p, snapshot.as_of, trainFit);
      timeErrors.push(observed - predicted); timeFlat.push(observed - Math.log10(p.tvl_usd * flat));
      growth.push(growthRate(p)); ages.push(Math.log10(Math.max(1, ageFrom(snapshot.as_of, p.listed_at) ?? UNKNOWN_AGE_DAYS)));
    }
  }
  const loo = missStats(looErrors), looBase = missStats(looFlat), time = missStats(timeErrors), timeBase = missStats(timeFlat);
  const factorResiduals = timeErrors;
  // Held-out log(actual / predicted) errors supply asymmetric empirical prediction intervals.
  // Coverage below is calibration on that same error sample, not an additional independent test.
  const band: BandOffsets = { p10_log: quantile(looErrors, 0.1), p90_log: quantile(looErrors, 0.9), q25_log: quantile(looErrors, 0.25), q75_log: quantile(looErrors, 0.75) };
  const coverage = (lo: number, hi: number): number | null => looErrors.length ? 100 * looErrors.filter((x) => x >= lo && x <= hi).length / looErrors.length : null;
  const summary: BacktestSummary = {
    loo: { n: looErrors.length, median_miss_factor: loo.median, within_3x_pct: loo.within, flat_median_miss_factor: looBase.median, flat_within_3x_pct: looBase.within },
    time_split: { train_n: train.length, test_n: test.length, median_miss_factor: time.median, within_3x_pct: time.within, flat_median_miss_factor: timeBase.median, flat_within_3x_pct: timeBase.within },
    factor_check: { growth_correlation: corr(growth, factorResiduals), age_correlation: corr(ages, factorResiduals) },
    bands: { coverage_50_pct: coverage(band.q25_log, band.q75_log), coverage_80_pct: coverage(band.p10_log, band.p90_log) },
  };
  return { summary, band, timeErrors, diagnostics: { nTrain: train.length, nTest: test.length } };
}

export function fitModel(snapshot: Snapshot): ModelConstants {
  if (Object.values(FEE_TABLE).some((fee) => !Number.isFinite(fee) || fee < 2 || fee > 12)) throw new SnapshotError('chain fee budgets must stay within $2 to $12 per position');
  const comps = cleanComps(snapshot);
  if (comps.length < 3) throw new SnapshotError(`only ${comps.length} cleaned comparables; need at least three`);
  const core = fitCore(comps, snapshot.as_of), words = siblingWords(snapshot.protocols);
  const bt = backtest(snapshot, comps);
  const diagnostics: ModelDiagnostics = {
    n: core.n, a: core.a, b: core.b, r2: core.r2, medianRatio: core.medianRatio,
    nTrain: bt.diagnostics.nTrain, nTest: bt.diagnostics.nTest, seasoningSlope: core.seasoning_slope,
    looMedianMissFactor: bt.summary.loo.median_miss_factor, timeMedianMissFactor: bt.summary.time_split.median_miss_factor,
    oosRmse: bt.timeErrors.length ? Math.sqrt(bt.timeErrors.reduce((s, x) => s + x * x, 0) / bt.timeErrors.length) : null,
    oosMeanErr: bt.timeErrors.length ? -bt.timeErrors.reduce((s, x) => s + x, 0) / bt.timeErrors.length : null,
    medianAbsFactor: bt.summary.time_split.median_miss_factor,
  };
  const category_factors: Record<string, number> = Object.create(null);
  for (const p of comps) category_factors[p.category ?? ''] = familyFactor(familyForCategory(p.category), core);
  for (const p of snapshot.protocols) {
    const family = familyForCategory(p.category);
    core.family_factors[family] ??= { factor: 1, n: 0 };
    category_factors[p.category ?? ''] = core.family_factors[family]!.factor;
  }
  const comparables = comps.map((p) => ({ slug: p.slug, name: p.name, category: p.category, family: familyForCategory(p.category), tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, log_residual: Math.log10(p.mcap_usd!) - (core.a + core.b * Math.log10(p.tvl_usd)) })).sort((a, b) => compareText(a.slug, b.slug));
  return {
    base_multiple: core.medianRatio, a: core.a, b: core.b, category_factors, family_factors: core.family_factors,
    seasoning_slope: core.seasoning_slope, mean_log_age: core.mean_log_age, unknown_age_days: UNKNOWN_AGE_DAYS,
    sibling_words: words, band_offsets: bt.band, diagnostics, backtest: bt.summary, comparables, fee_table: { ...FEE_TABLE },
  };
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number; base: number; familyFactor: number; growthPct: number; growthMult: number;
  seasoningMult: number; siblingMult: number; age: number | null; family: string;
  catFactor: number; maturityMult: number; chainsMult: number;
} {
  const age = ageFrom(asOf, protocol.listed_at), growthPct = clamp(finite(protocol.change_7d, 0), -30, 30);
  const growth = growthPct / 100;
  const base = protocol.tvl_usd > 0 ? 10 ** (model.a + model.b * Math.log10(protocol.tvl_usd)) : 0;
  const growthMult = (1 + growth) ** (2 * model.b);
  const family = familyForCategory(protocol.category), familyFactorValue = model.family_factors[family]?.factor ?? 1;
  const ageForModel = age ?? model.unknown_age_days;
  const seasoningRaw = 10 ** (model.seasoning_slope * (Math.log10(Math.max(1, ageForModel)) - model.mean_log_age));
  const seasoningMult = clamp(seasoningRaw, 0.67, 1.5);
  const siblingMult = isPreToken(protocol) && isSibling(protocol, model) ? 0.5 : 1;
  const implied = Math.max(1, Math.round(base * growthMult * familyFactorValue * seasoningMult * siblingMult));
  return { implied, base, familyFactor: familyFactorValue, growthPct, growthMult, seasoningMult, siblingMult, age, family,
    catFactor: familyFactorValue, maturityMult: seasoningMult, chainsMult: 1 };
}

function categoryReason(p: SnapshotProtocol): string | null {
  const c = (p.category ?? '').toLowerCase(), n = p.name.toLowerCase();
  if (c === 'cex') return 'centralized exchange category';
  if (c === 'bridge' || c === 'canonical bridge' || c === 'cross chain bridge') return 'bridge infrastructure';
  if (/(liquid staking|restaking|restaked)/.test(c)) return 'liquid staking or restaking';
  if (/(restaked btc|wrapped btc)/.test(c) || /(restaked btc|wrapped btc)/.test(n)) return 'BTC wrapper or restaked BTC listing';
  if (n.includes('wrapped')) return 'name contains wrapped';
  if (VERSIONED.test(p.name)) return 'version-marked listing';
  return null;
}
function exclusionReason(p: SnapshotProtocol, model: ModelConstants): string | null {
  if (!isPreToken(p)) return 'already has a token record';
  return categoryReason(p) ?? (isSibling(p, model) ? 'shares a leading word with a traded token' : null);
}
export function isRankable(p: SnapshotProtocol, model?: ModelConstants): boolean {
  return isPreToken(p) && categoryReason(p) === null && (model === undefined || !isSibling(p, model));
}
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> { return new Map(protocols.map((p) => [p.slug, p])); }

export function stepText(step: FarmStep): string {
  const suffix = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const text = `${step.text.slice(0, Math.max(0, 600 - suffix.length))}${suffix}`;
  return text.length < 20 ? `${text} Review the protocol's published terms.` : text;
}

function chainOf(p: SnapshotProtocol): string {
  return [...p.chains.slice(0, 3)].sort((a, b) => (FEE_TABLE[a] ?? FEE_TABLE.default!) - (FEE_TABLE[b] ?? FEE_TABLE.default!) || compareText(a, b))[0] ?? 'its main chain';
}
function capitalFor(_p: SnapshotProtocol): number { return 1000; }
function holdDaysFor(age: number | null): number {
  // A newer project gets more time for an eligibility window; mature projects use a 45-day hold.
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
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
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
  ].map((step, index) => ({ ...step, active_minutes: PLAN_ACTIVE_MINUTES[index]!, passive_days: index === 3 ? hold : 0 }));
}

function feeFor(p: SnapshotProtocol, table: Record<string, number>): number {
  const fallback = table.default ?? FEE_TABLE.default!;
  const choices = p.chains.slice(0, 3).map((c) => table[c] ?? fallback);
  return Math.min(...(choices.length ? choices : [fallback]));
}
export function farmEconomics(p: SnapshotProtocol, implied: number, steps: FarmStep[], capital = 1000, share = 0.1, table = FEE_TABLE): FarmEconomics {
  if (!(capital > 0) || !Number.isFinite(capital) || !Number.isFinite(share) || share < 0 || share > 1) throw new SnapshotError('farm capital and allocation share are invalid');
  const hold = steps.reduce((sum, step) => sum + step.passive_days, 0), fees = feeFor(p, table);
  const active = steps.reduce((sum, step) => sum + step.active_minutes, 0), totalTime = active + hold * 1440;
  const sliceAt = (c: number, value: number): number => c / (p.tvl_usd + c) * share * value;
  // Gas and the budgeted bridge/action package are fixed across these deposit scenarios.
  const netAt = (c: number, value: number): number => sliceAt(c, value) - fees - c * 0.04 * hold / 365;
  const slice = sliceAt(capital, implied), tbill = capital * 0.04 * hold / 365, net = netAt(capital, implied);
  const minDeposit = [100, 250, 500, 1000, 2500, 5000, 10000].find((c) => netAt(c, implied) > 0) ?? null;
  const sensitivity: FarmSensitivity[] = [];
  for (const drop of [5, 10, 20]) for (const c of [1000, 10000, 100000]) sensitivity.push({ implied_drop_pct: drop, capital_usd: c, net_usd: round4(netAt(c, implied * (1 - drop / 100))) });
  return {
    capital_usd: capital, airdrop_share: share, slice_usd: round4(slice), fees_usd: round4(fees), tbill_usd: round4(tbill), net_usd: round4(net),
    net_verdict: net > 0 ? 'farm' : slice > fees ? 'thin' : 'skip', hold_days: hold, active_minutes: active,
    dollars_per_active_hour: active > 0 ? round4(net / (active / 60)) : 0, min_deposit_usd: minDeposit, sensitivity,
    total_cost_usd: round4(fees + tbill), total_time_minutes: totalTime,
  };
}

function makeRow(p: SnapshotProtocol, snapshot: Snapshot, model: ModelConstants, rank: number): BoardRow {
  const score = impliedValue(p, snapshot.as_of, model), plan = farmSteps(p, score.age), steps = plan.map(stepText);
  const p10 = Math.max(1, Math.round(score.implied * 10 ** model.band_offsets.p10_log));
  const p90 = Math.max(1, Math.round(score.implied * 10 ** model.band_offsets.p90_log));
  return {
    rank, slug: p.slug, name: p.name, category: p.category, family: score.family, chains: p.chains,
    tvl_usd: p.tvl_usd, change_7d: p.change_7d, mcap_usd: p.mcap_usd, listed_at: p.listed_at, gecko_id: p.gecko_id, symbol: p.symbol,
    token_status: 'pre-token', age_days: score.age, implied_value_usd: score.implied, p10_usd: p10, p90_usd: p90, sibling_multiplier: score.siblingMult,
    model: { base_multiple: p.tvl_usd > 0 ? score.base / p.tvl_usd : 0, base_value_usd: score.base, family_factor: score.familyFactor, growth_pct: score.growthPct, growth_multiplier: score.growthMult, seasoning_multiplier: score.seasoningMult, age_days: score.age,
      category_factor: score.familyFactor, maturity_multiplier: score.seasoningMult, chains_multiplier: 1 },
    farm_steps: steps, farm_economics: farmEconomics(p, score.implied, plan, 1000, 0.1, model.fee_table),
  };
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols), selected = new Map<string, SnapshotProtocol>();
  // Watchlist membership is an explicit inclusion, even when a category would otherwise be excluded.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p && !isPreToken(p)) throw new SnapshotError(`watchlist slug ${slug} already has a token record`);
    if (p) selected.set(slug, p);
  }
  if (snapshot.watchlist.some((slug) => !selected.has(slug))) throw new SnapshotError('watchlist contains a slug absent from the snapshot');
  for (const p of snapshot.protocols) if (!selected.has(p.slug) && isRankable(p, model)) selected.set(p.slug, p);
  const scored = [...selected.values()].map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.score.implied - a.score.implied || compareText(a.p.slug, b.p.slug));
  return scored.map((x, i) => makeRow(x.p, snapshot, model, i + 1));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols.filter(tokenBearing).sort((a, b) => (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) || compareText(a.slug, b.slug)).map((p) => ({
    slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd, change_7d: p.change_7d, symbol: p.symbol, gecko_id: p.gecko_id,
  }));
}
function setAsideRows(snapshot: Snapshot, model: ModelConstants): SetAsideRow[] {
  return snapshot.protocols.filter((p) => isPreToken(p) && !snapshot.watchlist.includes(p.slug) && !isRankable(p, model)).map((p) => ({
    slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p, model) ?? 'excluded by board rules',
  })).sort((a, b) => compareText(a.slug, b.slug));
}

export function radarRow(row: BoardRow): RadarRow {
  return { ...row, growth_multiplier: row.model.growth_multiplier, maturity_multiplier: row.model.seasoning_multiplier,
    base_value_usd: row.model.base_value_usd, category_factor: row.model.family_factor, chains_multiplier: 1 };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model), live = liveRows(snapshot), set_aside = setAsideRows(snapshot, model);
  const comps = cleanComps(snapshot), cutoff = '2024-01-01';
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = comps.filter((p) => !(p.listed_at !== null && p.listed_at < cutoff));
  const time_split_points = train.length >= 2 ? test.map((p) => ({
    slug: p.slug, name: p.name, predicted_usd: 10 ** scoreLog(p, snapshot.as_of, fitCore(train, snapshot.as_of)), actual_usd: p.mcap_usd!,
  })) : [];
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model, model_version: MODEL_VERSION,
    diagnostics: model.diagnostics, backtest: model.backtest, watchlist: [...snapshot.watchlist], watchlist_size: snapshot.watchlist.length,
    board_size: board.length, early_size: early, live_size: live.length, set_aside_size: set_aside.length,
    rows: board.map(radarRow), live, set_aside, comparables: model.comparables, time_split_points, fee_table: { ...model.fee_table },
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocol ${i} lacks slug, name or TVL`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null, gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug)), missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const row = board[i]!;
    if (row.rank !== i + 1) return `rank ${i + 1} is ${row.rank}`;
    if (i && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} is out of order`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has invalid implied value`;
    if (row.farm_steps.length !== 6) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    if (row.farm_steps.some((x) => x.length < 20 || x.length > 600)) return `${row.slug} has an invalid farm step length`;
  }
  return null;
}

export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
