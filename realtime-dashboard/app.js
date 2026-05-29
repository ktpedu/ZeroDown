// Global variables for dashboard configuration and telemetry data
const SHEET_ID = '1CjVO9-OXdzSpfIY4bK_2uf7AjS9tOkF-ixws69SXObc';

let telemetryData = [];
let telemetryChart = null;
let activeChartTab = 'all';
let refreshInterval = 5000; // 5 seconds
let refreshTimer = null;
let timerStart = Date.now();

// DOM elements
const refreshIcon = document.getElementById('manual-refresh');
const timerText = document.getElementById('timer-text');
const timerBar = document.getElementById('timer-bar');

const metricStatus = document.getElementById('metric-status');
const cardStatus = document.getElementById('card-status-container');
const statusDesc = document.getElementById('status-desc');

const metricPower = document.getElementById('metric-power');
const cardPower = document.getElementById('card-power-container');
const powerDesc = document.getElementById('power-desc');

const metricRms = document.getElementById('metric-rms');
const rmsBar = document.getElementById('rms-bar');
const cardRms = document.getElementById('card-rms-container');

const metricPeak = document.getElementById('metric-peak');
const peakAvg = document.getElementById('peak-avg');
const peakMax = document.getElementById('peak-max');

const tbody = document.getElementById('telemetry-tbody');
const logSearch = document.getElementById('log-search');
const downloadCsv = document.getElementById('download-csv');

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initChart();
  fetchDashboardData();
  startRefreshTimer();
});

// Setup DOM event listeners
function setupEventListeners() {
  // Manual refresh button click
  refreshIcon.addEventListener('click', () => {
    fetchDashboardData(true);
  });

  // Chart view selectors
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeChartTab = e.target.dataset.chart;
      updateChartData();
    });
  });

  // Search input filter
  logSearch.addEventListener('input', renderLogTable);

  // CSV download trigger
  downloadCsv.addEventListener('click', handleDownloadCSV);
}

// Start visual auto-refresh timer loop
function startRefreshTimer() {
  timerStart = Date.now();
  if (refreshTimer) clearInterval(refreshTimer);
  
  refreshTimer = setInterval(() => {
    const elapsed = Date.now() - timerStart;
    const percentage = Math.min((elapsed / refreshInterval) * 100, 100);
    timerBar.style.width = `${percentage}%`;
    
    const secondsRemaining = Math.max(Math.ceil((refreshInterval - elapsed) / 1000), 0);
    timerText.textContent = `${secondsRemaining}s`;
    
    if (elapsed >= refreshInterval) {
      fetchDashboardData();
    }
  }, 100);
}

// Reset the refresh cycle timer
function resetRefreshTimer() {
  timerStart = Date.now();
  timerBar.style.width = '0%';
  timerText.textContent = `${refreshInterval/1000}s`;
}

