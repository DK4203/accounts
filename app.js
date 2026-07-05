/* app.js — main application controller */

const State = {
  user: null,
  view: 'home',
  transactions: [],
  groups: [],
  budgets: [],
  currencies: [],
  search: '',
  filters: { from: '', to: '', groupId: '', type: '' },
  editingTxId: null,
  pendingAttachments: [],
  theme: 'light',
};

const NAV_ITEMS = [
  { id: 'home', label: 'Home', ic: '🏠' },
  { id: 'income', label: 'Income', ic: '💰' },
  { id: 'expenses', label: 'Expenses', ic: '💸' },
  { id: 'reports', label: 'Reports', ic: '📊' },
  { id: 'budgets', label: 'Budgets', ic: '🎯' },
  { id: 'groups', label: 'Groups', ic: '🗂️' },
  { id: 'settings', label: 'Settings', ic: '⚙️' },
];

/* ---------------- Boot ---------------- */
window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  await DB.init();
  await Auth.restoreSession();
  wireAuthScreen();
  if (Auth.currentUser) {
    await enterApp(Auth.currentUser);
  } else {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

async function enterApp(user) {
  State.user = user;
  State.theme = user.settings?.theme || 'light';
  applyTheme(State.theme);
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  await loadUserData();
  buildSidebar();
  buildBottomNav();
  wireShell();
  goTo('home');
}

async function loadUserData() {
  const uidVal = State.user.id;
  [State.transactions, State.groups, State.budgets, State.currencies] = await Promise.all([
    DB.getAllByUser('transactions', uidVal),
    DB.getAllByUser('groups', uidVal),
    DB.getAllByUser('budgets', uidVal),
    DB.getAllByUser('currencies', uidVal),
  ]);
  CurrencyUtil.setAll(State.currencies);
}

/* ---------------- Auth screen wiring ---------------- */
function wireAuthScreen() {
  const tabs = document.querySelectorAll('.auth-tabs button');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.classList.toggle('hidden', !isLogin);
      signupForm.classList.toggle('hidden', isLogin);
      document.getElementById('auth-error').textContent = '';
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
      const user = await Auth.login(username, password);
      loginForm.reset();
      await enterApp(user);
    } catch (err) {
      document.getElementById('auth-error').textContent = err.message;
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value;
    const password = document.getElementById('signup-password').value;
    const password2 = document.getElementById('signup-password2').value;
    if (password !== password2) {
      document.getElementById('auth-error').textContent = 'Passwords do not match.';
      return;
    }
    try {
      const user = await Auth.createUser(username, password);
      await Auth.login(username, password);
      signupForm.reset();
      await enterApp(user);
    } catch (err) {
      document.getElementById('auth-error').textContent = err.message;
    }
  });
}

/* ---------------- Sidebar & bottom nav ---------------- */
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = NAV_ITEMS.map(
    (item) => `<button class="nav-item" data-nav="${item.id}"><span class="ic">${item.ic}</span>${item.label}</button>`
  ).join('');
  nav.querySelectorAll('.nav-item').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.nav)));

  const chip = document.getElementById('sidebar-user-chip');
  chip.querySelector('.name').textContent = State.user.username;
  chip.querySelector('.av').textContent = State.user.username.slice(0, 1).toUpperCase();
}

function buildBottomNav() {
  const bn = document.getElementById('bottom-nav');
  const items = NAV_ITEMS.filter((n) => ['home', 'income', 'expenses', 'reports', 'settings'].includes(n.id));
  bn.innerHTML = items.map(
    (item) => `<button data-nav="${item.id}"><span class="ic">${item.ic}</span>${item.label}</button>`
  ).join('');
  bn.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => goTo(btn.dataset.nav)));
}

function wireShell() {
  document.getElementById('btn-logout').addEventListener('click', () => {
    Auth.logout();
    location.reload();
  });
  document.getElementById('fab-add').addEventListener('click', () => openTxModal());
  document.getElementById('btn-add-topbar').addEventListener('click', () => openTxModal());
  document.getElementById('global-search').addEventListener('input', (e) => {
    State.search = e.target.value.toLowerCase();
    if (['home', 'income', 'expenses'].includes(State.view)) renderView();
  });
  document.getElementById('theme-switch').addEventListener('click', toggleTheme);
  document.getElementById('theme-switch').classList.toggle('on', State.theme === 'dark');

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('modal-root').children.length) return;
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      document.getElementById('global-search').focus();
    }
    if ((e.key === 'n' || e.key === 'N') && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      openTxModal();
    }
  });
}

