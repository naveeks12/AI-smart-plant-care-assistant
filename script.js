/* ==========================================================================
   FloraMind AI — Your Intelligent Plant Companion
   script.js  |  All front-end intelligence (no framework, no external AI API)
   --------------------------------------------------------------------------
   Contents
     01. Config + tiny helpers
     02. Toasts
     03. Backend bridge (Flask /analyze + /chat with automatic JS fallback)
     04. Page loader
     05. Theme (dark / light) with smooth transition
     06. Navbar (blur on scroll, active link, mobile collapse)
     07. Hero: typing effect + stat counters + plant growth trigger
     08. AI Plant Scanner (drag&drop, canvas analysis, mock AI result)
     09. Smart Care Dashboard (localStorage plants, countdown, sun, gauge, climate)
     10. Plant Library (search + filter + flip cards)
     11. Growth timeline
     12. Fertilizer calculator
     13. Weather widget (mock data -> care advice)
     14. Daily checklist + confetti
     15. Notifications (watering reminders)
     16. AI Chat assistant (floating widget, typing dots, voice input)
     17. Boot
   ========================================================================== */
'use strict';

/* ==========================================================================
   01. CONFIG + HELPERS
   ========================================================================== */
const FLORA = {
  /* When index.html is opened directly from disk (file://) the page talks to
     the optional Flask server on port 5000. When Flask itself serves the page
     we simply use same-origin requests. */
  apiBase: (location.protocol === 'file:' || location.port !== '5000')
    ? 'http://127.0.0.1:5000'
    : '',

  ls: {
    theme: 'flora.theme',
    plants: 'flora.plants',
    checklist: 'flora.checklist.',
    chat: 'flora.chat'
  },

  backendOnline: false
};

/* Short query helpers */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Random integer between min and max (inclusive) */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* Random float with fixed decimals */
const randFloat = (min, max, d = 1) => +(Math.random() * (max - min) + min).toFixed(d);

/* Pick a random element from an array */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Escape user supplied text before injecting into innerHTML */
const esc = (str) => String(str).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* Safe JSON read from localStorage */
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

/* Safe JSON write to localStorage */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* Storage can be full or blocked (private mode) — silently ignore */
  }
}

/* Image generator endpoint (keeps every web image on a single trusted host) */
const IMG = (prompt, size = 'landscape_4_3') =>
  `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;

/* ==========================================================================
   02. TOASTS
   ========================================================================== */
function toast(message, icon = 'fa-circle-check', ms = 3600) {
  const wrap = $('#toastWrap');
  if (!wrap) return;

  const el = document.createElement('div');
  el.className = 'flora-toast';
  el.innerHTML = `<i class="fa-solid ${icon}"></i><div>${message}</div>`;
  wrap.appendChild(el);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 420);
  }, ms);
}

/* ==========================================================================
   03. BACKEND BRIDGE
   --------------------------------------------------------------------------
   Every AI call first tries the Flask backend, then falls back to the local
   JavaScript mock so the site is 100% functional as a static page.
   ========================================================================== */
const Backend = {
  /* One-time probe so we never add latency to requests we know will fail */
  async probe() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`${FLORA.apiBase}/health`, { signal: ctrl.signal });
      FLORA.backendOnline = res.ok;
    } catch (e) {
      FLORA.backendOnline = false;
    } finally {
      clearTimeout(timer);
    }
    return FLORA.backendOnline;
  },

  /* POST JSON -> parsed response, or null when the backend is unreachable */
  async post(path, payload, timeout = 2500) {
    if (!FLORA.backendOnline) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${FLORA.apiBase}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return null; /* caller uses local mock */
    } finally {
      clearTimeout(timer);
    }
  }
};

/* ==========================================================================
   04. PAGE LOADER
   ========================================================================== */
function hideLoader() {
  const loader = $('#loader');
  if (!loader) return;
  loader.classList.add('is-hidden');
  setTimeout(() => { loader.style.display = 'none'; }, 750);
}

/* ==========================================================================
   05. THEME (dark / light)
   ========================================================================== */
const Theme = {
  init() {
    /* localStorage wins, otherwise follow the OS preference */
    const saved = lsGet(FLORA.ls.theme, null);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved || (prefersDark ? 'dark' : 'light'), false);

    $('#themeToggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
      this.apply(next, true);
    });
  },

  apply(mode, persist) {
    document.documentElement.setAttribute('data-bs-theme', mode);
    if (persist) lsSet(FLORA.ls.theme, mode);

    /* Keep the Chart.js gauge readable in both themes */
    if (window.FloraDashboard) window.FloraDashboard.repaintChart();
  }
};

/* ==========================================================================
   06. NAVBAR
   ========================================================================== */
const Navbar = {
  init() {
    const nav = $('#mainNav');
    const links = $$('.flora-nav .nav-link');
    const sections = links
      .map((l) => $(l.getAttribute('href')))
      .filter(Boolean);

    /* Blur / solid background after scrolling */
    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 24);

      /* Highlight the section currently in view */
      const y = window.scrollY + 140;
      let current = sections[0];
      sections.forEach((s) => { if (s.offsetTop <= y) current = s; });
      links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${current.id}`));
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* Collapse the mobile menu after choosing a link */
    const collapse = $('#navMenu');
    links.forEach((l) => l.addEventListener('click', () => {
      if (collapse?.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(collapse).hide();
      }
    }));
  }
};

/* ==========================================================================
   07. HERO — typing effect, counters, growth animation
   ========================================================================== */
const Hero = {
  phrases: [
    'Analyzing leaf patterns with neural vision…',
    'Detecting 38 plant diseases at 96.4% accuracy…',
    'Building your personalised care plan…',
    'Predicting your next watering window…'
  ],

  init() {
    this.typeLoop();
    this.counters();
  },

  /* Typewriter that cycles through the phrases above */
  typeLoop() {
    const el = $('#typingText');
    if (!el) return;

    let phrase = 0, char = 0, deleting = false;

    const tick = () => {
      const text = this.phrases[phrase];

      if (!deleting) {
        char++;
        el.textContent = text.slice(0, char);
        if (char === text.length) {
          deleting = true;
          return setTimeout(tick, 1700);           /* pause on full sentence */
        }
        return setTimeout(tick, 34);
      }

      char--;
      el.textContent = text.slice(0, char);
      if (char === 0) {
        deleting = false;
        phrase = (phrase + 1) % this.phrases.length;
        return setTimeout(tick, 320);
      }
      setTimeout(tick, 16);
    };

    setTimeout(tick, 900);
  },

  /* Animated statistics counters (eased, GPU friendly) */
  counters() {
    const nodes = $$('[data-count]');
    if (!nodes.length) return;

    const run = (node) => {
      const target = parseFloat(node.dataset.count);
      const decimals = (node.dataset.decimals | 0);
      const suffix = node.dataset.suffix || '';
      const duration = 1700;
      const start = performance.now();

      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);        /* easeOutCubic */
        node.textContent = (target * eased).toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          run(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .4 });

    nodes.forEach((n) => io.observe(n));
  }
};

/* ==========================================================================
   08. AI PLANT SCANNER
   --------------------------------------------------------------------------
   The "AI" is a deterministic simulation:
     a) pixels are sampled from the uploaded image through <canvas>
     b) green coverage / brightness / saturation drive a health score
     c) the score + filename hash picks a disease profile from a knowledge base
   ========================================================================== */
