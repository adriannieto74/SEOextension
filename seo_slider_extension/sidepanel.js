document.addEventListener('DOMContentLoaded', async () => {
  // 1. DETECCIÓN AUTOMÁTICA: Al abrir, captura la URL de la pestaña activa
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && tab.url.startsWith('http')) {
    urlInput.value = tab.url;
    analyze(); // Lanza el análisis automáticamente al abrir
  }
});

const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const scoreEl = document.getElementById('score');
const scoreTextEl = document.getElementById('scoreText');
const exportBtn = document.getElementById('exportBtn');

// 2. ENLACES DE AYUDA: Añadidos a la configuración de los checks
const CHECKS = [
  { 
    key: 'morePages', weight: 10, type: 'automatic', title: 'Más de una página', 
    desc: 'Busca enlaces internos y sitemap para confirmar que no es una "one-page".',
    helpUrl: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=es#organize-hierarchy'
  },
  { 
    key: 'searchPresence', weight: 4, type: 'manual', title: 'Presencia en buscadores', 
    desc: 'Verificación manual en Google y Bing.',
    helpUrl: 'https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-operators?hl=es'
  },
  { 
    key: 'googleAnalytics', weight: 8, type: 'heuristic', title: 'Google Analytics', 
    desc: 'Detecta scripts de GA4 o Google Tag Manager.',
    helpUrl: 'https://support.google.com/analytics/answer/1008015?hl=en'
  },
  { 
    key: 'robots', weight: 8, type: 'automatic', title: 'Archivo robots.txt', 
    desc: 'Comprueba si el archivo existe y es accesible.',
    helpUrl: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=es'
  },
  { 
    key: 'githubRoot', weight: 3, type: 'manual', title: 'Raíz de Repositorio', 
    desc: 'Revisión de la estructura en GitHub.',
    helpUrl: 'https://pages.github.com/'
  },
  { 
    key: 'sitemap', weight: 8, type: 'automatic', title: 'Mapa del sitio (Sitemap)', 
    desc: 'Verifica la existencia de sitemap.xml.',
    helpUrl: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview?hl=es'
  },
  { 
    key: 'errorHandling', weight: 8, type: 'heuristic', title: 'Manejo de errores 404', 
    desc: 'Prueba si una página inexistente devuelve un error controlado.',
    helpUrl: 'https://developers.google.com/search/docs/crawling-indexing/soft-404-errors?hl=es'
  },
  { 
    key: 'browsers', weight: 3, type: 'manual', title: 'Compatibilidad de navegadores', 
    desc: 'Requiere prueba visual en diferentes motores.',
    helpUrl: 'https://developer.mozilla.org/es/docs/Learn/Tools_and_testing/Cross_browser_testing'
  },
  { 
    key: 'links', weight: 8, type: 'heuristic', title: 'Enlaces internos/externos', 
    desc: 'Analiza la salud del enlazado de la página.',
    helpUrl: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=es#optimize-content'
  },
  { 
    key: 'trends', weight: 3, type: 'manual', title: 'Tendencias de búsqueda', 
    desc: 'Compara la temática con Google Trends.',
    helpUrl: 'https://trends.google.com/trends/'
  },
  { 
    key: 'sitemapIndexed', weight: 4, type: 'manual', title: 'Indexación de Sitemap', 
    desc: 'Comprobar si las URLs del sitemap están en el índice.',
    helpUrl: 'https://search.google.com/search-console/about'
  },
  { 
    key: 'ads', weight: 5, type: 'heuristic', title: 'Publicidad (Ads)', 
    desc: 'Detecta presencia de AdSense u otras redes.',
    helpUrl: 'https://support.google.com/adsense/answer/75440?hl=en'
  },
  { 
    key: 'accessibility', weight: 12, type: 'heuristic', title: 'Accesibilidad SEO', 
    desc: 'Atributos alt, lang y títulos correctos.',
    helpUrl: 'https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=es'
  },
  { 
    key: 'social', weight: 6, type: 'heuristic', title: 'Señales Sociales', 
    desc: 'Presencia de enlaces a LinkedIn o grafos sociales.',
    helpUrl: 'https://ogp.me/'
  },
  { 
    key: 'bing', weight: 8, type: 'heuristic', title: 'Bing Webmaster Tools', 
    desc: 'Detecta meta de verificación de Bing.',
    helpUrl: 'https://www.bing.com/webmasters/help/getting-started-gsw-60c1d291'
  }
];