function toggleTheme() {
  State.theme = State.theme === 'dark' ? 'light' : 'dark';
  applyTheme(State.theme);
  document.getElementById('theme-switch').classList.toggle('on', State.theme === 'dark');
  State.user.settings.theme = State.theme;
  Auth.saveUser(State.user);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/* ---------------- Routing ---------------- */
function goTo(view) {
  State.view = view;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  document.querySelectorAll('#bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  document.getElementById('topbar-title').textContent = NAV_ITEMS.find((n) => n.id === view)?.label || '';
  renderView();
}

function renderView() {
  const root = document.getElementById('view-root');
  switch (State.view) {
    case 'home': root.innerHTML = renderHome(); afterRenderHome(); break;
    case 'income': root.innerHTML = renderTxList('income'); afterRenderTxList('income'); break;
    case 'expenses': root.innerHTML = renderTxList('expense'); afterRenderTxList('expense'); break;
    case 'reports': root.innerHTML = renderReports(); afterRenderReports(); break;
    case 'budgets': root.innerHTML = renderBudgets(); afterRenderBudgets(); break;
    case 'groups': root.innerHTML = renderGroups(); afterRenderGroups(); break;
    case 'settings': root.innerHTML = renderSettings(); afterRenderSettings(); break;
  }
}

/* ---------------- Helpers ---------------- */
function fmt(amount, code) { return CurrencyUtil.format(amount, code); }
function toDefault(amount, code) { return CurrencyUtil.toDefault(amount, code); }
function groupById(id) { return State.groups.find((g) => g.id === id); }
function monthKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(key) { const [y, m] = key.split('-'); return new Date(y, m - 1).toLocaleString(undefined, { month: 'short', year: '2-digit' }); }

function totalsInDefault(txs) {
  let income = 0, expense = 0;
  txs.forEach((t) => {
    const v = toDefault(t.amount, t.currency);
    if (t.type === 'income') income += v; else expense += v;
  });
  return { income, expense, net: income - expense };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= HOME (Dashboard) ================= */
function renderHome() {
  const all = State.transactions;
  const { income, expense, net } = totalsInDefault(all);
  const savingsRate = income > 0 ? Math.max(0, Math.min(100, Math.round((net / income) * 100))) : 0;
  const defSym = CurrencyUtil.symbol(CurrencyUtil.defaultCode);

  const thisMonthKey = monthKey(new Date());
  const monthTx = all.filter((t) => monthKey(t.date) === thisMonthKey);
  const monthTotals = totalsInDefault(monthTx);

  const recent = [...all].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  const ring = describeRing(savingsRate);

  return `
    <div class="hero-money card">
      <div>
        <div class="label">Total Money</div>
        <div class="amount mono">${defSym}${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="label" style="margin-top:8px; opacity:.85; font-weight:500; text-transform:none;">This month: ${defSym}${monthTotals.net.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      </div>
      <div class="hero-ring">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="9"/>
          <circle cx="48" cy="48" r="42" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${ring.dash}" stroke-dashoffset="0"/>
        </svg>
        <div class="pct">${savingsRate}%</div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card card">
        <div class="top"><div class="ic" style="background:var(--accent-soft); color:var(--accent-ink);">💰</div></div>
        <div class="val mono">${fmt(income, CurrencyUtil.defaultCode)}</div>
        <div class="lbl">Money In (All Time)</div>
      </div>
      <div class="stat-card card">
        <div class="top"><div class="ic" style="background:var(--coral-soft); color:var(--coral);">💸</div></div>
        <div class="val mono">${fmt(expense, CurrencyUtil.defaultCode)}</div>
        <div class="lbl">Money Out (All Time)</div>
      </div>
      <div class="stat-card card">
        <div class="top"><div class="ic" style="background:#EFF3FF; color:#5B6BFF;">🏦</div></div>
        <div class="val mono">${fmt(monthTotals.income, CurrencyUtil.defaultCode)}</div>
        <div class="lbl">Money In (This Month)</div>
      </div>
      <div class="stat-card card">
        <div class="top"><div class="ic" style="background:#FFF6E3; color:var(--gold);">🎯</div></div>
        <div class="val mono">${fmt(monthTotals.expense, CurrencyUtil.defaultCode)}</div>
        <div class="lbl">Money Out (This Month)</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-card card">
        <h3>Money In vs Money Out (Last 6 Months)</h3>
        <canvas id="chart-bar"></canvas>
      </div>
      <div class="chart-card card">
        <h3>Spending by Group</h3>
        <canvas id="chart-pie"></canvas>
      </div>
    </div>
    <div class="chart-card card" style="margin-bottom:20px;">
      <h3>Total Money Over Time</h3>
      <canvas id="chart-line"></canvas>
    </div>

    <div class="list-card card">
      <div class="list-head"><h3>Recent Activity</h3><button class="btn btn-ghost btn-sm" id="see-all-tx">See All</button></div>
      ${recent.length ? recent.map(txRowHtml).join('') : emptyState('📭', 'No transactions yet', 'Tap the + button to add your first one.')}
    </div>
  `;
}

function describeRing(pct) {
  const circumference = 2 * Math.PI * 42;
  const dash = `${(pct / 100) * circumference} ${circumference}`;
  return { dash };
}

function afterRenderHome() {
  document.getElementById('see-all-tx')?.addEventListener('click', () => goTo('expenses'));
  wireTxRowButtons();

  // Bar: last 6 months income vs expense
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const incomeData = months.map((mk) => totalsInDefault(State.transactions.filter((t) => t.type === 'income' && monthKey(t.date) === mk)).income);
  const expenseData = months.map((mk) => totalsInDefault(State.transactions.filter((t) => t.type === 'expense' && monthKey(t.date) === mk)).expense);
  renderIncomeExpenseBar('chart-bar', months.map(monthLabel), incomeData, expenseData);

  // Pie: spending by group (expenses only)
  const expenseGroups = State.groups.filter((g) => g.type === 'expense');
  const pieLabels = [], pieData = [], pieColors = [];
  expenseGroups.forEach((g) => {
    const sum = totalsInDefault(State.transactions.filter((t) => t.type === 'expense' && t.groupId === g.id)).expense;
    if (sum > 0) { pieLabels.push(g.name); pieData.push(Number(sum.toFixed(2))); pieColors.push(g.color); }
  });
  renderGroupPie('chart-pie', pieLabels, pieData, pieColors);

  // Line: running total over last 6 months
  let running = 0;
  const beforeStart = State.transactions.filter((t) => new Date(t.date) < new Date(now.getFullYear(), now.getMonth() - 5, 1));
  running = totalsInDefault(beforeStart).net;
  const lineData = months.map((mk) => {
    const t = totalsInDefault(State.transactions.filter((tr) => monthKey(tr.date) === mk));
    running += t.net;
    return Number(running.toFixed(2));
  });
  renderTrendLine('chart-line', months.map(monthLabel), lineData);
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state"><div class="big">${icon}</div><p><strong>${title}</strong><br>${sub}</p></div>`;
}

/* ================= Transaction row + list ================= */
function txRowHtml(t) {
  const g = groupById(t.groupId);
  const sign = t.type === 'income' ? '+' : '-';
  const cls = t.type === 'income' ? 'pos' : 'neg';
  return `
    <div class="tx-row" data-id="${t.id}">
      <div class="ic" style="background:${g ? g.color + '22' : '#ddd'}; color:${g ? g.color : '#666'};">${g ? g.icon : '❓'}</div>
      <div class="info">
        <div class="desc">${escapeHtml(t.description || (g ? g.name : 'Transaction'))}</div>
        <div class="meta">${g ? g.name : 'No Group'} · ${new Date(t.date).toLocaleDateString()}${t.attachments?.length ? ` <span class="attach-badge">📎 ${t.attachments.length}</span>` : ''}</div>
      </div>
      <div class="amt mono ${cls}">${sign}${fmt(t.amount, t.currency)}</div>
      <div class="row-actions">
        <button class="btn btn-icon btn-ghost btn-edit-tx" title="Edit">✏️</button>
        <button class="btn btn-icon btn-ghost btn-del-tx" title="Delete">🗑️</button>
      </div>
    </div>`;
}

function wireTxRowButtons() {
  document.querySelectorAll('.btn-edit-tx').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.tx-row').dataset.id;
      openTxModal(State.transactions.find((t) => t.id === id));
    });
  });
  document.querySelectorAll('.btn-del-tx').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.tx-row').dataset.id;
      if (!confirm('Delete this transaction? This cannot be undone.')) return;
      await DB.delete('transactions', id);
      State.transactions = State.transactions.filter((t) => t.id !== id);
      showToast('Transaction deleted');
      renderView();
    });
  });
}