const Scanner = {
  file: null,
  busy: false,

  /* Knowledge base of possible diagnoses, weighted by health score */
  conditions: [
    { name: 'Healthy Foliage', severity: 'none',  emoji: '🌟',
      advice: ['Maintain current watering rhythm', 'Rotate the pot weekly for even light', 'Wipe leaves monthly to keep pores open'] },
    { name: 'Overwatering / Root Stress', severity: 'warning', emoji: '💧',
      advice: ['Let the top 3 cm of soil dry out completely', 'Check the pot drainage holes are not blocked', 'Reduce watering frequency by 30% for 2 weeks'] },
    { name: 'Nitrogen Deficiency', severity: 'warning', emoji: '🍃',
      advice: ['Apply a balanced 10-10-10 fertiliser at half strength', 'Yellow lower leaves indicate mobile nutrient loss', 'Re-check in 10 days for new growth'] },
    { name: 'Leaf Spot Fungus', severity: 'danger', emoji: '🦠',
      advice: ['Remove and bin affected leaves (do not compost)', 'Improve air circulation around the plant', 'Apply a copper-based fungicide every 7 days'] },
    { name: 'Spider Mite Infestation', severity: 'danger', emoji: '🕷️',
      advice: ['Rinse the undersides of leaves with lukewarm water', 'Apply neem oil spray in the evening', 'Isolate from other plants for 2 weeks'] },
    { name: 'Sunburn / Scorched Tips', severity: 'warning', emoji: '☀️',
      advice: ['Move 60 cm away from the window during peak hours', 'Increase humidity with a pebble tray', 'Trim fully brown tips with clean scissors'] },
    { name: 'Low Light Etiolation', severity: 'warning', emoji: '💡',
      advice: ['Relocate to a brighter spot with indirect light', 'Long, stretched stems mean the plant is reaching for sun', 'Consider a 12W full-spectrum LED for 6h a day'] }
  ],

  init() {
    const dz = $('#dropzone');
    const input = $('#fileInput');
    if (!dz || !input) return;

    /* Click + keyboard to browse */
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    /* Native drag & drop */
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));

    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) this.load(f);
    });

    input.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) this.load(f);
    });

    /* Demo button lets visitors try the scanner without a photo */
    $('#demoScanBtn')?.addEventListener('click', () => this.runDemo());
    $('#resetScanBtn')?.addEventListener('click', () => this.reset());
    $('#saveScanBtn')?.addEventListener('click', () => this.saveToDashboard());
  },

  /* Validate the file, then draw a preview */
  load(file) {
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file (JPG or PNG).', 'fa-triangle-exclamation');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('Image is larger than 8 MB — please pick a smaller one.', 'fa-triangle-exclamation');
      return;
    }

    this.file = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      $('#previewImg').src = e.target.result;
      $('#dropzone').classList.add('d-none');
      $('#previewWrap').classList.remove('d-none');
      $('#resultPanel').classList.add('d-none');
      $('#resultCard').classList.remove('show');
      this.scan(e.target.result);
    };
    reader.readAsDataURL(file);
  },

  /* Demo path: scan a generated leaf photo instead of a user upload */
  runDemo() {
    if (this.busy) return;

    const url = IMG('healthy monstera deliciosa leaf, vibrant deep green, no spots, soft daylight, plain white background, macro product photograph', 'square');

    this.file = null;
    $('#previewImg').src = url;
    $('#dropzone').classList.add('d-none');
    $('#previewWrap').classList.remove('d-none');
    $('#resultPanel').classList.add('d-none');
    $('#resultCard').classList.remove('show');

    toast('Demo leaf loaded — running AI vision scan.', 'fa-wand-magic-sparkles');
    this.scan(url);
  },

  reset() {
    this.file = null;
    $('#fileInput').value = '';
    $('#dropzone').classList.remove('d-none');
    $('#previewWrap').classList.add('d-none');
    $('#resultPanel').classList.add('d-none');
    $('#resultCard').classList.remove('show');
    $('#scannerOverlay').classList.remove('active');
    this.busy = false;
  },

  /* Canvas pixel sampling -> simple "computer vision" metrics */
  analysePixels(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const size = 96;                                   /* downsample for speed */
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);

          const { data } = ctx.getImageData(0, 0, size, size);
          let green = 0, dark = 0, bright = 0, total = 0, warmth = 0;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b);
            total++;
            if (g > r * 1.06 && g > b * 1.06) green++;         /* clearly green pixel */
            if (lum < 62) dark++;                              /* shadow / necrosis  */
            if (lum > 205) bright++;                           /* blown highlights   */
            warmth += (r - b);                                 /* yellowing indicator */
          }

          resolve({
            greenRatio: green / total,
            darkRatio: dark / total,
            brightRatio: bright / total,
            warmth: warmth / total
          });
        } catch (err) {
          /* Canvas can be tainted for cross-origin demo images -> neutral metrics */
          resolve({ greenRatio: .46, darkRatio: .12, brightRatio: .08, warmth: 14 });
        }
      };

      img.onerror = () => resolve({ greenRatio: .46, darkRatio: .12, brightRatio: .08, warmth: 14 });
      img.src = src;
    });
  },

  /* Deterministic pseudo-random from a string (so the same photo gives the same result) */
  hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  },

  /* Main pipeline: overlay animation -> metrics -> backend or mock -> render */
  async scan(src) {
    if (this.busy) return;
    this.busy = true;

    const overlay = $('#scannerOverlay');
    const status = $('#scanStatus');
    overlay.classList.add('active');

    const steps = [
      'Uploading image securely…',
      'Extracting leaf geometry…',
      'Running disease classifier…',
      'Cross-checking 1.2M plant records…',
      'Compiling care recommendations…'
    ];
    let step = 0;
    status.textContent = steps[0];
    const stepper = setInterval(() => {
      step = Math.min(step + 1, steps.length - 1);
      status.textContent = steps[step];
    }, 560);

    const metrics = await this.analysePixels(src);
    const key = this.file ? `${this.file.name}-${this.file.size}` : src.slice(-64);
    const seed = this.hash(key);

    /* Give the scanning animation time to breathe (feels like real work) */
    await new Promise((r) => setTimeout(r, 2600));

    clearInterval(stepper);
    overlay.classList.remove('active');

    /* Try Flask first, fall back to the local JS mock */
    const remote = await Backend.post('/analyze', {
      seed,
      metrics,
      filename: this.file?.name || 'demo-leaf.jpg'
    });
    const result = remote || this.localAnalysis(seed, metrics);

    this.render(result);
    this.lastResult = result;
    this.busy = false;
  },

  /* Local mock AI: metrics -> health score -> weighted diagnosis */
  localAnalysis(seed, m) {
    const species = [
      { name: 'Monstera Deliciosa', sci: 'Monstera deliciosa', emoji: '🌿', water: 'Every 7 days', light: 'Bright indirect' },
      { name: 'Snake Plant', sci: 'Dracaena trifasciata', emoji: '🪴', water: 'Every 14 days', light: 'Low to bright' },
      { name: 'Peace Lily', sci: 'Spathiphyllum wallisii', emoji: '🌼', water: 'Every 5 days', light: 'Medium indirect' },
      { name: 'Fiddle Leaf Fig', sci: 'Ficus lyrata', emoji: '🌳', water: 'Every 8 days', light: 'Bright indirect' },
      { name: 'Aloe Vera', sci: 'Aloe barbadensis', emoji: '🌵', water: 'Every 18 days', light: 'Direct sun' },
      { name: 'Boston Fern', sci: 'Nephrolepis exaltata', emoji: '🌱', water: 'Every 3 days', light: 'Filtered shade' },
      { name: 'Rubber Plant', sci: 'Ficus elastica', emoji: '🍃', water: 'Every 9 days', light: 'Medium indirect' },
      { name: 'ZZ Plant', sci: 'Zamioculcas zamiifolia', emoji: '🌾', water: 'Every 16 days', light: 'Low light' }
    ];

    const plant = species[seed % species.length];

    /* Green coverage is the strongest health signal, then shadow/necrosis */
    let health = 52 + m.greenRatio * 62 - m.darkRatio * 46 - m.brightRatio * 22;
    health = Math.max(28, Math.min(99, Math.round(health)));

    /* Condition weighting: healthy when the score is high, diseases otherwise */
    let condition;
    const roll = (seed % 100) / 100;

    if (health >= 84) {
      condition = this.conditions[0];
    } else if (roll < .34) {
      condition = this.conditions[health < 60 ? 3 : 1];
    } else if (roll < .58) {
      condition = this.conditions[2];
    } else if (roll < .76) {
      condition = this.conditions[4];
    } else if (roll < .9) {
      condition = this.conditions[5];
    } else {
      condition = this.conditions[6];
    }

    /* Confidence grows with a cleaner green signal */
    const confidence = Math.min(98.7, 74 + m.greenRatio * 30 - m.darkRatio * 12);

    return {
      source: 'local-js',
      plant: plant.name,
      scientific: plant.sci,
      emoji: plant.emoji,
      health,
      confidence: +confidence.toFixed(1),
      condition: condition.name,
      severity: condition.severity,
      diseaseEmoji: condition.emoji,
      watering: plant.water,
      light: plant.light,
      humidity: health > 80 ? '45–60%' : '55–70%',
      soilPh: randFloat(5.8, 6.9, 1),
      lastChecked: new Date().toLocaleString(),
      tips: condition.advice,
      metrics: {
        greenCoverage: +(m.greenRatio * 100).toFixed(1),
        shadowAreas: +(m.darkRatio * 100).toFixed(1),
        specularSpots: +(m.brightRatio * 100).toFixed(1)
      }
    };
  },

  /* Paint the result panel */
  render(r) {
    const sevClass = { none: 'badge-green', warning: 'badge-amber', danger: 'badge-red' }[r.severity] || 'badge-green';

    $('#rsEmoji').textContent = r.emoji;
    $('#rsPlant').textContent = r.plant;
    $('#rsSci').textContent = r.scientific;
    $('#rsCondition').textContent = `${r.diseaseEmoji} ${r.condition}`;
    $('#rsCondition').className = `badge ${sevClass} badge-soft`;
    $('#rsSource').textContent = r.source === 'flake' ? 'Flask engine' : 'On-device JS model';

    $('#rsConfidence').textContent = `${r.confidence}%`;
    $('#rsWater').textContent = r.watering;
    $('#rsLight').textContent = r.light;
    $('#rsHumidity').textContent = r.humidity;
    $('#rsPh').textContent = r.soilPh;
    $('#rsChecked').textContent = r.lastChecked;

    $('#rsGreen').textContent = `${r.metrics.greenCoverage}%`;
    $('#rsShadow').textContent = `${r.metrics.shadowAreas}%`;
    $('#rsSpec').textContent = `${r.metrics.specularSpots}%`;

    /* Care suggestions */
    $('#rsTips').innerHTML = r.tips.map((t) =>
      `<div class="care-tip"><i class="fa-solid fa-leaf"></i><span>${esc(t)}</span></div>`).join('');

    /* Animate the circular health ring (CSS @property makes the transition smooth) */
    const ring = $('#healthRing');
    ring.style.setProperty('--p', 0);
    setTimeout(() => ring.style.setProperty('--p', r.health), 120);
    $('#healthValue').textContent = `${r.health}%`;
    $('#healthLabel').textContent = r.health >= 84 ? 'Excellent' : r.health >= 65 ? 'Good' : r.health >= 45 ? 'Stressed' : 'Critical';

    const panel = $('#resultPanel');
    panel.classList.remove('d-none');
    requestAnimationFrame(() => panel.classList.add('show'));
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    toast(`Scan complete — ${r.plant} at ${r.health}% health.`, 'fa-microscope');
  },

  /* Push the scanned plant into the dashboard + localStorage */
  saveToDashboard() {
    if (!this.lastResult) return;
    const r = this.lastResult;
    const days = parseInt((r.watering.match(/\d+/) || [7])[0], 10);

    Dashboard.addPlant({
      id: 'p' + Date.now(),
      name: r.plant,
      emoji: r.emoji,
      type: 'Indoor',
      interval: days,
      lastWatered: new Date().toISOString(),
      humidity: r.humidity,
      health: r.health
    });
    toast(`${r.plant} added to your care dashboard.`, 'fa-plus');
  }
};

