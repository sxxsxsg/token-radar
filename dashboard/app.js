(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('board');
  if (!DATA || !root) return;

  var state = { filter: '', category: 'all', tab: 'pre', sort: 'implied', direction: -1, slug: null };
  var wholeUsd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var modelFormula = 'implied = max(1, round(curve_base × category_factor × growth × maturity × chains))';

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

  function growthText(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function ageText(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'unknown age';
    if (value >= 365) return (value / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(value)) + 'd';
  }

  function score(row) {
    var model = DATA.model;
    var change = typeof row.change_7d === 'number' && Number.isFinite(row.change_7d) ? row.change_7d : 0;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    var growthMultiplier = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturityMultiplier = model.maturity_floor + model.maturity_range * Math.sqrt(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days);
    var chains = Array.isArray(row.chains) ? row.chains.length : 0;
    var chainMultiplier = 1 + 0.04 * Math.min(Math.max(chains - 1, 0), 4);
    var base = row.tvl_usd > 0 ? 10 ** (model.a + model.b * Math.log10(row.tvl_usd)) : 0;
    var category = row.category === null || row.category === undefined ? '' : row.category;
    var categoryFactor = Object.prototype.hasOwnProperty.call(model.category_factors, category) ? model.category_factors[category] : 1;
    var implied = Math.max(1, Math.round(base * categoryFactor * growthMultiplier * maturityMultiplier * chainMultiplier));
    return { base: base, category: categoryFactor, growthPct: growth, growth: growthMultiplier, maturity: maturityMultiplier, chains: chainMultiplier, implied: implied };
  }

  function netVerdict(row) {
    var effort = row.farm_economics.total_cost_usd * row.farm_economics.total_time_minutes;
    var implied = score(row).implied;
    return implied >= effort ? 'farm' : implied >= effort / 2 ? 'thin' : 'skip';
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
    state.tab = params.get('tab') === 'live' ? 'live' : 'pre';
  }

  function boardHash() {
    var params = new URLSearchParams();
    if (state.filter) params.set('filter', state.filter);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab === 'live') params.set('tab', 'live');
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

  function filteredRows(list) {
    var query = state.filter.trim().toLowerCase();
    return list.filter(function (row) {
      if (state.category !== 'all' && (row.category || 'Other') !== state.category) return false;
      if (!query) return true;
      return [row.name, row.slug, row.category, (row.chains || []).join(' ')].join(' ').toLowerCase().indexOf(query) >= 0;
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
      else { av = score(a).implied; bv = score(b).implied; }
      if (av < bv) return -1 * state.direction;
      if (av > bv) return 1 * state.direction;
      return a.rank - b.rank;
    });
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

  function rowElement(row, maxValue) {
    var value = score(row).implied;
    var width = maxValue > 0 ? Math.max(2, value / maxValue * 100) : 2;
    var chainNames = (row.chains || []).slice(0, 2).join(', ') || 'Chain data unavailable';
    var rowText = 'Rank ' + row.rank + ', ' + row.name + ', TVL ' + compactUsd(row.tvl_usd) + ', 7 day growth ' + growthText(row.change_7d) + ', ' + ageText(row.age_days) + ', no token, implied value ' + exactUsd(value);
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
      element('td', {}, [text('span', row.name, 'protocol-name'), text('span', (row.category || 'Other') + ' · ' + chainNames, 'protocol-meta')]),
      element('td', { className: 'metric', text: compactUsd(row.tvl_usd) }),
      element('td', { className: 'metric growth', text: growthText(row.change_7d) }),
      element('td', { className: 'age', text: ageText(row.age_days) + ' · no token' }),
      element('td', { className: 'value-cell' }, [
        element('div', { className: 'value-track', 'aria-hidden': 'true' }, [element('span', { style: 'width:' + width + '%' })]),
        text('span', compactUsd(value), 'value-label')
      ])
    ]);
  }

  function liveRow(row) {
    return element('tr', {}, [
      element('td', {}, [text('span', row.name, 'protocol-name'), text('span', row.category || 'Other', 'protocol-meta')]),
      element('td', { className: 'protocol-meta', text: (row.chains || []).slice(0, 3).join(', ') || 'Chain data unavailable' }),
      element('td', { className: 'metric', text: compactUsd(row.tvl_usd) }),
      element('td', { className: 'metric growth', text: growthText(row.change_7d) }),
      element('td', {}, [text('span', compactUsd(row.mcap_usd), 'value-label'), text('span', 'ALREADY TRADING', 'trading-tag')])
    ]);
  }

  function tableView(rows) {
    var live = state.tab === 'live';
    var shown = live ? rows.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }) : sortedRows(rows);
    var maxValue = shown.reduce(function (max, row) { return Math.max(max, score(row).implied); }, 0);
    var table = element('table', {}, [
      element('caption', { text: live ? 'Already trading protocols, ordered by market capitalization.' : 'Pre-token protocols. Select a row to open its full model and farm plan.' }),
      element('thead', {}, [element('tr', {}, live ? [
        element('th', { scope: 'col', text: 'Protocol' }), element('th', { scope: 'col', text: 'Chains' }),
        element('th', { scope: 'col', text: 'TVL' }), element('th', { scope: 'col', text: '7d growth' }),
        element('th', { scope: 'col', text: 'Market cap · descending' })
      ] : [sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d growth'), sortHeader('age', 'Age / token'), sortHeader('implied', 'Implied value')])]),
      element('tbody', {}, shown.map(function (row) { return live ? liveRow(row) : rowElement(row, maxValue); }))
    ]);
    if (!shown.length) {
      var tbody = table.children[2];
      tbody.appendChild(element('tr', {}, [element('td', { colspan: live ? '5' : '6' }, [
        element('div', { className: 'empty' }, [text('p', 'No protocols match these filters.'), element('button', { type: 'button', className: 'action-button', 'aria-label': 'Clear filters', onclick: clearFilters }, [text('span', 'Clear filters')])])
      ])]));
    }
    return element('div', { className: 'table-scroll' }, [table]);
  }

  function clearFilters() {
    state.filter = '';
    state.category = 'all';
    state.tab = 'pre';
    state.sort = 'implied';
    state.direction = -1;
    syncBoardHash();
    render();
  }

  function modelPanel() {
    var model = DATA.model;
    var d = DATA.diagnostics;
    var counts = { farm: 0, thin: 0, skip: 0 };
    DATA.rows.forEach(function (row) { counts[netVerdict(row)] += 1; });
    function metric(value) { return value === null ? 'n/a' : value.toFixed(4); }
    return element('section', { className: 'model-panel', 'aria-labelledby': 'model-title' }, [
      element('div', {}, [text('h2', 'Radar-3 model', null), text('p', 'OLS fit of live-token market cap against TVL in log10 dollars. All fitted numbers come from this snapshot.')]),
      element('div', { className: 'formula', id: 'model-title' }, [
        text('strong', 'log10(mcap) = a + b × log10(tvl)'),
        text('p', 'a = ' + model.a + ' · b = ' + model.b + ' · n = ' + d.n),
        text('p', 'R² = ' + metric(d.r2) + ' · median mcap/tvl = ' + metric(d.medianRatio) + '×'),
        text('h3', 'Backtest · curve only'),
        text('p', 'Train ' + d.nTrain + ' (listed before 2025-01-01) · test ' + d.nTest + ' (on/after cutoff) · undated excluded from split: ' + (d.n - d.nTrain - d.nTest)),
        text('p', 'OOS log10 RMSE = ' + metric(d.oosRmse) + ' · mean error (predicted − observed) = ' + metric(d.oosMeanErr) + ' · median absolute error factor = ' + metric(d.medianAbsFactor) + '×'),
        text('h3', 'Adjustments'),
        text('p', 'category_factor = clamp(1 + (category median mcap/tvl / overall median mcap/tvl − 1) × n/(n+5), 0.25, 4). Unseen categories use 1; n is the category’s comparable count.'),
        text('p', 'growth = 1 + clamp(change_7d, ' + model.growth_floor + ', ' + model.growth_cap + ')/100 × ' + model.growth_weight + '; missing growth = 0.'),
        text('p', 'maturity = ' + model.maturity_floor + ' + ' + model.maturity_range + ' × sqrt(clamp(age_days, 0, ' + model.maturity_days + ')/' + model.maturity_days + '); unknown age = ' + model.unknown_age_days + ' days.'),
        text('p', 'chains = 1 + 0.04 × min(max(chains.length − 1, 0), 4).'),
        text('strong', modelFormula),
        text('h3', 'Net verdict · literal value/effort screen'),
        text('p', 'farm if implied >= total_cost_usd × total_time_minutes; thin if implied >= half that effort; else skip.'),
        text('p', 'Across all ' + DATA.rows.length + ' board rows — farm: ' + counts.farm + ' · thin: ' + counts.thin + ' · skip: ' + counts.skip),
        text('p', 'Totals sum the plan literally: reused capital is counted each time Cost lists it, passive hold time is included, and weekly actions count once. This screen does not estimate payouts or profit.'),
        text('p', 'The curve is weak (R² about ' + d.r2.toFixed(2) + ', median error factor about ' + (d.medianAbsFactor === null ? 'n/a' : d.medianAbsFactor.toFixed(1) + '×') + '), so implied values are order-of-magnitude estimates, not prices.', 'model-caveat')
      ])
    ]);
  }

  function comparablesPanel() {
    var summaries = DATA.comparables_summary;
    return element('section', { className: 'detail-section comparables', 'aria-labelledby': 'comparables-title' }, [
      text('h2', 'Live comparables behind the fit', null),
      text('p', DATA.comparables.length + ' tokens with positive market cap and TVL, including CEX. This full fitted set differs from the ' + DATA.live_size + '-token live display sample.', 'detail-meta'),
      element('div', { className: 'table-scroll', id: 'comparables-title' }, [element('table', {}, [
        element('caption', { text: 'Comparable counts, median market cap to TVL ratios, and shrunk category factors.' }),
        element('thead', {}, [element('tr', {}, ['Category', 'Count (n)', 'Median mcap/tvl', 'Category factor'].map(function (label) { return element('th', { scope: 'col', text: label }); }))]),
        element('tbody', {}, summaries.map(function (group) { return element('tr', {}, [
          text('td', group.category || 'Other'), text('td', String(group.n), 'metric'),
          text('td', group.medianRatio.toFixed(4) + '×', 'metric'), text('td', DATA.model.category_factors[group.category].toFixed(4) + '×', 'metric')
        ]); }))
      ])]),
      element('details', { className: 'comparable-tokens' }, [
        text('summary', 'Inspect all ' + DATA.comparables.length + ' fitted live tokens'),
        element('div', { className: 'table-scroll' }, [element('table', {}, [
          element('caption', { text: 'All live tokens used to fit the curve, including CEX.' }),
          element('thead', {}, [element('tr', {}, ['Token / category', 'TVL', 'Market cap', 'mcap/tvl'].map(function (label) { return element('th', { scope: 'col', text: label }); }))]),
          element('tbody', {}, DATA.comparables.map(function (comp) { return element('tr', {}, [
            element('td', {}, [text('span', comp.name, 'protocol-name'), text('span', comp.category || 'Other', 'protocol-meta')]),
            text('td', exactUsd(comp.tvl_usd), 'metric'), text('td', exactUsd(comp.mcap_usd), 'metric'), text('td', (comp.mcap_usd / comp.tvl_usd).toFixed(4) + '×', 'metric')
          ]); }))
        ])])
      ])
    ]);
  }

  function boardView() {
    var live = state.tab === 'live';
    var source = state.tab === 'live' ? DATA.live : DATA.rows;
    var rows = filteredRows(source);
    var categories = Array.from(new Set(source.map(function (row) { return row.category || 'Other'; }))).sort(function (a, b) { return a.localeCompare(b); });
    if (state.category !== 'all' && categories.indexOf(state.category) < 0) categories.push(state.category);
    var heading = element('section', { className: 'page-heading' }, [
      element('div', {}, [text('p', 'EARLY ASSET FIELD', 'eyebrow'), text('h1', state.tab === 'live' ? 'Already trading' : 'Pre-token radar')]),
      text('p', state.tab === 'live' ? 'Live protocols are shown by market cap and kept outside the pre-token ranking.' : 'A ranked scan of protocols with no token on record.', 'heading-note')
    ]);
    var tabs = element('div', { className: 'tabs', role: 'tablist', 'aria-label': 'Protocol status' }, [
      element('button', { type: 'button', role: 'tab', className: 'tab', 'aria-selected': state.tab === 'pre' ? 'true' : 'false', 'aria-label': 'Show pre-token protocols', onclick: function () { state.tab = 'pre'; syncBoardHash(); render(); } }, [text('span', 'Pre-token'), text('small', String(DATA.board_size))]),
      element('button', { type: 'button', role: 'tab', className: 'tab', 'aria-selected': state.tab === 'live' ? 'true' : 'false', 'aria-label': 'Show live-token protocols, already trading', onclick: function () { state.tab = 'live'; syncBoardHash(); render(); } }, [text('span', 'Live-token'), text('small', String(DATA.live_size))])
    ]);
    var toolbar = element('div', { className: 'toolbar' }, [
      element('div', { className: 'field' }, [element('label', { for: 'filter', text: 'Filter protocols' }), element('input', {
        id: 'filter', type: 'search', value: state.filter, placeholder: 'Name, slug, category, or chain', 'aria-label': 'Filter by protocol name, slug, category, or chain', autocomplete: 'off',
        oninput: function (event) { state.filter = event.target.value; syncBoardHash(); render(); }
      })]),
      element('div', { className: 'field' }, [element('label', { for: 'category', text: 'Category' }), element('select', {
        id: 'category', 'aria-label': 'Filter by category', onchange: function (event) { state.category = event.target.value; syncBoardHash(); render(); }
      }, [element('option', { value: 'all', text: 'All categories' })].concat(categories.map(function (category) { return element('option', { value: category, text: category, selected: state.category === category ? 'selected' : null }); })))])
    ]);
    var resultLine = element('div', { className: 'results-line' }, [
      element('strong', { text: rows.length + ' rows shown', 'aria-live': 'polite' }),
      live ? text('span', 'Market cap order · outside ranking') : element('div', { className: 'legend', 'aria-label': 'Metric colors' }, [
        element('span', {}, [element('i', {}), text('span', 'Implied value')]),
        element('span', {}, [element('i', { className: 'cyan-dot' }), text('span', '7d growth')])
      ])
    ]);
    var body = element('section', { 'aria-label': live ? 'Live-token protocols' : 'Pre-token board' }, [tabs, toolbar, resultLine, tableView(rows)]);
    return pageShell(append(element('div', {}), [heading, body, live ? element('div', { className: 'live-callout' }, [text('strong', 'Already trading'), text('span', 'These market caps are listed separately and do not enter the pre-token ranking.')]) : null, modelPanel(), comparablesPanel()]));
  }

  function factors(row) {
    var values = score(row);
    var labels = [
      { title: 'Curve base value', value: exactUsd(values.base), note: '10^(' + DATA.model.a + ' + ' + DATA.model.b + ' × log10(' + row.tvl_usd + ')) = ' + values.base.toFixed(4) },
      { title: 'Category factor', value: values.category.toFixed(6) + '×', note: (row.category || 'Other') + ' · shrunk median ratio; unseen category = 1' },
      { title: 'Growth multiplier', value: values.growth.toFixed(6) + '×', note: 'Clamped 7d growth ' + values.growthPct + '% × weight ' + DATA.model.growth_weight },
      { title: 'Maturity multiplier', value: values.maturity.toFixed(6) + '×', note: (row.age_days === null ? DATA.model.unknown_age_days + 'd fallback' : row.age_days + 'd old') + ' · square-root progress over ' + DATA.model.maturity_days + 'd' },
      { title: 'Chain-breadth multiplier', value: values.chains.toFixed(6) + '×', note: (row.chains || []).length + ' chains · 0.04 per extra, capped at 4 extras' }
    ];
    return { values: values, list: element('div', { className: 'factor-grid' }, labels.map(function (item) {
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
    var chains = (row.chains || []).map(function (chainName) { return element('li', { text: chainName }); });
    var age = ageText(row.age_days) + ' · no token';
    var back = element('a', { href: boardHash() || '#/', className: 'back-link', 'aria-label': 'Back to pre-token board', onclick: function (event) { event.preventDefault(); goBack(); } }, [text('span', '← Back to board')]);
    var heading = element('section', { className: 'detail-head' }, [
      back,
      element('div', { className: 'detail-title-line' }, [element('div', {}, [text('p', row.category || 'Other', 'eyebrow'), text('h1', row.name), text('p', row.slug, 'detail-meta')]), text('span', 'RANK ' + row.rank, 'detail-rank')]),
      element('p', { className: 'detail-meta', text: (row.chains || []).join(' · ') || 'Chain data unavailable' })
    ]);
    var summary = element('section', { className: 'detail-metrics', 'aria-label': 'Protocol metrics' }, [
      element('div', { className: 'detail-metric' }, [element('label', { text: 'Total value locked' }), element('strong', { text: exactUsd(row.tvl_usd) })]),
      element('div', { className: 'detail-metric' }, [element('label', { text: '7d growth' }), element('strong', { text: growthText(row.change_7d) })]),
      element('div', { className: 'detail-metric' }, [element('label', { text: 'Age · token status' }), element('strong', { text: age })]),
      element('div', { className: 'detail-metric value' }, [element('label', { text: 'Recomputed implied value' }), element('strong', { text: exactUsd(calc.values.implied) })])
    ]);
    var factorSection = element('section', { className: 'detail-section', 'aria-labelledby': 'factors-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Model factors', null), text('p', 'Calculated from this row’s snapshot values.')]),
      element('div', { id: 'factors-title' }, [calc.list]),
      element('p', { className: 'parity ' + (match ? 'match' : 'mismatch'), role: 'status', text: match ? 'Recomputed ' + exactUsd(calc.values.implied) + ' · board.json ' + exactUsd(row.implied_value_usd) + ' · MATCH' : 'DATA MISMATCH · recomputed ' + exactUsd(calc.values.implied) + ' but board.json carries ' + exactUsd(row.implied_value_usd) })
    ]);
    var chainSection = element('section', { className: 'detail-section', 'aria-labelledby': 'chains-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Chain footprint', null), text('p', (row.chains || []).length + ' reported chains · breadth factor ' + calc.values.chains.toFixed(4) + '×')]),
      element('ul', { className: 'chain-list', id: 'chains-title' }, chains.length ? chains : [element('li', { text: 'No chain data' })])
    ]);
    var farmSection = element('section', { className: 'detail-section', 'aria-labelledby': 'farm-title' }, [
      element('div', { className: 'section-head' }, [text('h2', 'Six-step farm plan', null), text('p', 'The exact six actions and literal costs/time recorded in board.json.')]),
      element('div', { className: 'farm-economics' }, [
        element('div', { className: 'factor' }, [text('label', 'Total cost'), text('strong', exactUsd(row.farm_economics.total_cost_usd)), text('small', 'Literal Cost sum, including repeated capital')]),
        element('div', { className: 'factor' }, [text('label', 'Total time'), text('strong', row.farm_economics.total_time_minutes + ' minutes'), text('small', 'Includes passive hold; weekly actions counted once')]),
        element('div', { className: 'factor' }, [text('label', 'Net verdict: ' + netVerdict(row)), text('strong', netVerdict(row).toUpperCase()), text('small', 'Effort threshold: ' + exactUsd(row.farm_economics.total_cost_usd) + ' × ' + row.farm_economics.total_time_minutes + ' minutes = ' + wholeUsd.format(row.farm_economics.total_cost_usd * row.farm_economics.total_time_minutes))])
      ]),
      element('div', { id: 'farm-title' }, [farmPlan(row)])
    ]);
    return pageShell(append(element('article', {}), [heading, summary, factorSection, chainSection, farmSection]));
  }

  function render() {
    var focusId = document.activeElement && document.activeElement.id;
    var detail = state.slug ? DATA.rows.find(function (row) { return row.slug === state.slug; }) : null;
    root.replaceChildren(state.slug ? detailView(detail) : boardView());
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
