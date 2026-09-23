/**
 * Founders Community Uzbekistan
 * Editorial Design System — Final Pass
 * Application Orchestrator
 */

import { RegionalMap } from './map.js';
import { HeroNetwork } from './network.js';

class App {
  constructor() {
    this.data = null;
    this.regionalMap = null;
    this.heroNetwork = null;
    this.currentGalleryFilter = 'all';
    this.init();
  }

  async init() {
    try {
      const response = await fetch('./data/community.json');
      if (!response.ok) throw new Error('Failed to load community.json');
      this.data = await response.json();
    } catch (e) {
      console.error('Failed to load community dataset:', e);
      return;
    }

    this.initRevealAnimations();
    this.initMarquee();
    this.initHeroNetwork();
    this.initAnimatedCounters();
    this.initRegionalMap();
    this.initPartners();
    this.initGallery();
    this.initJoinModal();
    this.initMobileNav();
    this.initSmoothScroll();
  }

  /* --------------------------------------------------------------------------
     00. Scroll-entry Reveal Animations
     -------------------------------------------------------------------------- */
  initRevealAnimations() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -30px 0px'
    });

    elements.forEach(el => observer.observe(el));
  }

  /* --------------------------------------------------------------------------
     01. Regions Marquee Strip
     -------------------------------------------------------------------------- */
  initMarquee() {
    const track = document.getElementById('marquee-track');
    if (!track) return;

    const regions = [
      'TASHKENT', 'SAMARKAND', 'FERGANA', 'BUKHARA', 'ANDIJAN',
      'NAMANGAN', 'NAVOI', 'KHOREZM', 'KASHKADARYA', 'SURKHANDARYA',
      'JIZZAKH', 'KARAKALPAKSTAN'
    ];

    // Build the marquee content — duplicated for seamless loop
    const buildItems = () => {
      return regions.map(r => `
        <span class="marquee-item">${r}</span>
        <span class="marquee-item-sep">—</span>
      `).join('');
    };

    // Three repetitions to ensure seamless scroll
    track.innerHTML = buildItems() + buildItems() + buildItems();
  }

  /* --------------------------------------------------------------------------
     02. Living Hero Founder Network
     -------------------------------------------------------------------------- */
  initHeroNetwork() {
    this.heroNetwork = new HeroNetwork('hero-network-canvas', 'hero-stat-card');
  }

  /* --------------------------------------------------------------------------
     03. Animated Statistics Counters (Ease-Out Count-up)
     -------------------------------------------------------------------------- */
  initAnimatedCounters() {
    const counterElements = document.querySelectorAll('[data-counter-target]');
    if (!counterElements.length) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateCount = (el) => {
      const target = parseInt(el.getAttribute('data-counter-target'), 10);
      const suffix = el.getAttribute('data-counter-suffix') || '';
      const prefix = el.getAttribute('data-counter-prefix') || '';

      if (prefersReducedMotion || isNaN(target)) {
        el.textContent = `${prefix}${target.toLocaleString('en-US')}${suffix}`;
        return;
      }

      // Duration: large numbers get 2s, small numbers 1.2s
      const duration = target > 500 ? 2000 : (target > 50 ? 1500 : 1200);
      let startTime = null;

      // Exponential ease-out — natural, elegant slowing
      const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easeVal = easeOutExpo(progress);
        const currentVal = Math.floor(easeVal * target);

        el.textContent = `${prefix}${currentVal.toLocaleString('en-US')}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = `${prefix}${target.toLocaleString('en-US')}${suffix}`;
        }
      };

      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target); // Once per page load
        }
      });
    }, {
      threshold: 0.25,
      rootMargin: '0px 0px -40px 0px'
    });

    counterElements.forEach(el => observer.observe(el));
  }

  /* --------------------------------------------------------------------------
     04. Regional Cartographic Map
     -------------------------------------------------------------------------- */
  initRegionalMap() {
    if (this.data && this.data.regions) {
      this.regionalMap = new RegionalMap('map-svg-container', 'region-drawer-content', this.data.regions);
    }
  }

  /* --------------------------------------------------------------------------
     05. Institutional Ecosystem Partners
     -------------------------------------------------------------------------- */
  initPartners() {
    const container = document.getElementById('partners-wall');
    const partners = this.data.partners || [];
    if (!container || partners.length === 0) return;

    container.innerHTML = '';
    partners.forEach((partner, idx) => {
      const card = document.createElement('a');
      card.className = 'partner-card reveal';
      // Stagger delay by index
      if (idx > 0 && idx < 4) card.classList.add(`reveal-delay-${idx}`);
      card.href = partner.url || '#';
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.setAttribute('aria-label', partner.name);

      const logoSrc = partner.logo || '';
      let logoHtml = '';
      if (logoSrc) {
        logoHtml = `<img src="${logoSrc}" alt="${partner.name}" class="partner-logo-img" onerror="this.style.display='none';">`;
      }

      card.innerHTML = `
        ${logoHtml}
        <span class="partner-name">${partner.name}</span>
        <span class="partner-role">${partner.role || partner.category || 'Ecosystem Partner'}</span>
      `;
      container.appendChild(card);
    });

    // Trigger reveal observer for newly-created partner cards
    this._observeNewReveals(container.querySelectorAll('.reveal'));
  }

  /* --------------------------------------------------------------------------
     06. Documentary Photo Archive (Filtered & Lightbox)
     -------------------------------------------------------------------------- */
  initGallery() {
    const grid = document.getElementById('gallery-grid');
    const filterContainer = document.getElementById('gallery-filter-bar');
    const photos = this.data.photos || [];
    if (!grid || photos.length === 0) return;

    // Create lightbox element if not present
    let lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.id = 'gallery-lightbox';
      lightbox.className = 'gallery-lightbox-backdrop';
      lightbox.innerHTML = `
        <div class="gallery-lightbox-container" onclick="event.stopPropagation()">
          <div class="gallery-lightbox-img-wrap">
            <img id="gallery-lightbox-img" src="" alt="">
          </div>
          <div class="gallery-lightbox-details">
            <div>
              <div id="gallery-lightbox-cat" class="mono-tag signal" style="font-size:0.75rem; margin-bottom:0.25rem;"></div>
              <h3 id="gallery-lightbox-title" style="color:#FBFBFA; font-size:1.0625rem; margin:0 0 0.25rem 0;"></h3>
              <div id="gallery-lightbox-meta" style="font-family:var(--font-mono); font-size:0.6875rem; color:#9E9C95;"></div>
              <p id="gallery-lightbox-caption" style="font-size:0.875rem; color:#7D7A73; margin:0.5rem 0 0 0; line-height:1.5;"></p>
            </div>
            <button class="gallery-lightbox-close" id="gallery-lightbox-close-btn" aria-label="Close">&times;</button>
          </div>
        </div>
      `;
      document.body.appendChild(lightbox);

      const closeLightbox = () => lightbox.classList.remove('active');
      lightbox.addEventListener('click', closeLightbox);
      document.getElementById('gallery-lightbox-close-btn').addEventListener('click', closeLightbox);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
          closeLightbox();
        }
      });
    }

    const openPhotoModal = (photo) => {
      const img = document.getElementById('gallery-lightbox-img');
      const cat = document.getElementById('gallery-lightbox-cat');
      const title = document.getElementById('gallery-lightbox-title');
      const meta = document.getElementById('gallery-lightbox-meta');
      const caption = document.getElementById('gallery-lightbox-caption');

      img.src = photo.image;
      img.alt = photo.title;
      cat.textContent = photo.category || 'Archive';
      title.textContent = photo.title;
      meta.textContent = `${photo.location || ''} · ${photo.date || ''}`;
      caption.textContent = photo.caption || '';

      lightbox.classList.add('active');
    };

    const renderPhotos = (filter) => {
      this.currentGalleryFilter = filter;
      grid.innerHTML = '';

      const filtered = filter === 'all'
        ? photos
        : photos.filter(p => p.category === filter);

      if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-tertiary); font-family: var(--font-mono); font-size: 0.8125rem;">No photographs in this category archive.</div>`;
        return;
      }

      filtered.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
          <img src="${photo.image}" alt="${photo.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1000&q=80'">
          <div class="gallery-overlay">
            <div class="gallery-overlay-cat">${photo.category}</div>
            <div class="gallery-overlay-title">${photo.title}</div>
            <div style="font-family: var(--font-mono); font-size: 0.625rem; color: rgba(251,251,250,0.55); margin-top: 0.3rem; letter-spacing: 0.04em;">
              ${photo.location} · ${photo.date}
            </div>
          </div>
        `;
        item.addEventListener('click', () => openPhotoModal(photo));
        grid.appendChild(item);
      });
    };

    if (filterContainer) {
      filterContainer.querySelectorAll('.filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          filterContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderPhotos(btn.getAttribute('data-gallery-filter'));
        });
      });
    }

    renderPhotos('all');
  }

  /* --------------------------------------------------------------------------
     07. Application Intake Modal
     -------------------------------------------------------------------------- */
  initJoinModal() {
    const overlay = document.getElementById('join-modal-overlay');
    const closeBtn = document.getElementById('join-close-btn');
    const form = document.getElementById('join-form');
    const allTriggers = document.querySelectorAll('.trigger-join-modal');

    const closeModal = () => {
      if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    };

    this.openJoinModal = () => {
      if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    };

    allTriggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openJoinModal();
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
        closeModal();
      }
    });

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          form.reset();
          closeModal();
          alert('Thank you! Your application has been submitted to Founders Community.');
        }, 500);
      });
    }
  }

  /* --------------------------------------------------------------------------
     08. Mobile Navigation Drawer
     -------------------------------------------------------------------------- */
  initMobileNav() {
    const btn = document.getElementById('mobile-menu-btn');
    const drawer = document.getElementById('mobile-nav');

    if (btn && drawer) {
      btn.addEventListener('click', () => {
        const isOpen = drawer.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', isOpen.toString());
      });

      drawer.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          drawer.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
     09. Smooth Scroll
     -------------------------------------------------------------------------- */
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (!targetId || targetId === '#' || targetId === '#join') return;
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     Internal: observe newly-created reveal elements
     -------------------------------------------------------------------------- */
  _observeNewReveals(elements) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    elements.forEach(el => observer.observe(el));
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.FC_APP = new App();
});