/* ==========================================================================
   09. SMART CARE DASHBOARD
   ========================================================================== */
const Dashboard = {
  plants: [],
  chart: null,
  moisture: 62,
  timer: null,

  init() {
    this.plants = lsGet(FLORA.ls.plants, this.seedPlants());
    this.renderPlantList();
    this.renderWaterCard();
    this.initSunSlider();
    this.initGauge();
    this.renderClimate();
    this.bindActions();

    /* Live countdown, refreshed every second (cheap text update only) */
    this.timer = setInterval(() => this.renderWaterCard(), 1000);
  },

  /* Three starter plants so the dashboard is never empty on first visit */
  seedPlants() {
    const now = Date.now(), day = 86400000;
    return [
      { id: 'p1', name: 'Monstera Deliciosa', emoji: '🌿', type: 'Indoor',    interval: 7,  lastWatered: new Date(now - 4 * day).toISOString(), health: 92 },
      { id: 'p2', name: 'Snake Plant',        emoji: '🪴', type: 'Indoor',    interval: 14, lastWatered: new Date(now - 12 * day).toISOString(), health: 88 },
      { id: 'p3', name: 'Aloe Vera',          emoji: '🌵', type: 'Succulent', interval: 18, lastWatered: new Date(now - 6 * day).toISOString(), health: 79 }
    ];
  },

  save() { lsSet(FLORA.ls.plants, this.plants); },

  addPlant(plant) {
    this.plants.push(plant);
    this.save();
    this.renderPlantList();
    this.renderWaterCard();
    this.bootstrapModalHide();
  },

  removePlant(id) {
    this.plants = this.plants.filter((p) => p.id !== id);
    this.save();
    this.renderPlantList();
    this.renderWaterCard();
    toast('Plant removed from your garden.', 'fa-trash-can');
  },

  waterNow(id) {
    const p = this.plants.find((x) => x.id === id);
    if (!p) return;
    p.lastWatered = new Date().toISOString();
    this.save();
    this.renderPlantList();
    this.renderWaterCard();
    toast(`${p.name} watered — next one in ${p.interval} days.`, 'fa-droplet');
  },

  bootstrapModalHide() {
    const modal = bootstrap.Modal.getInstance($('#addPlantModal'));
    modal?.hide();
  },

  /* Hours (or days) remaining until the next watering, per plant */
  nextWatering(p) {
    const due = new Date(p.lastWatered).getTime() + p.interval * 86400000;
    return due - Date.now();
  },

  /* Convert milliseconds to a readable countdown */
  formatLeft(ms) {
    if (ms <= 0) return 'Water now!';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  /* Card 1 — watering schedule + progress + local countdown */
  renderWaterCard() {
    if (!this.plants.length) {
      $('#waterNext').textContent = 'No plants yet';
      $('#waterCountdown').textContent = '—';
      $('#waterProgress').style.width = '0%';
      return;
    }

    /* The plant with the smallest remaining time is "next" */
    const sorted = [...this.plants].sort((a, b) => this.nextWatering(a) - this.nextWatering(b));
    const next = sorted[0];
    const left = this.nextWatering(next);
    const total = next.interval * 86400000;
    const elapsedPct = Math.max(0, Math.min(100, ((total - left) / total) * 100));

    $('#waterNext').textContent = `${next.emoji} ${next.name}`;
    $('#waterCountdown').textContent = this.formatLeft(left);
    $('#waterProgress').style.width = `${elapsedPct.toFixed(1)}%`;
    $('#waterProgress').setAttribute('aria-valuenow', elapsedPct.toFixed(0));
    $('#waterDueLabel').textContent = left <= 0 ? 'Due now' : `${Math.round(elapsedPct)}% of cycle elapsed`;
    $('#waterState').textContent = left <= 0 ? 'Thirsty' : left < 86400000 ? 'Almost due' : 'Hydrated';
  },

  renderPlantList() {
    const wrap = $('#plantList');
    if (!wrap) return;

    if (!this.plants.length) {
      wrap.innerHTML = `<p class="small mb-0" style="color:var(--text-3)">Add your first plant to start tracking.</p>`;
      return;
    }

    wrap.innerHTML = this.plants.map((p) => {
      const left = this.nextWatering(p);
      const state = left <= 0 ? 'badge-red' : left < 86400000 ? 'badge-amber' : 'badge-green';
      return `
        <div class="plant-pill">
          <span class="emoji">${p.emoji}</span>
          <div class="flex-grow-1">
            <div class="fw-semibold" style="font-size:.92rem">${esc(p.name)}</div>
            <div class="small" style="color:var(--text-3)">${esc(p.type)} · every ${p.interval} days</div>
          </div>
          <span class="badge ${state} badge-soft">${left <= 0 ? 'Water' : this.formatLeft(left)}</span>
          <button class="btn btn-sm btn-icon border-0" data-water="${p.id}" title="Water now" style="width:34px;height:34px">
            <i class="fa-solid fa-droplet"></i>
          </button>
          <button class="btn btn-sm btn-icon border-0" data-remove="${p.id}" title="Remove" style="width:34px;height:34px">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`;
    }).join('');

    /* Delegated actions for water / remove */
    $$('[data-water]', wrap).forEach((b) =>
      b.addEventListener('click', () => this.waterNow(b.dataset.water)));
    $$('[data-remove]', wrap).forEach((b) =>
      b.addEventListener('click', () => this.removePlant(b.dataset.remove)));
  },

  /* Card 2 — animated sunlight tracker */
  initSunSlider() {
    const slider = $('#sunSlider');
    if (!slider) return;

    const apply = () => {
      const v = +slider.value;
      $('#sunOrb').style.setProperty('--pos', v);
      const label = v < 30 ? 'Low light' : v < 65 ? 'Medium indirect' : 'Bright / direct';
      const advice = v < 30
        ? 'Move closer to a window or add a grow light.'
        : v < 65 ? 'Ideal for most tropical houseplants.'
        : 'Protect shade-lovers from 11am–4pm sun.';
      $('#sunValue').textContent = `${v}%`;
      $('#sunLabel').textContent = label;
      $('#sunAdvice').textContent = advice;
    };

    slider.addEventListener('input', apply);
    apply();
  },

  /* Card 3 — soil moisture gauge (Chart.js doughnut used as a gauge) */
  initGauge() {
    const canvas = $('#moistureChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Moisture', 'Remaining'],
        datasets: [{
          data: [this.moisture, 100 - this.moisture],
          backgroundColor: [this.gradient(ctx), this.trackColor()],
          borderWidth: 0,
          circumference: 180,
          rotation: 270,
          cutout: '76%',
          hoverBackgroundColor: [this.gradient(ctx), this.trackColor()]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { animateRotate: true, duration: 1200, easing: 'easeOutCubic' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        events: []
      }
    });

    $('#refreshMoisture')?.addEventListener('click', () => {
      /* Simulate a fresh sensor reading */
      this.moisture = randInt(24, 88);
      this.updateGauge();
      toast(`Soil sensor re-read: ${this.moisture}% moisture.`, 'fa-gauge-high');
    });

    this.updateGaugeLabel();
  },

  /* Linear gradient for the gauge arc (matches the brand gradient) */
  gradient(ctx) {
    const g = ctx.createLinearGradient(0, 0, 220, 0);
    g.addColorStop(0, '#00C853');
    g.addColorStop(1, '#00E676');
    return g;
  },

  trackColor() {
    return document.documentElement.dataset.bsTheme === 'dark'
      ? 'rgba(255,255,255,.08)' : 'rgba(15,40,25,.08)';
  },

  updateGauge() {
    if (!this.chart) return;
    this.chart.data.datasets[0].data = [this.moisture, 100 - this.moisture];
    this.chart.update();
    this.updateGaugeLabel();
  },

  updateGaugeLabel() {
    const v = this.moisture;
    $('#moistureValue').textContent = `${v}%`;
    $('#moistureState').textContent = v < 35 ? 'Dry — water soon' : v < 70 ? 'Optimal range' : 'Soggy — hold off';
    $('#moistureState').className = `badge badge-soft ${v < 35 ? 'badge-amber' : v < 70 ? 'badge-green' : 'badge-red'}`;
  },

  /* Called after a theme switch so the gauge track stays visible */
  repaintChart() {
    if (!this.chart) return;
    this.chart.data.datasets[0].backgroundColor = [this.chart.data.datasets[0].backgroundColor[0], this.trackColor()];
    this.chart.update('none');
  },

  /* Card 4 — temperature & humidity with a small trend chart */
  renderClimate() {
    const temp = randInt(19, 31);
    const hum = randInt(38, 72);
    $('#climateTemp').textContent = `${temp}°C`;
    $('#climateHum').textContent = `${hum}%`;

    const trend = temp > 27 ? 'Warm — increase watering slightly' : temp < 21 ? 'Cool — reduce watering' : 'Comfortable growing range';
    $('#climateNote').textContent = trend;

    const canvas = $('#climateChart');
    if (canvas && typeof Chart !== 'undefined') {
      if (this.climateChart) this.climateChart.destroy();
      const ctx = canvas.getContext('2d');
      this.climateChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['12a', '6a', '12p', '6p', 'Now'],
          datasets: [{
            data: [temp - 4, temp - 2, temp + 1, temp, temp].map((v) => v),
            borderColor: '#00C853',
            backgroundColor: 'rgba(0,200,83,.16)',
            fill: true,
            tension: .42,
            pointRadius: 0,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
          events: []
        }
      });
    }

    $('#refreshClimate')?.addEventListener('click', () => this.renderClimate());
  },

  /* Modal form + quick actions */
  bindActions() {
    const form = $('#addPlantForm');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#plantName').value.trim();
      if (!name) return;

      this.addPlant({
        id: 'p' + Date.now(),
        name,
        emoji: $('#plantEmoji').value || '🪴',
        type: $('#plantType').value,
        interval: Math.max(1, parseInt($('#plantInterval').value, 10) || 7),
        lastWatered: $('#plantLastWatered').value
          ? new Date($('#plantLastWatered').value).toISOString()
          : new Date().toISOString(),
        health: randInt(72, 97)
      });
      form.reset();
      toast(`${name} is now being tracked.`, 'fa-seedling');
    });

    /* Pre-fill "last watered" with today's date */
    const dateField = $('#plantLastWatered');
    if (dateField) dateField.value = new Date().toISOString().slice(0, 10);
  }
};