function renderTxList(type) {
  const label = type === 'income' ? 'Income' : 'Expenses';
  const groupsOfType = State.groups.filter((g) => g.type === type);
  let list = State.transactions.filter((t) => t.type === type);

  if (State.filters.from) list = list.filter((t) => t.date >= State.filters.from);
  if (State.filters.to) list = list.filter((t) => t.date <= State.filters.to);
  if (State.filters.groupId) list = list.filter((t) => t.groupId === State.filters.groupId);
  if (State.search) list = list.filter((t) => (t.description || '').toLowerCase().includes(State.search) || (groupById(t.groupId)?.name || '').toLowerCase().includes(State.search));

  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  const total = totalsInDefault(list)[type === 'income' ? 'income' : 'expense'];

  return `
    <div class="filter-bar card" style="padding:14px 16px;">
      <div class="field"><label>From</label><input type="date" id="filter-from" value="${State.filters.from}"></div>
      <div class="field"><label>To</label><input type="date" id="filter-to" value="${State.filters.to}"></div>
      <div class="field">
        <label>Group</label>
        <select id="filter-group">
          <option value="">All Groups</option>
          ${groupsOfType.map((g) => `<option value="${g.id}" ${State.filters.groupId === g.id ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-ghost btn-sm" id="clear-filters">Clear</button>
      <button class="btn btn-primary btn-sm" id="export-csv" style="margin-left:auto;">Export</button>
    </div>
    <div class="list-card card">
      <div class="list-head">
        <h3>${label} List</h3>
        <span class="pill ${type === 'income' ? 'pill-income' : 'pill-expense'}">Total: ${fmt(total, CurrencyUtil.defaultCode)}</span>
      </div>
      ${list.length ? list.map(txRowHtml).join('') : emptyState(type === 'income' ? '💰' : '💸', `No ${label.toLowerCase()} found`, 'Try changing filters or add a new one.')}
    </div>
  `;
}

function afterRenderTxList(type) {
  wireTxRowButtons();
  document.getElementById('filter-from').addEventListener('change', (e) => { State.filters.from = e.target.value; renderView(); });
  document.getElementById('filter-to').addEventListener('change', (e) => { State.filters.to = e.target.value; renderView(); });
  document.getElementById('filter-group').addEventListener('change', (e) => { State.filters.groupId = e.target.value; renderView(); });
  document.getElementById('clear-filters').addEventListener('click', () => { State.filters = { from: '', to: '', groupId: '', type: '' }; renderView(); });
  document.getElementById('export-csv').addEventListener('click', () => exportCsv(type));
}

function exportCsv(type) {
  const list = State.transactions.filter((t) => t.type === type);
  const rows = [['Date', 'Description', 'Group', 'Amount', 'Currency']];
  list.forEach((t) => rows.push([t.date, t.description || '', groupById(t.groupId)?.name || '', t.amount, t.currency]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${type}-export.csv`;
  a.click();
  showToast('File exported');
}

/* ================= REPORTS ================= */
function renderReports() {
  const currencyOptions = State.currencies.map((c) => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
  return `
    <div class="filter-bar card" style="padding:14px 16px;">
      <div class="field"><label>From</label><input type="date" id="rep-from" value="${State.filters.from}"></div>
      <div class="field"><label>To</label><input type="date" id="rep-to" value="${State.filters.to}"></div>
      <div class="field"><label>Show In</label><select id="rep-currency">${currencyOptions}</select></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card card"><h3>Money In vs Money Out</h3><canvas id="rep-bar"></canvas></div>
      <div class="chart-card card"><h3>Spending by Group</h3><canvas id="rep-pie"></canvas></div>
    </div>
    <div class="chart-card card"><h3>Trend</h3><canvas id="rep-line"></canvas></div>
  `;
}

function afterRenderReports() {
  const currencySel = document.getElementById('rep-currency');
  currencySel.value = CurrencyUtil.defaultCode;
  const rerun = () => renderReportCharts(document.getElementById('rep-from').value, document.getElementById('rep-to').value, currencySel.value);
  document.getElementById('rep-from').addEventListener('change', rerun);
  document.getElementById('rep-to').addEventListener('change', rerun);
  currencySel.addEventListener('change', rerun);
  rerun();
}

function renderReportCharts(from, to, toCode) {
  let list = State.transactions;
  if (from) list = list.filter((t) => t.date >= from);
  if (to) list = list.filter((t) => t.date <= to);

  const months = [...new Set(list.map((t) => monthKey(t.date)))].sort();
  const finalMonths = months.length ? months : [monthKey(new Date())];
  const incomeData = finalMonths.map((mk) => list.filter((t) => t.type === 'income' && monthKey(t.date) === mk).reduce((s, t) => s + CurrencyUtil.convert(t.amount, t.currency, toCode), 0));
  const expenseData = finalMonths.map((mk) => list.filter((t) => t.type === 'expense' && monthKey(t.date) === mk).reduce((s, t) => s + CurrencyUtil.convert(t.amount, t.currency, toCode), 0));
  renderIncomeExpenseBar('rep-bar', finalMonths.map(monthLabel), incomeData, expenseData);

  const expenseGroups = State.groups.filter((g) => g.type === 'expense');
  const pieLabels = [], pieData = [], pieColors = [];
  expenseGroups.forEach((g) => {
    const sum = list.filter((t) => t.type === 'expense' && t.groupId === g.id).reduce((s, t) => s + CurrencyUtil.convert(t.amount, t.currency, toCode), 0);
    if (sum > 0) { pieLabels.push(g.name); pieData.push(Number(sum.toFixed(2))); pieColors.push(g.color); }
  });
  renderGroupPie('rep-pie', pieLabels, pieData, pieColors);

  let running = 0;
  const lineData = finalMonths.map((mk, i) => {
    running += incomeData[i] - expenseData[i];
    return Number(running.toFixed(2));
  });
  renderTrendLine('rep-line', finalMonths.map(monthLabel), lineData);
}

/* ================= BUDGETS ================= */
function renderBudgets() {
  const expenseGroups = State.groups.filter((g) => g.type === 'expense');
  const thisMonthKey = monthKey(new Date());
  const rows = expenseGroups.map((g) => {
    const budget = State.budgets.find((b) => b.groupId === g.id);
    const spent = totalsInDefault(State.transactions.filter((t) => t.type === 'expense' && t.groupId === g.id && monthKey(t.date) === thisMonthKey)).expense;
    const limit = budget ? toDefault(budget.amount, budget.currency) : 0;
    const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    return `
      <div class="budget-row" data-group="${g.id}">
        <div class="top"><span>${g.icon} ${g.name}</span><span>${fmt(spent, CurrencyUtil.defaultCode)} ${limit ? '/ ' + fmt(limit, CurrencyUtil.defaultCode) : ''}</span></div>
        <div class="bar"><div class="fill ${pct >= 100 ? 'over' : ''}" style="width:${limit ? pct : 0}%; background:${limit ? '' : 'var(--line)'};"></div></div>
        <div class="sub">${limit ? pct + '% used this month' : 'No limit set'} · <a href="#" class="set-budget-link" data-group="${g.id}">${limit ? 'Edit Limit' : 'Set Limit'}</a></div>
      </div>`;
  }).join('');
  return `<div class="list-card card"><div class="list-head"><h3>Group Limits (This Month)</h3></div>${rows || emptyState('🎯', 'No groups yet', 'Add a group first.')}</div>`;
}

function afterRenderBudgets() {
  document.querySelectorAll('.set-budget-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openBudgetModal(link.dataset.group);
    });
  });
}