// Fetch spreadsheet JSONP feed to bypass browser CORS blockages in local file mode (file://)
function fetchDashboardData(isManual = false) {
  refreshIcon.classList.add('spinning');
  
  // Set up temporary JSONP callback name
  const callbackName = 'jsonpCallback_' + Math.floor(Math.random() * 1000000);
  
  // Define callback function globally
  window[callbackName] = function(parsedData) {
    // Clean up callback and script tag
    delete window[callbackName];
    const scriptEl = document.getElementById(callbackName);
    if (scriptEl) scriptEl.remove();
    
    refreshIcon.classList.remove('spinning');
    resetRefreshTimer();

    try {
      const data = parseGoogleSheetsJsonObj(parsedData);
      if (data && data.length > 0) {
        telemetryData = data;
        updateMetricsUI();
        updateChartData();
        renderLogTable();
        if (isManual) {
          showToast('Data refreshed successfully', 'success');
        }
      } else {
        throw new Error('No data rows retrieved');
      }
    } catch (error) {
      console.error('Error parsing JSONP data:', error);
      showToast('Failed to parse sheet data structure.', 'error');
    }
  };

  // Create script tag to fetch the sheet data via JSONP
  const script = document.createElement('script');
  script.id = callbackName;
  script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}`;
  
  // Handle network loading errors (e.g. offline, bad sheet ID)
  script.onerror = function() {
    delete window[callbackName];
    script.remove();
    refreshIcon.classList.remove('spinning');
    resetRefreshTimer();
    showToast('Failed to pull live sheet metrics. Using cache.', 'error');
  };

  document.head.appendChild(script);
}

// Parse Google Visualization JSONP object directly (no string slicing needed!)
function parseGoogleSheetsJsonObj(parsed) {
  try {
    const table = parsed.table;
    if (!table || !table.rows) return [];
    
    // Dynamic mapping of columns based on label matching the Google Sheet
    const colIndices = { time: 0, vib_rms: 1, peak: 2, status: 3, power: 4 };
    if (table.cols) {
      table.cols.forEach((col, idx) => {
        const label = (col.label || '').toLowerCase();
        if (label.includes('time') || label.includes('date')) colIndices.time = idx;
        else if (label.includes('vib_rms_counts') || label.includes('rms')) colIndices.vib_rms = idx;
        else if (label.includes('peak_counts') || label.includes('peak')) colIndices.peak = idx;
        else if (label.includes('status')) colIndices.status = idx;
        else if (label.includes('power')) colIndices.power = idx;
      });
    }
    
    // Parse row objects and filter out empty/invalid rows
    return table.rows
      .map(row => {
        const cells = row.c || [];
        
        // Parse timestamp
        let timestamp = '';
        const cellTime = cells[colIndices.time];
        if (cellTime) {
          if (cellTime.f) {
            timestamp = cellTime.f;
          } else if (cellTime.v) {
            const match = cellTime.v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
            if (match) {
              const year = parseInt(match[1]);
              const month = parseInt(match[2]);
              const day = parseInt(match[3]);
              const hours = match[4] ? parseInt(match[4]) : 0;
              const minutes = match[5] ? parseInt(match[5]) : 0;
              const seconds = match[6] ? parseInt(match[6]) : 0;
              
              const date = new Date(year, month, day, hours, minutes, seconds);
              timestamp = date.toLocaleString('th-TH', { hour12: false });
            } else {
              timestamp = cellTime.v;
            }
          }
        }
        
        // Check if row is completely empty
        const hasData = cells.some(cell => cell !== null && cell !== undefined && cell.v !== null && cell.v !== '');
        if (!timestamp && !hasData) return null;
        
        return {
          timestamp: timestamp || 'N/A',
          vib_rms: cells[colIndices.vib_rms] ? parseFloat(cells[colIndices.vib_rms].v) || 0 : 0,
          peak: cells[colIndices.peak] ? parseFloat(cells[colIndices.peak].v) || 0 : 0,
          status: cells[colIndices.status] ? (cells[colIndices.status].v || '').trim() : 'normal',
          power: cells[colIndices.power] ? (cells[colIndices.power].v || '').trim().toUpperCase() : 'ON'
        };
      })
      .filter(item => item !== null && item.timestamp !== 'N/A');
  } catch (err) {
    console.error('Error parsing visual table JSON:', err);
    return [];
  }
}

// Update current Metric Cards in the UI
function updateMetricsUI() {
  if (telemetryData.length === 0) return;
  
  // The most recent record is the last item (bottom-most row of Google Sheet)
  const current = telemetryData[telemetryData.length - 1];
  
  // 1. Status Indicator
  const statusStr = current.status;
  const statusLower = statusStr.toLowerCase();
  metricStatus.textContent = statusStr.toUpperCase();
  cardStatus.className = `metric-card card-status ${statusLower}`;
  
  if (statusLower === 'normal') {
    statusDesc.innerHTML = `<i class="fa-solid fa-check"></i> Monitoring active, standard load`;
    document.documentElement.style.setProperty('--color-info', 'hsl(195, 90%, 50%)');
  } else if (statusLower === 'turnoff_normal') {
    statusDesc.innerHTML = `<i class="fa-solid fa-circle-minus"></i> Standard manual machine cooldown`;
    document.documentElement.style.setProperty('--color-info', 'hsl(195, 90%, 50%)');
  } else {
    statusDesc.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Critical vibration anomaly warning`;
    document.documentElement.style.setProperty('--color-info', 'hsl(355, 85%, 55%)');
  }

  // 2. Power State
  const powerState = current.power.toUpperCase();
  metricPower.textContent = powerState;
  cardPower.className = `metric-card card-power ${powerState.toLowerCase()}`;
  
  if (powerState === 'ON') {
    powerDesc.innerHTML = `<i class="fa-solid fa-bolt"></i> Power Grid: Stable Supply`;
  } else if (powerState === 'CUT') {
    powerDesc.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Main Grid Cutoff Triggered`;
  } else {
    powerDesc.innerHTML = `<i class="fa-solid fa-power-off"></i> Device Standby mode`;
  }

  // 3. Vibration RMS
  const rmsVal = current.vib_rms;
  metricRms.textContent = rmsVal.toLocaleString();
  
  // Calculate percentage relative to max typical scale (6000)
  const rmsPercent = Math.min((rmsVal / 6000) * 100, 100);
  rmsBar.style.width = `${rmsPercent}%`;
  
  // Dynamic color for score bar based on threshold
  if (rmsVal >= 4000) {
    rmsBar.style.backgroundColor = 'var(--color-abnormal)';
    cardRms.style.borderColor = 'rgba(239, 68, 68, 0.2)';
  } else if (rmsVal >= 1000) {
    rmsBar.style.backgroundColor = 'var(--color-warn)';
    cardRms.style.borderColor = 'rgba(245, 158, 11, 0.2)';
  } else {
    rmsBar.style.backgroundColor = 'var(--color-normal)';
    cardRms.style.borderColor = 'var(--panel-border)';
  }

  // 4. Peak Vibration Stats
  metricPeak.textContent = current.peak.toLocaleString();
  
  const peakValues = telemetryData.map(d => d.peak);
  const avgPeak = (peakValues.reduce((sum, v) => sum + v, 0) / telemetryData.length).toFixed(0);
  const maxPeak = Math.max(...peakValues).toFixed(0);
  
  peakAvg.textContent = parseInt(avgPeak).toLocaleString();
  peakMax.textContent = parseInt(maxPeak).toLocaleString();
}

// Initialize Chart.js configuration
function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Vib RMS Counts',
          data: [],
          borderColor: 'rgba(6, 182, 212, 1)',
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: 'rgba(6, 182, 212, 1)',
          pointBorderColor: 'rgba(255, 255, 255, 0.2)',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true,
          yAxisID: 'yRms'
        },
        {
          label: 'Peak Vibration Counts',
          data: [],
          borderColor: 'rgba(245, 158, 11, 1)',
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(245, 158, 11, 1)',
          pointBorderColor: 'rgba(255, 255, 255, 0.2)',
          pointRadius: 4,
          tension: 0.2,
          fill: false,
          yAxisID: 'yPeak'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#9ca3af',
            font: { family: 'Outfit', size: 12 },
            boxWidth: 15
          }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 14, 27, 0.95)',
          titleColor: '#fff',
          bodyColor: '#e5e7eb',
          titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.03)' },
          ticks: { color: '#6b7280', font: { family: 'Outfit', size: 11 } }
        },
        yRms: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Vib RMS (Counts)',
            color: 'rgba(6, 182, 212, 1)',
            font: { family: 'Outfit', size: 12, weight: 600 }
          },
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
        },
        yPeak: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Peak Vibration (Counts)',
            color: 'rgba(245, 158, 11, 1)',
            font: { family: 'Outfit', size: 12, weight: 600 }
          },
          grid: { drawOnChartArea: false },
          ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });
}

// Update the chart datasets based on selected toggles
function updateChartData() {
  if (!telemetryChart || telemetryData.length === 0) return;
  
  // Show the last 15 data entries in chart for readability
  const recentData = telemetryData.slice(-15);
  const labels = recentData.map(d => d.timestamp.split(', ')[1] || d.timestamp);
  
  telemetryChart.data.labels = labels;

  // Filter datasets based on active tabs
  if (activeChartTab === 'all') {
    telemetryChart.data.datasets[0].data = recentData.map(d => d.vib_rms);
    telemetryChart.data.datasets[0].hidden = false;
    
    telemetryChart.data.datasets[1].data = recentData.map(d => d.peak);
    telemetryChart.data.datasets[1].hidden = false;
    
    telemetryChart.options.scales.yRms.display = true;
    telemetryChart.options.scales.yPeak.display = true;
  } else if (activeChartTab === 'rms') {
    telemetryChart.data.datasets[0].data = recentData.map(d => d.vib_rms);
    telemetryChart.data.datasets[0].hidden = false;
    telemetryChart.data.datasets[1].hidden = true;
    
    telemetryChart.options.scales.yRms.display = true;
    telemetryChart.options.scales.yPeak.display = false;
  } else if (activeChartTab === 'peak') {
    telemetryChart.data.datasets[0].hidden = true;
    telemetryChart.data.datasets[1].data = recentData.map(d => d.peak);
    telemetryChart.data.datasets[1].hidden = false;
    
    telemetryChart.options.scales.yRms.display = false;
    telemetryChart.options.scales.yPeak.display = true;
  }
  
  telemetryChart.update('none');
}

// Populate and filter the telemetry logs table
function renderLogTable() {
  if (telemetryData.length === 0) return;
  
  const searchVal = logSearch.value.toLowerCase().trim();
  tbody.innerHTML = '';
  
  // Render newest logs first
  const reversedData = [...telemetryData].reverse();
  
  let matchesCount = 0;
  reversedData.forEach(row => {
    const isMatch = !searchVal || 
                    row.timestamp.toLowerCase().includes(searchVal) || 
                    row.status.toLowerCase().includes(searchVal) || 
                    row.power.toLowerCase().includes(searchVal) ||
                    row.vib_rms.toString().includes(searchVal) ||
                    row.peak.toString().includes(searchVal);
                    
    if (isMatch) {
      matchesCount++;
      const tr = document.createElement('tr');
      
      const statusLower = row.status.toLowerCase();
      const statusClass = `status-td ${statusLower}`;
      const powerClass = `power-td ${row.power.toLowerCase()}`;
      
      // The first match in reversed data (when no search query is active) is the latest entry (bottom-most row of Google Sheet)
      const isLatest = matchesCount === 1 && !searchVal;
      const latestBadge = isLatest ? '<span class="latest-badge-ui">LATEST</span> ' : '';
      if (isLatest) {
        tr.classList.add('latest-row-highlight');
      }
      
      tr.innerHTML = `
        <td>${latestBadge}${row.timestamp}</td>
        <td class="${statusClass}">${row.status.toUpperCase()}</td>
        <td>${row.vib_rms.toLocaleString()}</td>
        <td>${row.peak.toLocaleString()}</td>
        <td class="${powerClass}">${row.power}</td>
      `;
      tbody.appendChild(tr);
    }
  });
  
  if (matchesCount === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">No records match your query</td></tr>`;
  }
}

// Export the logs as a CSV file
function handleDownloadCSV() {
  if (telemetryData.length === 0) {
    showToast('No logs available for download', 'error');
    return;
  }
  
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Timestamp,Status,Vib RMS Counts,Peak Counts,Power State\n';
  
  telemetryData.forEach(row => {
    const formattedTime = row.timestamp.replace(/,/g, '');
    csvContent += `"${formattedTime}","${row.status.toUpperCase()}",${row.vib_rms},${row.peak},"${row.power}"\n`;
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `zerodown_telemetry_logs_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Telemetry CSV file downloaded!', 'success');
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s reverse forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3500);
}