/* ==========================================================================
   10. PLANT LIBRARY (search + filter + flip cards)
   ========================================================================== */
const Library = {
  data: [
    { name: 'Monstera Deliciosa', sci: 'Monstera deliciosa', type: 'indoor', emoji: '🌿',
      prompt: 'monstera deliciosa houseplant with split leaves in white ceramic pot, soft natural light, minimal background, product photography',
      tips: ['Water when top 3cm dries', 'Bright indirect light', 'Loves 60% humidity'] },
    { name: 'Snake Plant', sci: 'Dracaena trifasciata', type: 'indoor', emoji: '🪴',
      prompt: 'snake plant sansevieria in modern grey pot on concrete floor, studio lighting, minimal background, product photography',
      tips: ['Water every 2–3 weeks', 'Tolerates low light', 'Never let it sit in water'] },
    { name: 'Peace Lily', sci: 'Spathiphyllum wallisii', type: 'indoor', emoji: '🌼',
      prompt: 'peace lily with white flower in ceramic pot, soft daylight, clean minimal background, product photography',
      tips: ['Drooping = thirsty', 'Medium indirect light', 'Mist leaves weekly'] },
    { name: 'Aloe Vera', sci: 'Aloe barbadensis miller', type: 'succulent', emoji: '🌵',
      prompt: 'aloe vera succulent plant in terracotta pot, bright sunlight, minimal beige background, product photography',
      tips: ['Water every 2–3 weeks', 'Needs direct sun', 'Sandy well-draining soil'] },
    { name: 'Fiddle Leaf Fig', sci: 'Ficus lyrata', type: 'indoor', emoji: '🌳',
      prompt: 'fiddle leaf fig large indoor tree in woven basket planter, bright airy room, minimal background, product photography',
      tips: ['Hates being moved', 'Bright filtered light', 'Water weekly in summer'] },
    { name: 'Boston Fern', sci: 'Nephrolepis exaltata', type: 'indoor', emoji: '🌱',
      prompt: 'boston fern lush green fronds in hanging white pot, soft diffused light, minimal background, product photography',
      tips: ['Keep soil evenly moist', 'Loves high humidity', 'Indirect light only'] },
    { name: 'Jade Plant', sci: 'Crassula ovata', type: 'succulent', emoji: '💚',
      prompt: 'jade plant crassula ovata succulent in white pot, morning sunlight, minimal background, product photography',
      tips: ['Water every 2 weeks', '4+ hours direct sun', 'Drought tolerant'] },
    { name: 'Lavender', sci: 'Lavandula angustifolia', type: 'outdoor', emoji: '💜',
      prompt: 'lavender plant with purple flowers in a terracotta pot outdoors, golden hour sunlight, minimal background, photography',
      tips: ['Full sun 6+ hours', 'Poor sandy soil is best', 'Prune after blooming'] },
    { name: 'Rose Bush', sci: 'Rosa gallica', type: 'outdoor', emoji: '🌹',
      prompt: 'pink rose bush in bloom in a garden bed, soft morning light, blurred green background, photography',
      tips: ['Deep water twice weekly', 'Feed monthly in season', 'Watch for black spot'] },
    { name: 'Echeveria', sci: 'Echeveria elegans', type: 'succulent', emoji: '🌸',
      prompt: 'echeveria rosette succulent in small stone pot, bright light, minimal white background, macro product photography',
      tips: ['Soak and dry method', 'Bright direct light', 'Avoid water in rosette'] },
    { name: 'Bamboo Palm', sci: 'Chamaedorea seifrizii', type: 'indoor', emoji: '🎋',
      prompt: 'bamboo palm indoor plant in tall planter, warm interior light, minimal background, product photography',
      tips: ['Keep soil lightly moist', 'Medium to bright light', 'Great air purifier'] },
    { name: 'Tomato Plant', sci: 'Solanum lycopersicum', type: 'outdoor', emoji: '🍅',
      prompt: 'tomato plant with red ripe tomatoes in a vegetable garden, sunny day, blurred green background, photography',
      tips: ['Water daily when fruiting', 'Needs 8h direct sun', 'Stake for support'] },
    { name: 'String of Pearls', sci: 'Senecio rowleyanus', type: 'succulent', emoji: '🫧',
      prompt: 'string of pearls succulent trailing from a hanging pot, bright soft light, minimal background, product photography',
      tips: ['Water monthly in winter', 'Bright indirect light', 'Shallow pots only'] },
    { name: 'Areca Palm', sci: 'Dypsis lutescens', type: 'indoor', emoji: '🌴',
      prompt: 'areca palm indoor plant in a large pot, bright modern interior, minimal background, product photography',
      tips: ['Keep soil moist', 'Bright indirect light', 'Mist in dry air'] },
    { name: 'Marigold', sci: 'Tagetes erecta', type: 'outdoor', emoji: '🌻',
      prompt: 'orange marigold flowers in a garden bed, bright sunny day, blurred green background, photography',
      tips: ['Full sun all day', 'Water at the base', 'Deadhead to keep blooming'] },
    { name: 'Haworthia', sci: 'Haworthia fasciata', type: 'succulent', emoji: '🌵',
      prompt: 'haworthia zebra cactus succulent in small white pot, soft window light, minimal background, product photography',
      tips: ['Very low water need', 'Bright indirect light', 'Gritty soil mix'] }
  ],

  syncFlag: null,

  init() {
    this.render(this.data);
    this.bindFilters();
    this.bindSearch();
    this.bindFlipForTouch();
  },

  /* Build the grid; images fall back to a gradient + emoji if the host fails */
  render(list) {
    const grid = $('#plantGrid');
    if (!grid) return;

    $('#libraryCount').textContent = `${list.length} plants`;

    if (!list.length) {
      grid.innerHTML = `<div class="col-12 text-center py-5" style="color:var(--text-3)">
        <i class="fa-solid fa-magnifying-glass fa-2x mb-3 d-block"></i>No plants matched your search.</div>`;
      return;
    }

    grid.innerHTML = list.map((p, i) => `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3" data-aos="fade-up" data-aos-delay="${(i % 4) * 80}">
        <div class="flip-card">
          <div class="flip-inner">
            <div class="flip-face">
              <img src="${IMG(p.prompt)}" alt="${esc(p.name)}" loading="lazy" data-emoji="${p.emoji}">
              <div class="flip-body">
                <span class="badge badge-green badge-soft align-self-start text-capitalize">${p.type}</span>
                <h5>${esc(p.name)}</h5>
                <div class="sci">${esc(p.sci)}</div>
                <div class="mt-auto small" style="color:var(--text-3)">
                  <i class="fa-solid fa-rotate-right me-1"></i>Hover to see care tips
                </div>
              </div>
            </div>
            <div class="flip-face flip-back">
              <h6>Care Guide</h6>
              <ul>
                ${p.tips.map((t) => `<li><i class="fa-solid fa-leaf mt-1"></i><span>${esc(t)}</span></li>`).join('')}
              </ul>
              <div class="small fw-semibold mt-2" style="opacity:.8">FloraMind confidence 9${randInt(1, 8)}%</div>
            </div>
          </div>
        </div>
      </div>`).join('');

    /* Image fallback: swap in a gradient tile with the emoji if loading fails */
    $$('img[data-emoji]', grid).forEach((img) => {
      img.addEventListener('error', () => {
        const fallback = document.createElement('div');
        fallback.className = 'd-grid align-items-center justify-content-center img-fallback';
        fallback.style.cssText = 'height:190px;background:linear-gradient(140deg,rgba(0,200,83,.2),rgba(0,191,165,.14));';
        fallback.innerHTML = `<span class="emoji-avatar">${img.dataset.emoji}</span>`;
        img.replaceWith(fallback);
      });
    });

    if (window.AOS) AOS.refreshHard();
  },

  /* Filter chips (All / Indoor / Outdoor / Succulent) */
  bindFilters() {
    $$('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const type = chip.dataset.filter;
        const q = ($('#plantSearch')?.value || '').toLowerCase().trim();
        this.render(this.apply(type, q));
      });
    });
  },

  /* Live search across name, scientific name and type */
  bindSearch() {
    const input = $('#plantSearch');
    input?.addEventListener('input', () => {
      const type = $('.filter-chip.active')?.dataset.filter || 'all';
      this.render(this.apply(type, input.value.toLowerCase().trim()));
    });
  },

  apply(type, q) {
    return this.data.filter((p) => {
      const typeOk = type === 'all' || p.type === type;
      const qOk = !q || p.name.toLowerCase().includes(q) || p.sci.toLowerCase().includes(q) || p.type.includes(q);
      return typeOk && qOk;
    });
  },

  /* Touch devices cannot hover — tap to flip */
  bindFlipForTouch() {
    if (!window.matchMedia('(hover: none)').matches) return;
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.flip-card');
      if (card) card.classList.toggle('flipped');
    });
  }
};

