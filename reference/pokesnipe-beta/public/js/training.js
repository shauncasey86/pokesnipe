// ═══════════════════════════════════════════════════════════════════════════
// POKESNIPE — Parser Training Dashboard
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const API = '/api/training';

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  const state = {
    stats: null,
    analytics: null,
    pending: [],
    feedback: [],
    currentSection: 'overview',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Theme
  // ─────────────────────────────────────────────────────────────────────────

  function initTheme() {
    const saved = localStorage.getItem('pokesnipe-theme');
    document.documentElement.setAttribute('data-theme', saved || 'dark');
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pokesnipe-theme', next);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatTime(isoString) {
    return new Date(isoString).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────────────────────────────────

  function switchSection(sectionId) {
    state.currentSection = sectionId;

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(section => {
      section.classList.toggle('active', section.id === `section-${sectionId}`);
    });

    // Load section data
    switch (sectionId) {
      case 'overview':
        fetchStats();
        break;
      case 'analytics':
        fetchAnalytics();
        break;
      case 'review':
        fetchPending();
        break;
      case 'feedback':
        fetchFeedback();
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API Functions
  // ─────────────────────────────────────────────────────────────────────────

  async function fetchStats() {
    try {
      const res = await fetch(`${API}/stats`);
      const data = await res.json();

      if (data.status === 'ok') {
        state.stats = data.corpus;
        state.analytics = data.analytics;
        renderOverview();
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await fetch(`${API}/analytics`);
      const data = await res.json();

      if (data.status === 'ok') {
        state.analytics = data.analytics;
        renderAnalytics();
      }
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    }
  }

  async function fetchPending() {
    try {
      const res = await fetch(`${API}/pending?limit=20`);
      const data = await res.json();

      if (data.status === 'ok') {
        state.pending = data.entries;
        renderPending();
      }
    } catch (e) {
      console.error('Failed to fetch pending:', e);
    }
  }

  async function fetchFeedback() {
    try {
      const res = await fetch(`${API}/feedback?limit=50`);
      const data = await res.json();

      if (data.status === 'ok') {
        state.feedback = data.feedback;
        renderFeedback();
      }
    } catch (e) {
      console.error('Failed to fetch feedback:', e);
    }
  }

  async function reviewEntry(id, status, notes = null) {
    try {
      const body = { status };
      if (notes) body.notes = notes;

      const res = await fetch(`${API}/review/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        const reason = notes ? ` (${notes})` : '';
        showToast(`Marked as ${status}${reason}`);
        // Remove from pending list
        state.pending = state.pending.filter(e => e.id !== id);
        renderPending();
      } else {
        showToast(data.message || 'Failed to save', true);
      }
    } catch (e) {
      console.error('Failed to review entry:', e);
      showToast('Failed to save', true);
    }
  }

  // Show reason selection for incorrect reviews
  function showIncorrectReasons(id) {
    // Hide all other reason panels first
    document.querySelectorAll('.review-reasons').forEach(el => el.classList.remove('show'));
    // Show this one
    const panel = document.getElementById(`reasons-${id}`);
    if (panel) panel.classList.add('show');
  }

  function hideIncorrectReasons(id) {
    const panel = document.getElementById(`reasons-${id}`);
    if (panel) panel.classList.remove('show');
  }

  function submitIncorrectWithReason(id, reason) {
    const reasonLabels = {
      card_name: 'Wrong Card Name',
      card_number: 'Wrong Card Number',
      set: 'Wrong Set/Expansion',
      condition: 'Wrong Condition',
      wrong_card: 'Wrong Scrydex Match',
      wrong_price: 'Wrong Price Used',
      wrong_variant: 'Wrong Variant',
      no_scrydex_match: 'No Scrydex Match Found',
    };
    reviewEntry(id, 'incorrect', reasonLabels[reason] || reason);
  }

  async function runTests() {
    const btn = document.getElementById('run-tests-btn');
    btn.disabled = true;
    btn.textContent = 'Running...';

    try {
      const res = await fetch(`${API}/test`, { method: 'POST' });
      const data = await res.json();

      if (data.status === 'ok') {
        renderTestResults(data.results);
      } else {
        showToast(data.message || 'Test failed', true);
      }
    } catch (e) {
      console.error('Failed to run tests:', e);
      showToast('Test failed', true);
    }

    btn.disabled = false;
    btn.textContent = 'Run Regression Tests';
  }

  async function parseTitle(title) {
    try {
      const res = await fetch(`${API}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        return data.parsed;
      }
    } catch (e) {
      console.error('Failed to parse title:', e);
    }
    return null;
  }

  async function exportCorpus() {
    window.location.href = `${API}/export`;
    showToast('Downloading corpus...');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering - Overview
  // ─────────────────────────────────────────────────────────────────────────

  function renderOverview() {
    const { stats, analytics } = state;

    if (stats) {
      document.getElementById('stat-total').textContent = stats.total || 0;
      document.getElementById('stat-pending').textContent = stats.pending || 0;
      document.getElementById('stat-verified').textContent = stats.verified || 0;
      document.getElementById('stat-incorrect').textContent = stats.incorrect || 0;
    }

    if (analytics) {
      document.getElementById('stat-processed').textContent = analytics.totalProcessed || 0;
      document.getElementById('stat-deals').textContent = analytics.totalDeals || 0;
      document.getElementById('stat-avg-conf').textContent = analytics.averageConfidence || 0;

      const matchRate = analytics.totalProcessed > 0
        ? Math.round((analytics.totalMatched / analytics.totalProcessed) * 100)
        : 0;
      document.getElementById('stat-match-rate').textContent = `${matchRate}%`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering - Analytics
  // ─────────────────────────────────────────────────────────────────────────

  function renderAnalytics() {
    const { analytics } = state;
    if (!analytics) return;

    // Confidence distribution
    const confChart = document.getElementById('confidence-chart');
    const confDist = analytics.confidenceDistribution || {};
    const confTotal = Object.values(confDist).reduce((a, b) => a + b, 0) || 1;

    confChart.innerHTML = [
      { label: 'Perfect (85+)', value: confDist.perfect || 0, class: 'perfect' },
      { label: 'High (70-84)', value: confDist.high || 0, class: 'high' },
      { label: 'Medium (50-69)', value: confDist.medium || 0, class: 'medium' },
      { label: 'Low (<50)', value: confDist.low || 0, class: 'low' },
    ].map(item => `
      <div class="bar-row">
        <span class="bar-label">${item.label}</span>
        <div class="bar-track">
          <div class="bar-fill ${item.class}" style="width: ${(item.value / confTotal) * 100}%"></div>
        </div>
        <span class="bar-value">${item.value}</span>
      </div>
    `).join('');

    // Top patterns
    const patternsChart = document.getElementById('patterns-chart');
    const topPatterns = analytics.topPatterns || [];
    const maxPattern = topPatterns[0]?.[1] || 1;

    patternsChart.innerHTML = topPatterns.slice(0, 10).map(([name, count]) => `
      <div class="bar-row">
        <span class="bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <div class="bar-track">
          <div class="bar-fill pattern" style="width: ${(count / maxPattern) * 100}%"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>
    `).join('') || '<div class="empty-state"><p>No pattern data yet</p></div>';

    // Skip reasons
    const skipChart = document.getElementById('skip-chart');
    const skipReasons = analytics.skipReasons || [];
    const maxSkip = skipReasons[0]?.[1] || 1;

    skipChart.innerHTML = skipReasons.slice(0, 10).map(([reason, count]) => `
      <div class="bar-row">
        <span class="bar-label" title="${escapeHtml(reason)}">${escapeHtml(reason)}</span>
        <div class="bar-track">
          <div class="bar-fill low" style="width: ${(count / maxSkip) * 100}%"></div>
        </div>
        <span class="bar-value">${count}</span>
      </div>
    `).join('') || '<div class="empty-state"><p>No skip data yet</p></div>';

    // Capture reasons (from corpus stats)
    const captureChart = document.getElementById('capture-chart');
    if (state.stats?.byReason) {
      const byReason = state.stats.byReason;
      const maxCapture = Math.max(...Object.values(byReason), 1);

      captureChart.innerHTML = Object.entries(byReason)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `
          <div class="bar-row">
            <span class="bar-label">${escapeHtml(reason)}</span>
            <div class="bar-track">
              <div class="bar-fill medium" style="width: ${(count / maxCapture) * 100}%"></div>
            </div>
            <span class="bar-value">${count}</span>
          </div>
        `).join('');
    } else {
      captureChart.innerHTML = '<div class="empty-state"><p>No capture data yet</p></div>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering - Pending Review
  // ─────────────────────────────────────────────────────────────────────────

  function renderPending() {
    const container = document.getElementById('review-list');

    if (state.pending.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">✅</div>
          <h3 class="empty-state__title">All caught up!</h3>
          <p>No pending cases to review</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.pending.map(entry => {
      const parsed = entry.parsed || {};
      const variant = parsed.variant || {};

      return `
        <div class="review-card" data-id="${entry.id}">
          <div class="review-card__header">
            <span class="review-card__title">${formatTime(entry.timestamp)}</span>
            <span class="review-card__badge ${entry.captureReason}">${entry.captureReason.replace(/_/g, ' ')}</span>
          </div>
          <div class="review-card__body">
            <div class="review-card__ebay-title">${escapeHtml(entry.ebayTitle)}</div>

            <div class="parsed-grid">
              <div class="parsed-item">
                <span class="parsed-item__label">Card Name</span>
                <span class="parsed-item__value ${!parsed.cardName ? 'empty' : ''}">${parsed.cardName || 'Not detected'}</span>
              </div>
              <div class="parsed-item">
                <span class="parsed-item__label">Card Number</span>
                <span class="parsed-item__value ${!parsed.cardNumber ? 'empty' : ''}">${parsed.cardNumber || 'Not detected'}</span>
              </div>
              <div class="parsed-item">
                <span class="parsed-item__label">Set Name</span>
                <span class="parsed-item__value ${!parsed.setName ? 'empty' : ''}">${parsed.setName || 'Not detected'}</span>
              </div>
              <div class="parsed-item">
                <span class="parsed-item__label">Confidence</span>
                <span class="parsed-item__value">${parsed.confidenceScore || 0} (${parsed.confidence || 'N/A'})</span>
              </div>
              <div class="parsed-item">
                <span class="parsed-item__label">Graded</span>
                <span class="parsed-item__value">${parsed.isGraded ? `${parsed.gradingCompany} ${parsed.grade}` : 'No'}</span>
              </div>
              <div class="parsed-item">
                <span class="parsed-item__label">Variant</span>
                <span class="parsed-item__value">${variant.variantName || 'Standard'}</span>
              </div>
            </div>

            ${entry.scrydexMatched ? `
              <div style="font-size: 12px; color: var(--profit); margin-bottom: var(--space-md);">
                ✓ Matched: ${escapeHtml(entry.scrydexCardName || '')} (${escapeHtml(entry.expansionMatched || '')})
              </div>
            ` : `
              <div style="font-size: 12px; color: var(--accent); margin-bottom: var(--space-md);">
                ✗ No Scrydex match found
              </div>
            `}

            <div class="review-card__actions">
              <button class="review-btn correct" onclick="window.reviewEntry('${entry.id}', 'verified')">
                ✓ Correct
              </button>
              <button class="review-btn incorrect" onclick="window.showIncorrectReasons('${entry.id}')">
                ✗ Incorrect
              </button>
              <button class="review-btn skip" onclick="window.reviewEntry('${entry.id}', 'skipped')">
                Skip
              </button>
            </div>

            <!-- Reason selection for incorrect -->
            <div class="review-reasons" id="reasons-${entry.id}">
              <div class="review-reasons__title">What was incorrect?</div>
              <div class="review-reasons__grid">
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'card_name')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  Card Name
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'card_number')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>
                  </svg>
                  Card Number
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'set')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                  Set/Expansion
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'condition')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Condition
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'wrong_card')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Wrong Card
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'wrong_price')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                  Wrong Price
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'wrong_variant')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
                  </svg>
                  Wrong Variant
                </button>
                <button class="reason-btn" onclick="window.submitIncorrectWithReason('${entry.id}', 'no_scrydex_match')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                  No Match Found
                </button>
              </div>
              <button class="review-reasons__cancel" onclick="window.hideIncorrectReasons('${entry.id}')">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering - Test Results
  // ─────────────────────────────────────────────────────────────────────────

  function renderTestResults(results) {
    const container = document.getElementById('test-results');
    const summary = document.getElementById('test-summary');
    const list = document.getElementById('test-list');

    container.style.display = 'block';

    summary.innerHTML = `
      <div class="test-stat">
        <div class="test-stat__value">${results.totalTests}</div>
        <div class="test-stat__label">Total</div>
      </div>
      <div class="test-stat">
        <div class="test-stat__value pass">${results.passed}</div>
        <div class="test-stat__label">Passed</div>
      </div>
      <div class="test-stat">
        <div class="test-stat__value fail">${results.failed}</div>
        <div class="test-stat__label">Failed</div>
      </div>
      <div class="test-stat">
        <div class="test-stat__value">${results.duration}ms</div>
        <div class="test-stat__label">Duration</div>
      </div>
    `;

    // Show failures first
    const sortedResults = [...results.results].sort((a, b) => {
      if (a.passed === b.passed) return 0;
      return a.passed ? 1 : -1;
    });

    list.innerHTML = sortedResults.map(result => `
      <div class="test-item">
        <span class="test-item__icon">${result.passed ? '✅' : '❌'}</span>
        <div class="test-item__content">
          <div class="test-item__title">${escapeHtml(result.ebayTitle)}</div>
          ${result.differences.length > 0 ? `
            <div class="test-item__diff">${result.differences.map(d => escapeHtml(d)).join('<br>')}</div>
          ` : ''}
        </div>
      </div>
    `).join('') || '<div class="empty-state"><p>No test results</p></div>';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering - Feedback
  // ─────────────────────────────────────────────────────────────────────────

  function renderFeedback() {
    const container = document.getElementById('feedback-list');

    if (state.feedback.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <h3 class="empty-state__title">No feedback yet</h3>
          <p>User feedback from wrong matches will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.feedback.map(item => `
      <div class="feedback-item">
        <div class="feedback-item__header">
          <span class="feedback-item__time">${formatTime(item.timestamp)}</span>
          <span class="feedback-item__type">${item.feedbackType}</span>
        </div>
        <div class="feedback-item__title">${escapeHtml(item.ebayTitle)}</div>
        <div class="feedback-item__match">
          Matched: ${escapeHtml(item.matchedCardName)} • ${escapeHtml(item.matchedExpansion)} • #${escapeHtml(item.matchedCardNumber)}
        </div>
        ${item.notes ? `<div style="margin-top: var(--space-sm); font-size: 12px; color: var(--ink-faded);">Note: ${escapeHtml(item.notes)}</div>` : ''}
      </div>
    `).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parser Test Tool
  // ─────────────────────────────────────────────────────────────────────────

  let parseTimeout;

  function setupParserTest() {
    const input = document.getElementById('parser-input');
    const output = document.getElementById('parser-output');

    input.addEventListener('input', () => {
      clearTimeout(parseTimeout);
      parseTimeout = setTimeout(async () => {
        const title = input.value.trim();
        if (!title) {
          output.textContent = 'Enter a title above to see parser output';
          return;
        }

        output.textContent = 'Parsing...';
        const parsed = await parseTitle(title);

        if (parsed) {
          output.textContent = JSON.stringify(parsed, null, 2);
        } else {
          output.textContent = 'Failed to parse title';
        }
      }, 300);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // eBay Listing Test Tool
  // ─────────────────────────────────────────────────────────────────────────

  let lastListingData = null; // Store for copy functionality

  async function fetchEbayListing() {
    const input = document.getElementById('ebay-url-input');
    const btn = document.getElementById('fetch-listing-btn');
    const placeholder = document.getElementById('ebay-listing-placeholder');
    const resultSection = document.getElementById('ebay-listing-result');

    const urlOrId = input.value.trim();
    if (!urlOrId) {
      showToast('Please enter an eBay URL or item ID', true);
      return;
    }

    // Show loading state
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Fetching...
    `;
    placeholder.style.display = 'block';
    placeholder.textContent = 'Fetching listing from eBay API...';
    resultSection.style.display = 'none';

    try {
      const res = await fetch(`${API}/ebay-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlOrId }),
      });

      const data = await res.json();

      if (data.status !== 'ok') {
        throw new Error(data.message || 'Failed to fetch listing');
      }

      // Store for copy functionality
      lastListingData = data;

      // Update display
      displayEbayListing(data);

      placeholder.style.display = 'none';
      resultSection.style.display = 'block';

      showToast('Listing fetched successfully');
    } catch (err) {
      placeholder.textContent = `Error: ${err.message}`;
      placeholder.style.color = 'var(--accent)';
      resultSection.style.display = 'none';
      showToast(err.message, true);
    }

    // Reset button
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
      Fetch
    `;
  }

  function displayEbayListing(data) {
    const { listing, parsed } = data;

    // Update header
    document.getElementById('listing-title').textContent = listing.title;
    document.getElementById('listing-image').src = listing.imageUrl || '';
    document.getElementById('listing-image').style.display = listing.imageUrl ? 'block' : 'none';

    // Format price
    const currency = listing.priceCurrency === 'GBP' ? '£' : (listing.priceCurrency === 'USD' ? '$' : listing.priceCurrency);
    document.getElementById('listing-price').textContent = `${currency}${listing.price?.toFixed(2) || '—'}`;

    // Shipping
    const shipping = listing.shippingCost > 0 ? `+${currency}${listing.shippingCost.toFixed(2)} shipping` : 'Free shipping';
    document.getElementById('listing-shipping').textContent = shipping;

    // Condition
    let conditionText = listing.mappedCondition || listing.cardCondition || listing.condition || 'Unknown';
    if (listing.conditionSource) {
      conditionText += ` (${listing.conditionSource})`;
    }
    document.getElementById('listing-condition').textContent = conditionText;

    // Seller
    const seller = listing.seller || {};
    const sellerText = `${seller.username || 'Unknown'} (${seller.feedbackScore || 0})`;
    document.getElementById('listing-seller').textContent = sellerText;

    // Link
    document.getElementById('listing-link').href = listing.url || '#';

    // Listing data JSON
    document.getElementById('listing-data-output').textContent = JSON.stringify(listing, null, 2);

    // Parser output JSON
    document.getElementById('listing-parser-output').textContent = JSON.stringify(parsed, null, 2);
  }

  async function copyListingJSON() {
    if (!lastListingData) {
      showToast('No listing data to copy', true);
      return;
    }

    try {
      const jsonStr = JSON.stringify(lastListingData, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      showToast('Full JSON copied to clipboard');
    } catch (err) {
      showToast('Failed to copy to clipboard', true);
    }
  }

  function setupEbayListingTest() {
    const input = document.getElementById('ebay-url-input');
    const fetchBtn = document.getElementById('fetch-listing-btn');
    const copyBtn = document.getElementById('copy-listing-json-btn');

    fetchBtn.addEventListener('click', fetchEbayListing);
    copyBtn.addEventListener('click', copyListingJSON);

    // Allow Enter key to trigger fetch
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        fetchEbayListing();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────

  function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Test buttons
    document.getElementById('run-tests-btn').addEventListener('click', runTests);
    document.getElementById('export-btn').addEventListener('click', exportCorpus);

    // Report generation
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('copy-report-btn').addEventListener('click', copyReport);
    document.getElementById('close-report-btn').addEventListener('click', closeReport);

    // Clear corpus
    document.getElementById('clear-corpus-btn').addEventListener('click', clearCorpus);

    // Parser test
    setupParserTest();

    // eBay listing test
    setupEbayListingTest();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Report Generation
  // ─────────────────────────────────────────────────────────────────────────

  async function generateReport() {
    const btn = document.getElementById('generate-report-btn');
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Generating...
    `;

    try {
      const res = await fetch(`${API}/report`);
      if (!res.ok) throw new Error('Failed to generate report');

      const report = await res.text();

      // Show report output
      const outputEl = document.getElementById('report-output');
      const contentEl = document.getElementById('report-content');
      contentEl.textContent = report;
      outputEl.hidden = false;

      showToast('Report generated - copy and paste to Claude');
    } catch (err) {
      showToast(`Error: ${err.message}`, true);
    }

    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      Generate Report for Claude
    `;
  }

  async function copyReport() {
    const contentEl = document.getElementById('report-content');
    try {
      await navigator.clipboard.writeText(contentEl.textContent);
      showToast('Report copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = contentEl.textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Report copied to clipboard!');
    }
  }

  function closeReport() {
    document.getElementById('report-output').hidden = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Clear Corpus
  // ─────────────────────────────────────────────────────────────────────────

  async function clearCorpus() {
    const keepVerified = confirm(
      'Clear training corpus?\n\n' +
      'Click OK to clear all entries (start completely fresh)\n' +
      'Click Cancel to keep verified entries for regression testing'
    );

    // If they clicked cancel on the first prompt, ask if they want to keep verified
    if (!keepVerified) {
      const confirmClear = confirm(
        'Keep verified entries and clear only pending/incorrect?\n\n' +
        'Click OK to clear (keeping verified)\n' +
        'Click Cancel to abort'
      );
      if (!confirmClear) {
        return; // User doesn't want to clear anything
      }
    }

    const btn = document.getElementById('clear-corpus-btn');
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Clearing...
    `;

    try {
      const res = await fetch(`${API}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepVerified: !keepVerified,  // keepVerified=true when they clicked Cancel on first prompt
          clearFeedback: true
        }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        const msg = data.verifiedKept > 0
          ? `Cleared ${data.corpusCleared} entries (kept ${data.verifiedKept} verified)`
          : `Cleared ${data.corpusCleared} entries`;
        showToast(msg);

        // Refresh stats
        fetchStats();
      } else {
        showToast(data.message || 'Failed to clear', true);
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, true);
    }

    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      Clear Corpus
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────────────────

  // Expose functions globally for onclick handlers
  window.reviewEntry = reviewEntry;
  window.showIncorrectReasons = showIncorrectReasons;
  window.hideIncorrectReasons = hideIncorrectReasons;
  window.submitIncorrectWithReason = submitIncorrectWithReason;

  function init() {
    initTheme();
    setupEventListeners();
    fetchStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