// ============= EVENT LISTENERS =============
analyzeBtn.addEventListener('click', analyze);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyze();
});

exportBtn.addEventListener('click', exportResults);
historyBtn.addEventListener('click', showHistory);
modalClose.addEventListener('click', () => historyModal.classList.add('hidden'));
clearHistoryBtn.addEventListener('click', clearHistory);
historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) historyModal.classList.add('hidden');
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    filterBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const filter = e.target.dataset.filter;
    filterResults(filter);
  });
});

// ============= FUNCIONES PRINCIPALES =============
function setStatus(text) {
  statusEl.textContent = text;
}

function normalizeUrl(value) {
  let text = value.trim();
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
  return new URL(text).toString();
}

async function fetchText(url) {
  // Manejo de caché y errores para optimizar peticiones
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  const text = await res.text();
  return { res, text };
}

function toDoc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function pick(base, path) {
  return new URL(path, base).toString();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

// ============= DETECTORES ESPECIALIZADOS =============
function isProbablyGoogleAnalytics(html) {
  return /(googletagmanager\.com|google-analytics\.com|gtag\(|ga\(|G-[A-Z0-9]+)/i.test(html);
}

function detectAds(html) {
  return /(googlesyndication\.com|doubleclick\.net|adsbygoogle|adservice\.google)/i.test(html);
}

function validateMetaTitle(doc) {
  const title = doc.querySelector('title');
  if (!title) return { status: 'bad', detail: 'No hay título meta' };
  const len = title.textContent.length;
  if (len < 30) return { status: 'warn', detail: `Muy corto (${len} caracteres). Mínimo 30.` };
  if (len > 60) return { status: 'warn', detail: `Muy largo (${len} caracteres). Máximo 60.` };
  return { status: 'ok', detail: `Óptimo (${len} caracteres): "${title.textContent.substring(0, 40)}..."` };
}

function validateMetaDescription(doc) {
  const desc = doc.querySelector('meta[name="description"]');
  if (!desc) return { status: 'bad', detail: 'No hay meta description' };
  const len = desc.content.length;
  if (len < 120) return { status: 'warn', detail: `Muy corta (${len} caracteres). Mínimo 120.` };
  if (len > 160) return { status: 'warn', detail: `Muy larga (${len} caracteres). Máximo 160.` };
  return { status: 'ok', detail: `Óptima (${len} caracteres): "${desc.content.substring(0, 40)}..."` };
}

function validateH1Structure(doc) {
  const h1s = [...doc.querySelectorAll('h1')];
  if (h1s.length === 0) return { status: 'bad', detail: 'No hay ningún H1 en la página' };
  if (h1s.length > 1) return { status: 'warn', detail: `Múltiples H1 encontrados (${h1s.length}). Solo debería haber uno.` };
  return { status: 'ok', detail: `Un H1 correcto: "${h1s[0].textContent.substring(0, 40)}"` };
}

function validateHeadingStructure(doc) {
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  if (headings.length === 0) return { status: 'bad', detail: 'Sin headings' };
  
  let isCorrect = true;
  let lastLevel = 0;
  
  for (const h of headings) {
    const level = parseInt(h.tagName[1]);
    if (level > lastLevel + 1) isCorrect = false;
    lastLevel = level;
  }
  
  return { status: isCorrect ? 'ok' : 'warn', detail: `${headings.length} headings. ${isCorrect ? 'Estructura correcta' : 'Posibles saltos en jerarquía'}` };
}

function checkImageAlt(doc) {
  const images = [...doc.querySelectorAll('img')];
  if (images.length === 0) return { status: 'ok', detail: 'Sin imágenes en la página' };
  
  const withoutAlt = images.filter(i => !i.hasAttribute('alt') || !i.getAttribute('alt').trim()).length;
  if (withoutAlt === 0) return { status: 'ok', detail: `Todas las ${images.length} imágenes tienen alt` };
  
  return { status: withoutAlt > images.length / 2 ? 'bad' : 'warn', detail: `${withoutAlt} de ${images.length} sin alt (${Math.round(withoutAlt/images.length*100)}%)` };
}

function checkFormLabels(doc) {
  const inputs = [...doc.querySelectorAll('input, select, textarea')];
  if (inputs.length === 0) return { status: 'ok', detail: 'Sin formularios' };
  
  const withLabels = inputs.filter(i => {
    const id = i.id;
    return id && doc.querySelector(`label[for="${id}"]`);
  }).length;
  
  const coverage = Math.round(withLabels / inputs.length * 100);
  if (coverage === 100) return { status: 'ok', detail: `Todos los inputs (${inputs.length}) tienen labels` };
  return { status: coverage > 50 ? 'warn' : 'bad', detail: `${coverage}% de inputs con labels (${withLabels}/${inputs.length})` };
}

function checkOgTags(doc) {
  const og = {
    title: !!doc.querySelector('meta[property="og:title"]'),
    description: !!doc.querySelector('meta[property="og:description"]'),
    image: !!doc.querySelector('meta[property="og:image"]'),
    url: !!doc.querySelector('meta[property="og:url"]')
  };
  
  const count = Object.values(og).filter(Boolean).length;
  if (count === 0) return { status: 'warn', detail: 'Sin tags Open Graph' };
  if (count === 4) return { status: 'ok', detail: 'Todos los Open Graph básicos presentes' };
  return { status: 'warn', detail: `${count}/4 Open Graph tags` };
}

function checkStructuredData(doc) {
  const jsonLd = doc.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLd.length === 0) return { status: 'warn', detail: 'Sin Schema.org JSON-LD' };
  
  return { status: 'ok', detail: `${jsonLd.length} bloque(s) de structured data detectado(s)` };
}

function checkCanonicalTag(doc) {
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) return { status: 'warn', detail: 'Sin canonical tag' };
  return { status: 'ok', detail: `Canonical: ${canonical.href}` };
}

function checkViewportMeta(doc) {
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (!viewport) return { status: 'bad', detail: 'Sin viewport meta tag' };
  const content = viewport.getAttribute('content');
  if (/width=device-width/.test(content)) return { status: 'ok', detail: 'Mobile-friendly meta correcta' };
  return { status: 'warn', detail: 'Viewport meta presente pero posible problema' };
}

function checkNoindex(doc) {
  const robots = doc.querySelector('meta[name="robots"]');
  if (robots && /noindex/i.test(robots.content)) return { status: 'bad', detail: 'Meta robots contiene noindex' };
  
  const googleBot = doc.querySelector('meta[name="googlebot"]');
  if (googleBot && /noindex/i.test(googleBot.content)) return { status: 'bad', detail: 'Meta googlebot contiene noindex' };
  
  return { status: 'ok', detail: 'Sin noindex - página indexable' };
}

// ============= ANÁLISIS PRINCIPAL =============
async function analyze() {
  resultsEl.innerHTML = '';
  scoreEl.textContent = '...';
  scoreTextEl.textContent = 'Analizando';
  let baseUrl;

  try {
    baseUrl = normalizeUrl(urlInput.value);
  } catch {
    setStatus('La URL no es válida.');
    return;
  }

  setStatus('Analizando señales SEO en paralelo...');

  try {
    const base = new URL(baseUrl);
    const headers = await fetchHeaders(baseUrl);

    // 3. ASINCRONÍA EN PARALELO: Ejecutamos todas las peticiones de red simultáneamente
    const [homepage, robotsResult, sitemapResult, errorResult] = await Promise.all([
      fetchText(baseUrl),
      fetchText(pick(base, '/robots.txt')).catch(() => ({ res: { ok: false }, text: '' })),
      fetchText(pick(base, '/sitemap.xml')).catch(() => ({ res: { ok: false }, text: '' })),
      fetch(pick(base, `/seo-audit-404-${Date.now()}`), { redirect: 'follow' }).catch(() => ({ ok: false, status: 'Error' }))
    ]);

    const doc = toDoc(homepage.text);
    const anchors = [...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    const resolved = unique(anchors.map(h => {
      try { return new URL(h, base).toString(); } catch { return null; }
    }));
    const internalLinks = resolved.filter(u => {
      try { return new URL(u).hostname === base.hostname; } catch { return false; }
    });
    const externalLinks = resolved.filter(u => {
      try { return new URL(u).hostname !== base.hostname; } catch { return false; }
    });

    const scriptSrcs = [...doc.querySelectorAll('script[src]')].map(s => s.src).join('\n');
    const imgs = [...doc.images];
    const imgsWithoutAlt = imgs.filter(i => !i.hasAttribute('alt')).length;
    const forms = [...doc.forms];
    const labels = [...doc.querySelectorAll('label[for]')];
    const linkedInFound = /linkedin\.com/i.test(homepage.text) || resolved.some(u => /linkedin\.com/i.test(u));
    const bingVerification = !!doc.querySelector('meta[name="msvalidate.01"]');

    // Procesar Robots
    const robotsInfo = {
      exists: robotsResult.res.ok,
      note: robotsResult.res.ok ? `Detectado (${robotsResult.text.length} bytes)` : `No encontrado (HTTP ${robotsResult.res.status || 'N/A'})`
    };

    // Procesar Sitemap
    const sitemapCount = (sitemapResult.text.match(/<loc>/gi) || []).length;
    const sitemapInfo = {
      exists: sitemapResult.res.ok,
      count: sitemapCount,
      note: sitemapResult.res.ok ? `Detectado. URLs: ${sitemapCount}` : `No encontrado`
    };

    // Procesar Error Handling
    const errorControlled = errorResult.ok === false || errorResult.status === 404 || errorResult.redirected;

    // === DETECCIONES MULTI-PÁGINA ===
    const hasMultiplePages = internalLinks.filter(u => {
      try {
        const p = new URL(u).pathname;
        return p && p !== '/' && p !== '/index.html';
      } catch { return false; }
    }).length > 0 || sitemapInfo.count > 1;

    // === COMPILAR RESULTADOS ===
    const payload = {
      morePages: { status: hasMultiplePages ? 'ok' : 'bad', detail: `Internos: ${internalLinks.length}. Sitemap: ${sitemapInfo.count}.` },
      searchPresence: { status: 'manual', detail: `Revisar site:${base.hostname}` },
      googleAnalytics: {
        status: isProbablyGoogleAnalytics(homepage.text + '\n' + scriptSrcs) ? 'ok' : 'warn',
        detail: isProbablyGoogleAnalytics(homepage.text + '\n' + scriptSrcs) ? 'Patrones GA detectados.' : 'Sin señales de analítica.'
      },
      robots: { status: robotsInfo.exists ? 'ok' : 'bad', detail: robotsInfo.note },
      githubRoot: { status: 'manual', detail: 'Verificar en el repo fuente.' },
      sitemap: { status: sitemapInfo.exists ? 'ok' : 'bad', detail: sitemapInfo.note },
      errorHandling: { status: errorControlled ? 'ok' : 'warn', detail: `Respuesta HTTP ${errorResult.status}` },
      browsers: { status: 'manual', detail: 'Requiere multi-navegador.' },
      links: { status: (internalLinks.length > 1 && externalLinks.length > 0) ? 'ok' : 'warn', detail: `In: ${internalLinks.length} | Out: ${externalLinks.length}` },
      trends: { status: 'manual', detail: `Comparar temática en Trends.` },
      sitemapIndexed: { status: 'manual', detail: 'Comprobar indexación manual.' },
      ads: { status: detectAds(homepage.text + '\n' + scriptSrcs) ? 'ok' : 'warn', detail: detectAds(homepage.text + '\n' + scriptSrcs) ? 'Anuncios detectados.' : 'Sin anuncios.' },
      accessibility: { status: accessibilityOk ? 'ok' : 'warn', detail: `Alt faltantes: ${imgsWithoutAlt}. Lang: ${!!doc.documentElement.getAttribute('lang')}` },
      social: { status: linkedInFound ? 'ok' : 'warn', detail: linkedInFound ? 'LinkedIn detectado.' : 'Sin LinkedIn.' },
      bing: { status: bingVerification ? 'ok' : 'warn', detail: bingVerification ? 'Verificado.' : 'Falta meta Bing.' }
    };

    renderResults(payload, base.hostname);
    setStatus(`Análisis finalizado.`);
  } catch (err) {
    console.error(err);
    setStatus('Error al analizar. Posible bloqueo por CORS o conectividad.');
    scoreEl.textContent = '0';
    scoreTextEl.textContent = 'Error';
  }
}

// ============= RENDERIZADO DE RESULTADOS =============
function renderResults(payload, host) {
  resultsEl.innerHTML = '';
  let score = 0;
  let maxScore = 0;

  for (const check of CHECKS) {
    const data = payload[check.key] || { status: 'manual', detail: 'Sin datos' };
    maxScore += check.weight;
    
    if (data.status === 'ok') score += check.weight;
    else if (data.status === 'warn') score += Math.round(check.weight * 0.45);
    else if (data.status === 'manual') score += Math.round(check.weight * 0.25);

    const item = document.createElement('div');
    item.className = 'item';
    const statusLabel = data.status === 'ok' ? 'Cumple' : data.status === 'bad' ? 'No cumple' : data.status === 'warn' ? 'Revisar' : 'Manual';
    
    item.innerHTML = `
      <div class="item-head">
        <div>
          <h3>${escapeHtml(check.title)}</h3>
          <p>${escapeHtml(check.desc)}</p>
        </div>
        <div>
          <span class="pill ${data.status === 'ok' ? 'ok' : data.status === 'bad' ? 'bad' : data.status === 'warn' ? 'warn' : 'manual'}">${statusLabel}</span>
        </div>
      </div>
      <div class="meta">
        <strong>Resultado:</strong> ${escapeHtml(data.detail)} <br>
        ${check.helpUrl ? `<a class="small-link" href="${check.helpUrl}" target="_blank" style="color: #4f46e5; text-decoration: underline;">Saber más sobre este check ↗</a>` : ''}
        ${buildManualExtra(check.key, host)}
      </div>
    `;
    resultsEl.appendChild(item);
  }

  const normalized = Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
  scoreEl.textContent = String(normalized);
  scoreTextEl.textContent = normalized >= 80 ? '✓ Muy bien' : normalized >= 60 ? '⚠ Aceptable' : '✗ A mejorar';
}

function filterResults(filter) {
  const items = document.querySelectorAll('.item');
  items.forEach(item => {
    if (filter === 'all' || item.dataset.category === filter) {
      item.classList.remove('hidden');
    } else {
      item.classList.add('hidden');
    }
  });
}

// ============= EXPORTACIÓN =============
function exportResults() {
  const score = scoreEl.textContent;
  const hostname = new URL(normalizeUrl(urlInput.value)).hostname;
  const items = Array.from(document.querySelectorAll('.item')).map(item => {
    const title = item.querySelector('h3').textContent;
    const status = item.querySelector('.pill').textContent;
    const detail = item.querySelector('.meta').textContent.split('\n')[2]?.trim();
    return { title, status, detail };
  });

  const report = {
    hostname,
    score: parseInt(score),
    timestamp: new Date().toISOString(),
    checks: items
  };

  const json = JSON.stringify(report, null, 2);
  downloadFile(json, `audit-${hostname}-${Date.now()}.json`, 'application/json');
}

function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============= HISTORIAL =============
function saveToHistory(hostname, payload) {
  chrome.storage.local.get('analyses', (data) => {
    const analyses = data.analyses || [];
    const score = scoreEl.textContent;
    analyses.unshift({
      hostname,
      score: parseInt(score),
      timestamp: Date.now()
    });
    // Guardar solo últimos 20 análisis
    if (analyses.length > 20) analyses.pop();
    chrome.storage.local.set({ analyses });
  });
}

function showHistory() {
  chrome.storage.local.get('analyses', (data) => {
    const analyses = data.analyses || [];
    historyList.innerHTML = '';
    
    if (analyses.length === 0) {
      historyList.innerHTML = '<p style="color: var(--muted); font-size: 12px;">Sin análisis previos</p>';
    } else {
      analyses.forEach((analysis, index) => {
        const date = new Date(analysis.timestamp).toLocaleString('es-ES');
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-item-domain">${escapeHtml(analysis.hostname)} (${analysis.score}/100)</div>
          <div class="history-item-date">${date}</div>
        `;
        item.addEventListener('click', () => {
          urlInput.value = `https://${analysis.hostname}`;
          historyModal.classList.add('hidden');
          analyze();
        });
        historyList.appendChild(item);
      });
    }
    
    historyModal.classList.remove('hidden');
  });
}

