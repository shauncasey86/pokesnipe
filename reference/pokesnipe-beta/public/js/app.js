// ═══════════════════════════════════════════════════════════════════════════
// POKESNIPE — COLLECTOR'S STUDY V5
// With Match Details | Seller Info | International Badge | Expansion Logo
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const API = '/api';

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────

  const state = {
    deals: [],
    dealIds: new Set(),
    reportedDealIds: new Set(), // Track deals that have been reported as wrong match
    filter: 'all',
    cardTypeFilter: 'all', // 'all' | 'raw' | 'graded'
    view: 'grid',
    rate: 1.27,
    rateLive: false,
    running: false,
    selectedGradingCompany: 'PSA',
    currentDeal: null,
    theme: 'dark',
    logOpen: false,
    logs: [],
    maxLogs: 100,
    lastScansToday: 0, // Track scan count to update eBay badge only after scans
    diagnosticsOpen: false,
    diagnosticsView: 'session', // 'session' or 'lastScan'
    diagnosticsData: null, // Full API response
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DOM HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  function price(val, symbol = '£') {
    if (typeof val !== 'number' || isNaN(val)) return '—';
    return `${symbol}${val.toFixed(2)}`;
  }

  function toGBP(usd) {
    if (typeof usd !== 'number' || isNaN(usd)) return 0;
    return usd / state.rate;
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function buildEbayUrl(deal) {
    console.log('buildEbayUrl:', {
      id: deal.id,
      affiliateUrl: deal.affiliateUrl,
      ebayUrl: deal.ebayUrl,
      ebayItemId: deal.ebayItemId,
      itemId: deal.itemId
    });
    
    if (deal.affiliateUrl && typeof deal.affiliateUrl === 'string') {
      if (deal.affiliateUrl.includes('ebay.co.uk') || deal.affiliateUrl.includes('ebay.com')) {
        return deal.affiliateUrl;
      }
    }
    
    if (deal.ebayUrl && typeof deal.ebayUrl === 'string') {
      if (deal.ebayUrl.includes('ebay.co.uk') || deal.ebayUrl.includes('ebay.com')) {
        return deal.ebayUrl;
      }
    }
    
    const itemId = deal.ebayItemId || deal.itemId;
    if (itemId) {
      const cleanId = String(itemId).replace(/^v/, '').replace(/[^0-9]/g, '');
      if (cleanId && cleanId.length > 5) {
        const url = `https://www.ebay.co.uk/itm/${cleanId}`;
        console.log('Constructed eBay URL:', url);
        return url;
      }
    }
    
    console.warn('Could not build eBay URL for deal:', deal.id);
    return '#';
  }

  function getConditionLabel(deal) {
    if (deal.isGraded) {
      return `${deal.gradingCompany || ''} ${deal.grade || ''}`.trim();
    }
    return deal.rawCondition || 'Raw';
  }

  function getMatchLevel(confidence) {
    if (confidence >= 85) return { level: 'high', label: 'Verified', desc: 'Strong match — card number and expansion confirmed' };
    if (confidence >= 60) return { level: 'medium', label: 'Likely', desc: 'Probable match — verify listing images before buying' };
    return { level: 'low', label: 'Check', desc: 'Lower confidence — carefully review the listing' };
  }

  // Check if item is international (not UK)
  function isInternational(deal) {
    const location = (deal.itemLocation || deal.location || '').toLowerCase();
    const country = (deal.itemCountry || deal.country || '').toLowerCase();
    
    // List of UK indicators
    const ukIndicators = ['united kingdom', 'uk', 'gb', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'];
    
    // If we have country info, check it
    if (country) {
      return !ukIndicators.some(uk => country.includes(uk));
    }
    
    // Fall back to location string
    if (location) {
      return !ukIndicators.some(uk => location.includes(uk));
    }
    
    return false; // Default to not international if no data
  }

  function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // THEME
  // ─────────────────────────────────────────────────────────────────────────

  function initTheme() {
    const saved = localStorage.getItem('pokesnipe-theme');
    state.theme = saved || 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('pokesnipe-theme', state.theme);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REPORTED DEALS TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  function loadReportedDeals() {
    try {
      const saved = localStorage.getItem('pokesnipe-reported-deals');
      if (saved) {
        const ids = JSON.parse(saved);
        state.reportedDealIds = new Set(ids);
      }
    } catch (e) {
      console.warn('Failed to load reported deals:', e);
    }
  }

  function saveReportedDeals() {
    try {
      const ids = Array.from(state.reportedDealIds);
      localStorage.setItem('pokesnipe-reported-deals', JSON.stringify(ids));
    } catch (e) {
      console.warn('Failed to save reported deals:', e);
    }
  }

  function markDealReported(dealId) {
    state.reportedDealIds.add(dealId);
    saveReportedDeals();
  }

  function isDealReported(dealId) {
    return state.reportedDealIds.has(dealId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVITY LOG - Now uses server-side detailed scan activity
  // ─────────────────────────────────────────────────────────────────────────

  function loadLogs() {
    // Logs are now fetched from server, no local storage needed
    // Initial load will happen via fetchActivityLogs()
  }

  function saveLogs() {
    // No longer saving to localStorage - server is source of truth
  }

  function addLog(message, type = 'info') {
    // Add local log entry for immediate feedback
    const entry = {
      time: new Date(),
      message,
      type
    };

    state.logs.unshift(entry);
    if (state.logs.length > state.maxLogs) {
      state.logs.pop();
    }

    renderLogs();
  }

  async function fetchActivityLogs() {
    try {
      const res = await fetch(`${API}/scanner/logs?limit=100`);
      const data = await res.json();

      if (data.status === 'ok' && Array.isArray(data.entries)) {
        // Convert server entries to local format
        state.logs = data.entries.map(entry => ({
          time: new Date(entry.timestamp),
          message: entry.message,
          type: entry.level.toLowerCase() === 'success' ? 'success' :
                entry.level.toLowerCase() === 'error' ? 'error' :
                entry.level.toLowerCase() === 'warn' ? 'warn' : 'info',
          details: entry.details
        }));
        renderLogs();
      }
    } catch (e) {
      console.warn('Failed to fetch activity logs:', e);
    }
  }

  async function clearLogs() {
    try {
      await fetch(`${API}/scanner/logs`, { method: 'DELETE' });
      state.logs = [];
      renderLogs();
      toast('Logs cleared', 'info');
    } catch (e) {
      toast('Failed to clear logs', 'error');
    }
  }

  function renderLogs() {
    const list = $('#log-list');
    const count = $('#log-count');

    if (!list || !count) return;

    count.textContent = `${state.logs.length} entries`;

    if (state.logs.length === 0) {
      list.innerHTML = '<div class="activity-log__empty">No activity yet</div>';
      return;
    }

    list.innerHTML = state.logs.map(log => {
      // Format time for display
      const timeStr = formatTime(log.time);

      // Add details tooltip if available
      let detailsAttr = '';
      if (log.details) {
        const d = log.details;
        const parts = [];
        if (d.query) parts.push(`Query: ${d.query}`);
        if (d.listingsFetched) parts.push(`Listings: ${d.listingsFetched}`);
        if (d.cardsMatched) parts.push(`Matched: ${d.cardsMatched}`);
        if (d.dealsFound) parts.push(`Deals: ${d.dealsFound}`);
        if (d.durationMs) parts.push(`Time: ${(d.durationMs / 1000).toFixed(1)}s`);
        if (parts.length > 0) {
          detailsAttr = ` title="${parts.join(' | ')}"`;
        }
      }

      return `
        <div class="log-entry log-entry--${log.type}"${detailsAttr}>
          <div class="log-entry__time">${timeStr}</div>
          <div class="log-entry__message">${esc(log.message)}</div>
        </div>
      `;
    }).join('');
  }

  function toggleLog() {
    state.logOpen = !state.logOpen;
    const panel = $('#activity-log');
    if (panel) {
      panel.hidden = !state.logOpen;
      // Fetch fresh logs when opening
      if (state.logOpen) {
        fetchActivityLogs();
      }
    }
  }

  function closeLog() {
    state.logOpen = false;
    const panel = $('#activity-log');
    if (panel) {
      panel.hidden = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DIAGNOSTICS PANEL
  // ─────────────────────────────────────────────────────────────────────────

  function toggleDiagnostics() {
    state.diagnosticsOpen = !state.diagnosticsOpen;
    const panel = $('#diagnostics-panel');
    if (panel) {
      panel.hidden = !state.diagnosticsOpen;
      // Fetch fresh diagnostics when opening
      if (state.diagnosticsOpen) {
        fetchDiagnostics();
      }
    }
  }

  function closeDiagnostics() {
    state.diagnosticsOpen = false;
    const panel = $('#diagnostics-panel');
    if (panel) {
      panel.hidden = true;
    }
  }

  async function fetchDiagnostics() {
    try {
      const res = await fetch('/api/scanner/diagnostics');
      const data = await res.json();

      if (data.status === 'ok') {
        state.diagnosticsData = data;
        renderDiagnosticsPanel();
      } else {
        state.diagnosticsData = null;
        renderDiagnosticsPanel();
      }
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    }
  }

  function switchDiagnosticsView(view) {
    state.diagnosticsView = view;

    // Update tab active states
    $$('.diagnostics-tab').forEach(tab => {
      if (tab.dataset.view === view) {
        tab.classList.add('diagnostics-tab--active');
      } else {
        tab.classList.remove('diagnostics-tab--active');
      }
    });

    renderDiagnosticsPanel();
  }

  function renderDiagnosticsPanel() {
    const data = state.diagnosticsData;
    const view = state.diagnosticsView;

    // Get the right diagnostics data based on view
    let diagnostics = null;
    let hint = 'No completed scans yet';

    if (data) {
      if (view === 'session' && data.session) {
        diagnostics = data.session;
        hint = `Cumulative results from ${data.session.scanCount || 0} scans`;
      } else if (view === 'lastScan' && data.lastScan) {
        diagnostics = data.lastScan;
        hint = 'Last completed scan results';
      }

      // Update scan count in tab
      const scanCountEl = $('#diag-scan-count');
      if (scanCountEl && data.session) {
        scanCountEl.textContent = data.session.scanCount || 0;
      }
    }

    // Update hint
    const hintEl = $('#diagnostics-hint');
    if (hintEl) hintEl.textContent = hint;

    // Update summary stats
    const matchRate = $('#diag-match-rate');
    const totalScanned = $('#diag-total-scanned');
    const matches = $('#diag-matches');
    const deals = $('#diag-deals');

    if (!diagnostics) {
      if (matchRate) matchRate.textContent = '—';
      if (totalScanned) totalScanned.textContent = '—';
      if (matches) matches.textContent = '—';
      if (deals) deals.textContent = '—';
      return;
    }

    if (matchRate) matchRate.textContent = diagnostics.matchRate;
    if (totalScanned) totalScanned.textContent = diagnostics.totalScanned;
    if (matches) matches.textContent = diagnostics.successfulMatches;
    if (deals) deals.textContent = diagnostics.successfulDeals;

    // Update failure breakdown bars
    const breakdown = diagnostics.failureBreakdown;
    if (breakdown) {
      const stages = [
        'lowConfidence', 'noExpansionMatch', 'noCardNumber', 'scrydexNotFound',
        'nameMismatch', 'noPriceMatch', 'nonEnglish', 'belowProfit'
      ];

      // Find max count for scaling
      const maxCount = Math.max(
        ...stages.map(s => breakdown[s]?.count || 0),
        1 // Prevent division by zero
      );

      stages.forEach(stage => {
        const bar = $(`#bar-${stage}`);
        const val = $(`#val-${stage}`);
        const count = breakdown[stage]?.count || 0;
        const pct = breakdown[stage]?.pct || '0.0';

        if (bar) {
          // Scale bar width relative to max failure count
          const widthPct = (count / maxCount) * 100;
          bar.style.width = `${widthPct}%`;
        }
        if (val) {
          val.textContent = `${count} (${pct}%)`;
        }
      });
    }
  }

  async function copyDiagnosticsJSON() {
    const data = state.diagnosticsData;
    if (!data) {
      toast('No diagnostics data to copy', 'error');
      return;
    }

    try {
      // Fetch set match failures to include in the report
      let setMatchFailures = null;
      try {
        const failuresRes = await fetch(`${API}/training/set-match-failures?limit=50&minHitCount=1`);
        const failuresData = await failuresRes.json();
        if (failuresData.status === 'ok') {
          setMatchFailures = {
            count: failuresData.count,
            totalHits: failuresData.totalHits,
            uniqueSetNames: failuresData.uniqueSetNames,
            // Include top failures sorted by hit count
            topFailures: failuresData.failures.slice(0, 50).map(f => ({
              parsedSetName: f.parsedSetName,
              cardNumber: f.cardNumber,
              hitCount: f.hitCount,
              nearMisses: f.nearMisses,
              ebayTitle: f.ebayTitle,
            })),
          };
        }
      } catch (e) {
        console.warn('Could not fetch set match failures:', e);
      }

      // Combine diagnostics with set match failures
      const combinedData = {
        ...data,
        setMatchFailures,
      };

      const jsonStr = JSON.stringify(combinedData, null, 2);
      await navigator.clipboard.writeText(jsonStr);

      // Visual feedback
      const btn = $('#diagnostics-copy');
      if (btn) {
        btn.classList.add('diagnostics-panel__action--success');
        setTimeout(() => btn.classList.remove('diagnostics-panel__action--success'), 1500);
      }

      toast('Diagnostics JSON copied to clipboard', 'success');
    } catch (err) {
      console.error('Copy failed:', err);
      toast('Failed to copy to clipboard', 'error');
    }
  }

  async function resetDiagnostics() {
    if (!confirm('Reset session diagnostics? This will clear all cumulative stats.')) {
      return;
    }

    try {
      const res = await fetch('/api/scanner/diagnostics/reset', { method: 'POST' });
      const data = await res.json();

      if (data.status === 'ok') {
        toast('Session diagnostics reset', 'success');
        fetchDiagnostics(); // Refresh
      } else {
        toast(data.message || 'Failed to reset', 'error');
      }
    } catch (err) {
      console.error('Reset failed:', err);
      toast('Failed to reset diagnostics', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOAST NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  function toast(message, type = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  async function fetchDeals() {
    try {
      const res = await fetch(`${API}/arbitrage/deals`);
      const data = await res.json();

      console.log('fetchDeals response:', {
        status: data.status,
        dealsCount: data.deals?.length || 0,
        count: data.count,
        storageMode: data.storageMode,
      });

      if (data.status === 'ok' && Array.isArray(data.deals)) {
        if (data.deals.length > 0) {
          const d = data.deals[0];
          console.log('First deal data:', {
            id: d.id,
            cardName: d.cardName,
            ebayItemId: d.ebayItemId,
            profitGBP: d.profitGBP,
            discountPercent: d.discountPercent,
          });
        }

        const newIds = new Set(data.deals.map(d => d.id));
        const hasChanged = data.deals.length !== state.deals.length ||
          data.deals.some(d => !state.dealIds.has(d.id));

        console.log('Deals change check:', {
          apiDealsCount: data.deals.length,
          stateDealsCount: state.deals.length,
          hasChanged,
        });

        // Always update and render on initial load or when deals change
        if (hasChanged || state.deals.length === 0) {
          const newDeals = data.deals.filter(d => !state.dealIds.has(d.id));
          newDeals.forEach(deal => {
            const intl = isInternational(deal) ? ' [INTL]' : '';
            addLog(`Found: ${deal.cardName}${intl} — ${price(deal.profitGBP)} profit`, 'success');
          });

          // Filter out deals that have been reported as wrong match
          const filteredDeals = data.deals.filter(d => !isDealReported(d.id));
          state.deals = filteredDeals;
          state.dealIds = new Set(filteredDeals.map(d => d.id));
          renderDeals();
        }

        if (data.rate) state.rate = data.rate;
        if (data.rateLive !== undefined) {
          state.rateLive = data.rateLive;
          updateRateStatus();
        }
      }
    } catch (e) {
      console.error('Failed to fetch deals:', e);
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/scanner/status`);
      const data = await res.json();

      if (data.status === 'ok') {
        const s = data.scanner || {};
        const d = data.deals || {};

        const wasRunning = state.running;
        state.running = s.isRunning || false;

        const scannerStateChanged = state.running !== wasRunning;
        if (scannerStateChanged) {
          updateToggleBtn();
          updateStatusIndicator();
          addLog(state.running ? 'Scanner started' : 'Scanner stopped', 'info');
        }

        // Show actual active deals count from server (not expired)
        // This is the real count of deals currently available
        const activeDeals = d.active !== undefined ? d.active : state.deals.length;
        $('#stat-deals').textContent = activeDeals;

        if (s.exchangeRate) {
          state.rate = s.exchangeRate;
          $('#stat-rate').textContent = s.exchangeRate.toFixed(2);
        }

        if (s.exchangeRateLive !== undefined) {
          state.rateLive = s.exchangeRateLive;
          updateRateStatus();
        }

        // Update eBay API status only when:
        // 1. A new scan completes (scansToday changes)
        // 2. Scanner starts/stops
        // 3. Initial page load (lastScansToday is 0)
        const scansToday = s.scansToday || 0;
        const shouldUpdateEbay = scansToday !== state.lastScansToday || scannerStateChanged;
        if (shouldUpdateEbay) {
          state.lastScansToday = scansToday;
          updateEbayStatus(s.ebayRateLimited, s.ebayRateLimitRetryAfterMs, false, s.ebayRateLimits);
        }

        // Update next scan time
        const nextScanEl = $('#stat-next-scan');
        if (nextScanEl) {
          if (s.nextScanAt && state.running) {
            const nextScan = new Date(s.nextScanAt);
            const now = new Date();
            const diffMs = nextScan - now;
            if (diffMs > 0) {
              const mins = Math.floor(diffMs / 60000);
              const secs = Math.floor((diffMs % 60000) / 1000);
              nextScanEl.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            } else {
              nextScanEl.textContent = 'Now';
            }
          } else if (!state.running) {
            nextScanEl.textContent = 'Stopped';
          } else if (s.currentQuery) {
            // Currently scanning - nextScanAt will be set after scan completes
            nextScanEl.textContent = 'Scanning...';
          } else {
            nextScanEl.textContent = '—';
          }
        }

        // Update next query
        const nextQueryEl = $('#stat-next-query');
        if (nextQueryEl) {
          if (s.nextQuery && state.running) {
            // Truncate for display
            const query = s.nextQuery;
            const truncated = query.length > 25 ? query.slice(0, 25) + '...' : query;
            nextQueryEl.textContent = truncated;
            nextQueryEl.title = query;
          } else if (s.currentQuery) {
            nextQueryEl.textContent = 'Scanning...';
            nextQueryEl.title = s.currentQuery;
          } else {
            nextQueryEl.textContent = '—';
            nextQueryEl.title = '';
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  }

  async function toggleScanner() {
    const btn = $('#toggle-btn');
    btn.disabled = true;
    
    try {
      const endpoint = state.running ? `${API}/scanner/stop` : `${API}/scanner/start`;
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      
      if (data.status === 'ok') {
        state.running = !state.running;
        updateToggleBtn();
        updateStatusIndicator();
        toast(state.running ? 'Scanner started' : 'Scanner stopped', 'success');
        addLog(state.running ? 'Scanner started by user' : 'Scanner stopped by user', 'info');
      } else {
        toast(data.message || 'Failed to toggle scanner', 'error');
      }
    } catch (e) {
      toast('Failed to toggle scanner', 'error');
    }
    
    btn.disabled = false;
  }

  async function triggerSearch() {
    const input = $('#search-input');
    const query = input.value.trim();
    
    if (!query) {
      toast('Enter a search query', 'error');
      return;
    }
    
    const btn = $('#search-btn');
    btn.disabled = true;
    btn.textContent = '...';
    addLog(`Searching: "${query}"`, 'info');
    
    try {
      const res = await fetch(`${API}/scanner/scan?q=${encodeURIComponent(query)}&limit=25`, {
        method: 'POST'
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      
      if (data.status === 'ok') {
        const result = data.result || {};
        const scanned = result.listingsFetched || 0;
        const matched = result.cardsMatched || 0;
        const deals = result.dealsFound || 0;

        addLog(`Scan finished: ${scanned} scanned, ${matched} matched, ${deals} deals`, deals > 0 ? 'success' : 'info');
        
        if (deals > 0) {
          toast(`Found ${deals} opportunit${deals > 1 ? 'ies' : 'y'}`, 'success');
        } else {
          toast('Search complete — no new finds', 'info');
        }
        await fetchDeals();
        await fetchStatus();
      } else {
        addLog(`Search failed: ${data.message || 'Unknown error'}`, 'error');
        toast(data.message || 'Search failed', 'error');
      }
    } catch (e) {
      addLog(`Search error: ${e.message}`, 'error');
      toast('Search failed', 'error');
    }
    
    btn.disabled = false;
    btn.textContent = 'Find';
  }

  async function fetchScrydexUsage() {
    try {
      const res = await fetch(`${API}/scrydex/usage`);
      const data = await res.json();

      if (data.status === 'ok' && data.data) {
        const usage = data.data;

        // Scrydex API response: total_credits_consumed, period_end
        const usedCredits = usage.total_credits_consumed || 0;
        const totalCredits = 50000; // Monthly limit
        const remainingCredits = totalCredits - usedCredits;

        // Calculate today's usage by tracking start-of-day value
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const storageKey = 'scrydex_daily_start';
        let todayUsed = 0;

        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
          if (stored.date === today) {
            // Same day - calculate difference
            todayUsed = usedCredits - stored.startCredits;
          } else {
            // New day - store current value as start
            localStorage.setItem(storageKey, JSON.stringify({
              date: today,
              startCredits: usedCredits
            }));
            todayUsed = 0;
          }
        } catch {
          todayUsed = 0;
        }

        // Update monthly usage display
        const creditsEl = document.getElementById('stat-credits');
        const maxEl = document.getElementById('stat-credits-max');
        if (creditsEl) creditsEl.textContent = usedCredits.toLocaleString();
        if (maxEl) maxEl.textContent = totalCredits.toLocaleString();

        // Update today's usage display
        const dailyEl = document.getElementById('stat-daily-budget');
        if (dailyEl) dailyEl.textContent = todayUsed.toLocaleString();

        // Update tooltips
        if (creditsEl) {
          const statEl = creditsEl.closest('.footer__stat');
          if (statEl) {
            const pct = ((usedCredits / totalCredits) * 100).toFixed(1);
            statEl.title = `Used: ${usedCredits.toLocaleString()} / ${totalCredits.toLocaleString()} (${pct}%)\nRemaining: ${remainingCredits.toLocaleString()}`;
          }
        }

        if (dailyEl) {
          const statEl = dailyEl.closest('.footer__stat');
          if (statEl) {
            statEl.title = `Credits consumed today: ${todayUsed.toLocaleString()}`;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch Scrydex usage:', e);
    }
  }

  async function clearDeals() {
    if (!confirm('Clear all opportunities?')) return;
    
    try {
      const res = await fetch(`${API}/arbitrage/clear`, { method: 'POST' });
      const data = await res.json();
      
      if (data.status === 'ok') {
        state.deals = [];
        state.dealIds.clear();
        renderDeals();
        toast('All cleared', 'success');
        addLog('Cleared all opportunities', 'info');
      }
    } catch (e) {
      toast('Failed to clear', 'error');
    }
  }

  // Show reason selection when "Report Wrong Match" is clicked
  function showFeedbackReasons() {
    const btn = $('#feedback-btn');
    const reasons = $('#feedback-reasons');
    const hint = $('#feedback-hint');

    btn.style.display = 'none';
    hint.style.display = 'none';
    reasons.style.display = 'block';
  }

  // Hide reason selection and show original button
  function hideFeedbackReasons() {
    const btn = $('#feedback-btn');
    const reasons = $('#feedback-reasons');
    const hint = $('#feedback-hint');

    reasons.style.display = 'none';
    btn.style.display = 'inline-flex';
    hint.style.display = 'block';
  }

  // Submit feedback with specific reason
  async function submitFeedbackWithReason(reason) {
    const deal = state.currentDeal;
    if (!deal) {
      toast('No deal selected', 'error');
      return;
    }

    const btn = $('#feedback-btn');
    const reasons = $('#feedback-reasons');
    const hint = $('#feedback-hint');

    // Disable all reason buttons during submission
    const reasonBtns = $$('.feedback-reason-btn');
    reasonBtns.forEach(b => b.disabled = true);

    const reasonLabels = {
      card_name: 'Card Name',
      card_number: 'Card Number',
      set: 'Set/Expansion',
      condition: 'Condition',
      wrong_card: 'Wrong Card',
      wrong_price: 'Wrong Price',
    };

    try {
      const res = await fetch(`${API}/training/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: deal.id,
          ebayTitle: deal.title,
          matchedCardName: deal.cardName,
          matchedExpansion: deal.expansionName || deal.expansion,
          matchedCardNumber: deal.cardNumber || '',
          confidence: deal.matchConfidence || 0,
          feedbackType: 'wrong_match',
          wrongMatchReason: reason,
        }),
      });
      const data = await res.json();

      if (data.status === 'ok') {
        // Mark deal as reported to prevent duplicates
        markDealReported(deal.id);

        // Remove deal from the dashboard
        state.deals = state.deals.filter(d => d.id !== deal.id);
        state.dealIds.delete(deal.id);

        // Close modal and re-render deals
        closeModal();
        renderDeals();

        toast(`Reported: ${reasonLabels[reason] || reason} — deal removed`, 'success');
        addLog(`Reported wrong match (${reasonLabels[reason]}): ${deal.cardName}`, 'info');
      } else {
        toast(data.message || 'Failed to submit feedback', 'error');
        reasonBtns.forEach(b => b.disabled = false);
      }
    } catch (e) {
      toast('Failed to submit feedback', 'error');
      reasonBtns.forEach(b => b.disabled = false);
    }
  }

  // Legacy function for backwards compatibility
  async function submitFeedback() {
    showFeedbackReasons();
  }

  // Mark deal as sold and remove from dashboard
  async function markAsSold() {
    const deal = state.currentDeal;
    if (!deal) {
      toast('No deal selected', 'error');
      return;
    }

    const btn = $('#sold-btn');
    const hint = document.querySelector('.sold-section__hint');

    // Disable button during request
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/>
      </svg>
      Removing...
    `;

    try {
      const res = await fetch(`/api/arbitrage/deal/${deal.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.status === 'ok') {
        // Remove from local state
        state.deals = state.deals.filter(d => d.id !== deal.id);
        state.dealIds.delete(deal.id);

        // Close modal and re-render
        closeModal();
        renderDeals();

        // Show success toast
        toast('Deal marked as sold and removed', 'success');
      } else {
        toast(data.message || 'Failed to remove deal', 'error');
        // Reset button
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Mark as Sold
        `;
      }
    } catch (e) {
      toast('Failed to remove deal', 'error');
      // Reset button
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Mark as Sold
      `;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI UPDATES
  // ─────────────────────────────────────────────────────────────────────────

  function updateToggleBtn() {
    const btn = $('#toggle-btn');
    
    if (state.running) {
      btn.classList.add('running');
      btn.textContent = 'Stop Scanner';
    } else {
      btn.classList.remove('running');
      btn.textContent = 'Start Scanner';
    }
  }

  function updateStatusIndicator() {
    const dot = $('.status-dot');
    const text = $('.status-text');

    if (state.running) {
      dot.classList.add('running');
      text.textContent = 'Scanning';
    } else {
      dot.classList.remove('running');
      text.textContent = 'Idle';
    }
  }

  function updateRateStatus() {
    const statusEl = $('#rate-status');
    if (!statusEl) return;

    const dot = statusEl.querySelector('.rate-status__dot');
    if (!dot) return;

    if (state.rateLive) {
      dot.classList.add('live');
      dot.classList.remove('fallback');
      statusEl.title = 'Live rate from Frankfurter API';
    } else {
      dot.classList.remove('live');
      dot.classList.add('fallback');
      statusEl.title = 'Using fallback rate (API unavailable)';
    }
  }

  function updateEbayStatus(rateLimited, retryAfterMs, verified = false, rateLimits = null) {
    const statusEl = $('#ebay-status');
    const textEl = $('#ebay-status-text');
    if (!statusEl || !textEl) return;

    const dot = statusEl.querySelector('.ebay-status__dot');
    if (!dot) return;

    // Remove all status classes
    dot.classList.remove('connected', 'rate-limited', 'error');

    if (rateLimited) {
      dot.classList.add('rate-limited');
      // Show reset time if available from API
      if (rateLimits?.resetAt) {
        const resetTime = new Date(rateLimits.resetAt);
        const now = new Date();
        const diffMs = resetTime - now;
        if (diffMs > 0) {
          const mins = Math.ceil(diffMs / 60000);
          textEl.textContent = `Reset ${mins}m`;
          statusEl.title = `Rate limited. Resets at ${resetTime.toLocaleTimeString()}. ${rateLimits.remaining ?? 0}/${rateLimits.limit ?? '?'} calls remaining.`;
        } else {
          textEl.textContent = 'Reset soon';
          statusEl.title = 'Rate limit should reset soon. Click to verify.';
        }
      } else {
        const mins = Math.ceil((retryAfterMs || 60000) / 60000);
        textEl.textContent = `Retry ${mins}m`;
        statusEl.title = `Rate limited by eBay API. Retry in ${mins} minute(s).${verified ? ' (verified)' : ' Click to verify.'}`;
      }
    } else {
      dot.classList.add('connected');
      // Show remaining calls if available
      if (rateLimits?.remaining !== undefined && rateLimits?.limit) {
        const pct = Math.round((rateLimits.remaining / rateLimits.limit) * 100);
        textEl.textContent = `${rateLimits.remaining}/${rateLimits.limit}`;
        statusEl.title = `eBay API: ${rateLimits.remaining} of ${rateLimits.limit} calls remaining (${pct}%). Click to refresh.`;
      } else {
        textEl.textContent = verified ? 'OK ✓' : 'OK';
        statusEl.title = verified ? 'eBay API connected and verified' : 'eBay API status (click to verify)';
      }
    }
  }

  // Verify eBay status by actually pinging the API
  async function verifyEbayStatus() {
    const statusEl = $('#ebay-status');
    const textEl = $('#ebay-status-text');
    if (!textEl) return;

    textEl.textContent = '...';
    if (statusEl) statusEl.title = 'Checking eBay API...';

    try {
      const res = await fetch(`${API}/ebay/status`);
      const data = await res.json();

      if (data.status === 'rate_limited') {
        updateEbayStatus(true, data.retryAfterMs, data.verified, data.rateLimits);
      } else if (data.status === 'connected') {
        updateEbayStatus(false, 0, true, data.rateLimits);
      } else {
        // Error state
        const dot = statusEl?.querySelector('.ebay-status__dot');
        if (dot) {
          dot.classList.remove('connected', 'rate-limited');
          dot.classList.add('error');
        }
        textEl.textContent = 'ERR';
        if (statusEl) statusEl.title = data.message || 'eBay API error';
      }
    } catch (e) {
      console.error('Failed to verify eBay status:', e);
      textEl.textContent = 'ERR';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDERING
  // ─────────────────────────────────────────────────────────────────────────

  function renderDeals() {
    console.log('renderDeals called:', {
      totalDeals: state.deals.length,
      filter: state.filter,
      cardTypeFilter: state.cardTypeFilter,
    });

    let deals = [...state.deals];

    // Filter by value
    if (state.filter === 'high') {
      deals = deals.filter(d => d.discountPercent >= 30 || d.profitGBP >= 20);
    } else if (state.filter === 'moderate') {
      deals = deals.filter(d => d.discountPercent >= 15 && d.discountPercent < 30);
    }

    // Filter by card type (raw/graded)
    if (state.cardTypeFilter === 'raw') {
      deals = deals.filter(d => !d.isGraded);
    } else if (state.cardTypeFilter === 'graded') {
      deals = deals.filter(d => d.isGraded);
    }

    console.log('renderDeals after filter:', {
      filteredDeals: deals.length,
    });

    deals.sort((a, b) => b.profitGBP - a.profitGBP);

    const grid = $('#deals-grid');
    const tableBody = $('#deals-table-body');
    const tableContainer = $('#deals-table-container');
    const empty = $('#empty-state');
    const featuredSection = $('#featured-section');

    $('#deals-count').textContent = deals.length;

    if (!deals.length) {
      console.log('renderDeals: no deals to show, showing empty state');
      grid.innerHTML = '';
      tableBody.innerHTML = '';
      empty.style.display = 'flex';
      featuredSection.hidden = true;
      return;
    }
    
    empty.style.display = 'none';
    
    const featured = deals[0];
    if (featured && featured.profitGBP >= 10) {
      renderFeatured(featured);
      featuredSection.hidden = false;
      deals = deals.slice(1);
    } else {
      featuredSection.hidden = true;
    }
    
    if (state.view === 'grid') {
      grid.style.display = 'grid';
      tableContainer.hidden = true;
      renderGridView(deals, grid);
    } else {
      grid.style.display = 'none';
      tableContainer.hidden = false;
      renderTableView(deals, tableBody);
    }
  }

  function renderFeatured(deal) {
    const ebayUrl = buildEbayUrl(deal);
    console.log('Featured CTA URL:', ebayUrl);
    
    const condition = getConditionLabel(deal);
    const cardImage = deal.imageUrl || deal.scrydexImageUrl || '';
    const logo = deal.expansionLogo || '';
    const intl = isInternational(deal);
    
    $('#featured-name').textContent = deal.cardName;
    $('#featured-expansion').textContent = deal.expansionName || deal.expansion || '';
    $('#featured-number').textContent = `#${deal.cardNumber || '—'}`;
    $('#featured-condition').textContent = condition;
    $('#featured-discount').textContent = `-${deal.discountPercent.toFixed(0)}%`;
    
    // Use logo instead of symbol
    const logoEl = $('#featured-logo');
    if (logo) {
      logoEl.src = logo;
      logoEl.style.display = 'inline';
    } else {
      logoEl.style.display = 'none';
    }
    
    // International badge
    const intlBadge = $('#featured-intl-badge');
    if (intlBadge) {
      intlBadge.hidden = !intl;
    }
    
    $('#featured-img').src = cardImage;
    
    const shipping = deal.shippingGBP || 0;
    $('#featured-ebay').textContent = price(deal.ebayPriceGBP);
    $('#featured-shipping').textContent = shipping > 0 ? price(shipping) : 'Free';
    $('#featured-total').textContent = price(deal.totalCostGBP);
    $('#featured-market').textContent = price(deal.marketValueGBP);
    $('#featured-profit').textContent = `+${price(deal.profitGBP)}`;
    
    const ctaEl = $('#featured-cta');
    ctaEl.href = ebayUrl;
    ctaEl.onclick = function(e) {
      console.log('Featured CTA clicked, href is:', this.href);
      e.stopPropagation();
    };
    
    const card = $('#featured-card');
    card.dataset.dealId = deal.id;
  }

  function renderGridView(deals, container) {
    container.innerHTML = deals.map((deal) => {
      const condition = getConditionLabel(deal);
      const cardImage = deal.imageUrl || deal.scrydexImageUrl || '';
      const logo = deal.expansionLogo || '';
      const confidence = deal.matchConfidence || 0;
      const match = getMatchLevel(confidence);
      const tier = deal.tier || 'standard';
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      const cardNumber = deal.cardNumber ? `#${deal.cardNumber}` : '';

      return `
        <article class="deal-card deal-card--${tier}" data-id="${deal.id}">
          <div class="deal-card__image-wrap">
            <img class="deal-card__image" src="${cardImage}" alt="${esc(deal.cardName)}" loading="lazy" onerror="this.style.opacity='0.3'">
            <span class="deal-card__discount">-${deal.discountPercent.toFixed(0)}%</span>
            <span class="deal-card__tier deal-card__tier--${tier}">${tierLabel}</span>
          </div>
          <div class="deal-card__info">
            <div class="deal-card__header">
              <h3 class="deal-card__name">${esc(deal.cardName)}</h3>
              ${cardNumber ? `<span class="deal-card__number">${cardNumber}</span>` : ''}
            </div>
            <div class="deal-card__meta">
              ${logo ? `<img class="deal-card__logo" src="${logo}" alt="">` : ''}
              <span>${esc(deal.expansionName || deal.expansion)}</span>
              <span class="deal-card__condition">${esc(condition)}</span>
            </div>
            <div class="deal-card__match">
              <span class="match-badge match-badge--${match.level}">
                <span class="match-badge__dot"></span>
                ${match.label}
              </span>
            </div>
            <div class="deal-card__prices">
              <div class="deal-card__price-row">
                <span class="deal-card__price-label">Buy</span>
                <span class="deal-card__price-value">${price(deal.totalCostGBP)}</span>
              </div>
              <div class="deal-card__price-row">
                <span class="deal-card__price-label">Market</span>
                <span class="deal-card__price-value deal-card__price-value--market">${price(deal.marketValueGBP)}</span>
              </div>
              <div class="deal-card__price-row deal-card__price-row--profit">
                <span class="deal-card__price-label">Profit</span>
                <span class="deal-card__price-value deal-card__price-value--profit">+${price(deal.profitGBP)}</span>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderTableView(deals, container) {
    container.innerHTML = deals.map(deal => {
      const ebayUrl = buildEbayUrl(deal);
      const condition = getConditionLabel(deal);
      const cardImage = deal.imageUrl || deal.scrydexImageUrl || '';
      const confidence = deal.matchConfidence || 0;
      const match = getMatchLevel(confidence);
      const intl = isInternational(deal);
      
      return `
        <tr data-id="${deal.id}" class="${intl ? 'deals-table__row--intl' : ''}">
          <td>
            <div class="deals-table__card">
              <img class="deals-table__thumb" src="${cardImage}" alt="">
              <span class="deals-table__name">${esc(deal.cardName)}</span>
              ${intl ? '<span class="deals-table__intl" title="International">🌍</span>' : ''}
            </div>
          </td>
          <td>${esc(deal.expansionName || deal.expansion)}</td>
          <td>
            ${esc(condition)}
            <span class="match-badge match-badge--${match.level}">
              <span class="match-badge__dot"></span>
              ${match.label}
            </span>
          </td>
          <td class="text-right">${price(deal.totalCostGBP)}</td>
          <td class="text-right">${price(deal.marketValueGBP)}</td>
          <td class="text-right deals-table__profit">+${price(deal.profitGBP)}</td>
          <td class="text-right deals-table__margin">${deal.discountPercent.toFixed(1)}%</td>
          <td>
            <a href="${ebayUrl}" target="_blank" rel="noopener noreferrer" class="deals-table__cta" onclick="event.stopPropagation();">
              Buy →
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODAL
  // ─────────────────────────────────────────────────────────────────────────

  function openModal(deal) {
    if (!deal) return;

    console.log('Opening modal for deal:', deal);

    state.currentDeal = deal;
    const overlay = $('#modal-overlay');

    // Reset feedback section - check if already reported
    const feedbackBtn = $('#feedback-btn');
    const feedbackReasons = $('#feedback-reasons');
    const feedbackHint = $('#feedback-hint');
    const alreadyReported = isDealReported(deal.id);

    if (feedbackBtn) {
      if (alreadyReported) {
        // Show already reported state
        feedbackBtn.disabled = true;
        feedbackBtn.classList.add('feedback-btn--success');
        feedbackBtn.style.display = 'inline-flex';
        feedbackBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Already Reported
        `;
      } else {
        // Reset to initial state
        feedbackBtn.disabled = false;
        feedbackBtn.classList.remove('feedback-btn--success');
        feedbackBtn.style.display = 'inline-flex';
        feedbackBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Report Wrong Match
        `;
      }
    }
    if (feedbackReasons) {
      feedbackReasons.style.display = 'none';
    }
    if (feedbackHint) {
      feedbackHint.textContent = alreadyReported ? 'You have already reported this match' : 'Help improve matching accuracy';
      feedbackHint.style.display = 'block';
    }
    // Re-enable reason buttons (only matters if not already reported)
    $$('.feedback-reason-btn').forEach(b => b.disabled = alreadyReported);

    // Reset sold button
    const soldBtn = $('#sold-btn');
    if (soldBtn) {
      soldBtn.disabled = false;
      soldBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Mark as Sold
      `;
    }

    // Modal reference image should ONLY use Scrydex card image, NOT eBay listing image
    // Deal cards show eBay listing image, modal shows official card reference
    const referenceImg = deal.scrydexImageUrl || '';
    const condition = getConditionLabel(deal);
    const logo = deal.expansionLogo || '';
    const symbol = deal.expansionSymbol || '';
    
    // Reference image
    $('#modal-reference-img').src = referenceImg;
    
    // Header
    $('#modal-title').textContent = deal.cardName;
    $('#modal-expansion').textContent = deal.expansionName || deal.expansion || '';
    $('#modal-number').textContent = `#${deal.cardNumber || '—'}`;
    
    // eBay listing title
    $('#modal-listing-title').textContent = deal.title || '';
    
    // Expansion logo
    const logoEl = $('#modal-logo');
    if (logo) {
      logoEl.src = logo;
      logoEl.style.display = 'inline';
    } else {
      logoEl.style.display = 'none';
    }
    
    // Expansion symbol
    const symbolEl = $('#modal-symbol');
    if (symbol) {
      symbolEl.src = symbol;
      symbolEl.style.display = 'inline';
    } else {
      symbolEl.style.display = 'none';
    }
    
    // Release date
    const releaseEl = $('#modal-release');
    const releaseDivider = $('#modal-release-divider');
    const expansion = deal.scrydexExpansion;
    if (expansion && expansion.release_date) {
      // Format: "1999/01/09" -> "Jan 1999"
      const parts = expansion.release_date.split('/');
      if (parts.length >= 2) {
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        releaseEl.textContent = `${monthNames[month - 1]} ${year}`;
        releaseEl.style.display = 'inline';
        if (releaseDivider) releaseDivider.style.display = 'inline';
      } else {
        releaseEl.textContent = expansion.release_date;
        releaseEl.style.display = 'inline';
        if (releaseDivider) releaseDivider.style.display = 'inline';
      }
    } else {
      releaseEl.style.display = 'none';
      if (releaseDivider) releaseDivider.style.display = 'none';
    }
    
    // Opportunity breakdown - new grid layout
    const shipping = deal.shippingGBP || 0;
    $('#modal-total-cost').textContent = price(deal.totalCostGBP);
    $('#modal-ebay-price').textContent = price(deal.ebayPriceGBP);
    $('#modal-shipping').textContent = shipping > 0 ? price(shipping) : 'Free';
    $('#modal-market-value').textContent = price(deal.marketValueGBP);
    $('#modal-condition').textContent = `(${condition})`;
    $('#modal-profit').textContent = `+${price(deal.profitGBP)}`;
    $('#modal-margin').textContent = `${deal.discountPercent.toFixed(1)}%`;
    
    // CTA
    const ebayUrl = buildEbayUrl(deal);
    console.log('Setting modal CTA href to:', ebayUrl);
    const ctaEl = $('#modal-cta');
    ctaEl.href = ebayUrl;
    ctaEl.onclick = function(e) {
      console.log('CTA clicked, href is:', this.href);
    };
    
    // Prices
    renderModalPrices(deal);
    
    // Match info with details (in sidebar)
    renderMatchInfo(deal);
    
    // Seller info (in sidebar)
    renderSellerInfo(deal);
    
    // Show modal
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
    state.currentDeal = null;
  }

  function renderMatchInfo(deal) {
    const confidence = deal.matchConfidence || 0;
    const match = getMatchLevel(confidence);
    
    // Circular gauge
    const circumference = 125.6;
    const offset = circumference - (confidence / 100) * circumference;
    
    const fill = $('#match-gauge-fill');
    fill.style.strokeDashoffset = offset;
    fill.className.baseVal = `match-info__fill match-info__fill--${match.level}`;
    
    $('#match-percent').textContent = `${Math.round(confidence)}%`;
    $('#match-label').textContent = match.label;
    $('#match-desc').textContent = match.desc;
    
    // Match breakdown details
    const breakdown = $('#match-breakdown');
    const details = deal.matchDetails || deal.cardDetails || {};
    
    let breakdownHtml = '';
    
    // Build breakdown from available data
    const items = [];
    
    // Card number match
    if (deal.cardNumber) {
      items.push({ label: 'Card Number', value: `#${deal.cardNumber}`, status: 'ok' });
    }
    
    // Expansion match
    if (deal.expansionName || deal.expansion) {
      items.push({ label: 'Expansion', value: deal.expansionName || deal.expansion, status: 'ok' });
    }
    
    // Grading if applicable
    if (deal.isGraded) {
      items.push({ label: 'Grading', value: `${deal.gradingCompany || ''} ${deal.grade || ''}`.trim(), status: 'ok' });
    }
    
    // Add parsed info if available - Holo types BEFORE variant
    if (details.isFirstEdition) {
      items.push({ label: '1st Edition', value: 'Detected', status: 'ok' });
    }
    if (details.isHolo) {
      items.push({ label: 'Holo', value: 'Detected', status: 'ok' });
    }
    if (details.isReverseHolo) {
      items.push({ label: 'Reverse Holo', value: 'Detected', status: 'ok' });
    }
    
    // Variant detection (now after holo)
    if (deal.detectedVariant) {
      items.push({ label: 'Variant', value: deal.detectedVariant, status: 'ok' });
    }

    // Detected condition (raw cards only)
    if (!deal.isGraded && deal.rawCondition) {
      // Use abbreviated condition codes
      const condLabel = deal.rawCondition;
      const source = deal.conditionSource || 'default';
      const sourceInfo = {
        'condition_descriptor': { class: 'source--verified', tip: 'From eBay condition descriptor' },
        'item_specifics': { class: 'source--good', tip: 'From Item Specifics' },
        'title': { class: 'source--parsed', tip: 'Parsed from listing title' },
        'default': { class: 'source--default', tip: 'Assumed LP (no condition data)' }
      };
      const info = sourceInfo[source] || sourceInfo['default'];
      items.push({ label: 'Condition', value: condLabel, status: 'ok', sourceClass: info.class, sourceTip: info.tip });
    }

    breakdownHtml = items.map(item => {
      const valueClass = item.sourceClass ? `match-info__item-value ${item.sourceClass}` : 'match-info__item-value';
      const titleAttr = item.sourceTip ? ` title="${item.sourceTip}"` : '';
      return `
      <div class="match-info__item match-info__item--${item.status}">
        <span class="match-info__item-label">${item.label}</span>
        <span class="${valueClass}"${titleAttr}>${esc(item.value)}</span>
      </div>
    `;
    }).join('');
    
    breakdown.innerHTML = breakdownHtml || '<div class="match-info__empty">No match details available</div>';
  }

  function renderSellerInfo(deal) {
    const seller = deal.seller || '—';
    const feedback = deal.sellerFeedback;
    // Try multiple possible field names for feedback percentage
    const feedbackPercent = deal.sellerFeedbackPercent || deal.feedbackPercent || deal.sellerFeedbackPercentage;

    $('#seller-name').textContent = seller;

    // Show feedback count and percentage if available
    if (feedback !== undefined && feedback !== null) {
      let feedbackText = feedback.toLocaleString();
      if (feedbackPercent !== undefined && feedbackPercent !== null) {
        feedbackText += ` (${parseFloat(feedbackPercent).toFixed(1)}%)`;
      }
      $('#seller-feedback').textContent = feedbackText;
    } else {
      $('#seller-feedback').textContent = '—';
    }
  }

  function renderCardDetails(deal) {
    const container = $('#modal-card-details');
    const section = $('#card-details-section');
    const card = deal.scrydexCard;
    
    if (!card) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    const details = [];
    
    if (card.hp) details.push({ label: 'HP', value: card.hp });
    if (card.types?.length) details.push({ label: 'Type', value: card.types.join(', ') });
    if (card.supertype) details.push({ label: 'Supertype', value: card.supertype });
    if (card.subtypes?.length) details.push({ label: 'Subtype', value: card.subtypes.join(', ') });
    if (card.rarity) details.push({ label: 'Rarity', value: card.rarity });
    if (card.artist) details.push({ label: 'Artist', value: card.artist });
    
    container.innerHTML = details.map(d => `
      <div class="card-detail">
        <span class="card-detail__label">${d.label}:</span>
        <span class="card-detail__value">${esc(String(d.value))}</span>
      </div>
    `).join('');
  }

  function renderModalPrices(deal) {
    const allPrices = deal.allPrices || [];

    const rawPrices = allPrices.filter(p => p.type === 'raw');
    const gradedPrices = allPrices.filter(p => p.type === 'graded');

    const rawSection = $('#raw-prices-section');
    const gradedSection = $('#graded-prices-section');

    if (rawPrices.length > 0) {
      rawSection.style.display = 'block';
      renderRawPrices(rawPrices);
    } else {
      rawSection.style.display = 'none';
    }

    // For graded deals, always show the graded section with all grades
    // If no price data, show the deal's grading company with all grades as '—'
    if (deal.isGraded || gradedPrices.length > 0) {
      gradedSection.style.display = 'block';
      renderGradedPrices(gradedPrices, deal);
    } else {
      gradedSection.style.display = 'none';
    }
  }

  function renderRawPrices(prices) {
    const grid = $('#raw-prices-grid');
    
    const seen = new Set();
    const uniquePrices = prices.filter(p => {
      const key = p.condition || 'NM';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    const conditionOrder = ['NM', 'LP', 'MP', 'HP', 'DM'];
    uniquePrices.sort((a, b) => {
      return conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition);
    });
    
    grid.innerHTML = uniquePrices.map(p => {
      const gbpValue = toGBP(p.market || 0);
      return `
        <div class="price-cell">
          <span class="price-cell__label">${p.condition || 'NM'}</span>
          <span class="price-cell__value">${price(gbpValue)}</span>
        </div>
      `;
    }).join('');
  }

  function renderGradedPrices(prices, deal = null) {
    const grid = $('#graded-prices-grid');
    const tabs = $('#graded-tabs');

    // Common grading companies - always show tabs for these
    const commonCompanies = ['PSA', 'CGC', 'BGS'];

    // Get companies from price data
    const dataCompanies = [...new Set(prices.map(p => p.company).filter(Boolean))];

    // Merge: show common companies + any additional from data
    const allCompanies = [...new Set([...commonCompanies, ...dataCompanies])];

    // Use deal's grading company as default if available
    if (deal?.gradingCompany && !state.selectedGradingCompany) {
      state.selectedGradingCompany = deal.gradingCompany;
    }

    // Ensure selected company is valid
    if (!allCompanies.includes(state.selectedGradingCompany)) {
      state.selectedGradingCompany = deal?.gradingCompany || allCompanies[0] || 'PSA';
    }

    // Render company tabs
    tabs.innerHTML = allCompanies.map(company => `
      <button class="graded-tab ${company === state.selectedGradingCompany ? 'graded-tab--active' : ''}"
              data-company="${company}">
        ${company}
      </button>
    `).join('');

    // Get prices for selected company
    const companyPrices = prices.filter(p => p.company === state.selectedGradingCompany);

    // All common grades to display (10 down to 1)
    const targetGrades = ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5.5', '5', '4', '3', '2', '1'];

    // Highlight the deal's grade if this is the matching company
    const dealGrade = deal?.isGraded && deal?.gradingCompany === state.selectedGradingCompany ? deal.grade : null;

    grid.innerHTML = targetGrades.map(grade => {
      const priceData = companyPrices.find(p => p.grade === grade);
      const gbpValue = priceData ? toGBP(priceData.market || priceData.mid || 0) : null;
      const isCurrentGrade = dealGrade && dealGrade.toString() === grade;

      return `
        <div class="price-cell ${!priceData ? 'price-cell--empty' : ''} ${isCurrentGrade ? 'price-cell--current' : ''}">
          <span class="price-cell__label">${grade}</span>
          <span class="price-cell__value">${gbpValue ? price(gbpValue) : '—'}</span>
        </div>
      `;
    }).join('');

    // Add click handlers to tabs
    tabs.querySelectorAll('.graded-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.selectedGradingCompany = tab.dataset.company;
        tabs.querySelectorAll('.graded-tab').forEach(t => t.classList.remove('graded-tab--active'));
        tab.classList.add('graded-tab--active');
        renderGradedPrices(prices, deal);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  function handleCardClick(e) {
    const card = e.target.closest('.deal-card');
    if (!card) return;
    
    if (e.target.closest('a')) return;
    
    const dealId = card.dataset.id;
    const deal = state.deals.find(d => d.id === dealId);
    if (deal) openModal(deal);
  }

  function handleFeaturedClick(e) {
    const card = e.target.closest('.featured__card');
    if (!card) return;
    
    if (e.target.closest('.featured__cta')) return;
    
    const dealId = card.dataset.dealId;
    const deal = state.deals.find(d => d.id === dealId);
    if (deal) openModal(deal);
  }

  function handleTableRowClick(e) {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    
    if (e.target.closest('.deals-table__cta')) return;
    
    const dealId = row.dataset.id;
    const deal = state.deals.find(d => d.id === dealId);
    if (deal) openModal(deal);
  }

  function handleViewToggle(e) {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    
    const view = btn.dataset.view;
    if (view === state.view) return;
    
    state.view = view;
    
    $$('.view-btn').forEach(b => b.classList.remove('view-btn--active'));
    btn.classList.add('view-btn--active');
    
    renderDeals();
  }

  function handleFilterClick(e) {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    state.filter = btn.dataset.filter;
    $$('.filter-btn').forEach(f => f.classList.remove('filter-btn--active'));
    btn.classList.add('filter-btn--active');
    renderDeals();
  }

  function handleTypeFilterClick(e) {
    const btn = e.target.closest('.type-filter-btn');
    if (!btn) return;

    state.cardTypeFilter = btn.dataset.type;
    $$('.type-filter-btn').forEach(f => f.classList.remove('type-filter-btn--active'));
    btn.classList.add('type-filter-btn--active');
    renderDeals();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  function init() {
    initTheme();
    loadReportedDeals();
    loadLogs();
    renderLogs();
    
    function on(selector, event, handler) {
      const el = $(selector);
      if (el) {
        el.addEventListener(event, handler);
      } else {
        console.warn(`Element not found: ${selector}`);
      }
    }
    
    on('#toggle-btn', 'click', toggleScanner);
    on('#search-btn', 'click', triggerSearch);
    on('#clear-btn', 'click', clearDeals);
    on('#theme-toggle', 'click', toggleTheme);
    on('#log-toggle', 'click', toggleLog);
    on('#log-clear', 'click', clearLogs);
    on('#log-close', 'click', closeLog);
    on('#diagnostics-toggle', 'click', toggleDiagnostics);
    on('#diagnostics-close', 'click', closeDiagnostics);
    on('#diagnostics-copy', 'click', copyDiagnosticsJSON);
    on('#diagnostics-reset', 'click', resetDiagnostics);

    // eBay status badge - click to verify
    on('#ebay-status', 'click', verifyEbayStatus);

    // Diagnostics tab switching
    $$('.diagnostics-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        if (view) switchDiagnosticsView(view);
      });
    });

    on('#search-input', 'keydown', (e) => {
      if (e.key === 'Enter') triggerSearch();
    });
    
    $$('.filter-btn').forEach(f => f.addEventListener('click', handleFilterClick));
    $$('.type-filter-btn').forEach(f => f.addEventListener('click', handleTypeFilterClick));
    $$('.view-btn').forEach(b => b.addEventListener('click', handleViewToggle));
    
    on('#deals-grid', 'click', handleCardClick);
    on('#deals-table-body', 'click', handleTableRowClick);
    on('#featured-section', 'click', handleFeaturedClick);
    
    on('#modal-close', 'click', closeModal);
    on('#modal-overlay', 'click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });
    on('#feedback-btn', 'click', submitFeedback);
    on('#feedback-cancel', 'click', hideFeedbackReasons);
    on('#sold-btn', 'click', markAsSold);

    // Feedback reason buttons - use event delegation
    const feedbackReasons = $('#feedback-reasons');
    if (feedbackReasons) {
      feedbackReasons.addEventListener('click', (e) => {
        const reasonBtn = e.target.closest('.feedback-reason-btn');
        if (reasonBtn) {
          const reason = reasonBtn.dataset.reason;
          if (reason) {
            submitFeedbackWithReason(reason);
          }
        }
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
    
    fetchDeals();
    fetchStatus();
    fetchScrydexUsage();
    fetchActivityLogs(); // Fetch server-side activity logs

    setInterval(fetchDeals, 20000);
    setInterval(fetchStatus, 15000);
    setInterval(fetchScrydexUsage, 60000); // Every 60 seconds for more responsive display
    setInterval(fetchActivityLogs, 30000); // Refresh activity logs every 30 seconds

    console.log('📋 PokeSnipe Collector\'s Study V5 initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();