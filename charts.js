/* charts.js — thin wrappers around Chart.js for the dashboard & reports views. */

const ChartRegistry = {};

function destroyChart(key) {
  if (ChartRegistry[key]) {
    ChartRegistry[key].destroy();
    delete ChartRegistry[key];
  }
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartLibReady() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js has not loaded (no internet on first load?). Charts will appear once it loads.');
    return false;
  }
  return true;
}

function renderIncomeExpenseBar(canvasId, labels, incomeData, expenseData) {
  if (!chartLibReady()) return;
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  ChartRegistry[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Money In', data: incomeData, backgroundColor: cssVar('--accent'), borderRadius: 6, maxBarThickness: 26 },
        { label: 'Money Out', data: expenseData, backgroundColor: cssVar('--coral'), borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: cssVar('--muted') } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: cssVar('--muted'), font: { size: 11 } } },
        y: { grid: { color: cssVar('--line') }, ticks: { color: cssVar('--muted'), font: { size: 11 } } },
      },
    },
  });
}

function renderGroupPie(canvasId, labels, data, colors) {
  if (!chartLibReady()) return;
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (!data.length) return;
  ChartRegistry[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: cssVar('--surface') }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10.5 }, color: cssVar('--muted') } } },
    },
  });
}

function renderTrendLine(canvasId, labels, data) {
  if (!chartLibReady()) return;
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(15,157,120,0.35)');
  gradient.addColorStop(1, 'rgba(15,157,120,0)');
  ChartRegistry[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Money',
        data,
        borderColor: cssVar('--accent'),
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: cssVar('--accent'),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: cssVar('--muted'), font: { size: 11 } } },
        y: { grid: { color: cssVar('--line') }, ticks: { color: cssVar('--muted'), font: { size: 11 } } },
      },
    },
  });
}
