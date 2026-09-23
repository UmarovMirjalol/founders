/**
 * Interactive Uzbekistan + Central Asia Regional Network Map
 * Renders all 12 regions with dynamic living corridor connections
 */

export class RegionalMap {
  constructor(containerId, drawerId, regionsData) {
    this.container = document.getElementById(containerId);
    this.drawer = document.getElementById(drawerId);
    this.listContainer = document.getElementById('regional-nodes-list');
    this.regions = regionsData || [];
    this.activeRegion = this.regions[0] || null;
    this.lines = [];
    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderMap();
    this.renderList();
    this.renderDrawer();
    this.selectRegion(this.activeRegion.id);
  }

  renderMap() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 600');
    svg.setAttribute('class', 'map-svg');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <pattern id="archGrid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8E6DF" stroke-width="0.5"/>
        <circle cx="40" cy="40" r="0.75" fill="#DCD9CE"/>
      </pattern>
      <style>
        @keyframes dashFlow {
          to { stroke-dashoffset: -24; }
        }
        .active-corridor {
          stroke: #DE3E15 !important;
          stroke-width: 1.5px !important;
          stroke-dasharray: 6 4 !important;
          animation: dashFlow 1.2s linear infinite;
        }
      </style>
    `;
    svg.appendChild(defs);

    // Architectural coordinate grid
    const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gridRect.setAttribute('width', '1000');
    gridRect.setAttribute('height', '600');
    gridRect.setAttribute('fill', 'url(#archGrid)');
    svg.appendChild(gridRect);

    // Territory schematic boundaries
    const territoryPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    territoryPath.setAttribute('d', `
      M 80,180 
      Q 160,110 320,170 
      T 560,160 
      T 690,140 
      T 880,120 
      Q 920,180 870,270 
      T 760,330 
      T 640,360 
      T 570,540 
      Q 480,510 450,440 
      T 360,400 
      T 220,310 
      Z
    `);
    territoryPath.setAttribute('fill', '#F4F3EE');
    territoryPath.setAttribute('stroke', '#DCD9CE');
    territoryPath.setAttribute('stroke-width', '1.2');
    svg.appendChild(territoryPath);

    // Network corridor lines connecting from Tashkent Central Hub
    const tashkent = this.regions.find(r => r.id === 'tashkent') || { coordinates: { x: 680, y: 200 } };
    const networkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    networkGroup.setAttribute('class', 'map-network-lines');

    this.lines = [];
    this.regions.forEach(region => {
      if (region.id !== 'tashkent') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', tashkent.coordinates.x);
        line.setAttribute('y1', tashkent.coordinates.y);
        line.setAttribute('x2', region.coordinates.x);
        line.setAttribute('y2', region.coordinates.y);
        line.setAttribute('stroke', '#D5D2C7');
        line.setAttribute('stroke-width', '0.85');
        line.setAttribute('stroke-dasharray', '3 3');
        line.setAttribute('data-target-id', region.id);
        line.style.transition = 'stroke 0.25s ease, stroke-width 0.25s ease';
        networkGroup.appendChild(line);
        this.lines.push({ id: region.id, element: line });
      }
    });
    svg.appendChild(networkGroup);

    // Region nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'map-nodes-layer');

    this.regions.forEach(region => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'map-region-node');
      g.setAttribute('data-id', region.id);
      g.setAttribute('transform', `translate(${region.coordinates.x}, ${region.coordinates.y})`);
      g.style.cursor = 'pointer';
      g.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';

      const isCapital = region.id === 'tashkent';
      const mainColor = isCapital ? '#DE3E15' : '#111110';
      const radius = isCapital ? 7 : 5;

      g.innerHTML = `
        <circle r="${radius + 4}" fill="transparent" stroke="${isCapital ? 'rgba(222, 62, 21, 0.3)' : 'rgba(0, 0, 0, 0.08)'}" stroke-width="1.5"/>
        <circle r="${radius}" fill="${mainColor}" stroke="#FBFBFA" stroke-width="1.5"/>
        <text y="${radius + 13}" text-anchor="middle" font-family="'Geist', -apple-system, sans-serif" font-size="10.5" font-weight="600" fill="#111110" style="user-select: none; pointer-events: none;">
          ${region.name.split(' ')[0]}
        </text>
        <text y="${radius + 23}" text-anchor="middle" font-family="'IBM Plex Mono', monospace" font-size="8.5" font-weight="500" fill="#7D7A73" style="user-select: none; pointer-events: none;">
          ${region.foundersCount}+
        </text>
      `;

      g.addEventListener('click', () => {
        this.selectRegion(region.id);
      });

      g.addEventListener('mouseenter', () => {
        this.selectRegion(region.id);
      });

      nodesGroup.appendChild(g);
    });

    svg.appendChild(nodesGroup);
    this.container.innerHTML = '';
    this.container.appendChild(svg);
  }

  renderList() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    this.regions.forEach(region => {
      const li = document.createElement('li');
      li.style.listStyle = 'none';

      const btn = document.createElement('button');
      btn.className = `regional-node-btn ${this.activeRegion && this.activeRegion.id === region.id ? 'active' : ''}`;
      btn.setAttribute('data-id', region.id);

      btn.innerHTML = `
        <span>${region.name.split(' ')[0]}</span>
        <span style="font-family: var(--font-mono); font-size: 0.6875rem; color: var(--accent-signal);">${region.foundersCount}+</span>
      `;

      btn.addEventListener('click', () => {
        this.selectRegion(region.id);
      });

      btn.addEventListener('mouseenter', () => {
        this.selectRegion(region.id);
      });

      li.appendChild(btn);
      this.listContainer.appendChild(li);
    });
  }

  selectRegion(regionId) {
    const region = this.regions.find(r => r.id === regionId);
    if (!region) return;
    this.activeRegion = region;
    this.renderDrawer();

    // Update button states
    if (this.listContainer) {
      const btns = this.listContainer.querySelectorAll('.regional-node-btn');
      btns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === regionId);
      });
    }

    // Highlight node and active corridor in SVG
    if (this.container) {
      const nodes = this.container.querySelectorAll('.map-region-node');
      nodes.forEach(node => {
        const isCurrent = node.getAttribute('data-id') === regionId;
        node.style.opacity = isCurrent ? '1' : '0.65';
      });

      // Highlight corresponding connection line
      this.lines.forEach(item => {
        if (item.id === regionId) {
          item.element.classList.add('active-corridor');
        } else {
          item.element.classList.remove('active-corridor');
        }
      });
    }
  }

  renderDrawer() {
    if (!this.drawer || !this.activeRegion) return;
    const r = this.activeRegion;

    this.drawer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="mono-tag signal">${r.category}</span>
        <span style="font-family: var(--font-mono); font-size: 0.6875rem; color: var(--text-tertiary);">REGION // ${r.id.toUpperCase()}</span>
      </div>

      <h4 class="region-name" style="margin-top: 0.25rem;">${r.name}</h4>

      <div class="region-stats">
        <span><strong>${r.foundersCount}+</strong> Founders Connected</span>
        <span>&bull;</span>
        <span><strong>${r.startupsCount}</strong> Active Startups</span>
      </div>

      <p class="region-desc">
        ${r.description}
      </p>

      <div>
        <div style="font-family: var(--font-mono); font-size: 0.6875rem; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 0.35rem;">
          Verified Innovation Hubs:
        </div>
        <div style="display: flex; gap: 0.375rem; flex-wrap: wrap;">
          ${r.hubs.map(hub => `<span style="display: inline-block; font-family: var(--font-mono); font-size: 0.6875rem; padding: 0.25rem 0.5rem; background: rgba(255, 255, 255, 0.08); border-radius: 4px; color: #FFFFFF;">${hub}</span>`).join('')}
        </div>
      </div>
    `;
  }
}