/* ==========================================================================
   11. GROWTH TIMELINE
   ========================================================================== */
const Timeline = {
  init() {
    const items = $$('.tl-item');
    if (!items.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = items.indexOf(entry.target);
        setTimeout(() => entry.target.classList.add('in'), idx * 160);
        io.unobserve(entry.target);
      });
    }, { threshold: .25 });

    items.forEach((i) => { i.classList.add('reveal'); io.observe(i); });

    /* Progress bar fills as the timeline scrolls through the viewport */
    const bar = $('#timelineProgress');
    if (bar) {
      const onScroll = () => {
        const host = $('#growthTimeline');
        const rect = host.getBoundingClientRect();
        const visible = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (rect.height + window.innerHeight * .4)));
        bar.style.width = `${(visible * 100).toFixed(0)}%`;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
};

/* ==========================================================================
   12. FERTILIZER CALCULATOR
   ========================================================================== */
const Fertilizer = {
  /* Dosage factors per plant group, in ml per litre of pot volume per week */
  factors: {
    foliage:  { label: 'Foliage / Tropical', factor: 1.15, npk: '3-1-2' },
    flowering:{ label: 'Flowering',          factor: 1.45, npk: '2-3-4' },
    succulent:{ label: 'Succulent / Cactus', factor: 0.55, npk: '1-2-1' },
    herbs:    { label: 'Herbs / Vegetables', factor: 1.30, npk: '3-2-3' },
    orchid:   { label: 'Orchid',             factor: 0.70, npk: '2-1-2' }
  },

  init() {
    const form = $('#fertilizerForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const key = $('#fertType').value;
      const pot = Math.max(1, parseFloat($('#fertPot').value) || 12);
      const group = this.factors[key];

      /* Pot volume approximation: a round pot of diameter D cm ≈ (D/2)^2 · π · D · 0.5 */
      const litres = +(((pot / 2) ** 2 * Math.PI * pot * 0.5) / 1000).toFixed(2);
      const dose = +Math.max(0.5, litres * group.factor).toFixed(1);
      const water = Math.round(litres * 3.5);
      const weeks = key === 'succulent' ? 'every 8 weeks' : key === 'orchid' ? 'every 4 weeks' : 'every 3 weeks';

      $('#fertVolume').textContent = `${litres} L`;
      $('#fertDose').textContent = `${dose} ml`;
      $('#fertWater').textContent = `${water} ml`;
      $('#fertNpk').textContent = group.npk;
      $('#fertSchedule').textContent = weeks;
      $('#fertOutput').classList.remove('d-none');

      toast(`Fertilizer plan ready for ${group.label}.`, 'fa-flask');
    });
  }
};

