// preferences.js - User preferences management

(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM Elements
  // ─────────────────────────────────────────────────────────────────────────────

  const elements = {
    // Deal filtering
    minDiscount: document.getElementById('pref-min-discount'),
    minDiscountValue: document.getElementById('min-discount-value'),
    showGraded: document.getElementById('pref-show-graded'),
    showRaw: document.getElementById('pref-show-raw'),
    graderPsa: document.getElementById('pref-grader-psa'),
    graderCgc: document.getElementById('pref-grader-cgc'),
    graderBgs: document.getElementById('pref-grader-bgs'),
    graderSgc: document.getElementById('pref-grader-sgc'),
    minGrade: document.getElementById('pref-min-grade'),
    maxGrade: document.getElementById('pref-max-grade'),
    tierPremium: document.getElementById('pref-tier-premium'),
    tierHigh: document.getElementById('pref-tier-high'),
    tierStandard: document.getElementById('pref-tier-standard'),
    // Display
    currency: document.getElementById('pref-currency'),
    compactView: document.getElementById('pref-compact-view'),
    enableSounds: document.getElementById('pref-enable-sounds'),
    // Scanner
    dailyBudget: document.getElementById('pref-daily-budget'),
    hoursStart: document.getElementById('pref-hours-start'),
    hoursEnd: document.getElementById('pref-hours-end'),
    autoStart: document.getElementById('pref-auto-start'),
    // Notifications
    desktopNotif: document.getElementById('pref-desktop-notif'),
    premiumSound: document.getElementById('pref-premium-sound'),
    // Actions
    saveBtn: document.getElementById('save-btn'),
    resetBtn: document.getElementById('reset-btn'),
    statusMessage: document.getElementById('status-message'),
    themeToggle: document.getElementById('theme-toggle'),
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Theme Management
  // ─────────────────────────────────────────────────────────────────────────────

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // API Functions
  // ─────────────────────────────────────────────────────────────────────────────

  async function fetchPreferences() {
    try {
      const response = await fetch('/api/preferences');
      if (!response.ok) throw new Error('Failed to fetch preferences');
      return await response.json();
    } catch (error) {
      console.error('Error fetching preferences:', error);
      showStatus('Failed to load preferences', 'error');
      return null;
    }
  }

  async function savePreferences(prefs) {
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!response.ok) throw new Error('Failed to save preferences');
      return await response.json();
    } catch (error) {
      console.error('Error saving preferences:', error);
      throw error;
    }
  }

  async function resetPreferences() {
    try {
      const response = await fetch('/api/preferences/reset', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reset preferences');
      return await response.json();
    } catch (error) {
      console.error('Error resetting preferences:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI Functions
  // ─────────────────────────────────────────────────────────────────────────────

  function populateForm(prefs) {
    if (!prefs) return;

    // Deal filtering
    elements.minDiscount.value = prefs.minDiscountPercent || 20;
    elements.minDiscountValue.textContent = `${prefs.minDiscountPercent || 20}%`;
    elements.showGraded.checked = prefs.showGradedDeals !== false;
    elements.showRaw.checked = prefs.showRawDeals !== false;

    // Grading companies
    const graders = prefs.preferredGradingCompanies || ['PSA', 'CGC', 'BGS'];
    elements.graderPsa.checked = graders.includes('PSA');
    elements.graderCgc.checked = graders.includes('CGC');
    elements.graderBgs.checked = graders.includes('BGS');
    elements.graderSgc.checked = graders.includes('SGC');

    // Grade range
    elements.minGrade.value = prefs.minGrade || 7;
    elements.maxGrade.value = prefs.maxGrade || 10;

    // Tiers
    elements.tierPremium.checked = prefs.showPremiumTier !== false;
    elements.tierHigh.checked = prefs.showHighTier !== false;
    elements.tierStandard.checked = prefs.showStandardTier !== false;

    // Display
    elements.currency.value = prefs.currency || 'GBP';
    elements.compactView.checked = prefs.compactView || false;
    elements.enableSounds.checked = prefs.enableSounds !== false;

    // Scanner
    elements.dailyBudget.value = prefs.dailyCreditBudget || 1500;
    elements.hoursStart.value = prefs.operatingHoursStart ?? 6;
    elements.hoursEnd.value = prefs.operatingHoursEnd ?? 23;
    elements.autoStart.checked = prefs.autoStartScanner || false;

    // Notifications
    elements.desktopNotif.checked = prefs.desktopNotifications !== false;
    elements.premiumSound.checked = prefs.premiumDealSound !== false;
  }

  function collectFormData() {
    const graders = [];
    if (elements.graderPsa.checked) graders.push('PSA');
    if (elements.graderCgc.checked) graders.push('CGC');
    if (elements.graderBgs.checked) graders.push('BGS');
    if (elements.graderSgc.checked) graders.push('SGC');

    return {
      minDiscountPercent: parseInt(elements.minDiscount.value, 10),
      showGradedDeals: elements.showGraded.checked,
      showRawDeals: elements.showRaw.checked,
      preferredGradingCompanies: graders,
      minGrade: parseFloat(elements.minGrade.value),
      maxGrade: parseFloat(elements.maxGrade.value),
      showPremiumTier: elements.tierPremium.checked,
      showHighTier: elements.tierHigh.checked,
      showStandardTier: elements.tierStandard.checked,
      currency: elements.currency.value,
      compactView: elements.compactView.checked,
      enableSounds: elements.enableSounds.checked,
      dailyCreditBudget: parseInt(elements.dailyBudget.value, 10),
      operatingHoursStart: parseInt(elements.hoursStart.value, 10),
      operatingHoursEnd: parseInt(elements.hoursEnd.value, 10),
      autoStartScanner: elements.autoStart.checked,
      desktopNotifications: elements.desktopNotif.checked,
      premiumDealSound: elements.premiumSound.checked,
    };
  }

  function showStatus(message, type = 'success') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `preferences-status show ${type}`;

    setTimeout(() => {
      elements.statusMessage.classList.remove('show');
    }, 3000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  function setupEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Min discount range slider
    elements.minDiscount.addEventListener('input', () => {
      elements.minDiscountValue.textContent = `${elements.minDiscount.value}%`;
    });

    // Save button
    elements.saveBtn.addEventListener('click', async () => {
      elements.saveBtn.disabled = true;
      elements.saveBtn.textContent = 'Saving...';

      try {
        const prefs = collectFormData();
        await savePreferences(prefs);
        showStatus('Preferences saved successfully', 'success');

        // Also save to localStorage for immediate use
        localStorage.setItem('userPreferences', JSON.stringify(prefs));
      } catch (error) {
        showStatus('Failed to save preferences', 'error');
      } finally {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = 'Save Preferences';
      }
    });

    // Reset button
    elements.resetBtn.addEventListener('click', async () => {
      if (!confirm('Reset all preferences to defaults?')) return;

      elements.resetBtn.disabled = true;
      elements.resetBtn.textContent = 'Resetting...';

      try {
        const prefs = await resetPreferences();
        populateForm(prefs);
        localStorage.removeItem('userPreferences');
        showStatus('Preferences reset to defaults', 'success');
      } catch (error) {
        showStatus('Failed to reset preferences', 'error');
      } finally {
        elements.resetBtn.disabled = false;
        elements.resetBtn.textContent = 'Reset to Defaults';
      }
    });

    // Desktop notifications permission
    elements.desktopNotif.addEventListener('change', async () => {
      if (elements.desktopNotif.checked) {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            elements.desktopNotif.checked = false;
            showStatus('Notification permission denied', 'error');
          }
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialize
  // ─────────────────────────────────────────────────────────────────────────────

  async function init() {
    initTheme();
    setupEventListeners();

    // Load preferences
    const prefs = await fetchPreferences();
    if (prefs) {
      populateForm(prefs);
    }
  }

  // Start
  document.addEventListener('DOMContentLoaded', init);
})();
