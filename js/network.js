/**
 * Founders Community Living Network Engine
 * Renders an organic, subtle network of founder nodes and connections
 * symbolizing 1,250+ founders connected across 12 regions of Uzbekistan.
 *
 * Design intent: human, regional, calm — not AI/sci-fi.
 * Nodes drift slowly. Connections form and fade organically.
 */

export class HeroNetwork {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    if (!this.canvas || !this.container) return;

    this.ctx = this.canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.nodes = [];
    this.pulses = [];
    this.mouse = { x: -1000, y: -1000, active: false };
    this.hoveredNode = null;
    this.animFrameId = null;
    this.isVisible = false;
    this.tick = 0;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 12 regional hubs with realistic Uzbekistan population density
    this.regionNames = [
      { name: 'Tashkent',     count: 450, hub: true },
      { name: 'Samarkand',    count: 140, hub: true },
      { name: 'Fergana',      count: 110, hub: true },
      { name: 'Andijan',      count: 95,  hub: true },
      { name: 'Namangan',     count: 90,  hub: true },
      { name: 'Bukhara',      count: 85,  hub: true },
      { name: 'Navoi',        count: 55,  hub: true },
      { name: 'Khorezm',      count: 45,  hub: true },
      { name: 'Kashkadarya',  count: 40,  hub: true },
      { name: 'Jizzakh',      count: 35,  hub: true },
      { name: 'Karakalpakstan', count: 35, hub: true },
      { name: 'Surkhandarya', count: 30,  hub: true }
    ];

