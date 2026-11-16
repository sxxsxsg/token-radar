(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('board');
  if (!DATA || !root) return;

  var state = { filter: '', category: 'all', family: 'all', verdict: 'all', tab: 'pre', sort: 'implied', direction: -1, slug: null, capital: 1000, share: 0.1 };
  var wholeUsd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var SVGNS = 'http://www.w3.org/2000/svg';

  function element(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (key === 'text') el.textContent = value;
      else if (key === 'className') el.className = value;
      else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== null && value !== undefined) el.setAttribute(key, String(value));
    });
    (children || []).forEach(function (child) { if (child !== null && child !== undefined) el.appendChild(child); });
    return el;
  }

  function text(tag, value, className) {
    return element(tag, { text: value, className: className });
  }

  function append(parent, children) {
    children.forEach(function (child) { if (child) parent.appendChild(child); });
    return parent;
  }

  function finite(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function compactUsd(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    var n = Math.abs(value);
    if (n >= 1000000000) return '$' + (value / 1000000000).toFixed(2) + 'B';
    if (n >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(value / 1000) + 'K';
    return '$' + wholeUsd.format(value);
  }

  function exactUsd(value) {
    return '$' + wholeUsd.format(Math.round(value));
  }

  function signedUsd(value) {
    return (value < 0 ? '−$' : '$') + wholeUsd.format(Math.round(Math.abs(value)));
  }

  function growthText(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function ageText(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'unknown age';
    if (value >= 365) return (value / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(value)) + 'd';
  }

  /** Recompute one row's implied value from its snapshot figures, exactly as lib/model.ts does. */
  function score(row) {
    var model = DATA.model;
    var change = finite(row.change_7d, 0);
    var growthPct = Math.min(model.growth_clamp, Math.max(-model.growth_clamp, change));
    var effTvl = row.tvl_usd * (1 + growthPct / 100) * (1 + growthPct / 100);
    var base = effTvl > 0 ? 10 ** (model.a + model.b * Math.log10(effTvl)) : 0;
    var fam = model.family_factors[row.family] ? model.family_factors[row.family].factor : 1;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var season = Math.min(1.5, Math.max(0.67, 10 ** (model.seasoning_slope * (Math.log10(Math.max(1, age)) - model.seasoning_mean_log_age))));
    var sib = row.sibling_multiplier;
    var implied = Math.max(1, Math.round(base * fam * season * sib));
    var growthMult = (1 + growthPct / 100) ** (2 * model.b);
    return { base: base, fam: fam, growthPct: growthPct, growthMult: growthMult, season: season, sib: sib, implied: implied };
  }

  /** Farm economics at a capital and airdrop share: slice minus fees minus the T-bill cost of holding. */
  function economics(row, capital, share) {
    var fees = row.farm_economics.fees_usd;
    var hold = row.farm_economics.hold_days;
    var slice = capital / (row.tvl_usd + capital) * share * score(row).implied;
    var tbill = capital * 0.04 * hold / 365;
    var net = slice - fees - tbill;
    var verdict = net > 0 ? 'farm' : slice > fees ? 'thin' : 'skip';
    return { slice: slice, fees: fees, tbill: tbill, net: net, verdict: verdict, hold: hold };
  }

  /** The smallest position whose net beats all costs, or null when none on the ladder does. */
  function minDeposit(row, share) {
    var fees = row.farm_economics.fees_usd;
    var hold = row.farm_economics.hold_days;
    var implied = score(row).implied;
    var ladder = [100, 250, 500, 1000, 2500, 5000, 10000];
    for (var i = 0; i < ladder.length; i++) {
      var cap = ladder[i];
      var slice = cap / (row.tvl_usd + cap) * share * implied;
      if (slice - fees - cap * 0.04 * hold / 365 > 0) return cap;
    }
    return null;
  }

  /** Net at a 5/10/20% drop in implied value, for $1K / $10K / $100K positions, at a share. */
  function sensitivity(row, share) {
    var fees = row.farm_economics.fees_usd;
    var hold = row.farm_economics.hold_days;
    var implied = score(row).implied;
    return [0.05, 0.1, 0.2].map(function (drop) {
      return [1000, 10000, 100000].map(function (cap) {
        var slice = cap / (row.tvl_usd + cap) * share * implied * (1 - drop);
        return slice - fees - cap * 0.04 * hold / 365;
      });
    });
  }

  function parseHash() {
    var hash = window.location.hash.replace(/^#/, '');
    state.slug = null;
    if (hash.indexOf('/protocol/') === 0) {
      try { state.slug = decodeURIComponent(hash.slice('/protocol/'.length)); }
      catch (_err) { state.slug = hash.slice('/protocol/'.length); }
      return;
    }
    var queryAt = hash.indexOf('?');
    var params = new URLSearchParams(queryAt >= 0 ? hash.slice(queryAt + 1) : '');
    state.filter = params.get('filter') || '';
    state.category = params.get('category') || 'all';
    state.family = params.get('family') || 'all';
    state.verdict = params.get('verdict') || 'all';
    var tab = params.get('tab');
    state.tab = tab === 'live' || tab === 'aside' || tab === 'method' ? tab : 'pre';
    state.capital = Number(params.get('capital')) || 1000;
    state.share = Number(params.get('share')) || 0.1;
  }

  function boardHash() {
    var params = new URLSearchParams();
    if (state.filter) params.set('filter', state.filter);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.family !== 'all') params.set('family', state.family);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.capital !== 1000) params.set('capital', String(state.capital));
    if (state.share !== 0.1) params.set('share', String(state.share));
    var query = params.toString();
    return query ? '#/?' + query : '';
  }

  function syncBoardHash() {
    var hash = boardHash();
    var current = window.location.hash;
    if (current === hash) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
  }

  function goTo(slug) {
    window.location.hash = '#/protocol/' + encodeURIComponent(slug);
    parseHash();
    render();
  }

  function goBack() {
    state.slug = null;
    syncBoardHash();
    render();
  }

  function header() {
    return element('header', { className: 'masthead' }, [
      element('div', { className: 'brand' }, [
        element('span', { className: 'radar-mark', 'aria-hidden': 'true' }),
        element('div', {}, [text('p', 'Token Radar', 'brand-title'), text('p', 'Independent protocol signals', 'brand-subtitle')])
      ]),
      element('div', { className: 'snapshot' }, [
        text('div', DATA.model_version.toUpperCase() + '  /  STATIC SNAPSHOT'),
        element('div', {}, [text('span', 'As of '), element('strong', { text: DATA.as_of })])
      ])
    ]);
  }

  function pageShell(content) {
    return element('div', { className: 'page' }, [header(), content]);
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    var direction = active ? (state.direction > 0 ? 'ascending' : 'descending') : 'none';
    var spoken = active ? ', ' + (state.direction > 0 ? 'ascending' : 'descending') : '';
    return element('th', { scope: 'col', 'aria-sort': direction }, [
      element('button', {
        type: 'button',
        'aria-label': 'Sort by ' + label + spoken,
        onclick: function () {
          if (state.sort === key) state.direction *= -1;
          else { state.sort = key; state.direction = key === 'rank' || key === 'name' || key === 'age' ? 1 : -1; }
          render();
        }
      }, [text('span', label), text('span', active ? (state.direction > 0 ? '  ↑' : '  ↓') : '', 'sort-mark')])
    ]);
  }

  function verdictChip(verdict) {
    return text('span', verdict.toUpperCase(), 'verdict verdict-' + verdict);
  }

  function filteredRows(list) {
    var query = state.filter.trim().toLowerCase();
    return list.filter(function (row) {
      if (state.category !== 'all' && (row.category || 'Other') !== state.category) return false;
      if (state.family !== 'all' && row.family !== state.family) return false;
      if (state.verdict !== 'all' && row.farm_economics && economics(row, state.capital, state.share).verdict !== state.verdict) return false;
      if (!query) return true;
      return [row.name, row.slug, row.category, row.family, (row.chains || []).join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
    });
  }

  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av;
      var bv;
      if (state.sort === 'rank') { av = a.rank; bv = b.rank; }
      else if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (state.sort === 'net') { av = economics(a, state.capital, state.share).net; bv = economics(b, state.capital, state.share).net; }
      else { av = score(a).implied; bv = score(b).implied; }
      if (av < bv) return -1 * state.direction;
      if (av > bv) return 1 * state.direction;
      return a.rank - b.rank;
    });
  }

  function rowElement(row, maxP90) {
    var calc = score(row);
    var econ = economics(row, state.capital, state.share);
    var tags = [];
    if (DATA.watchlist && DATA.watchlist.indexOf(row.slug) >= 0) tags.push('WATCHLIST');
    else if (row.sibling_multiplier < 1) tags.push('SIBLING ×0.5');
    var rangeLo = maxP90 > 0 ? Math.max(1, (Math.log10(row.p10_usd) - 4) / (Math.log10(maxP90) - 4) * 100) : 1;
    var rangeHi = maxP90 > 0 ? Math.min(100, (Math.log10(row.p90_usd) - 4) / (Math.log10(maxP90) - 4) * 100) : 100;
    var markAt = maxP90 > 0 ? Math.min(100, Math.max(0, (Math.log10(calc.implied) - 4) / (Math.log10(maxP90) - 4) * 100)) : 50;
    var chainNames = (row.chains || []).slice(0, 2).join(', ') || 'Chain data unavailable';
    var rowText = 'Rank ' + row.rank + ', ' + row.name + ', TVL ' + compactUsd(row.tvl_usd) + ', 7 day growth ' + growthText(row.change_7d) + ', ' + ageText(row.age_days) + ', no token, implied value ' + exactUsd(calc.implied) + ', net ' + signedUsd(econ.net) + ' at $' + state.capital + ' and ' + Math.round(state.share * 100) + '% share';
    return element('tr', {
      tabindex: '0',
      'data-openable': 'true',
      'aria-label': rowText,
      onclick: function () { goTo(row.slug); },
      onkeydown: function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goTo(row.slug); }
      }
    }, [
      element('td', { className: 'rank mono', text: String(row.rank) }),
      element('td', {}, [
        text('span', row.name, 'protocol-name'),
        text('span', (row.category || 'Other') + ' · ' + chainNames, 'protocol-meta'),
        tags.length ? element('span', { className: 'tag-row' }, tags.map(function (t) { return text('span', t, 'tag'); })) : null
      ]),
      element('td', { className: 'metric', text: compactUsd(row.tvl_usd) }),
      element('td', { className: 'metric growth', text: growthText(row.change_7d) }),
      element('td', { className: 'age', text: ageText(row.age_days) + ' · no token' }),
      element('td', { className: 'value-cell' }, [
        element('div', { className: 'range-track', 'aria-hidden': 'true' }, [
          element('span', { className: 'range-bar', style: 'left:' + rangeLo.toFixed(1) + '%;width:' + Math.max(1, rangeHi - rangeLo).toFixed(1) + '%' }),
          element('span', { className: 'range-mark', style: 'left:' + markAt.toFixed(1) + '%' })
        ]),
        text('span', compactUsd(calc.implied), 'value-label'),
        text('span', ' P10–P90 ' + compactUsd(row.p10_usd) + '–' + compactUsd(row.p90_usd), 'range-label')
      ]),
      element('td', { className: 'metric', text: compactUsd(econ.slice) }),
      element('td', {}, [verdictChip(econ.verdict), text('span', signedUsd(econ.net), 'net-value')])
    ]);
  }

  function liveRow(row) {
    return element('tr', {}, [
      element('td', {}, [text('span', row.name, 'protocol-name'), text('span', row.category || 'Other', 'protocol-meta')]),
      element('td', { className: 'protocol-meta', text: (row.chains || []).slice(0, 3).join(', ') || 'Chain data unavailable' }),
      element('td', { className: 'metric', text: compactUsd(row.tvl_usd) }),
      element('td', { className: 'metric growth', text: growthText(row.change_7d) }),
      element('td', {}, [text('span', row.mcap_usd === null ? '—' : compactUsd(row.mcap_usd), 'value-label'), text('span', 'ALREADY TRADING', 'trading-tag')])
    ]);
  }

  function asideRow(row) {
    return element('tr', {}, [
      element('td', {}, [text('span', row.name, 'protocol-name'), text('span', row.category || 'Other', 'protocol-meta')]),
      element('td', { className: 'metric', text: row.reason })
    ]);
  }

  function tableView(rows, kind) {
    var shown = kind === 'live' ? rows.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }) : kind === 'aside' ? rows.slice() : sortedRows(rows);
    var maxP90 = kind === 'pre' ? shown.reduce(function (max, row) { return Math.max(max, row.p90_usd); }, 0) : 0;
    var head;
    if (kind === 'live') head = [element('th', { scope: 'col', text: 'Protocol' }), element('th', { scope: 'col', text: 'Chains' }), element('th', { scope: 'col', text: 'TVL' }), element('th', { scope: 'col', text: '7d growth' }), element('th', { scope: 'col', text: 'Market cap · descending' })];
    else if (kind === 'aside') head = [element('th', { scope: 'col', text: 'Protocol' }), element('th', { scope: 'col', text: 'Why it is set aside' })];
    else head = [sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d growth'), sortHeader('age', 'Age / token'), sortHeader('implied', 'Implied value · P10–P90'), sortHeader('net', 'Slice · $' + state.capital), sortHeader('net', 'Net · verdict')];
    var table = element('table', {}, [
      element('caption', { text: kind === 'live' ? 'Already trading protocols, ordered by market capitalization.' : kind === 'aside' ? 'Pre-token protocols the radar does not rank, with the reason each was set aside.' : 'Pre-token protocols. Select a row to open its full model and farm plan.' }),
      element('thead', {}, [element('tr', {}, head)]),
      element('tbody', {}, shown.map(function (row) { return kind === 'live' ? liveRow(row) : kind === 'aside' ? asideRow(row) : rowElement(row, maxP90); }))
    ]);
    if (!shown.length) {
      var tbody = table.children[2];
      tbody.appendChild(element('tr', {}, [element('td', { colspan: kind === 'live' ? '5' : kind === 'aside' ? '2' : '8' }, [
        element('div', { className: 'empty' }, [text('p', 'No protocols match these filters.'), element('button', { type: 'button', className: 'action-button', 'aria-label': 'Clear filters', onclick: clearFilters }, [text('span', 'Clear filters')])])
      ])]));
    }
    return element('div', { className: 'table-scroll' }, [table]);
  }

  function clearFilters() {
    state.filter = '';
    state.category = 'all';
    state.family = 'all';
    state.verdict = 'all';
    state.tab = 'pre';
    state.sort = 'implied';
    state.direction = -1;
    syncBoardHash();
    render();
  }

  function svgEl(tag, attrs, children) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, String(attrs[key])); });
    (children || []).forEach(function (child) { if (child) el.appendChild(child); });
    return el;
  }

  function axisLabel(value) {
    if (value >= 1000000000) return '$' + (value / 1000000000) + 'B';
    if (value >= 1000000) return '$' + (value / 1000000) + 'M';
    if (value >= 1000) return '$' + (value / 1000) + 'K';
    return '$' + value;
  }

  function scatterChart(kind) {
    var W = 880, H = 300, ML = 56, MR = 16, MT = 12, MB = 32;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '300', role: 'img', 'aria-label': kind === 'curve' ? 'Scatter of traded tokens against the fitted curve, with board rows overlaid.' : 'Out-of-sample scatter of predicted against actual market cap.' });
    var points, xOf, yOf, xMin, xMax, yMin, yMax;
    if (kind === 'curve') {
      points = DATA.comparables.map(function (c) { return { x: Math.log10(c.tvl_usd), y: Math.log10(c.mcap_usd), kind: 'comp', label: c.name }; });
      xMin = Math.floor(Math.min.apply(null, points.map(function (p) { return p.x; })) - 0.3);
      xMax = Math.ceil(Math.max.apply(null, points.map(function (p) { return p.x; })) + 0.3);
      yMin = Math.floor(Math.min.apply(null, points.map(function (p) { return p.y; })) - 0.3);
      yMax = Math.ceil(Math.max.apply(null, points.map(function (p) { return p.y; })) + 0.3);
    } else {
      points = DATA.oos_points.map(function (p) { return { x: Math.log10(p.actual_usd), y: Math.log10(p.predicted_usd), kind: 'oos', label: p.name }; });
      if (!points.length) return element('p', { text: 'No out-of-sample points: the time split produced no test set.', className: 'detail-meta' });
      var all = points.map(function (p) { return p.x; }).concat(points.map(function (p) { return p.y; }));
      xMin = Math.floor(Math.min.apply(null, all) - 0.3);
      xMax = Math.ceil(Math.max.apply(null, all) + 0.3);
      yMin = xMin; yMax = xMax;
    }
    xOf = function (x) { return ML + (x - xMin) / (xMax - xMin) * (W - ML - MR); };
    yOf = function (y) { return MT + (yMax - y) / (yMax - yMin) * (H - MT - MB); };
    var grid = [];
    for (var gx = Math.ceil(xMin); gx <= xMax; gx++) {
      grid.push(svgEl('line', { x1: xOf(gx), y1: MT, x2: xOf(gx), y2: H - MB, stroke: '#2b3939', 'stroke-width': 1 }));
      grid.push(svgEl('text', { x: xOf(gx), y: H - 10, fill: '#71817f', 'font-size': 11, 'text-anchor': 'middle' }, [document.createTextNode(axisLabel(10 ** gx))]));
    }
    for (var gy = Math.ceil(yMin); gy <= yMax; gy++) {
      grid.push(svgEl('line', { x1: ML, y1: yOf(gy), x2: W - MR, y2: yOf(gy), stroke: '#2b3939', 'stroke-width': 1 }));
      grid.push(svgEl('text', { x: ML - 8, y: yOf(gy) + 4, fill: '#71817f', 'font-size': 11, 'text-anchor': 'end' }, [document.createTextNode(axisLabel(10 ** gy))]));
    }
    grid.forEach(function (g) { svg.appendChild(g); });
    if (kind === 'curve') {
      var line = '';
      for (var lx = xMin; lx <= xMax; lx += 0.1) line += (line ? ' L' : 'M') + xOf(lx).toFixed(1) + ' ' + yOf(DATA.model.a + DATA.model.b * lx).toFixed(1);
      svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: '#efbd69', 'stroke-width': 2 }));
      DATA.rows.forEach(function (row) {
        svg.appendChild(svgEl('circle', { cx: xOf(Math.log10(row.tvl_usd)), cy: yOf(Math.log10(row.implied_value_usd)), r: 2, fill: '#efbd69', opacity: 0.85 }));
      });
      points.forEach(function (p) {
        svg.appendChild(svgEl('circle', { cx: xOf(p.x), cy: yOf(p.y), r: 2.5, fill: '#60d6df', opacity: 0.75 }));
      });
    } else {
      var band = 0.4771;
      var poly = svgEl('polygon', { points: xOf(xMin) + ',' + yOf(xMin + band) + ' ' + xOf(xMax) + ',' + yOf(xMax + band) + ' ' + xOf(xMax) + ',' + yOf(xMax - band) + ' ' + xOf(xMin) + ',' + yOf(xMin - band), fill: 'rgba(96,214,223,0.08)' });
      svg.appendChild(poly);
      svg.appendChild(svgEl('line', { x1: xOf(xMin), y1: yOf(xMin), x2: xOf(xMax), y2: yOf(xMax), stroke: '#efbd69', 'stroke-width': 1.5 }));
      points.forEach(function (p) {
        svg.appendChild(svgEl('circle', { cx: xOf(p.x), cy: yOf(p.y), r: 2.5, fill: '#60d6df', opacity: 0.8 }));
      });
    }
    return svg;
  }

  function methodView() {
    var model = DATA.model;
    var d = DATA.backtest;
    function metric(value, digits) { return value === null ? 'n/a' : value.toFixed(digits === undefined ? 4 : digits); }
    function pct(value) { return value === null ? 'n/a' : Math.round(value * 100) + '%'; }
    var verdicts = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (row) { verdicts[row.farm_economics.net_verdict] += 1; });
    var feeRows = Object.keys(DATA.fee_table || {}).sort().map(function (chain) {
      return element('tr', {}, [text('td', chain), text('td', '$' + DATA.fee_table[chain], 'metric')]);
    });
    return pageShell(append(element('div', {}), [
      element('section', { className: 'page-heading' }, [
        element('div', {}, [text('p', 'METHOD AND BACKTEST', 'eyebrow'), text('h1', 'How the radar works')]),
        text('p', 'Every number on this page is fitted from the snapshot itself. Nothing is hardcoded.', 'heading-note')
      ]),
      tabsBar(),
      element('section', { className: 'detail-section', 'aria-labelledby': 'universe-title' }, [
        text('h2', 'Universe', null),
        text('p', DATA.rows.length + ' ranked rows · ' + DATA.set_aside_size + ' set aside · ' + DATA.live_size + ' already trading · watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' covered. The snapshot holds ' + (DATA.board_size + DATA.set_aside_size + DATA.live_size) + ' protocols as of ' + DATA.as_of + '; the board ranks every pre-token protocol it can score, at any TVL — there is no floor gate.', 'detail-meta')
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'curve-title' }, [
        text('h2', 'The curve', null),
        text('p', 'log10(mcap) = ' + model.a.toFixed(4) + ' + ' + model.b.toFixed(4) + ' × log10(tvl), fitted by OLS over ' + model.n_comps + ' cleaned comparables (traded tokens minus exchanges, bridges and version listings, mcap/TVL trimmed to [1/500, 50]). R² = ' + metric(d && model.r2, 4) + '; median mcap/TVL = ' + metric(model.median_ratio) + '×. The curve is weak, so implied values are order-of-magnitude estimates, not prices.', 'detail-meta'),
        scatterChart('curve'),
        text('p', 'Cyan dots are the ' + model.n_comps + ' traded comparables; amber dots are the ' + DATA.board_size + ' ranked rows at their implied values; the amber line is the fitted curve.', 'detail-meta')
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'family-title' }, [
        text('h2', 'Family factors', null),
        text('p', 'Each family’s factor is its mean log-residual against the curve, shrunk toward 1 by n/(n+6) and clamped to [0.5, 2.5]. Families with one or two comparables barely move the value.', 'detail-meta'),
        element('div', { className: 'table-scroll' }, [element('table', {}, [
          element('thead', {}, [element('tr', {}, ['Family', 'Comparables (n)', 'Factor'].map(function (label) { return element('th', { scope: 'col', text: label }); }))]),
          element('tbody', {}, DATA.family_summary.map(function (f) { return element('tr', {}, [text('td', f.family), text('td', String(f.n), 'metric'), text('td', f.factor.toFixed(4) + '×', 'metric')]); }))
        ])])
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'growth-title' }, [
        text('h2', 'Growth and seasoning', null),
        text('p', 'Growth: TVL is carried two weeks at the 7d rate, clamped to ±' + model.growth_clamp + '%, then through the curve — so a +30% week lifts the value by (1.30)^(2×' + model.b.toFixed(3) + ') ≈ ' + (1.3 ** (2 * model.b)).toFixed(2) + '×, not by a flat multiplier.', 'detail-meta'),
        text('p', 'Seasoning: the fitted slope of log-residual on log10(age in days) is ' + metric(model.seasoning_slope) + '; the multiplier is clamped to [0.67, 1.5] and unknown ages use ' + model.unknown_age_days + ' days. A watchlist protocol sharing a traded token’s first word is valued at half (×' + model.sibling_factor + '); a non-watchlist sibling is set aside.', 'detail-meta')
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'backtest-title' }, [
        text('h2', 'Backtests — tested blind', null),
        text('p', 'Leave-one-out (n = ' + d.loo_n + '): the full model misses by a median factor of ' + metric(d.loo_median_miss, 2) + '× (' + pct(d.loo_within_3x) + ' within 3×); one constant multiple (median mcap/TVL × TVL) misses by ' + metric(d.loo_flat_median_miss, 2) + '× (' + pct(d.loo_flat_within_3x) + ' within 3×).', 'detail-meta'),
        text('p', 'Time split (train ' + d.train_n + ' listed before 2024-01-01, test ' + d.test_n + ' listed on or after, undated included): the full model misses by ' + metric(d.ts_median_miss, 2) + '× (' + pct(d.ts_within_3x) + ' within 3×); the constant multiple misses by ' + metric(d.ts_flat_median_miss, 2) + '× (' + pct(d.ts_flat_within_3x) + ' within 3×).', 'detail-meta'),
        text('p', 'Factor check on leave-one-out residuals: correlation with 7d growth ' + metric(d.growth_corr, 2) + ', with log age ' + metric(d.age_corr, 2) + ' — both near zero, so growth and seasoning add little on a random holdout and most of their value shows in the forward split. Band calibration: the central 50% band covers ' + pct(d.band50_coverage) + ' of leave-one-out predictions, the 80% band ' + pct(d.band80_coverage) + '. The P10–P90 bars on the board come from these bands (log10 offsets ' + metric(d.p10_log, 2) + ' to ' + metric(d.p90_log, 2) + ').', 'detail-meta'),
        scatterChart('oos'),
        text('p', 'Out-of-sample scatter: predicted vs actual market cap for the ' + d.test_n + ' time-split test tokens. The shaded band is ±3×; the amber line is perfect prediction.', 'detail-meta')
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'farm-title' }, [
        text('h2', 'Farm plans and net verdicts', null),
        text('p', 'For a $' + state.capital + ' position at a ' + Math.round(state.share * 100) + '% airdrop share: slice = capital / (TVL + capital) × share × implied; net = slice − fees − T-bill (4% a year over the hold). FARM if net > 0, THIN if slice > fees, else SKIP. At the $1,000 / 10% defaults the board is ' + verdicts.farm + ' farm / ' + verdicts.thin + ' thin / ' + verdicts.skip + ' skip. Change the levers on the board to recompute every verdict live.', 'detail-meta'),
        element('div', { className: 'table-scroll' }, [element('table', {}, [
          element('thead', {}, [element('tr', {}, ['Chain', 'All-in fee per $1,000 position'].map(function (label) { return element('th', { scope: 'col', text: label }); }))]),
          element('tbody', {}, feeRows.concat([element('tr', {}, [text('td', 'Any other chain'), text('td', '$8', 'metric')])]))
        ])]),
        text('p', 'Fees are this entry’s own estimates of gas plus one bridge plus one action (November 2026); the cheapest of a protocol’s first three chains is charged. A fee table is a judgement call — the numbers are stated here so the reader can argue with them.', 'detail-meta')
      ]),
      element('section', { className: 'detail-section', 'aria-labelledby': 'limits-title' }, [
        text('h2', 'Limits', null),
        text('p', 'The curve explains little of the variation (R² ≈ ' + model.r2.toFixed(2) + '): implied values are order-of-magnitude. A DefiLlama record is not proof of no token — a protocol may have launched one after the snapshot, and this board cannot know. Nothing here is investment advice; farm plans describe onchain actions, not expected payouts.', 'detail-meta')
      ])
    ]));
  }

  function tabsBar() {
    function tabButton(label, tab, count) {
      return element('button', { type: 'button', role: 'tab', className: 'tab', 'aria-selected': state.tab === tab ? 'true' : 'false', 'aria-label': 'Show ' + label, onclick: function () { state.tab = tab; syncBoardHash(); render(); } }, [text('span', label), text('small', String(count))]);
    }
    return element('div', { className: 'tabs', role: 'tablist', 'aria-label': 'Protocol status' }, [
      tabButton('No token yet', 'pre', DATA.board_size),
      tabButton('Token trades', 'live', DATA.live_size),
      tabButton('Set aside', 'aside', DATA.set_aside_size),
      tabButton('Method and backtest', 'method', '—')
    ]);
  }

  function leverSelect(id, label, value, options, onchange) {
    return element('div', { className: 'field' }, [element('label', { for: id, text: label }), element('select', {
      id: id, 'aria-label': label, onchange: function (event) { onchange(event.target.value); syncBoardHash(); render(); }
    }, options.map(function (opt) { return element('option', { value: String(opt.value), text: opt.label, selected: String(value) === String(opt.value) ? 'selected' : null }); }))]);
  }

  function boardView() {
    var kind = state.tab;
    var source = kind === 'live' ? DATA.live : kind === 'aside' ? DATA.set_aside : DATA.rows;
    var rows = kind === 'aside' ? source.filter(function (row) {
      var q = state.filter.trim().toLowerCase();
      if (state.category !== 'all' && (row.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [row.name, row.slug, row.category, row.reason].join(' ').toLowerCase().indexOf(q) >= 0;
    }) : filteredRows(source);
    var categories = Array.from(new Set(source.map(function (row) { return row.category || 'Other'; }))).sort(function (a, b) { return a.localeCompare(b); });
    if (state.category !== 'all' && categories.indexOf(state.category) < 0) categories.push(state.category);
    var families = Array.from(new Set(DATA.rows.map(function (row) { return row.family; }))).sort(function (a, b) { return a.localeCompare(b); });
    var title = kind === 'live' ? 'Already trading' : kind === 'aside' ? 'Set aside' : 'Pre-token radar';
    var note = kind === 'live' ? 'Live protocols are shown by market cap and kept outside the pre-token ranking.' : kind === 'aside' ? 'Pre-token protocols the radar does not rank, with the reason each was set aside.' : 'A ranked scan of protocols with no token on record, at any TVL.';
    var heading = element('section', { className: 'page-heading' }, [
      element('div', {}, [text('p', 'EARLY ASSET FIELD', 'eyebrow'), text('h1', title)]),
      text('p', note, 'heading-note')
    ]);
    var toolbarFields = [
      element('div', { className: 'field' }, [element('label', { for: 'filter', text: 'Filter protocols' }), element('input', {
        id: 'filter', type: 'search', value: state.filter, placeholder: 'Name, slug, category, or chain', 'aria-label': 'Filter by protocol name, slug, category, or chain', autocomplete: 'off',
        oninput: function (event) { state.filter = event.target.value; syncBoardHash(); render(); }
      })]),
      element('div', { className: 'field' }, [element('label', { for: 'category', text: 'Category' }), element('select', {
        id: 'category', 'aria-label': 'Filter by category', onchange: function (event) { state.category = event.target.value; syncBoardHash(); render(); }
      }, [element('option', { value: 'all', text: 'All categories' })].concat(categories.map(function (category) { return element('option', { value: category, text: category, selected: state.category === category ? 'selected' : null }); })))])
    ];
    if (kind === 'pre') {
      toolbarFields.push(element('div', { className: 'field' }, [element('label', { for: 'family', text: 'Family' }), element('select', {
        id: 'family', 'aria-label': 'Filter by family', onchange: function (event) { state.family = event.target.value; syncBoardHash(); render(); }
      }, [element('option', { value: 'all', text: 'All families' })].concat(families.map(function (family) { return element('option', { value: family, text: family, selected: state.family === family ? 'selected' : null }); }))) ]));
      toolbarFields.push(element('div', { className: 'field' }, [element('label', { for: 'verdict', text: 'Net verdict' }), element('select', {
        id: 'verdict', 'aria-label': 'Filter by net verdict', onchange: function (event) { state.verdict = event.target.value; syncBoardHash(); render(); }
      }, [element('option', { value: 'all', text: 'All verdicts' }), element('option', { value: 'farm', text: 'FARM', selected: state.verdict === 'farm' ? 'selected' : null }), element('option', { value: 'thin', text: 'THIN', selected: state.verdict === 'thin' ? 'selected' : null }), element('option', { value: 'skip', text: 'SKIP', selected: state.verdict === 'skip' ? 'selected' : null })])]));
      toolbarFields.push(leverSelect('capital', 'Position capital', state.capital, [100, 250, 500, 1000, 2500, 5000, 10000].map(function (v) { return { value: v, label: '$' + v }; }), function (v) { state.capital = Number(v); }));
      toolbarFields.push(leverSelect('share', 'Airdrop share', state.share, [{ value: 0.01, label: '1%' }, { value: 0.05, label: '5%' }, { value: 0.1, label: '10%' }, { value: 0.2, label: '20%' }], function (v) { state.share = Number(v); }));
    }
    var toolbar = element('div', { className: 'toolbar toolbar-' + kind }, toolbarFields);
    var resultLine = element('div', { className: 'results-line' }, [
      element('strong', { text: rows.length + ' rows shown', 'aria-live': 'polite' }),
      kind === 'pre' ? element('div', { className: 'legend', 'aria-label': 'Metric colors' }, [
        element('span', {}, [element('i', {}), text('span', 'Implied value · bar is P10–P90')]),
        element('span', {}, [element('i', { className: 'cyan-dot' }), text('span', '7d growth')])
      ]) : text('span', kind === 'live' ? 'Market cap order · outside ranking' : 'Set aside · not ranked')
    ]);
    var body = element('section', { 'aria-label': title }, [tabsBar(), toolbar, resultLine, tableView(rows, kind)]);
    var callout = kind === 'live' ? element('div', { className: 'live-callout' }, [text('strong', 'Already trading'), text('span', 'These market caps are listed separately and do not enter the pre-token ranking.')]) : kind === 'aside' ? element('div', { className: 'live-callout' }, [text('strong', 'Set aside'), text('span', 'Bridges, exchanges, liquid staking, wrapped BTC, version listings and siblings of traded tokens are not ranked as launches.')]) : null;
    return pageShell(append(element('div', {}), [heading, body, callout]));
  }

  function factors(row) {
    var values = score(row);
    var labels = [
      { title: 'Curve base value', value: exactUsd(values.base), note: '10^(' + DATA.model.a.toFixed(4) + ' + ' + DATA.model.b.toFixed(4) + ' × log10(effective TVL ' + exactUsd(row.tvl_usd * (1 + values.growthPct / 100) * (1 + values.growthPct / 100)) + '))' },
      { title: 'Family factor', value: values.fam.toFixed(6) + '×', note: row.family + ' · shrunk mean log-residual; unseen family = 1' },
      { title: 'Growth multiplier', value: values.growthMult.toFixed(6) + '×', note: 'Clamped 7d growth ' + values.growthPct + '% carried two weeks through the slope' },
      { title: 'Seasoning multiplier', value: values.season.toFixed(6) + '×', note: (row.age_days === null ? DATA.model.unknown_age_days + 'd fallback' : row.age_days + 'd old') + ' · fitted slope ' + DATA.model.seasoning_slope.toFixed(4) + ' on log10(age)' },
      { title: 'Sibling multiplier', value: values.sib.toFixed(6) + '×', note: values.sib < 1 ? 'Watchlist protocol sharing a traded token’s first word' : 'Not a sibling of a traded token' },
      { title: 'Implied value', value: exactUsd(values.implied), note: 'P10–P90 ' + compactUsd(row.p10_usd) + '–' + compactUsd(row.p90_usd) }
    ];
    return { values: values, list: element('div', { className: 'factor-grid factor-grid-6' }, labels.map(function (item) {
      return element('div', { className: 'factor' }, [element('label', { text: item.title }), element('strong', { text: item.value }), element('small', { text: item.note })]);
    })) };
  }

  function farmPlan(row) {
    return element('ol', { className: 'steps' }, row.farm_steps.map(function (step, index) {
      var parts = /^(.*?) Cost:\s*(.*?)\s*Time:\s*(.*)$/.exec(step);
      return element('li', { className: 'step' }, [
        text('span', String(index + 1).padStart(2, '0'), 'step-number'),
        element('div', {}, [text('h3', 'Step ' + (index + 1)), text('p', parts ? parts[1] : step), element('div', { className: 'step-meta' }, parts ? [
          element('span', {}, [element('strong', { text: 'Cost: ' }), text('span', parts[2])]),
          element('span', {}, [element('strong', { text: 'Time: ' }), text('span', parts[3])])
        ] : [])])
      ]);
    }));
  }

  function detailView(row) {
    if (!row) return pageShell(element('section', { className: 'missing' }, [
      element('a', { href: boardHash() || '#/', className: 'back-link', onclick: function (event) { event.preventDefault(); goBack(); } }, [text('span', '← Board')]),
      text('h1', 'Protocol not found'), text('p', 'This slug is not present in the current radar snapshot.')
    ]));
    var calc = factors(row);
    var match = calc.values.implied === row.implied_value_usd;
    var econ = economics(row, state.capital, state.share);
    var minDep = minDeposit(row, state.share);
    var sens = sensitivity(row, state.share);
    var chains = (row.chains || []).map(function (chainName) { return element('li', { text: chainName }); });
    var age = ageText(row.age_days) + ' · no token';
    var back = element('a', { href: boardHash() || '#/', className: 'back-link', 'aria-label': 'Back to pre-token board', onclick: function (event) { event.preventDefault(); goBack(); } }, [text('span', '← Back to board')]);
    var heading = element('section', { className: 'detail-head' }, [
      back,
      element('div', { className: 'detail-title-line' }, [element('div', {}, [text('p', (row.category || 'Other') + ' · ' + row.family, 'eyebrow'), text('h1', row.name), text('p', row.slug, 'detail-meta')]), text('span', 'RANK ' + row.rank, 'detail-rank')]),
      element('p', { className: 'detail-meta', text: (row.chains || []).join(' · ') || 'Chain data unavailable' })
    ]);
    var summary = element('section', { className: 'detail-metrics', 'aria-label': 'Protocol metrics' }, [
      element('div', { className: 'detail-metric' }, [element('label', { text: 'Total value locked' }), element('strong', { text: exactUsd(row.tvl_usd) })]),
      element('div', { className: 'detail-metric' }, [element('label', { text: '7d growth' }), element('strong', { text: growthText(row.change_7d) })]),
      element('div', { className: 'detail-metric' }, [element('label', { text: 'Age · token status' }), element('strong', { text: age })]),
      element('div', { className: 'detail-metric value' }, [element('label', { text: 'Implied value · P10–P90' }), element('strong', { text: exactUsd(calc.values.implied) }), element('small', { text: compactUsd(row.p10_usd) + ' – ' + compactUsd(row.p90_usd) })])
    ]);
    var factorSection = element('section', { className: 'detail-section', 'aria-labelledby': 'factors-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Model factors', null), text('p', 'Calculated from this row’s snapshot values.')]),
      element('div', { id: 'factors-title' }, [calc.list]),
      element('p', { className: 'parity ' + (match ? 'match' : 'mismatch'), role: 'status', text: match ? 'Recomputed ' + exactUsd(calc.values.implied) + ' · board.json ' + exactUsd(row.implied_value_usd) + ' · MATCH' : 'DATA MISMATCH · recomputed ' + exactUsd(calc.values.implied) + ' but board.json carries ' + exactUsd(row.implied_value_usd) })
    ]);
    var peers = DATA.comparables.filter(function (c) { return c.family === row.family; }).map(function (c) {
      return { c: c, d: Math.abs(Math.log10(c.tvl_usd) - Math.log10(row.tvl_usd)) };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    var peersSection = element('section', { className: 'detail-section', 'aria-labelledby': 'peers-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Nearest trading peers', null), text('p', 'Same family (' + row.family + '), closest by TVL.')]),
      element('div', { className: 'table-scroll', id: 'peers-title' }, [element('table', {}, [
        element('thead', {}, [element('tr', {}, ['Peer', 'TVL', 'Market cap', 'mcap / TVL'].map(function (label) { return element('th', { scope: 'col', text: label }); }))]),
        element('tbody', {}, peers.map(function (p) { return element('tr', {}, [
          element('td', {}, [text('span', p.c.name, 'protocol-name'), text('span', p.c.category || 'Other', 'protocol-meta')]),
          text('td', exactUsd(p.c.tvl_usd), 'metric'), text('td', exactUsd(p.c.mcap_usd), 'metric'), text('td', (p.c.mcap_usd / p.c.tvl_usd).toFixed(4) + '×', 'metric')
        ]); }))
      ])])
    ]);
    var chainSection = element('section', { className: 'detail-section', 'aria-labelledby': 'chains-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Chain footprint', null), text('p', (row.chains || []).length + ' reported chains · fee charged on the cheapest of the first three: $' + row.farm_economics.fees_usd)]),
      element('ul', { className: 'chain-list', id: 'chains-title' }, chains.length ? chains : [element('li', { text: 'No chain data' })])
    ]);
    var sensTable = element('table', {}, [
      element('thead', {}, [element('tr', {}, [element('th', { scope: 'col', text: 'Implied −5% / −10% / −20%' }), element('th', { scope: 'col', text: '$1K' }), element('th', { scope: 'col', text: '$10K' }), element('th', { scope: 'col', text: '$100K' })])]),
      element('tbody', {}, sens.map(function (r, i) {
        return element('tr', {}, [text('td', '−' + [5, 10, 20][i] + '%'), text('td', signedUsd(r[0]), 'metric'), text('td', signedUsd(r[1]), 'metric'), text('td', signedUsd(r[2]), 'metric')]);
      }))
    ]);
    var farmSection = element('section', { className: 'detail-section', 'aria-labelledby': 'farm-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Six-step farm plan', null), text('p', 'The exact six actions recorded in board.json, with the net economics at your levers.')]),
      element('div', { className: 'farm-levers' }, [
        leverSelect('detail-capital', 'Position capital', state.capital, [100, 250, 500, 1000, 2500, 5000, 10000].map(function (v) { return { value: v, label: '$' + v }; }), function (v) { state.capital = Number(v); }),
        leverSelect('detail-share', 'Airdrop share', state.share, [{ value: 0.01, label: '1%' }, { value: 0.05, label: '5%' }, { value: 0.1, label: '10%' }, { value: 0.2, label: '20%' }], function (v) { state.share = Number(v); })
      ]),
      element('div', { className: 'farm-economics farm-economics-6' }, [
        element('div', { className: 'factor' }, [text('label', 'Slice'), text('strong', exactUsd(econ.slice)), text('small', '$' + state.capital + ' / (TVL + $' + state.capital + ') × ' + Math.round(state.share * 100) + '% × implied')]),
        element('div', { className: 'factor' }, [text('label', 'Fees'), text('strong', '$' + econ.fees), text('small', 'Cheapest of the first three chains, all-in')]),
        element('div', { className: 'factor' }, [text('label', 'T-bill cost'), text('strong', exactUsd(econ.tbill)), text('small', '4% a year over the ' + econ.hold + '-day hold')]),
        element('div', { className: 'factor' }, [text('label', 'Net'), text('strong', signedUsd(econ.net)), text('small', 'Slice − fees − T-bill')]),
        element('div', { className: 'factor' }, [text('label', 'Net per active hour'), text('strong', signedUsd(econ.net / (row.farm_economics.active_minutes / 60)) + ' / h'), text('small', row.farm_economics.active_minutes + ' active minutes in the plan')]),
        element('div', { className: 'factor' }, [text('label', 'Net verdict'), text('strong', econ.verdict.toUpperCase()), text('small', minDep === null ? 'No position on the $100–$10,000 ladder nets positive' : 'Smallest net-positive position: $' + minDep)])
      ]),
      element('div', { className: 'table-scroll sensitivity' }, [sensTable]),
      text('p', 'Sensitivity: net dollars at a 5%, 10% or 20% drop in implied value, for $1K / $10K / $100K positions at a ' + Math.round(state.share * 100) + '% share. A DefiLlama record is not proof of no token — check the protocol’s own channels before farming.', 'detail-meta'),
      element('div', { id: 'farm-title' }, [farmPlan(row)])
    ]);
    return pageShell(append(element('article', {}), [heading, summary, factorSection, peersSection, chainSection, farmSection]));
  }

  function render() {
    var focusId = document.activeElement && document.activeElement.id;
    var detail = state.slug ? DATA.rows.find(function (row) { return row.slug === state.slug; }) : null;
    root.replaceChildren(state.slug ? detailView(detail) : state.tab === 'method' ? methodView() : boardView());
    root.setAttribute('aria-busy', 'false');
    if (focusId) {
      var focusTarget = document.getElementById(focusId);
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    }
  }

  parseHash();
  render();
  window.addEventListener('hashchange', function () { parseHash(); render(); });
})();