/* ==========================================================================
   13. WEATHER WIDGET (mock data -> contextual care advice)
   ========================================================================== */
const Weather = {
  conditions: [
    { icon: 'fa-sun',        label: 'Clear sky',      temp: [28, 35] },
    { icon: 'fa-cloud-sun',  label: 'Partly cloudy',  temp: [24, 30] },
    { icon: 'fa-cloud-rain', label: 'Light showers',  temp: [20, 26] },
    { icon: 'fa-cloud',      label: 'Overcast',       temp: [19, 25] },
    { icon: 'fa-wind',       label: 'Windy',          temp: [21, 28] }
  ],

  init() {
    this.render();
    $('#refreshWeather')?.addEventListener('click', () => {
      this.render();
      toast('Weather refreshed with local sensor data.', 'fa-cloud-sun');
    });
  },

  render() {
    const c = pick(this.conditions);
    const temp = randInt(c.temp[0], c.temp[1]);
    const hum = randInt(35, 78);
    const rainChance = c.icon === 'fa-cloud-rain' ? randInt(60, 92) : randInt(5, 45);

    $('#weatherIcon').className = `fa-solid ${c.icon} weather-icon`;
    $('#weatherIcon').style.color = c.icon === 'fa-sun' ? '#ffb300' : c.icon === 'fa-cloud-rain' ? '#4fa3ff' : 'var(--brand-1)';
    $('#weatherTemp').textContent = `${temp}°C`;
    $('#weatherCondition').textContent = c.label;
    $('#weatherHumidity').textContent = `${hum}%`;
    $('#weatherRain').textContent = `${rainChance}%`;
    $('#weatherWind').textContent = `${randInt(4, 26)} km/h`;

    /* Rule-based care advice derived from the mock weather */
    let advice = 'Conditions are stable — keep your regular watering rhythm.';
    let icon = 'fa-circle-info';

    if (rainChance > 60) {
      advice = 'Rain expected: skip outdoor watering today and check that drainage trays are emptied.';
      icon = 'fa-cloud-showers-heavy';
    } else if (temp >= 32) {
      advice = 'High heat: water early morning, move pots out of direct midday sun and mist leafy plants.';
      icon = 'fa-temperature-high';
    } else if (hum < 42) {
      advice = 'Air is dry: group plants together or use a pebble tray to raise humidity above 50%.';
      icon = 'fa-droplet-slash';
    } else if (temp <= 21) {
      advice = 'Cooler air slows growth — hold back on fertiliser and water less frequently.';
      icon = 'fa-snowflake';
    }

    $('#weatherAdvice').textContent = advice;
    $('#weatherAdviceIcon').className = `fa-solid ${icon}`;
  }
};

/* ==========================================================================
   14. DAILY CHECKLIST + CONFETTI
   ========================================================================== */
const Checklist = {
  tasks: [
    { id: 'water',  icon: 'fa-droplet',       label: 'Water plants that are due today' },
    { id: 'light',  icon: 'fa-sun',           label: 'Rotate pots a quarter turn for even light' },
    { id: 'leaves', icon: 'fa-leaf',          label: 'Wipe dust off large leaves' },
    { id: 'pests',  icon: 'fa-bug',           label: 'Inspect leaf undersides for pests' },
    { id: 'soil',   icon: 'fa-seedling',      label: 'Loosen the top layer of soil' },
    { id: 'misting',icon: 'fa-spray-can',     label: 'Mist humidity-loving plants' }
  ],

  done: [],

  key() {
    /* A fresh checklist every calendar day */
    return FLORA.ls.checklist + new Date().toISOString().slice(0, 10);
  },

  init() {
    this.done = lsGet(this.key(), []);

    const wrap = $('#checklist');
    if (!wrap) return;

    wrap.innerHTML = this.tasks.map((t) => {
      const isDone = this.done.includes(t.id);
      return `
        <div class="check-item ${isDone ? 'done' : ''}" data-task="${t.id}" role="button" tabindex="0">
          <div class="check-box"><i class="fa-solid fa-check"></i></div>
          <div class="check-label flex-grow-1" style="font-size:.92rem">${t.label}</div>
          <i class="fa-solid ${t.icon}" style="color:var(--brand-1)"></i>
        </div>`;
    }).join('');

    /* Click or keyboard activation */
    $$('.check-item', wrap).forEach((el) => {
      const toggle = () => this.toggle(el.dataset.task, el);
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') toggle(); });
    });

    this.updateRing();
  },

  toggle(id, el) {
    const i = this.done.indexOf(id);
    if (i > -1) {
      this.done.splice(i, 1);
      el.classList.remove('done');
    } else {
      this.done.push(id);
      el.classList.add('done');
      Confetti.pop(el);              /* celebrate the individual task */
    }
    lsSet(this.key(), this.done);
    this.updateRing();

    if (this.done.length === this.tasks.length) {
      Confetti.burst();
      toast('Perfect day — every plant task complete! 🌿', 'fa-trophy', 5000);
    }
  },

  updateRing() {
    const pct = Math.round((this.done.length / this.tasks.length) * 100);
    const ring = $('#checkRing');
    if (ring) ring.style.setProperty('--p', pct);
    $('#checkValue').textContent = `${pct}%`;
    $('#checkCount').textContent = `${this.done.length}/${this.tasks.length} tasks`;
  }
};