function clearHistory() {
  if (confirm('¿Eliminar todo el historial de análisis?')) {
    chrome.storage.local.set({ analyses: [] });
    historyList.innerHTML = '<p style="color: var(--muted);">Historial eliminado</p>';
  }
}

function buildManualExtra(key, host) {
  if (key === 'searchPresence') {
    const q = encodeURIComponent(`site:${host}`);
    return `<br><strong>Accesos:</strong> <a class="small-link" href="https://www.google.com/search?q=${q}" target="_blank">Google</a> · <a class="small-link" href="https://www.bing.com/search?q=${q}" target="_blank">Bing</a>`;
  }
  return '';
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

exportBtn.addEventListener('click', () => {
    const url = urlInput.value || 'web-analizada';
    const score = scoreEl.textContent;
    const scoreText = scoreTextEl.textContent;
    const items = document.querySelectorAll('.item');

    if (items.length === 0) {
        alert("Primero realiza un análisis para poder exportar.");
        return;
    }

    let report = `==========================================\n`;
    report += `    REPORTE SEO: ${url}\n`;
    report += `==========================================\n`;
    report += `Puntuación: ${score}/100 (${scoreText})\n`;
    report += `Fecha: ${new Date().toLocaleString()}\n\n`;

    items.forEach((item) => {
        const title = item.querySelector('h3').innerText;
        const status = item.querySelector('.pill').innerText;
        // Limpiamos el detalle de espacios extras
        const detail = item.querySelector('.meta').innerText.replace(/\s+/g, ' ').trim();
        
        report += `[${status.toUpperCase()}] ${title}\n`;
        report += `Detalle: ${detail}\n`;
        report += `------------------------------------------\n`;
    });

    // Crear el archivo para descargar
    const blob = new Blob([report], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Limpiar el nombre del archivo de caracteres raros
    const fileName = `SEO_Audit_${url.replace(/https?:\/\/|www\.|\/|:/g, '')}.txt`;
    
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
});