    this.init();
  }

  init() {
    this.resize();
    this.createNodes();
    this.bindEvents();
    this.setupObserver();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  createNodes() {
    this.nodes = [];
    // More nodes on larger screens for richer visual
    const count = this.width < 500 ? 20 : (this.width < 900 ? 32 : 44);

    // 12 regional hub nodes with phase offset for organic sine wave drift
    this.regionNames.forEach((reg, i) => {
      const margin = 50;
      const x = margin + Math.random() * (this.width - margin * 2);
      const y = margin + Math.random() * (this.height - margin * 2);
      this.nodes.push({
        id: `hub-${i}`,
        name: reg.name,
        count: reg.count,
        isHub: true,
        x,
        y,
        baseX: x,
        baseY: y,
        phase: Math.random() * Math.PI * 2,          // sine wave phase
        speed: 0.12 + Math.random() * 0.08,          // drift speed
        amplitude: 14 + Math.random() * 10,          // drift range
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        radius: reg.name === 'Tashkent' ? 4.5 : 3.2,
        // On dark background: Tashkent = accent, others = white
        color: reg.name === 'Tashkent' ? '#DE3E15' : '#FFFFFF',
        alpha: reg.name === 'Tashkent' ? 0.95 : 0.55
      });
    });

    // Secondary founder nodes (smaller, dimmer)
    const remaining = count - this.nodes.length;
    for (let i = 0; i < remaining; i++) {
      const x = 24 + Math.random() * (this.width - 48);
      const y = 24 + Math.random() * (this.height - 48);
      this.nodes.push({
        id: `builder-${i}`,
        name: '',
        count: 1,
        isHub: false,
        x,
        y,
        baseX: x,
        baseY: y,
        phase: Math.random() * Math.PI * 2,
        speed: 0.08 + Math.random() * 0.06,
        amplitude: 8 + Math.random() * 12,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        radius: 1.5 + Math.random() * 1.5,
        color: Math.random() > 0.8 ? '#DE3E15' : '#FFFFFF',
        alpha: 0.12 + Math.random() * 0.2
      });
    }
  }

  bindEvents() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.resize();
        this.createNodes();
        if (this.prefersReducedMotion) this.drawStatic();
      }, 100);
    });

    const handleMove = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = clientX - rect.left;
      this.mouse.y = clientY - rect.top;
      this.mouse.active = true;

      let closest = null;
      let minDistance = 32;

      for (const node of this.nodes) {
        const dx = node.x - this.mouse.x;
        const dy = node.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          closest = node;
        }
      }
      this.hoveredNode = closest;
    };

    this.container.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    this.container.addEventListener('mouseleave', () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
      this.mouse.active = false;
      this.hoveredNode = null;
    });
    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  setupObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        this.isVisible = entry.isIntersecting;
        if (this.isVisible) {
          this.prefersReducedMotion ? this.drawStatic() : this.startLoop();
        } else {
          this.stopLoop();
        }
      });
    }, { threshold: 0.1 });

    observer.observe(this.container);
  }

  startLoop() {
    if (this.animFrameId) return;
    let lastPulseTime = 0;

    const loop = (now) => {
      if (!this.isVisible) return;
      this.tick++;

      // Slower pulse interval (calmer, more organic)
      if (now - lastPulseTime > 2400 && this.nodes.length > 2) {
        lastPulseTime = now;
        // Prefer hub → hub connections
        const hubs = this.nodes.filter(n => n.isHub);
        if (hubs.length > 1) {
          const n1 = hubs[Math.floor(Math.random() * hubs.length)];
          const neighbors = this.getNeighbors(n1, 180);
          if (neighbors.length > 0) {
            const n2 = neighbors[Math.floor(Math.random() * neighbors.length)];
            this.pulses.push({
              start: n1,
              end: n2,
              progress: 0,
              speed: 0.008 + Math.random() * 0.006  // slower = more deliberate
            });
          }
        }
      }

      this.update();
      this.draw();
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  getNeighbors(node, maxDist) {
    const res = [];
    for (const other of this.nodes) {
      if (other === node) continue;
      const dx = other.x - node.x;
      const dy = other.y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) < maxDist) res.push(other);
    }
    return res;
  }

  update() {
    const t = this.tick * 0.006;
    const pad = 20;

    for (const node of this.nodes) {
      // Gentle sine wave drift (organic breathing motion)
      node.x = node.baseX + Math.sin(t * node.speed + node.phase) * node.amplitude;
      node.y = node.baseY + Math.cos(t * node.speed * 0.7 + node.phase) * node.amplitude * 0.6;

      // Slow base position drift + boundary
      node.baseX += node.vx;
      node.baseY += node.vy;

      if (node.baseX < pad) { node.baseX = pad; node.vx *= -1; }
      if (node.baseX > this.width - pad) { node.baseX = this.width - pad; node.vx *= -1; }
      if (node.baseY < pad) { node.baseY = pad; node.vy *= -1; }
      if (node.baseY > this.height - pad) { node.baseY = this.height - pad; node.vy *= -1; }
    }

    // Progress connection pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].progress += this.pulses[i].speed;
      if (this.pulses[i].progress >= 1) this.pulses.splice(i, 1);
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Connection distance adapts to canvas size
    const maxDist = this.width < 500 ? 90 : (this.width < 900 ? 115 : 140);

    // Draw connection hairlines (very faint on dark bg)
    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDist) {
          const proximity = 1 - dist / maxDist;
          const isHoverConn = this.hoveredNode && (this.hoveredNode === n1 || this.hoveredNode === n2);

          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(n2.x, n2.y);

          if (isHoverConn) {
            this.ctx.strokeStyle = `rgba(222, 62, 21, ${proximity * 0.6})`;
            this.ctx.lineWidth = 1;
          } else {
            // White hairlines on dark background
            this.ctx.strokeStyle = `rgba(255, 255, 255, ${proximity * 0.08})`;
            this.ctx.lineWidth = 0.6;
          }
          this.ctx.stroke();
        }
      }
    }

    // Animated connection pulses (founder → founder)
    for (const p of this.pulses) {
      const px = p.start.x + (p.end.x - p.start.x) * p.progress;
      const py = p.start.y + (p.end.y - p.start.y) * p.progress;
      const alpha = Math.sin(p.progress * Math.PI) * 0.9;

      this.ctx.beginPath();
      this.ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(222, 62, 21, ${alpha})`;
      this.ctx.fill();
    }

    // Draw nodes
    for (const node of this.nodes) {
      const isHovered = this.hoveredNode === node;
      const r = isHovered ? node.radius + 1.5 : node.radius;

      // Subtle outer ring on hub nodes
      if (node.isHub) {
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        this.ctx.strokeStyle = isHovered
          ? 'rgba(222, 62, 21, 0.4)'
          : 'rgba(255, 255, 255, 0.06)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }

      // Core dot
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = isHovered ? '#DE3E15' : node.color;
      this.ctx.globalAlpha = isHovered ? 1 : node.alpha;
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    }

    // Tooltip on hover (hub nodes only)
    if (this.hoveredNode && this.hoveredNode.isHub) {
      this.drawTooltip(this.hoveredNode);
    }
  }

  drawTooltip(node) {
    const text = `${node.name} · ${node.count}+ founders`;
    this.ctx.font = "500 10px 'IBM Plex Mono', monospace";
    const textWidth = this.ctx.measureText(text).width;
    const px = 10, py = 5;
    const bw = textWidth + px * 2;
    const bh = 22;

    let tx = node.x - bw / 2;
    let ty = node.y - bh - 10;

    if (tx < 6) tx = 6;
    if (tx + bw > this.width - 6) tx = this.width - bw - 6;
    if (ty < 6) ty = node.y + 14;

    // Dark pill tooltip
    this.ctx.fillStyle = 'rgba(17, 17, 16, 0.9)';
    this.ctx.beginPath();
    this.ctx.roundRect(tx, ty, bw, bh, 4);
    this.ctx.fill();

    this.ctx.fillStyle = '#FBFBFA';
    this.ctx.fillText(text, tx + px, ty + 14);
  }

  drawStatic() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const maxDist = 120;

    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(n2.x, n2.y);
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - dist / maxDist) * 0.08})`;
          this.ctx.lineWidth = 0.6;
          this.ctx.stroke();
        }
      }
    }

    for (const node of this.nodes) {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = node.color;
      this.ctx.globalAlpha = node.alpha;
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    }
  }
}