/* --------------------------------------------------------------------------
   Lightweight canvas confetti (no external library, 60fps friendly)
   -------------------------------------------------------------------------- */
const Confetti = {
  ctx: null,
  raf: null,
  parts: [],

  setup() {
    const canvas = $('#confettiCanvas');
    if (!canvas) return false;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext('2d');
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
    return true;
  },

  spawn(x, y, count, power = 9) {
    const colors = ['#00C853', '#00BFA5', '#00E676', '#FFD54F', '#FF8A65', '#4fa3ff'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * .5;
      const vel = Math.random() * power + 2;
      this.parts.push({
        x, y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 3,
        size: randInt(5, 10),
        color: pick(colors),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * .3,
        life: 1
      });
    }
    this.run();
  },

  pop(el) {
    if (!this.ctx && !this.setup()) return;
    const rect = el.getBoundingClientRect();
    this.spawn(rect.left + 40, rect.top + rect.height / 2, 16, 5);
  },

  burst() {
    if (!this.ctx && !this.setup()) return;
    this.spawn(window.innerWidth / 2, window.innerHeight * .45, 90, 12);
    this.spawn(window.innerWidth * .2, window.innerHeight * .6, 45, 9);
    this.spawn(window.innerWidth * .8, window.innerHeight * .6, 45, 9);
  },

  run() {
    if (this.raf) return;
    const step = () => {
      const { ctx } = this;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      this.parts = this.parts.filter((p) => p.life > 0);
      this.parts.forEach((p) => {
        p.vy += .22;              /* gravity */
        p.vx *= .992;             /* drag    */
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= .008;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
        ctx.restore();
      });

      if (this.parts.length) {
        this.raf = requestAnimationFrame(step);
      } else {
        cancelAnimationFrame(this.raf);
        this.raf = null;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    };
    this.raf = requestAnimationFrame(step);
  }
};

/* ==========================================================================
   15. NOTIFICATIONS — browser watering reminders
   ========================================================================== */
const Reminders = {
  init() {
    $('#notifyBtn')?.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        toast('This browser does not support notifications.', 'fa-bell-slash');
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        toast('Reminders enabled — we will ping you when a plant is thirsty.', 'fa-bell');
        this.fire('FloraMind AI', 'Reminders are on. We will alert you at watering time. 🌿');
        this.schedule();
      } else {
        toast('Notification permission was blocked in your browser settings.', 'fa-bell-slash');
      }
    });
  },

  fire(title, body) {
    try {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%2300C853"/><text y="68" x="50" font-size="56" text-anchor="middle">🌿</text></svg>')
      });
    } catch (e) {
      /* Some browsers require a service worker — fail quietly */
    }
  },

  /* Check every minute; a real product would use a service worker */
  schedule() {
    setInterval(() => {
      if (Notification.permission !== 'granted') return;
      const thirsty = Dashboard.plants.filter((p) => Dashboard.nextWatering(p) <= 0);
      if (thirsty.length) {
        this.fire('Time to water 🌿', `${thirsty.map((p) => p.name).join(', ')} ${thirsty.length > 1 ? 'are' : 'is'} due for watering.`);
      }
    }, 60000);
  }
};

/* ==========================================================================
   16. AI CHAT ASSISTANT
   ========================================================================== */
