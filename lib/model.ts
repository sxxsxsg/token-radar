// Radar-3 fits live comparables from one sealed snapshot into a deterministic pre-token board.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   growthMult   = 1 + clamp(change_7d, -80, 200) / 100 x 0.7
//   maturityMult = 0.55 + 0.45 x sqrt(min(age_days ?? 365, 1460) / 1460)
//   chainsMult   = 1 + 0.04 x min(max(chains.length - 1, 0), 4)
//   base         = 10 ** (a + b * log10(tvl_usd)), with a and b fitted at runtime by OLS
//   implied      = max(1, round(base x categoryFactor x growthMult x maturityMult x chainsMult))
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

/** Runtime fit and structural adjustments carried to the dashboard. */
export interface ModelConstants {
  // Compatibility field: the observed median mcap/TVL, not a valuation coefficient.
  base_multiple: number;
  a: number;
  b: number;
  category_factors: Record<string, number>;
  diagnostics: ModelDiagnostics;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

/** Structural assumptions only; fitModel adds every snapshot-derived coefficient. */
export const MODEL = {
  // Growth response 0.7, with input clamped to [-80, 200] percent.
  growth_weight: 0.7,
  growth_floor: -80,
  growth_cap: 200,
  // Maturity floor 0.55 + range 0.45 over 1460 days; unknown age uses 365 days.
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** Board capacity: 158 highest-implied early rows plus this snapshot's 40 watchlist rows. */
export const EARLY_ROWS = 158;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** All errors are in log10 dollars; mean error is predicted minus observed. */
export interface ModelDiagnostics {
  n: number;
  a: number;
  b: number;
  r2: number;
  medianRatio: number;
  nTrain: number;
  nTest: number;
  oosRmse: number | null;
  oosMeanErr: number | null;
  medianAbsFactor: number | null;
}

export interface FarmEconomics {
  total_cost_usd: number;
  total_time_minutes: number;
  net_verdict: 'farm' | 'thin' | 'skip';
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
  model: {
    base_multiple: number;
    base_value_usd: number;
    category_factor: number;
    chains_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  farm_economics: FarmEconomics;
}

/** Dashboard row, including the exact plan and economics carried by board.json. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  base_value_usd: number;
  category_factor: number;
  chains_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  diagnostics: ModelDiagnostics;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
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

/** Plain centered OLS of log10 market cap on log10 TVL; no fitted constants are stored. */
function ols(comps: SnapshotProtocol[]): { n: number; a: number; b: number; r2: number } {
  if (comps.length < 2) throw new SnapshotError('OLS needs at least two live comparables');
  const points = comps.map((p) => ({ x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd!) }));
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

/** Fit exclusively from snapshot live comps, including CEX in the fit as specified. */
export function fitModel(snapshot: Snapshot): ModelConstants {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const fit = ols(comps);
  const medianRatio = median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  const groups = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? '';
    const ratios = groups.get(key) ?? [];
    ratios.push(p.mcap_usd! / p.tvl_usd);
    groups.set(key, ratios);
  }
  const category_factors: Record<string, number> = Object.create(null);
  for (const [key, ratios] of groups) {
    // Shrink category median / overall median toward 1 by n/(n+5), then clamp [0.25,4].
    // Shrinkage 5 and clamp bounds 0.25,4 are structural assumptions; unseen categories use 1.
    const factor = 1 + (median(ratios) / medianRatio - 1) * ratios.length / (ratios.length + 5);
    category_factors[key] = Math.min(4, Math.max(0.25, factor));
  }

  // Fixed evaluation cutoff, not an input to the full fit; undated comps enter neither split.
  const cutoff = '2025-01-01';
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
  const test = comps.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
  let residuals: number[] = [];
  // A changed snapshot may not support a split: report unavailable metrics as null, never NaN.
  if (train.length >= 2 && test.length > 0 && new Set(train.map((p) => p.tvl_usd)).size > 1) {
    const trainingFit = ols(train);
    residuals = test.map((p) => trainingFit.a + trainingFit.b * Math.log10(p.tvl_usd) - Math.log10(p.mcap_usd!));
  }
  const diagnostics: ModelDiagnostics = {
    ...fit,
    medianRatio,
    nTrain: train.length,
    nTest: test.length,
    oosRmse: residuals.length ? Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length) : null,
    oosMeanErr: residuals.length ? residuals.reduce((sum, r) => sum + r, 0) / residuals.length : null,
    medianAbsFactor: residuals.length ? 10 ** median(residuals.map(Math.abs)) : null,
  };
  return { ...MODEL, base_multiple: medianRatio, a: fit.a, b: fit.b, category_factors, diagnostics };
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot-derived multipliers and implied value for one protocol under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; base: number; catFactor: number; growthPct: number; growthMult: number; maturityMult: number; chainsMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityProgress = Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days;
  const maturityMult = model.maturity_floor + model.maturity_range * Math.sqrt(maturityProgress);
  // Each extra chain adds 0.04, capped at 4 extra chains (structural coverage adjustment).
  const chainsMult = 1 + 0.04 * Math.min(Math.max(protocol.chains.length - 1, 0), 4);
  const base = protocol.tvl_usd > 0 ? 10 ** (model.a + model.b * Math.log10(protocol.tvl_usd)) : 0;
  const catFactor = model.category_factors[protocol.category ?? ''] ?? 1;
  const implied = Math.max(1, Math.round(base * catFactor * growthMult * maturityMult * chainsMult));
  return { implied, base, catFactor, growthPct, growthMult, maturityMult, chainsMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const scores = new Map(snapshot.protocols.map((p) => [p.slug, impliedValue(p, snapshot.as_of, model)]));
  // The early radar: pre-token protocols below the watchlist floor, by implied value, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => scores.get(b.slug)!.implied - scores.get(a.slug)!.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    return { p, ...scores.get(p.slug)! };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const farm_steps = farmSteps(s.p, s.age).map(stepText);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
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
      model: {
        // Effective fitted base / TVL retained for consumers of radar-2's row field.
        base_multiple: s.p.tvl_usd > 0 ? s.base / s.p.tvl_usd : 0,
        base_value_usd: s.base,
        category_factor: s.catFactor,
        chains_multiplier: s.chainsMult,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps,
      farm_economics: farmEconomics(farm_steps, s.implied),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const suffix = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const text = `${step.text.slice(0, Math.max(0, 600 - suffix.length))}${suffix}`;
  const s = text.length < 20 ? `${text} Review the protocol's own page.` : text;
  return s;
}

/** Literal plan totals, not expected airdrop proceeds or net profit. */
export function farmEconomics(steps: string[], implied: number): FarmEconomics {
  let total_cost_usd = 0;
  let total_time_minutes = 0;
  for (const step of steps) {
    const cost = /Cost:\s*(.*?)\s*Time:/s.exec(step)?.[1] ?? '';
    for (const amount of cost.matchAll(/\$([\d,]+(?:\.\d+)?)/g)) {
      total_cost_usd += Number(amount[1]!.replaceAll(',', ''));
    }
    const time = /Time:\s*(.*)$/s.exec(step)?.[1] ?? '';
    for (const duration of time.matchAll(/(\d+(?:\.\d+)?)\s*(minutes?|hours?|days?)/g)) {
      // Unit conversions: 60 minutes/hour, 24 hours/day. Include passive hold time.
      const minutes = duration[2]!.startsWith('day') ? 24 * 60 : duration[2]!.startsWith('hour') ? 60 : 1;
      total_time_minutes += Number(duration[1]) * minutes;
    }
  }
  // Explicit triage rule using only this row: effort = summed Cost dollars * summed Time minutes.
  // farm if implied >= effort; thin if implied >= half effort; otherwise skip (structural bands 1,1/2).
  // This is a value/effort screen, not a payout estimate. Literal cost sums include reused capital
  // wherever Cost lists it; the one weekly repeat is counted once, exactly as the six-step plan says.
  const effort = total_cost_usd * total_time_minutes;
  const net_verdict = implied >= effort ? 'farm' : implied >= effort / 2 ? 'thin' : 'skip';
  return { total_cost_usd, total_time_minutes, net_verdict };
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
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
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
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
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
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    base_value_usd: row.model.base_value_usd,
    category_factor: row.model.category_factor,
    chains_multiplier: row.model.chains_multiplier,
    farm_steps: row.farm_steps,
    farm_economics: row.farm_economics,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = fitModel(snapshot)): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    diagnostics: model.diagnostics,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
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
