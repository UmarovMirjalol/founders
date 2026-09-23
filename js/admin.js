/**
 * Founders Community — Master Admin Dashboard & CMS Engine
 * Provides total control over all content, events, stories, pitch days, regions, stats, and raw JSON.
 */

class AdminApp {
  constructor() {
    this.token = localStorage.getItem('fc_admin_token') || '';
    this.activeTab = 'dashboard';
    this.jsonData = null;
    this.mediaList = [];

    this.init();
  }

  async init() {
    this.bindGlobalEvents();
    if (this.token) {
      const valid = await this.verifySession();
      if (valid) {
        this.showDashboard();
      } else {
        this.showAuthScreen();
      }
    } else {
      this.showAuthScreen();
    }
  }

  /* --------------------------------------------------------------------------
     01. Auth & Session Management
     -------------------------------------------------------------------------- */
  async verifySession() {
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        document.getElementById('current-user-name').textContent = data.username || 'admin';
        return true;
      }
    } catch (e) {
      console.warn('Auth verification failed:', e);
    }
    this.token = '';
    localStorage.removeItem('fc_admin_token');
    return false;
  }

  showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex';
  }

  showDashboard() {
    document.getElementById('auth-screen').style.display = 'none';
    this.switchTab('dashboard');
    this.loadAllData();
  }

  async login(username, password) {
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
      }

      const data = await res.json();
      this.token = data.token;
      localStorage.setItem('fc_admin_token', this.token);
      document.getElementById('current-user-name').textContent = data.username;
      this.showToast('Welcome back, Admin! Session authenticated.');
      this.showDashboard();
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.style.display = 'block';
    }
  }

  logout() {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` }
    }).catch(() => {});
    this.token = '';
    localStorage.removeItem('fc_admin_token');
    this.showAuthScreen();
  }

  /* --------------------------------------------------------------------------
     02. Data Fetching & Direct 2-Way Sync
     -------------------------------------------------------------------------- */
  async fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(url, options);
    if (res.status === 401) {
      this.logout();
      throw new Error('Session expired');
    }
    return res;
  }

  async loadAllData() {
    try {
      const res = await this.fetchWithAuth('/api/admin/json');
      if (res.ok) {
        const payload = await res.json();
        this.jsonData = payload.data || {};
      } else {
        // Fallback to static public json
        const fallback = await fetch('/data/community.json');
        this.jsonData = await fallback.json();
      }

      // Load media library
      const mediaRes = await this.fetchWithAuth('/api/admin/media');
      if (mediaRes.ok) {
        this.mediaList = (await mediaRes.json()).media || [];
      }

      this.updateDashboardMetrics();
      this.renderCurrentTab();
    } catch (e) {
      console.error('Error loading master dataset:', e);
      this.showToast('Error loading dataset from server', 'error');
    }
  }

  async saveMasterJson(dataToSave = null, showNotification = true) {
    const data = dataToSave || this.jsonData;
    try {
      const res = await this.fetchWithAuth('/api/admin/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Save failed');
      }

      this.jsonData = data;
      this.updateDashboardMetrics();
      this.renderCurrentTab();
      if (showNotification) {
        this.showToast('✅ Saved & synced live to website and Vercel dataset!');
      }
      return true;
    } catch (e) {
      this.showToast(`Save error: ${e.message}`, 'error');
      return false;
    }
  }

  updateDashboardMetrics() {
    if (!this.jsonData) return;
    const opps = this.jsonData.opportunities || [];
    const stories = this.jsonData.stories || [];
    const pitchCities = (this.jsonData.pitchDays && this.jsonData.pitchDays.cities) ? this.jsonData.pitchDays.cities : [];
    const regions = this.jsonData.regions || [];

    const elOpps = document.getElementById('dash-opps-count');
    const elStories = document.getElementById('dash-stories-count');
    const elPitch = document.getElementById('dash-pitch-count');
    const elRegions = document.getElementById('dash-regions-count');

    if (elOpps) elOpps.textContent = opps.length;
    if (elStories) elStories.textContent = stories.length;
    if (elPitch) elPitch.textContent = pitchCities.length;
    if (elRegions) elRegions.textContent = regions.length;
  }

  /* --------------------------------------------------------------------------
     03. Navigation & Tab Switching
     -------------------------------------------------------------------------- */
  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.sidebar-nav .nav-item-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `tab-${tabId}`);
    });

    const titleMap = {
      dashboard: 'Dashboard & Sync Control',
      opportunities: 'Live Radar & Events Management',
      pitchdays: 'Pitch Days & Stage Cities',
      stories: 'Field Dispatches & Founder Stories',
      stats: 'Homepage Key Statistics',
      pathway: '4-Step Ecosystem Pathway',
      regions: 'Regional Registry & 12 Chapters',
      partners: 'Ecosystem & Capital Partners',
      gallery: 'Documentary Photo Gallery Archive',
      rawjson: 'Full Master JSON Editor (community.json)',
      media: 'Media Library & Uploads',
      settings: 'Settings, Passwords & Backups'
    };

    const titleEl = document.getElementById('active-tab-title');
    if (titleEl) titleEl.textContent = titleMap[tabId] || 'Control Center';

    this.renderHeaderActions(tabId);
    this.renderCurrentTab();
  }

  renderHeaderActions(tabId) {
    const container = document.getElementById('header-actions');
    if (!container) return;
    container.innerHTML = '';

    if (tabId === 'opportunities') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = '+ Create Opportunity / Event';
      btn.onclick = () => this.openOpportunityModal();
      container.appendChild(btn);
    } else if (tabId === 'stories') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = '+ Create Story / Dispatch';
      btn.onclick = () => this.openStoryModal();
      container.appendChild(btn);
    } else if (tabId === 'partners') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = '+ Add Partner';
      btn.onclick = () => this.openPartnerModal();
      container.appendChild(btn);
    } else if (tabId === 'gallery') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.innerHTML = '+ Add Gallery Item';
      btn.onclick = () => this.openGalleryItemModal();
      container.appendChild(btn);
    }
  }

  renderCurrentTab() {
    if (!this.jsonData) return;

    switch (this.activeTab) {
      case 'opportunities':
        this.renderOpportunitiesTable();
        break;
      case 'pitchdays':
        this.renderPitchDays();
        break;
      case 'stories':
        this.renderStoriesTable();
        break;
      case 'stats':
        this.renderStatsForm();
        break;
      case 'pathway':
        this.renderPathwayForm();
        break;
      case 'regions':
        this.renderRegionsTable();
        break;
      case 'partners':
        this.renderPartnersTable();
        break;
      case 'gallery':
        this.renderGalleryGrid();
        break;
      case 'rawjson':
        this.renderRawJsonEditor();
        break;
      case 'media':
        this.renderMediaLibrary();
        break;
    }
  }

  /* --------------------------------------------------------------------------
     04. Opportunities / Events Tab
     -------------------------------------------------------------------------- */
  renderOpportunitiesTable() {
    const tbody = document.getElementById('opps-table-body');
    if (!tbody) return;
    const opps = this.jsonData.opportunities || [];
    tbody.innerHTML = '';

    if (opps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">No opportunities created yet. Click "+ Create Opportunity" above.</td></tr>`;
      return;
    }

    opps.forEach((opp, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--text-primary);">${this.escapeHtml(opp.title)}</strong></td>
        <td><span class="category-pill">${this.escapeHtml(opp.category || 'General')}</span></td>
        <td><code style="font-size:0.75rem; color:var(--brand-vermilion);">${opp.type || 'events'}</code></td>
        <td>
          <div>${this.escapeHtml(opp.date || 'TBD')}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(opp.location || '')}</div>
        </td>
        <td><span class="status-badge live">${this.escapeHtml(opp.status || 'Active')}</span></td>
        <td><span style="font-size:0.8rem; color:var(--text-secondary);">${this.escapeHtml(opp.action || 'Apply')}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="window.FC_ADMIN.openOpportunityModal(${index})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window.FC_ADMIN.deleteOpportunity(${index})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openOpportunityModal(index = null) {
    const modal = document.getElementById('modal-opp');
    const form = document.getElementById('form-opp');
    form.reset();

    const isEdit = index !== null && this.jsonData.opportunities[index];
    document.getElementById('modal-opp-title').textContent = isEdit ? 'Edit Opportunity / Event' : 'Create Opportunity / Event';
    document.getElementById('opp-id').value = isEdit ? index : '';

    if (isEdit) {
      const opp = this.jsonData.opportunities[index];
      document.getElementById('opp-title').value = opp.title || '';
      document.getElementById('opp-category').value = opp.category || '';
      document.getElementById('opp-type').value = opp.type || 'events';
      document.getElementById('opp-date').value = opp.date || '';
      document.getElementById('opp-location').value = opp.location || '';
      document.getElementById('opp-status').value = opp.status || 'Active Intake';
      document.getElementById('opp-tag').value = opp.tag || '';
      document.getElementById('opp-target').value = opp.target || '';
      document.getElementById('opp-desc').value = opp.description || '';
      document.getElementById('opp-action').value = opp.action || 'Apply to Pitch';
    }

    modal.classList.add('active');
  }

  async saveOpportunityFromModal() {
    const indexVal = document.getElementById('opp-id').value;
    const isEdit = indexVal !== '';
    const index = isEdit ? parseInt(indexVal, 10) : null;

    const newOpp = {
      id: isEdit ? this.jsonData.opportunities[index].id : `opp-${Date.now().toString().slice(-5)}`,
      title: document.getElementById('opp-title').value.trim(),
      category: document.getElementById('opp-category').value.trim(),
      type: document.getElementById('opp-type').value,
      date: document.getElementById('opp-date').value.trim(),
      location: document.getElementById('opp-location').value.trim(),
      status: document.getElementById('opp-status').value.trim(),
      tag: document.getElementById('opp-tag').value.trim() || 'Verified',
      target: document.getElementById('opp-target').value.trim() || 'Founders',
      description: document.getElementById('opp-desc').value.trim(),
      action: document.getElementById('opp-action').value.trim() || 'Apply Now'
    };

    if (!this.jsonData.opportunities) this.jsonData.opportunities = [];

    if (isEdit) {
      this.jsonData.opportunities[index] = newOpp;
    } else {
      this.jsonData.opportunities.unshift(newOpp);
    }

    document.getElementById('modal-opp').classList.remove('active');
    await this.saveMasterJson();
  }

  async deleteOpportunity(index) {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;
    this.jsonData.opportunities.splice(index, 1);
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     05. Pitch Days Tab
     -------------------------------------------------------------------------- */
  renderPitchDays() {
    const grid = document.getElementById('pitchdays-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const cities = (this.jsonData.pitchDays && this.jsonData.pitchDays.cities) ? this.jsonData.pitchDays.cities : [];
    if (cities.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-muted);">No pitch cities defined.</p>';
      return;
    }

    cities.forEach((city, index) => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-subtle)';
      card.style.borderRadius = '6px';
      card.style.padding = '1.25rem';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.75rem';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <h4 style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">${this.escapeHtml(city.name)}</h4>
            <span style="font-size:0.75rem; color:var(--brand-vermilion); font-family:var(--font-mono);">${this.escapeHtml(city.region || '')}</span>
          </div>
          <span class="status-badge live">${this.escapeHtml(city.status || 'Active')}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-secondary);">
          <div>📍 <strong>Venue:</strong> ${this.escapeHtml(city.venue || 'TBA')}</div>
          <div>🏛️ <strong>Past Cohorts:</strong> ${city.pastCohorts || 0} (${city.foundersPitched || 0} Founders Pitched)</div>
          <div>💼 <strong>Investors:</strong> ${this.escapeHtml(city.investorsPresent || 'Angels & Funds')}</div>
        </div>
        <p style="font-size:0.8125rem; color:var(--text-muted); line-height:1.4;">${this.escapeHtml(city.description || '')}</p>
        <div style="margin-top:auto; padding-top:0.5rem; border-top:1px solid var(--border-subtle);">
          <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;" onclick="window.FC_ADMIN.openPitchCityModal(${index})">
            Edit ${this.escapeHtml(city.name)} Stage Details &rarr;
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  openPitchCityModal(index) {
    const city = this.jsonData.pitchDays.cities[index];
    if (!city) return;

    document.getElementById('pitch-city-id').value = index;
    document.getElementById('modal-pitch-title').textContent = `Edit Stage: ${city.name}`;
    document.getElementById('pitch-city-name').value = city.name || '';
    document.getElementById('pitch-city-region').value = city.region || '';
    document.getElementById('pitch-city-status').value = city.status || '';
    document.getElementById('pitch-city-venue').value = city.venue || '';
    document.getElementById('pitch-city-cohorts').value = city.pastCohorts || 0;
    document.getElementById('pitch-city-pitched').value = city.foundersPitched || 0;
    document.getElementById('pitch-city-investors').value = city.investorsPresent || '';
    document.getElementById('pitch-city-desc').value = city.description || '';
    document.getElementById('pitch-city-coords').value = city.coordinates || '';

    document.getElementById('modal-pitch-city').classList.add('active');
  }

  async savePitchCityFromModal() {
    const index = parseInt(document.getElementById('pitch-city-id').value, 10);
    const city = this.jsonData.pitchDays.cities[index];
    if (!city) return;

    city.name = document.getElementById('pitch-city-name').value.trim();
    city.region = document.getElementById('pitch-city-region').value.trim();
    city.status = document.getElementById('pitch-city-status').value.trim();
    city.venue = document.getElementById('pitch-city-venue').value.trim();
    city.pastCohorts = parseInt(document.getElementById('pitch-city-cohorts').value, 10) || 0;
    city.foundersPitched = parseInt(document.getElementById('pitch-city-pitched').value, 10) || 0;
    city.investorsPresent = document.getElementById('pitch-city-investors').value.trim();
    city.description = document.getElementById('pitch-city-desc').value.trim();
    city.coordinates = document.getElementById('pitch-city-coords').value.trim();

    document.getElementById('modal-pitch-city').classList.remove('active');
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     06. Stories / Field Dispatches Tab
     -------------------------------------------------------------------------- */
  renderStoriesTable() {
    const tbody = document.getElementById('stories-table-body');
    if (!tbody) return;
    const stories = this.jsonData.stories || [];
    tbody.innerHTML = '';

    stories.forEach((story, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <img src="${this.escapeHtml(story.image || 'assets/hero.jpg')}" style="width:44px; height:44px; object-fit:cover; border-radius:4px; border:1px solid var(--border-subtle);" onerror="this.src='assets/brand-badge.svg'">
        </td>
        <td>
          <strong style="color:var(--text-primary);">${this.escapeHtml(story.title)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(story.excerpt || '')}</div>
        </td>
        <td>
          <div>${this.escapeHtml(story.author || '')}</div>
          <div style="font-size:0.75rem; color:var(--brand-vermilion);">${this.escapeHtml(story.authorRole || '')}</div>
        </td>
        <td><span class="category-pill">${this.escapeHtml(story.category || 'Article')} • ${this.escapeHtml(story.region || '')}</span></td>
        <td><span style="font-size:0.8rem; color:var(--text-muted);">${this.escapeHtml(story.readTime || '5 min read')}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="window.FC_ADMIN.openStoryModal(${index})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window.FC_ADMIN.deleteStory(${index})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openStoryModal(index = null) {
    const modal = document.getElementById('modal-story');
    const form = document.getElementById('form-story');
    form.reset();

    const isEdit = index !== null && this.jsonData.stories[index];
    document.getElementById('modal-story-title').textContent = isEdit ? 'Edit Story / Dispatch' : 'Create Story / Dispatch';
    document.getElementById('story-id').value = isEdit ? index : '';

    if (isEdit) {
      const story = this.jsonData.stories[index];
      document.getElementById('st-title').value = story.title || '';
      document.getElementById('st-author').value = story.author || '';
      document.getElementById('st-role').value = story.authorRole || '';
      document.getElementById('st-category').value = story.category || '';
      document.getElementById('st-region').value = story.region || '';
      document.getElementById('st-readtime').value = story.readTime || '5 min read';
      document.getElementById('st-date').value = story.date || '2026';
      document.getElementById('st-cover').value = story.image || 'assets/hero.jpg';
      document.getElementById('st-excerpt').value = story.excerpt || '';
    }

    modal.classList.add('active');
  }

  async saveStoryFromModal() {
    const indexVal = document.getElementById('story-id').value;
    const isEdit = indexVal !== '';
    const index = isEdit ? parseInt(indexVal, 10) : null;

    const newStory = {
      id: isEdit ? this.jsonData.stories[index].id : `dispatch-${Date.now().toString().slice(-4)}`,
      category: document.getElementById('st-category').value.trim(),
      region: document.getElementById('st-region').value.trim(),
      readTime: document.getElementById('st-readtime').value.trim() || '5 min read',
      date: document.getElementById('st-date').value.trim() || '2026',
      title: document.getElementById('st-title').value.trim(),
      excerpt: document.getElementById('st-excerpt').value.trim(),
      author: document.getElementById('st-author').value.trim(),
      authorRole: document.getElementById('st-role').value.trim() || 'Founder',
      image: document.getElementById('st-cover').value.trim() || 'assets/hero.jpg',
      link: isEdit ? this.jsonData.stories[index].link : '#'
    };

    if (!this.jsonData.stories) this.jsonData.stories = [];

    if (isEdit) {
      this.jsonData.stories[index] = newStory;
    } else {
      this.jsonData.stories.unshift(newStory);
    }

    document.getElementById('modal-story').classList.remove('active');
    await this.saveMasterJson();
  }

  async deleteStory(index) {
    if (!confirm('Are you sure you want to delete this story?')) return;
    this.jsonData.stories.splice(index, 1);
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     07. Key Statistics Tab
     -------------------------------------------------------------------------- */
  renderStatsForm() {
    const container = document.getElementById('stats-inputs-container');
    if (!container) return;
    container.innerHTML = '';
    const stats = this.jsonData.stats || [];

    stats.forEach((stat, index) => {
      const block = document.createElement('div');
      block.style.background = 'var(--bg-subtle)';
      block.style.padding = '1rem';
      block.style.borderRadius = '4px';
      block.style.border = '1px solid var(--border-subtle)';
      block.innerHTML = `
        <div style="font-weight:600; font-size:0.85rem; color:var(--brand-vermilion); margin-bottom:0.75rem;">Metric #${index + 1}</div>
        <div style="display:grid; grid-template-columns: 1fr 2fr 3fr; gap:0.75rem;">
          <div>
            <label class="form-label">Metric Value *</label>
            <input type="text" class="form-input stat-val" value="${this.escapeHtml(stat.value || '')}" required>
          </div>
          <div>
            <label class="form-label">Headline Label *</label>
            <input type="text" class="form-input stat-label" value="${this.escapeHtml(stat.label || '')}" required>
          </div>
          <div>
            <label class="form-label">Subtitle / Description</label>
            <input type="text" class="form-input stat-subtext" value="${this.escapeHtml(stat.subtext || '')}">
          </div>
        </div>
      `;
      container.appendChild(block);
    });
  }

  async saveStatsFromForm(e) {
    e.preventDefault();
    const vals = document.querySelectorAll('.stat-val');
    const labels = document.querySelectorAll('.stat-label');
    const subtexts = document.querySelectorAll('.stat-subtext');

    const newStats = [];
    vals.forEach((v, idx) => {
      newStats.push({
        value: v.value.trim(),
        label: labels[idx].value.trim(),
        subtext: subtexts[idx].value.trim()
      });
    });

    this.jsonData.stats = newStats;
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     08. Pathway Tab (How It Works)
     -------------------------------------------------------------------------- */
  renderPathwayForm() {
    const container = document.getElementById('pathway-inputs-container');
    if (!container) return;
    container.innerHTML = '';
    const steps = this.jsonData.howItWorks || [];

    steps.forEach((st, index) => {
      const block = document.createElement('div');
      block.style.background = 'var(--bg-subtle)';
      block.style.padding = '1.25rem';
      block.style.borderRadius = '4px';
      block.style.border = '1px solid var(--border-subtle)';
      block.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <span style="font-weight:700; color:var(--brand-vermilion); font-family:var(--font-mono);">Step ${st.step || `0${index+1}`} — ${this.escapeHtml(st.title || '')}</span>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" class="form-input path-title" value="${this.escapeHtml(st.title || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Subtitle</label>
            <input type="text" class="form-input path-subtitle" value="${this.escapeHtml(st.subtitle || '')}">
          </div>
          <div class="form-group full">
            <label class="form-label">Summary</label>
            <textarea class="form-textarea path-summary" rows="2">${this.escapeHtml(st.summary || '')}</textarea>
          </div>
          <div class="form-group full">
            <label class="form-label">Tags (comma-separated)</label>
            <input type="text" class="form-input path-tags" value="${this.escapeHtml((st.tags || []).join(', '))}">
          </div>
        </div>
      `;
      container.appendChild(block);
    });
  }

  async savePathwayFromForm(e) {
    e.preventDefault();
    const titles = document.querySelectorAll('.path-title');
    const subtitles = document.querySelectorAll('.path-subtitle');
    const summaries = document.querySelectorAll('.path-summary');
    const tagsArr = document.querySelectorAll('.path-tags');

    const updated = (this.jsonData.howItWorks || []).map((step, idx) => ({
      ...step,
      title: titles[idx].value.trim(),
      subtitle: subtitles[idx].value.trim(),
      summary: summaries[idx].value.trim(),
      tags: tagsArr[idx].value.split(',').map(t => t.trim()).filter(Boolean)
    }));

    this.jsonData.howItWorks = updated;
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     09. Regional Registry Tab
     -------------------------------------------------------------------------- */
  renderRegionsTable() {
    const tbody = document.getElementById('regions-table-body');
    if (!tbody) return;
    const regions = this.jsonData.regions || [];
    tbody.innerHTML = '';

    regions.forEach((reg, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--text-primary);">${this.escapeHtml(reg.name)}</strong></td>
        <td><span class="status-badge live">${this.escapeHtml(reg.status || 'Active')}</span></td>
        <td><span style="font-size:0.85rem; color:var(--text-secondary);">${this.escapeHtml(reg.hub || 'TBA')}</span></td>
        <td><span style="font-size:0.85rem; color:var(--text-primary);">${this.escapeHtml(reg.lead || 'Ecosystem Lead')}</span></td>
        <td><span style="font-size:0.8125rem; color:var(--brand-vermilion);">${this.escapeHtml(reg.focus || '')}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="window.FC_ADMIN.openRegionModal(${index})">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openRegionModal(index) {
    const reg = this.jsonData.regions[index];
    if (!reg) return;

    document.getElementById('reg-id').value = index;
    document.getElementById('modal-region-title').textContent = `Edit Region: ${reg.name}`;
    document.getElementById('reg-name').value = reg.name || '';
    document.getElementById('reg-status').value = reg.status || '';
    document.getElementById('reg-hub').value = reg.hub || '';
    document.getElementById('reg-lead').value = reg.lead || '';
    document.getElementById('reg-focus').value = reg.focus || '';
    document.getElementById('reg-desc').value = reg.description || '';

    document.getElementById('modal-region').classList.add('active');
  }

  async saveRegionFromModal() {
    const index = parseInt(document.getElementById('reg-id').value, 10);
    const reg = this.jsonData.regions[index];
    if (!reg) return;

    reg.name = document.getElementById('reg-name').value.trim();
    reg.status = document.getElementById('reg-status').value.trim();
    reg.hub = document.getElementById('reg-hub').value.trim();
    reg.lead = document.getElementById('reg-lead').value.trim();
    reg.focus = document.getElementById('reg-focus').value.trim();
    reg.description = document.getElementById('reg-desc').value.trim();

    document.getElementById('modal-region').classList.remove('active');
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     10. Partners Tab
     -------------------------------------------------------------------------- */
  renderPartnersTable() {
    const tbody = document.getElementById('partners-table-body');
    if (!tbody) return;
    const partners = this.jsonData.partners || [];
    tbody.innerHTML = '';

    partners.forEach((p, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <img src="${this.escapeHtml(p.logo || 'assets/brand-badge.svg')}" style="width:36px; height:36px; object-fit:contain; background:rgba(255,255,255,0.05); padding:3px; border-radius:4px;" onerror="this.src='assets/brand-badge.svg'">
        </td>
        <td><strong style="color:var(--text-primary);">${this.escapeHtml(p.name)}</strong></td>
        <td><span class="category-pill">${this.escapeHtml(p.category || 'Partner')}</span></td>
        <td><span style="font-size:0.8125rem; color:var(--brand-vermilion);">${this.escapeHtml(p.role || '')}</span></td>
        <td><a href="${this.escapeHtml(p.url || '#')}" target="_blank" style="color:var(--text-muted); font-size:0.75rem;">${this.escapeHtml(p.url || '#')}</a></td>
        <td style="text-align:right;">
          <button class="btn btn-secondary btn-sm" onclick="window.FC_ADMIN.openPartnerModal(${index})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window.FC_ADMIN.deletePartner(${index})">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  openPartnerModal(index = null) {
    const modal = document.getElementById('modal-partner');
    const form = document.getElementById('form-partner');
    form.reset();

    const isEdit = index !== null && this.jsonData.partners[index];
    document.getElementById('modal-partner-title').textContent = isEdit ? 'Edit Partner' : 'Add Partner';
    document.getElementById('partner-id').value = isEdit ? index : '';

    if (isEdit) {
      const p = this.jsonData.partners[index];
      document.getElementById('pt-name').value = p.name || '';
      document.getElementById('pt-category').value = p.category || '';
      document.getElementById('pt-role').value = p.role || '';
      document.getElementById('pt-url').value = p.url || '';
      document.getElementById('pt-logo').value = p.logo || '';
      document.getElementById('pt-desc').value = p.description || '';
    }

    modal.classList.add('active');
  }

  async savePartnerFromModal() {
    const indexVal = document.getElementById('partner-id').value;
    const isEdit = indexVal !== '';
    const index = isEdit ? parseInt(indexVal, 10) : null;

    const newPartner = {
      id: isEdit ? this.jsonData.partners[index].id : `partner-${Date.now().toString().slice(-4)}`,
      name: document.getElementById('pt-name').value.trim(),
      category: document.getElementById('pt-category').value.trim(),
      role: document.getElementById('pt-role').value.trim(),
      url: document.getElementById('pt-url').value.trim() || '#',
      logo: document.getElementById('pt-logo').value.trim(),
      textLogo: document.getElementById('pt-name').value.trim(),
      description: document.getElementById('pt-desc').value.trim()
    };

    if (!this.jsonData.partners) this.jsonData.partners = [];

    if (isEdit) {
      this.jsonData.partners[index] = newPartner;
    } else {
      this.jsonData.partners.push(newPartner);
    }

    document.getElementById('modal-partner').classList.remove('active');
    await this.saveMasterJson();
  }

  async deletePartner(index) {
    if (!confirm('Are you sure you want to delete this partner?')) return;
    this.jsonData.partners.splice(index, 1);
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     11. Gallery Tab
     -------------------------------------------------------------------------- */
  renderGalleryGrid() {
    const grid = document.getElementById('gallery-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = this.jsonData.gallery || [];

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.style.background = 'var(--bg-card)';
      card.style.border = '1px solid var(--border-subtle)';
      card.style.borderRadius = '6px';
      card.style.overflow = 'hidden';
      card.innerHTML = `
        <img src="${this.escapeHtml(item.src || '')}" style="width:100%; height:160px; object-fit:cover;" onerror="this.src='assets/hero.jpg'">
        <div style="padding:1rem; display:flex; flex-direction:column; gap:0.35rem;">
          <strong style="color:var(--text-primary); font-size:0.9rem;">${this.escapeHtml(item.caption || '')}</strong>
          <span style="color:var(--text-muted); font-size:0.75rem;">${this.escapeHtml(item.subtext || '')}</span>
          <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
            <button class="btn btn-secondary btn-sm" style="flex:1; justify-content:center;" onclick="window.FC_ADMIN.openGalleryItemModal(${index})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="window.FC_ADMIN.deleteGalleryItem(${index})">Delete</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  openGalleryItemModal(index = null) {
    const modal = document.getElementById('modal-gallery-item');
    const form = document.getElementById('form-gallery-item');
    form.reset();

    const isEdit = index !== null && this.jsonData.gallery[index];
    document.getElementById('modal-gallery-title').textContent = isEdit ? 'Edit Gallery Photo' : 'Add Gallery Photo';
    document.getElementById('gal-id').value = isEdit ? index : '';

    if (isEdit) {
      const item = this.jsonData.gallery[index];
      document.getElementById('gal-caption').value = item.caption || '';
      document.getElementById('gal-subtext').value = item.subtext || '';
      document.getElementById('gal-src').value = item.src || '';
      document.getElementById('gal-alt').value = item.alt || '';
    }

    modal.classList.add('active');
  }

  async saveGalleryItemFromModal() {
    const indexVal = document.getElementById('gal-id').value;
    const isEdit = indexVal !== '';
    const index = isEdit ? parseInt(indexVal, 10) : null;

    const newItem = {
      id: isEdit ? this.jsonData.gallery[index].id : `gallery-${Date.now().toString().slice(-4)}`,
      caption: document.getElementById('gal-caption').value.trim(),
      subtext: document.getElementById('gal-subtext').value.trim(),
      src: document.getElementById('gal-src').value.trim(),
      alt: document.getElementById('gal-alt').value.trim() || document.getElementById('gal-caption').value.trim()
    };

    if (!this.jsonData.gallery) this.jsonData.gallery = [];

    if (isEdit) {
      this.jsonData.gallery[index] = newItem;
    } else {
      this.jsonData.gallery.push(newItem);
    }

    // Sync with photos array
    if (!this.jsonData.photos) this.jsonData.photos = [];
    const photoObj = {
      id: newItem.id,
      title: newItem.caption,
      category: "Community",
      location: newItem.subtext || "Uzbekistan",
      date: "2026",
      image: newItem.src,
      caption: newItem.alt || newItem.caption
    };
    const pIdx = this.jsonData.photos.findIndex(p => p.id === newItem.id || p.image === newItem.src);
    if (pIdx >= 0) {
      this.jsonData.photos[pIdx] = { ...this.jsonData.photos[pIdx], ...photoObj };
    } else {
      this.jsonData.photos.unshift(photoObj);
    }

    document.getElementById('modal-gallery-item').classList.remove('active');
    await this.saveMasterJson();
  }

  async deleteGalleryItem(index) {
    if (!confirm('Are you sure you want to delete this gallery item?')) return;
    const removed = this.jsonData.gallery.splice(index, 1)[0];
    if (removed && this.jsonData.photos) {
      this.jsonData.photos = this.jsonData.photos.filter(p => p.id !== removed.id && p.image !== removed.src);
    }
    await this.saveMasterJson();
  }

  /* --------------------------------------------------------------------------
     12. Raw JSON Editor Tab
     -------------------------------------------------------------------------- */
  renderRawJsonEditor() {
    const textarea = document.getElementById('raw-json-textarea');
    if (!textarea) return;
    textarea.value = JSON.stringify(this.jsonData, null, 2);
  }

  formatRawJson() {
    const textarea = document.getElementById('raw-json-textarea');
    const statusEl = document.getElementById('json-editor-status');
    try {
      const parsed = JSON.parse(textarea.value);
      textarea.value = JSON.stringify(parsed, null, 2);
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(34, 197, 94, 0.15)';
        statusEl.style.color = '#22C55E';
        statusEl.textContent = '✅ JSON syntax is valid and prettified.';
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#EF4444';
        statusEl.textContent = `❌ JSON Syntax Error: ${e.message}`;
      }
    }
  }

  async saveRawJson() {
    const textarea = document.getElementById('raw-json-textarea');
    const statusEl = document.getElementById('json-editor-status');
    try {
      const parsed = JSON.parse(textarea.value);
      const success = await this.saveMasterJson(parsed);
      if (success && statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(34, 197, 94, 0.15)';
        statusEl.style.color = '#22C55E';
        statusEl.textContent = '✅ All changes saved & synced live to website & Vercel!';
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#EF4444';
        statusEl.textContent = `❌ Cannot save: Invalid JSON (${e.message})`;
      }
      this.showToast(`Invalid JSON: ${e.message}`, 'error');
    }
  }

  /* --------------------------------------------------------------------------
     13. Media Library Tab
     -------------------------------------------------------------------------- */
  renderMediaLibrary() {
    const grid = document.getElementById('media-library-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (this.mediaList.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-muted); padding:2rem;">No media uploaded yet. Use the Upload Images button above.</p>';
      return;
    }

    this.mediaList.forEach(m => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.innerHTML = `
        <img src="${this.escapeHtml(m.url)}" class="media-thumb" onerror="this.src='assets/brand-badge.svg'">
        <div class="media-info">
          <div class="media-name">${this.escapeHtml(m.original_name)}</div>
          <div class="media-meta">${m.file_size ? `${Math.round(m.file_size/1024)} KB` : 'Asset'} • ${m.mime_type || 'image'}</div>
          <button class="btn btn-secondary btn-sm" style="width:100%; margin-top:0.5rem; justify-content:center;" onclick="navigator.clipboard.writeText('${m.url}'); window.FC_ADMIN.showToast('Copied URL to clipboard!')">Copy URL</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  async handleMediaUpload(files) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let f of files) {
      formData.append('files', f);
    }

    try {
      const res = await this.fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        this.showToast('✅ Images uploaded successfully!');
        this.loadAllData();
      }
    } catch (e) {
      this.showToast(`Upload failed: ${e.message}`, 'error');
    }
  }

  /* --------------------------------------------------------------------------
     14. Global Event Binding & Modals
     -------------------------------------------------------------------------- */
  bindGlobalEvents() {
    // Auth login form
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value.trim();
      const p = document.getElementById('login-password').value.trim();
      this.login(u, p);
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());

    // Tab buttons
    document.querySelectorAll('.sidebar-nav .nav-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // Save buttons in modals
    document.getElementById('save-opp-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveOpportunityFromModal();
    });

    document.getElementById('save-pitch-city-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.savePitchCityFromModal();
    });

    document.getElementById('save-story-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveStoryFromModal();
    });

    document.getElementById('save-region-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveRegionFromModal();
    });

    document.getElementById('save-partner-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.savePartnerFromModal();
    });

    document.getElementById('save-gallery-item-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveGalleryItemFromModal();
    });

    // Forms
    document.getElementById('stats-form')?.addEventListener('submit', (e) => this.saveStatsFromForm(e));
    document.getElementById('pathway-form')?.addEventListener('submit', (e) => this.savePathwayFromForm(e));

    // Raw JSON Editor
    document.getElementById('btn-format-json')?.addEventListener('click', () => this.formatRawJson());
    document.getElementById('btn-reload-json')?.addEventListener('click', () => this.loadAllData());
    document.getElementById('btn-save-raw-json')?.addEventListener('click', () => this.saveRawJson());

    // Force Re-Sync button
    document.getElementById('dash-save-all-btn')?.addEventListener('click', async () => {
      await this.saveMasterJson(null, true);
    });

    // Media upload
    document.getElementById('media-upload-input')?.addEventListener('change', (e) => {
      this.handleMediaUpload(e.target.files);
    });

    // Export & Import backup
    document.getElementById('btn-export-backup')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `founders-community-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    });

    document.getElementById('btn-import-backup')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          await this.saveMasterJson(parsed);
          this.showToast('✅ Restored and synced from backup JSON file!');
        } catch (err) {
          this.showToast(`Invalid JSON file: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    });

    // Password change form
    document.getElementById('password-change-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldP = document.getElementById('pw-old').value;
      const newP = document.getElementById('pw-new').value;
      const confirmP = document.getElementById('pw-confirm').value;
      const msgEl = document.getElementById('pw-msg');

      if (newP !== confirmP) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#EF4444';
        msgEl.textContent = 'New passwords do not match';
        return;
      }

      try {
        const res = await this.fetchWithAuth('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ old_password: oldP, new_password: newP })
        });
        if (res.ok) {
          msgEl.style.display = 'block';
          msgEl.style.color = '#22C55E';
          msgEl.textContent = 'Password updated successfully!';
          document.getElementById('password-change-form').reset();
        } else {
          const err = await res.json();
          throw new Error(err.detail || 'Password update failed');
        }
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#EF4444';
        msgEl.textContent = err.message;
      }
    });
  }

  /* --------------------------------------------------------------------------
     15. Toast Notifications & Helpers
     -------------------------------------------------------------------------- */
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.FC_ADMIN = new AdminApp();
});