const Chat = {
  /* Mini knowledge base — each entry is matched by keyword hits */
  kb: [
    { tags: ['yellow', 'yellowing', 'yellowish'],
      answer: 'Yellow leaves usually mean one of three things: overwatering (most common), a nitrogen deficiency, or too much direct sun. Check the soil 3 cm deep — if it is soggy, pause watering for 5 days and let it dry. If the yellowing starts on lower leaves only, feed a balanced 10-10-10 fertiliser at half strength and re-check in 10 days.' },
    { tags: ['brown', 'crispy', 'tips', 'edges'],
      answer: 'Brown crispy tips are almost always low humidity or salt build-up. Trim the dead edges with clean scissors, raise humidity to 55–65% (pebble tray or grouping), and flush the pot with distilled water once a month to wash out fertiliser salts.' },
    { tags: ['water', 'watering', 'how often', 'thirsty'],
      answer: 'Water by feel, not by calendar. Push a finger 3 cm into the soil: dry means water, damp means wait. As a baseline — tropical foliage every 5–7 days, succulents every 14–18 days, and always water until it drains from the bottom holes.' },
    { tags: ['overwater', 'overwatering', 'root rot', 'soggy', 'mushy'],
      answer: 'Overwatering is the #1 houseplant killer. Signs: mushy stems, yellow lower leaves, fungus gnats. Take the plant out, cut any brown mushy roots, repot into fresh gritty mix, and do not water for 7 days. Add a drainage layer and empty the saucer every time.' },
    { tags: ['light', 'sunlight', 'sun', 'dark', 'shade', 'window'],
      answer: 'Bright indirect light suits 80% of houseplants — that is a spot 1–2 m from a south or east window, out of the direct beam. If your plant is stretching with long gaps between leaves, it is reaching for light. Rotate pots a quarter turn weekly for even growth.' },
    { tags: ['fertilizer', 'fertiliser', 'feed', 'nutrient', 'npk'],
      answer: 'Feed only during active growth (spring and summer). Use a balanced 10-10-10 at half strength every 3–4 weeks for foliage plants, and a 2-3-4 blend for flowering plants. Stop feeding entirely in winter, and never feed a dry or stressed plant.' },
    { tags: ['pest', 'bugs', 'insects', 'mites', 'gnat', 'aphid', 'white', 'fuzz'],
      answer: 'Look under the leaves first. White fuzzy patches mean mealybugs, fine webbing means spider mites, tiny black flies mean fungus gnats (from wet soil). Wipe with isopropyl alcohol, spray neem oil in the evening, and isolate the plant for two weeks.' },
    { tags: ['repot', 'pot', 'soil', 'transplant'],
      answer: 'Repot when roots circle the drainage holes or grow through them — usually every 12–18 months. Choose a pot only 2–4 cm wider, use a mix with perlite and bark, and water well after repotting. Skip fertiliser for the first month.' },
    { tags: ['humidity', 'moisture', 'dry air', 'mist'],
      answer: 'Most tropicals are happy at 50–65% relative humidity. Below 40% you will see brown tips and curled leaves. Options: a pebble tray with water, grouping plants together, or a humidifier. Avoid misting succulents — it invites rot.' },
    { tags: ['propagate', 'cutting', 'cut', 'clone'],
      answer: 'For most houseplants, take a cutting with 1–2 nodes, remove the lower leaves, and root it in water or damp sphagnum moss. Keep it in bright indirect light at 22–25°C and change the water every 4 days. Roots appear in 2–4 weeks.' },
    { tags: ['drooping', 'wilting', 'wilt', 'sad'],
      answer: 'Drooping has two opposite causes — too dry and too wet. Feel the soil: bone dry means water it and check again in 2 hours (it should lift). Wet soil with a drooping plant means root damage — stop watering immediately and improve drainage.' },
    { tags: ['summer', 'winter', 'season', 'cold'],
      answer: 'Growth slows below 18°C, so cut watering to roughly half and stop fertilising in winter. Keep plants away from cold windows and radiators — sudden temperature swings stress them more than the cold itself.' },
    { tags: ['snake plant', 'sansevieria'],
      answer: 'Snake plants thrive on neglect: water every 2–3 weeks, tolerate anything from low light to full sun, and hate wet feet. Let the soil dry completely between waterings and use a gritty cactus mix.' },
    { tags: ['monstera'],
      answer: 'Monstera likes bright indirect light, water when the top 3 cm dries, and humidity above 55%. Give it a moss pole to climb and the leaves will develop those iconic splits (fenestration).' },
    { tags: ['succulent', 'cactus'],
      answer: 'Succulents follow the soak-and-dry rule: water deeply, then wait until the soil is fully dry — often 2–3 weeks. They need 4+ hours of bright light, tiny pots, and gritty soil. When in doubt, do not water.' },
    { tags: ['flower', 'bloom', 'flowering'],
      answer: 'To encourage blooming, give full sun during the day, temps about 5°C cooler at night, and a phosphorus-rich feed (2-3-4). Remove faded flowers so the plant redirects energy into new buds.' },
    { tags: ['air purif', 'purify', 'oxygen', 'toxic', 'pet', 'cat', 'dog'],
      answer: 'Strong air purifiers include snake plant, peace lily, areca palm and bamboo palm. Careful with pets: peace lily, monstera and aloe are toxic if chewed — choose spider plant, calathea, or areca palm for pet-safe greenery.' },
    { tags: ['help', 'what can you do', 'hello', 'hi', 'hey'],
      answer: 'I can diagnose yellowing or browning leaves, build a watering schedule, calculate fertiliser dosage, identify pests, and match plants to your light conditions. Ask me anything — for example: "why are my monstera leaves curling?"' }
  ],

  history: [],
  busy: false,

  init() {
    const fab = $('#chatFab');
    const panel = $('#chatPanel');
    if (!fab || !panel) return;

    /* Restore the last conversation, otherwise greet the user */
    this.history = lsGet(FLORA.ls.chat, []);
    if (this.history.length) {
      this.history.forEach((m) => this.push(m.text, m.role, false));
    } else {
      this.push('Hi! I’m FloraMind AI 🌿 Describe what you see on your plant — for example "my plant leaves are yellow" — and I’ll diagnose it and suggest a fix.', 'bot', false);
    }

    fab.addEventListener('click', () => {
      panel.classList.toggle('open');
      fab.querySelector('.fab-dot')?.classList.add('d-none');
      if (panel.classList.contains('open')) setTimeout(() => $('#chatInput')?.focus(), 320);
    });

    $('#chatClose')?.addEventListener('click', () => panel.classList.remove('open'));

    $('#chatForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = $('#chatInput').value.trim();
      if (!value) return;
      $('#chatInput').value = '';
      this.send(value);
    });

    $$('.suggest-chip').forEach((chip) =>
      chip.addEventListener('click', () => this.send(chip.textContent.trim())));

    this.initVoice();
    this.persist();
  },

  /* Voice input via the Web Speech API (Chrome / Edge / Safari) */
  initVoice() {
    const btn = $('#micBtn');
    if (!btn) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.addEventListener('click', () => toast('Voice input is not supported in this browser.', 'fa-microphone-slash'));
      return;
    }

    const recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    btn.addEventListener('click', () => {
      try {
        recognition.start();
        btn.classList.add('listening');
        toast('Listening… speak now.', 'fa-microphone');
      } catch (e) {
        btn.classList.remove('listening');
      }
    });

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      $('#chatInput').value = text;
      this.send(text);
    };
    recognition.onerror = () => { btn.classList.remove('listening'); toast('Could not capture audio — try again.', 'fa-microphone-slash'); };
    recognition.onend = () => btn.classList.remove('listening');
  },

  /* Append a message bubble to the panel */
  push(text, role, animate = true) {
    const body = $('#chatBody');
    if (!body) return;

    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = role === 'bot' ? text : esc(text);
    if (!animate) el.style.animation = 'none';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  },

  /* Show / hide the animated typing indicator */
  typing(on) {
    const body = $('#chatBody');
    if (!body) return;
    if (on) {
      const el = document.createElement('div');
      el.className = 'msg bot';
      el.id = 'typingBubble';
      el.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
    } else {
      $('#typingBubble')?.remove();
    }
  },

  /* Main send flow: user bubble -> typing dots -> answer (Flask or local KB) */
  async send(text) {
    if (this.busy || !text) return;
    this.busy = true;

    this.push(text, 'user');
    this.history.push({ role: 'user', text });

    this.typing(true);
    const wait = randInt(700, 1400);
    await new Promise((r) => setTimeout(r, wait));

    /* Backend first, local knowledge base as the guaranteed fallback */
    const remote = await Backend.post('/chat', { message: text });
    const answer = (remote && remote.reply) ? remote.reply : this.answer(text);

    this.typing(false);
    this.push(answer, 'bot');
    this.history.push({ role: 'bot', text: answer });
    this.persist();
    this.busy = false;
  },

  /* Keyword scoring against the KB; unmatched questions get a smart fallback */
  answer(q) {
    const query = q.toLowerCase();
    let best = null, bestScore = 0;

    this.kb.forEach((entry) => {
      const score = entry.tags.reduce((acc, tag) => acc + (query.includes(tag) ? tag.length : 0), 0);
      if (score > bestScore) { bestScore = score; best = entry; }
    });

    if (best && bestScore > 0) {
      /* Light personalisation: prefix for very short questions */
      return best.answer;
    }

    const generic = [
      'I could not match that to a known symptom, so here is a safe checklist: check the soil 3 cm deep, confirm the light level, and inspect under the leaves for pests. If you tell me the leaf colour and where it appears (top or bottom of the plant), I can narrow it down.',
      'Tell me a bit more and I will diagnose it: what does the leaf look like (yellow, brown, curling, spots), how often do you water, and how much light does the plant get?',
      'To answer that precisely I need two details — the plant species and the symptom you are seeing. Meanwhile, the two most common causes of trouble are overwatering and low light.'
    ];
    return pick(generic);
  },

  /* Keep only the last 30 messages in localStorage */
  persist() {
    lsSet(FLORA.ls.chat, this.history.slice(-30));
  }
};

/* ==========================================================================
   17. BOOT
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  /* Reveal animations for any element marked .reveal */
  const revealio = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealio.unobserve(e.target); } });
  }, { threshold: .16 });
  $$('.reveal').forEach((el) => revealio.observe(el));

  Theme.init();
  Navbar.init();
  Hero.init();
  Scanner.init();
  Dashboard.init();
  Library.init();
  Timeline.init();
  Fertilizer.init();
  Weather.init();
  Checklist.init();
  Confetti.setup();
  Reminders.init();
  Chat.init();

  /* AOS (Animate On Scroll) — CDN library, initialised once per page */
  if (window.AOS) {
    AOS.init({ duration: 750, easing: 'ease-out-cubic', once: true, offset: 90, disable: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  }

  /* Probe the optional Flask backend once; the UI works either way */
  Backend.probe().then((online) => {
    if (online) {
      toast('Flask backend connected — using the Python AI engine.', 'fa-server', 4200);
    } else if (location.protocol !== 'file:') {
      toast('Running in standalone mode (JavaScript AI engine). Start app.py for the Python engine.', 'fa-plug-circle-xmark', 5200);
    }
  });

  /* Hide the loader once everything is painted */
  window.addEventListener('load', () => setTimeout(hideLoader, 600));
  setTimeout(hideLoader, 3200);   /* safety net so the loader never traps the user */

  /* Scroll-to-top shortcut (used by the footer button) */
  $('#toTop')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* Expose the dashboard for the theme switch repaint */
window.FloraDashboard = Dashboard;