function openBudgetModal(groupId) {
  const g = groupById(groupId);
  const existing = State.budgets.find((b) => b.groupId === groupId);
  const currencyOptions = State.currencies.map((c) => `<option value="${c.code}" ${existing?.currency === c.code ? 'selected' : (!existing && c.isDefault ? 'selected' : '')}>${c.code}</option>`).join('');
  openModal(`
    <h3>${g.icon} Set Limit — ${g.name}</h3>
    <div class="form-grid">
      <div class="two-col">
        <div class="field"><label>Amount</label><input type="number" id="budget-amount" min="0" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0.00"></div>
        <div class="field"><label>Currency</label><select id="budget-currency">${currencyOptions}</select></div>
      </div>
    </div>
    <div class="modal-actions">
      ${existing ? '<button class="btn btn-danger" id="budget-remove">Remove Limit</button>' : ''}
      <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="budget-save">Save</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('budget-remove')?.addEventListener('click', async () => {
    await DB.delete('budgets', existing.id);
    State.budgets = State.budgets.filter((b) => b.id !== existing.id);
    closeModal(); renderView(); showToast('Limit removed');
  });
  document.getElementById('budget-save').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('budget-amount').value);
    const currency = document.getElementById('budget-currency').value;
    if (!amount || amount <= 0) { showToast('Please enter an amount'); return; }
    const record = existing ? { ...existing, amount, currency } : { id: uid('bud'), userId: State.user.id, groupId, amount, currency };
    await DB.put('budgets', record);
    State.budgets = State.budgets.filter((b) => b.id !== record.id).concat(record);
    closeModal(); renderView(); showToast('Limit saved');
  });
}

/* ================= GROUPS ================= */
function renderGroups() {
  const income = State.groups.filter((g) => g.type === 'income');
  const expense = State.groups.filter((g) => g.type === 'expense');
  const tile = (g) => {
    const spend = totalsInDefault(State.transactions.filter((t) => t.groupId === g.id))[g.type === 'income' ? 'income' : 'expense'];
    return `
      <div class="group-tile card" data-id="${g.id}">
        <div class="tile-actions"><button class="btn btn-icon btn-ghost btn-sm edit-group" title="Edit">✏️</button><button class="btn btn-icon btn-ghost btn-sm del-group" title="Delete">🗑️</button></div>
        <div class="ic" style="background:${g.color}22; color:${g.color};">${g.icon}</div>
        <div class="name">${escapeHtml(g.name)}</div>
        <div class="spend mono">${fmt(spend, CurrencyUtil.defaultCode)} total</div>
      </div>`;
  };
  return `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;"><button class="btn btn-primary" id="add-group-btn">+ Add Group</button></div>
    <h3 style="margin-bottom:12px;">Income Groups</h3>
    <div class="groups-grid" style="margin-bottom:28px;">${income.map(tile).join('') || emptyState('💼','No income groups','Add one to get started.')}</div>
    <h3 style="margin-bottom:12px;">Expense Groups</h3>
    <div class="groups-grid">${expense.map(tile).join('') || emptyState('🛍️','No expense groups','Add one to get started.')}</div>
  `;
}

const GROUP_ICONS = ['💼','🎁','➕','🍽️','🚌','🧾','🛍️','💊','📦','🏠','🎓','🎮','✈️','🐾','💇','📱','🧘','🚗','🍕','☕'];
const GROUP_COLORS = ['#0F9D78','#FF6B5B','#3AA6FF','#F5A623','#8C6FE6','#E667C4','#22B8A6','#5B6BFF','#8C99A6','#D94F70'];

function afterRenderGroups() {
  document.getElementById('add-group-btn').addEventListener('click', () => openGroupModal());
  document.querySelectorAll('.edit-group').forEach((btn) => btn.addEventListener('click', (e) => {
    const id = e.target.closest('.group-tile').dataset.id;
    openGroupModal(groupById(id));
  }));
  document.querySelectorAll('.del-group').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('.group-tile').dataset.id;
    const used = State.transactions.some((t) => t.groupId === id);
    if (used && !confirm('This group has transactions. Delete anyway? Transactions will keep showing "No Group".')) return;
    if (!used && !confirm('Delete this group?')) return;
    await DB.delete('groups', id);
    State.groups = State.groups.filter((g) => g.id !== id);
    renderView(); showToast('Group deleted');
  }));
}

function openGroupModal(existing) {
  const iconPicker = GROUP_ICONS.map((ic) => `<button type="button" class="icon-opt btn btn-icon ${existing?.icon === ic ? 'active-pick' : ''}" data-ic="${ic}" style="font-size:16px;">${ic}</button>`).join('');
  const colorPicker = GROUP_COLORS.map((c) => `<button type="button" class="color-opt" data-color="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${existing?.color === c ? 'var(--ink)' : 'transparent'};cursor:pointer;"></button>`).join('');
  openModal(`
    <h3>${existing ? 'Edit Group' : 'Add Group'}</h3>
    <div class="form-grid">
      <div class="field"><label>Name</label><input type="text" id="group-name" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="e.g. Groceries"></div>
      <div class="field">
        <label>Type</label>
        <div class="type-toggle">
          <button type="button" id="g-type-income" class="${(!existing || existing.type==='income') ? 'active-income' : ''}">Income</button>
          <button type="button" id="g-type-expense" class="${existing?.type==='expense' ? 'active-expense' : ''}">Expense</button>
        </div>
      </div>
      <div class="field"><label>Icon</label><div style="display:flex; flex-wrap:wrap; gap:6px;">${iconPicker}</div></div>
      <div class="field"><label>Color</label><div style="display:flex; flex-wrap:wrap; gap:8px;">${colorPicker}</div></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="group-save">Save</button>
    </div>
  `);
  let picked = { type: existing?.type || 'income', icon: existing?.icon || GROUP_ICONS[0], color: existing?.color || GROUP_COLORS[0] };
  document.getElementById('g-type-income').addEventListener('click', () => { picked.type='income'; document.getElementById('g-type-income').className='active-income'; document.getElementById('g-type-expense').className=''; });
  document.getElementById('g-type-expense').addEventListener('click', () => { picked.type='expense'; document.getElementById('g-type-expense').className='active-expense'; document.getElementById('g-type-income').className=''; });
  document.querySelectorAll('.icon-opt').forEach((b) => b.addEventListener('click', () => { picked.icon = b.dataset.ic; document.querySelectorAll('.icon-opt').forEach(x=>x.classList.remove('active-pick')); b.classList.add('active-pick'); }));
  document.querySelectorAll('.color-opt').forEach((b) => b.addEventListener('click', () => { picked.color = b.dataset.color; document.querySelectorAll('.color-opt').forEach(x=>x.style.border='2px solid transparent'); b.style.border='2px solid var(--ink)'; }));
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('group-save').addEventListener('click', async () => {
    const name = document.getElementById('group-name').value.trim();
    if (!name) { showToast('Please enter a name'); return; }
    const record = existing ? { ...existing, name, ...picked } : { id: uid('grp'), userId: State.user.id, name, ...picked };
    await DB.put('groups', record);
    State.groups = State.groups.filter((g) => g.id !== record.id).concat(record);
    closeModal(); renderView(); showToast('Group saved');
  });
}

/* ================= SETTINGS ================= */
function renderSettings() {
  const curRows = State.currencies.map((c) => `
    <div class="cur-row" data-id="${c.id}">
      <strong>${c.symbol}</strong>
      <span>${c.code} — ${escapeHtml(c.name)}</span>
      <input type="number" class="cur-rate" step="0.0001" value="${c.rate}" ${c.isDefault ? 'disabled' : ''}>
      <label style="display:flex; align-items:center; gap:6px; font-size:12px;"><input type="radio" name="default-cur" class="cur-default" ${c.isDefault ? 'checked' : ''}> Default</label>
      <button class="btn btn-icon btn-ghost btn-sm cur-del" ${c.isDefault ? 'disabled style="opacity:.3;"' : ''}>🗑️</button>
    </div>`).join('');

  return `
    <div class="settings-section card">
      <h3>Look</h3>
      <div class="theme-toggle">
        <button class="switch ${State.theme === 'dark' ? 'on' : ''}" id="settings-theme-switch"></button>
        <span>Dark Mode</span>
      </div>
    </div>

    <div class="settings-section card">
      <h3>Money Types</h3>
      <div class="cur-row head"><span></span><span>Name</span><span>Rate</span><span>Default</span><span></span></div>
      ${curRows}
      <div style="margin-top:14px;"><button class="btn btn-sm" id="add-currency-btn">+ Add Money Type</button></div>
      <p style="font-size:12px; color:var(--muted); margin-top:10px;">Rate = how many units of this money type equal 1 unit of your default money. The default money type always has a rate of 1.</p>
    </div>

    <div class="settings-section card">
      <h3>Account</h3>
      <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">Signed in as <strong>${escapeHtml(State.user.username)}</strong></p>
      <button class="btn btn-sm" id="change-password-btn">Change Password</button>
    </div>
  `;
}

function afterRenderSettings() {
  document.getElementById('settings-theme-switch').addEventListener('click', toggleTheme);
  document.getElementById('add-currency-btn').addEventListener('click', openCurrencyModal);
  document.getElementById('change-password-btn').addEventListener('click', openChangePasswordModal);

  document.querySelectorAll('.cur-row[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('.cur-rate').addEventListener('change', async (e) => {
      const c = State.currencies.find((x) => x.id === id);
      c.rate = parseFloat(e.target.value) || 1;
      await DB.put('currencies', c);
      showToast('Rate updated');
    });
    row.querySelector('.cur-default').addEventListener('change', async () => {
      for (const c of State.currencies) {
        c.isDefault = c.id === id;
        if (c.isDefault) c.rate = 1;
        await DB.put('currencies', c);
      }
      CurrencyUtil.setAll(State.currencies);
      renderView(); showToast('Default money type updated');
    });
    row.querySelector('.cur-del').addEventListener('click', async () => {
      const used = State.transactions.some((t) => t.currency === State.currencies.find(c=>c.id===id).code);
      if (used && !confirm('Transactions use this money type. Delete anyway?')) return;
      await DB.delete('currencies', id);
      State.currencies = State.currencies.filter((c) => c.id !== id);
      CurrencyUtil.setAll(State.currencies);
      renderView(); showToast('Money type removed');
    });
  });
}

function openCurrencyModal() {
  openModal(`
    <h3>Add Money Type</h3>
    <div class="form-grid">
      <div class="two-col">
        <div class="field"><label>Code</label><input type="text" id="cur-code" maxlength="6" placeholder="e.g. GBP" style="text-transform:uppercase;"></div>
        <div class="field"><label>Symbol</label><input type="text" id="cur-symbol" maxlength="3" placeholder="£"></div>
      </div>
      <div class="field"><label>Name</label><input type="text" id="cur-name" placeholder="e.g. British Pound"></div>
      <div class="field"><label>Rate (units per 1 default)</label><input type="number" id="cur-rate" step="0.0001" value="1"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="cur-save">Save</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('cur-save').addEventListener('click', async () => {
    const code = document.getElementById('cur-code').value.trim().toUpperCase();
    const symbol = document.getElementById('cur-symbol').value.trim() || code;
    const name = document.getElementById('cur-name').value.trim();
    const rate = parseFloat(document.getElementById('cur-rate').value) || 1;
    if (!code || !name) { showToast('Please fill in code and name'); return; }
    if (State.currencies.some((c) => c.code === code)) { showToast('That code already exists'); return; }
    const record = { id: uid('cur'), userId: State.user.id, code, symbol, name, rate, isDefault: State.currencies.length === 0 };
    await DB.put('currencies', record);
    State.currencies.push(record);
    CurrencyUtil.setAll(State.currencies);
    closeModal(); renderView(); showToast('Money type added');
  });
}

function openChangePasswordModal() {
  openModal(`
    <h3>Change Password</h3>
    <div class="form-grid">
      <div class="field"><label>Current Password</label><input type="password" id="cp-current"></div>
      <div class="field"><label>New Password</label><input type="password" id="cp-new"></div>
      <div class="field"><label>Confirm New Password</label><input type="password" id="cp-confirm"></div>
    </div>
    <div class="auth-error" id="cp-error"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="cp-save">Save</button>
    </div>
  `);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('cp-save').addEventListener('click', async () => {
    const current = document.getElementById('cp-current').value;
    const next = document.getElementById('cp-new').value;
    const confirmVal = document.getElementById('cp-confirm').value;
    const hash = await sha256Hex(State.user.salt + current);
    if (hash !== State.user.passwordHash) { document.getElementById('cp-error').textContent = 'Current password is wrong.'; return; }
    if (!next || next !== confirmVal) { document.getElementById('cp-error').textContent = 'New passwords do not match.'; return; }
    State.user.passwordHash = await sha256Hex(State.user.salt + next);
    await Auth.saveUser(State.user);
    closeModal(); showToast('Password changed');
  });
}

/* ================= Transaction Modal ================= */
function openTxModal(existing) {
  State.editingTxId = existing ? existing.id : null;
  State.pendingAttachments = existing ? [...(existing.attachments || [])] : [];
  const type = existing ? existing.type : 'expense';
  renderTxModalBody(type, existing);
}

function renderTxModalBody(type, existing) {
  const groupsOfType = State.groups.filter((g) => g.type === type);
  const currencyOptions = State.currencies.map((c) => `<option value="${c.code}" ${((existing?.currency)||CurrencyUtil.defaultCode) === c.code ? 'selected' : ''}>${c.code}</option>`).join('');
  const dateVal = existing ? existing.date : new Date().toISOString().slice(0, 10);

  openModal(`
    <h3>${existing ? 'Edit Transaction' : 'Add Transaction'}</h3>
    <div class="type-toggle" style="margin-bottom:16px;">
      <button type="button" id="tx-type-income" class="${type === 'income' ? 'active-income' : ''}">Income</button>
      <button type="button" id="tx-type-expense" class="${type === 'expense' ? 'active-expense' : ''}">Expense</button>
    </div>
    <div class="form-grid">
      <div class="two-col">
        <div class="field"><label>Amount</label><input type="number" id="tx-amount" min="0" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0.00"></div>
        <div class="field"><label>Money Type</label><select id="tx-currency">${currencyOptions}</select></div>
      </div>
      <div class="field"><label>What was it for</label><input type="text" id="tx-desc" value="${existing ? escapeHtml(existing.description || '') : ''}" placeholder="e.g. Coffee with friend"></div>
      <div class="two-col">
        <div class="field"><label>Group</label><select id="tx-group">${groupsOfType.map((g) => `<option value="${g.id}" ${existing?.groupId === g.id ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}</select></div>
        <div class="field"><label>Date</label><input type="date" id="tx-date" value="${dateVal}"></div>
      </div>
      <div class="field">
        <label>Attachments (bill, receipt, image, PDF)</label>
        <div class="attach-drop" id="attach-drop">Tap to add a file</div>
        <input type="file" id="tx-file" class="hidden" multiple accept="image/*,application/pdf">
        <div class="attach-list" id="attach-list"></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="tx-save">Save</button>
    </div>
  `);

  let currentType = type;
  const switchType = (t) => {
    currentType = t;
    document.getElementById('tx-type-income').className = t === 'income' ? 'active-income' : '';
    document.getElementById('tx-type-expense').className = t === 'expense' ? 'active-expense' : '';
    const groupSel = document.getElementById('tx-group');
    const groups = State.groups.filter((g) => g.type === t);
    groupSel.innerHTML = groups.map((g) => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
  };
  document.getElementById('tx-type-income').addEventListener('click', () => switchType('income'));
  document.getElementById('tx-type-expense').addEventListener('click', () => switchType('expense'));

  renderAttachList();
  document.getElementById('attach-drop').addEventListener('click', () => document.getElementById('tx-file').click());
  document.getElementById('tx-file').addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      if (file.size > 4 * 1024 * 1024) { showToast(`${file.name} is too big (max 4MB)`); continue; }
      const dataUrl = await fileToDataUrl(file);
      State.pendingAttachments.push({ name: file.name, type: file.type, dataUrl });
    }
    renderAttachList();
    e.target.value = '';
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('tx-save').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const currency = document.getElementById('tx-currency').value;
    const description = document.getElementById('tx-desc').value.trim();
    const groupId = document.getElementById('tx-group').value;
    const date = document.getElementById('tx-date').value;
    if (!amount || amount <= 0) { showToast('Please enter an amount'); return; }
    if (!groupId) { showToast('Please choose a group'); return; }
    if (!date) { showToast('Please choose a date'); return; }

    const record = {
      id: State.editingTxId || uid('tx'),
      userId: State.user.id,
      type: currentType,
      amount, currency, description, groupId, date,
      attachments: State.pendingAttachments,
      createdAt: existing ? existing.createdAt : Date.now(),
    };
    await DB.put('transactions', record);
    State.transactions = State.transactions.filter((t) => t.id !== record.id).concat(record);
    closeModal();
    renderView();
    showToast(State.editingTxId ? 'Transaction updated' : 'Transaction added');
  });
}

function renderAttachList() {
  const box = document.getElementById('attach-list');
  if (!box) return;
  box.innerHTML = State.pendingAttachments.map((a, i) => `
    <div class="attach-chip">${a.type.includes('pdf') ? '📄' : '🖼️'} ${escapeHtml(a.name.slice(0, 18))} <button data-i="${i}" class="rm-attach">✕</button></div>
  `).join('');
  box.querySelectorAll('.rm-attach').forEach((btn) => btn.addEventListener('click', () => {
    State.pendingAttachments.splice(Number(btn.dataset.i), 1);
    renderAttachList();
  }));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ================= Generic Modal ================= */
function openModal(innerHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal card">${innerHtml}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  State.editingTxId = null;
  State.pendingAttachments = [];
}
