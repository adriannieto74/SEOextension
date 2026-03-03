const urlInput = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const exportBtn = document.getElementById('exportBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const statusEl = document.getElementById('status');
const globalScoreEl = document.getElementById('globalScore');
const globalMeterEl = document.getElementById('globalMeter');
const categoryCardsEl = document.getElementById('categoryCards');
const checksListEl = document.getElementById('checksList');
const historyListEl = document.getElementById('historyList');
const chart = document.getElementById('scoreChart');

let latestReport = null;

function setStatus(text, mode = 'idle') {
  statusEl.textContent = text;
  statusEl.className = `status ${mode}`;
}

function normalizeUrl(input) {
  const value = input.trim();
  if (!value) throw new Error('Introduce una URL.');
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withScheme).toString();
}

async function safeFetchText(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      redirected: res.redirected,
      text,
      headers: Object.fromEntries(res.headers.entries())
    };
  } catch (e) {
    return { ok: false, status: 0, url, redirected: false, text: '', headers: {}, error: e.message };
  }
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function domainLooksSuspicious(hostname) {
  const parts = hostname.split('.');
  const labels = parts.slice(0, -1);
  const longLabel = labels.some(x => x.length > 25);
  const manyHyphens = (hostname.match(/-/g) || []).length >= 3;
  const manyNumbers = (hostname.match(/\d/g) || []).length >= 4;
  const tooManySubdomains = parts.length > 4;
  const puny = hostname.startsWith('xn--');
  return longLabel || manyHyphens || manyNumbers || tooManySubdomains || puny;
}

function scoreState(value) {
  if (value >= 75) return 'good';
  if (value >= 45) return 'warn';
  return 'bad';
}

function makeCheck(key, title, type, passed, message, extra = '') {
  return { key, title, type, passed, message, extra };
}

function normalizeComparableUrl(raw) {
  try {
    const u = new URL(raw);
    const cleanPath = u.pathname.replace(/\/$/, '') || '/';
    return `${u.origin}${cleanPath}`;
  } catch {
    return raw;
  }
}

function textHasAny(text, patterns) {
  return patterns.some(p => p.test(text));
}

function countWords(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
}

async function analyze(urlStr) {
  const url = new URL(urlStr);
  const origin = url.origin;

  const homepage = await safeFetchText(url.toString());
  if (!homepage.text) throw new Error(`No se pudo leer la página principal (${homepage.status || 'sin respuesta'}).`);
  const doc = parseHtml(homepage.text);

  const allAnchors = [...doc.querySelectorAll('a[href]')];
  const absLinks = allAnchors.map(a => {
    try { return new URL(a.getAttribute('href'), homepage.url || url.toString()); } catch { return null; }
  }).filter(Boolean);

  const internalLinks = absLinks.filter(link => link.origin === origin);
  const uniqueInternalPages = [...new Set(internalLinks
    .filter(link => !/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|mp4|mp3|webm)$/i.test(link.pathname))
    .map(link => link.pathname.replace(/\/$/, '') || '/'))];
  const externalLinks = absLinks.filter(link => link.origin !== origin);
  const uniqueExternalHosts = [...new Set(externalLinks.map(link => link.hostname))];

  const robots = await safeFetchText(`${origin}/robots.txt`);
  const sitemap = await safeFetchText(`${origin}/sitemap.xml`);
  const fake404 = await safeFetchText(`${origin}/esto-no-deberia-existir-${Date.now()}`);

  const scripts = [...doc.querySelectorAll('script[src]')].map(s => s.src);
  const inlineScriptText = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent || '').join('\n');
  const trackers = scripts.filter(src => /googletagmanager|google-analytics|doubleclick|facebook\.net|hotjar|clarity|plausible|matomo/i.test(src));
  const ads = scripts.filter(src => /doubleclick|adsystem|googlesyndication|adservice/i.test(src));
  const hasGa = /gtag\(|google-analytics|googletagmanager|UA-|G-[A-Z0-9]+|GTM-[A-Z0-9]+|plausible|matomo/i.test(homepage.text);
  const hasBing = !!doc.querySelector('meta[name="msvalidate.01"], meta[content*="bing-site-verification"]');
  const hasLinkedIn = absLinks.some(link => /linkedin\.com/i.test(link.hostname));
  const hasAds = ads.length > 0 || /adsbygoogle|doubleclick|googlesyndication/i.test(homepage.text) || [...doc.querySelectorAll('[id],[class]')].some(el => /(^|\s)(ad|ads|banner|sponsor)(\s|$)/i.test(`${el.id} ${el.className}`));

  const title = (doc.querySelector('title')?.textContent || '').trim();
  const metaDescription = (doc.querySelector('meta[name="description"]')?.getAttribute('content') || '').trim();
  const htmlLang = doc.documentElement.getAttribute('lang') || '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const hasNoindex = /\bnoindex\b/i.test(doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '');
  const h1Count = doc.querySelectorAll('h1').length;
  const images = [...doc.querySelectorAll('img')];
  const imagesMissingAlt = images.filter(img => !img.hasAttribute('alt') || img.getAttribute('alt').trim() === '').length;
  const formInputs = [...doc.querySelectorAll('form input, form select, form textarea')];
  const labels = new Set([...doc.querySelectorAll('label[for]')].map(l => l.getAttribute('for')));
  const unlabeled = formInputs.filter(el => {
    const id = el.id;
    if (!id) return true;
    return !labels.has(id);
  }).length;
  const iframes = [...doc.querySelectorAll('iframe[src]')];
  const favicon = !!doc.querySelector('link[rel*="icon"]');
  const schemaCount = doc.querySelectorAll('script[type="application/ld+json"]').length;
  const hasOg = ['og:title', 'og:description', 'og:image'].every(p => doc.querySelector(`meta[property="${p}"]`));
  const hasTwitter = !!doc.querySelector('meta[name="twitter:card"]');
  const hasViewport = !!doc.querySelector('meta[name="viewport"]');
  const wordCount = countWords(doc.body?.textContent || '');
  const hasChatbot = textHasAny(homepage.text, [
    /intercom/i, /drift\.com/i, /tawk\.to/i, /crisp\.chat/i, /zendesk/i, /livechat/i,
    /chatbot/i, /assistant widget/i, /botpress/i, /tidio/i
  ]);
  const hasSkipLink = [...doc.querySelectorAll('a[href^="#"]')].some(a => /saltar|skip to content|ir al contenido/i.test(a.textContent || ''));

  const robotsHasSitemap = /\bSitemap:\s*https?:\/\//i.test(robots.text);
  const robotsBlocksAll = /User-agent:\s*\*[^]*Disallow:\s*\//i.test(robots.text);
  const sitemapUrls = [...(sitemap.text.matchAll(/<loc>(.*?)<\/loc>/gi))].map(m => m[1]).slice(0, 100);
  const sitemapMentionsHome = sitemapUrls.some(u => normalizeComparableUrl(u) === normalizeComparableUrl(homepage.url || url.toString()));
  const sampleSitemapInternal = sitemapUrls.filter(u => u.startsWith(origin)).length;

  const fakeIsProperError = fake404.status === 404 || fake404.status === 410 || /not found|404|no encontrado/i.test(fake404.text);
  const fakeRedirectsToHome = fake404.status === 200 && normalizeComparableUrl(fake404.url) === normalizeComparableUrl(homepage.url || `${origin}/`);
  const fakeHandledOkay = fakeIsProperError || fakeRedirectsToHome;

  const githubPagesRootOk = /github\.io$/i.test(url.hostname) ? url.pathname === '/' || url.pathname === '' : null;

  const checks = [
    makeCheck('pages', 'Más páginas que solo index', 'auto', uniqueInternalPages.length > 3, uniqueInternalPages.length > 3 ? `Se detectan ${uniqueInternalPages.length} rutas internas.` : 'Se ven pocas rutas internas; puede ser un sitio muy pequeño.', `Rutas detectadas: ${uniqueInternalPages.slice(0, 8).join(', ') || 'ninguna'}`),
    makeCheck('robots', 'robots.txt', 'auto', robots.ok, robots.ok ? 'Existe robots.txt.' : 'No se encontró robots.txt.', robots.ok ? `Estado ${robots.status}` : `Estado ${robots.status || 'sin respuesta'}`),
    makeCheck('robots-sitemap', 'robots.txt anuncia sitemap', 'auto', robots.ok && robotsHasSitemap, robots.ok && robotsHasSitemap ? 'robots.txt incluye una línea Sitemap.' : 'robots.txt no anuncia el sitemap.', robots.ok ? '' : 'Primero conviene crear robots.txt.'),
    makeCheck('robots-block', 'robots.txt no bloquea todo', 'heur', robots.ok ? !robotsBlocksAll : false, robots.ok ? (!robotsBlocksAll ? 'No parece bloquear todo el sitio.' : 'Cuidado: robots.txt parece bloquear el rastreo global.') : 'Sin robots.txt no puede comprobarse.', ''),
    makeCheck('sitemap', 'sitemap.xml', 'auto', sitemap.ok && sitemapUrls.length > 0, sitemap.ok && sitemapUrls.length > 0 ? `Existe sitemap con ${sitemapUrls.length} URL(s) leídas en la muestra.` : 'No se encontró sitemap válido.', sitemap.ok ? `Estado ${sitemap.status}` : `Estado ${sitemap.status || 'sin respuesta'}`),
    makeCheck('sitemap-home', 'El sitemap incluye la portada', 'heur', sitemap.ok && sitemapMentionsHome, sitemap.ok && sitemapMentionsHome ? 'La página principal aparece en el sitemap.' : 'La portada no aparece claramente en el sitemap.', ''),
    makeCheck('ga', 'Google Analytics / GTM', 'heur', hasGa, hasGa ? 'Se detectan señales de Analytics, GTM u otra analítica.' : 'No se detectan señales claras de analítica.', `Trackers técnicos detectados: ${trackers.length}`),
    makeCheck('search-index', 'Indexación permitida', 'heur', !hasNoindex, !hasNoindex ? 'No se detecta meta robots con noindex.' : 'La página lleva noindex y puede quedar fuera de buscadores.', ''),
    makeCheck('errors', 'Gestión de errores / redirección', 'heur', fakeHandledOkay, fakeHandledOkay ? (fakeRedirectsToHome ? 'Una URL inexistente redirige a la principal.' : 'La URL inexistente devuelve señal de error controlado.') : 'La URL inexistente no parece bien resuelta.', `Estado de prueba: ${fake404.status || 'sin respuesta'} · destino: ${fake404.url || 'sin respuesta'}`),
    makeCheck('links', 'Enlaces de ida y de vuelta', 'heur', internalLinks.length > 2 && externalLinks.length > 0, internalLinks.length > 2 && externalLinks.length > 0 ? `Se detectan ${internalLinks.length} internos y ${externalLinks.length} externos.` : 'Faltan señales de enlazado interno o de salida.', `Dominios externos únicos: ${uniqueExternalHosts.length}`),
    makeCheck('title-desc', 'Title y meta description', 'heur', !!title && metaDescription.length >= 70, (!!title && metaDescription.length >= 70) ? 'La portada tiene title y description razonables.' : 'Conviene completar title y meta description.', `Title: ${title ? title.length + ' caracteres' : 'no'} · Description: ${metaDescription ? metaDescription.length + ' caracteres' : 'no'}`),
    makeCheck('canonical', 'Canonical', 'auto', !!canonical, canonical ? 'Se detecta enlace canonical.' : 'No se detecta canonical.', canonical || ''),
    makeCheck('headings', 'Encabezado principal', 'heur', h1Count >= 1, h1Count >= 1 ? `Se detectan ${h1Count} H1.` : 'No se detecta ningún H1.', ''),
    makeCheck('social-meta', 'Metadatos sociales', 'heur', hasOg && hasTwitter, (hasOg && hasTwitter) ? 'Se detectan Open Graph y Twitter Card.' : 'Faltan metadatos sociales completos.', `Open Graph: ${hasOg ? 'sí' : 'no'} · Twitter Card: ${hasTwitter ? 'sí' : 'no'}`),
    makeCheck('accessibility', 'Accesibilidad básica', 'heur', !!title && !!htmlLang && imagesMissingAlt === 0 && unlabeled === 0 && hasViewport, (!!title && !!htmlLang && imagesMissingAlt === 0 && unlabeled === 0 && hasViewport) ? 'Pasa la revisión básica de título, lang, alt, labels y viewport.' : 'Hay señales de mejora en accesibilidad básica.', `lang: ${htmlLang || 'no'} · imágenes sin alt: ${imagesMissingAlt} · campos sin label: ${unlabeled} · viewport: ${hasViewport ? 'sí' : 'no'}`),
    makeCheck('accessibility-skip', 'Accesibilidad extra', 'heur', hasSkipLink || images.length === 0, (hasSkipLink || images.length === 0) ? 'Se aprecia un detalle adicional de accesibilidad o la portada es muy simple.' : 'No se detecta enlace de salto al contenido.', ''),
    makeCheck('linkedin', 'Redes sociales (LinkedIn)', 'auto', hasLinkedIn, hasLinkedIn ? 'Se detecta al menos un enlace a LinkedIn.' : 'No se detecta enlace a LinkedIn.', ''),
    makeCheck('bing', 'Bing Webmaster Tools', 'auto', hasBing, hasBing ? 'Se detecta meta de verificación de Bing.' : 'No se detecta meta de verificación de Bing.', ''),
    makeCheck('ads', 'Anuncios', 'heur', hasAds, hasAds ? 'Se detectan señales técnicas de anuncios o banners.' : 'No se detectan señales técnicas claras de anuncios.', `Scripts de anuncios detectados: ${ads.length}`),
    makeCheck('chatbot', 'Bot / chatbot', 'heur', hasChatbot, hasChatbot ? 'Se detectan señales de bot o chat web.' : 'No se detectan señales técnicas de chatbot.', ''),
    makeCheck('schema', 'Datos estructurados', 'auto', schemaCount > 0, schemaCount > 0 ? `Se detectan ${schemaCount} bloque(s) JSON-LD.` : 'No se detectan datos estructurados JSON-LD.', ''),
    makeCheck('favicon', 'Favicon', 'auto', favicon, favicon ? 'Se detecta favicon.' : 'No se detecta favicon.', ''),
    makeCheck('content-depth', 'Contenido mínimo visible', 'heur', wordCount >= 150, wordCount >= 150 ? `La portada tiene unas ${wordCount} palabras visibles.` : 'La portada parece muy escasa para posicionar.', `Palabras estimadas: ${wordCount}`),
    makeCheck('github-root', 'Web en la raíz del repositorio de GitHub', 'manual', githubPagesRootOk, githubPagesRootOk === null ? 'Solo aplica de forma automática si el dominio es github.io.' : (githubPagesRootOk ? 'La URL parece servirse desde la raíz.' : 'La URL parece servirse en una subruta; revisa la raíz del repositorio.'), ''),
    makeCheck('manual-search', 'Presencia en buscadores', 'manual', null, 'Revisión manual recomendada.', `<a target="_blank" href="https://www.google.com/search?q=site:${encodeURIComponent(url.hostname)}">Google</a> · <a target="_blank" href="https://www.bing.com/search?q=site:${encodeURIComponent(url.hostname)}">Bing</a> · <a target="_blank" href="https://search.yahoo.com/search?p=site:${encodeURIComponent(url.hostname)}">Yahoo</a> · <a target="_blank" href="https://duckduckgo.com/?q=site:${encodeURIComponent(url.hostname)}">DuckDuckGo</a>`),
    makeCheck('manual-sitemap-google', 'URLs del sitemap presentes en Google', 'manual', null, 'Revisión manual recomendada.', sitemapUrls[0] ? `<a target="_blank" href="https://www.google.com/search?q=${encodeURIComponent(sitemapUrls[0])}">Comprobar primera URL</a>` : 'No hay muestra de URLs en el sitemap.'),
    makeCheck('manual-browsers', 'Pruebas en más navegadores', 'manual', null, 'La compatibilidad cruzada requiere prueba manual.', 'Revisión recomendada en Chrome, Edge, Firefox y Safari.'),
    makeCheck('manual-links', 'Enlaces de vuelta', 'manual', null, 'Los backlinks externos reales requieren herramientas externas.', `<a target="_blank" href="https://www.bing.com/webmasters/">Abrir Bing Webmaster Tools</a>`),
    makeCheck('manual-trends', 'Google Trends', 'manual', null, 'Revisión manual de tendencias de búsqueda.', `<a target="_blank" href="https://trends.google.com/trends/explore?geo=ES&q=${encodeURIComponent(url.hostname.replace(/^www\./,''))}">Abrir Google Trends</a>`)
  ];

  const categoryScores = {
    rastreo: Math.round(((checks[0].passed ? 18 : 6) + (checks[1].passed ? 18 : 0) + (checks[2].passed ? 10 : 0) + (checks[3].passed ? 10 : 2) + (checks[4].passed ? 22 : 0) + (checks[5].passed ? 12 : 2) + (checks[7].passed ? 10 : 0))),
    contenido: Math.round(((checks[10].passed ? 25 : 8) + (checks[12].passed ? 15 : 3) + (checks[22].passed ? 25 : 8) + (checks[13].passed ? 15 : 5) + (checks[11].passed ? 20 : 5))),
    tecnica: Math.round(((checks[8].passed ? 22 : 5) + (checks[14].passed ? 18 : 5) + (checks[15].passed ? 12 : 4) + (checks[20].passed ? 18 : 4) + (checks[21].passed ? 10 : 2) + (checks[23].passed === false ? 6 : 12))),
    presencia: Math.round(((checks[6].passed ? 18 : 4) + (checks[16].passed ? 18 : 4) + (checks[17].passed ? 18 : 4) + (checks[18].passed ? 16 : 6) + (checks[19].passed ? 16 : 4) + (uniqueExternalHosts.length > 0 ? 14 : 4))),
    confianza: Math.round(((domainLooksSuspicious(url.hostname) ? 8 : 24) + (canonical ? 18 : 4) + (favicon ? 10 : 2) + (schemaCount > 0 ? 16 : 4) + (hasGa ? 12 : 4) + (hasChatbot ? 10 : 4) + (fakeHandledOkay ? 10 : 3)))
  };

  for (const key of Object.keys(categoryScores)) {
    categoryScores[key] = Math.max(0, Math.min(100, categoryScores[key]));
  }

  const globalScore = Math.round(Object.values(categoryScores).reduce((a, b) => a + b, 0) / Object.keys(categoryScores).length);

  return {
    url: url.toString(),
    origin,
    hostname: url.hostname,
    generatedAt: new Date().toISOString(),
    globalScore,
    categoryScores,
    suspiciousDomain: domainLooksSuspicious(url.hostname),
    counts: {
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      trackers: trackers.length,
      iframes: iframes.length,
      forms: doc.querySelectorAll('form').length,
      inputs: formInputs.length,
      sitemapUrls: sitemapUrls.length,
      wordCount
    },
    checks
  };
}

function renderReport(report) {
  latestReport = report;
  globalScoreEl.textContent = String(report.globalScore);
  globalMeterEl.style.width = `${report.globalScore}%`;
  drawChart(report.categoryScores);

  categoryCardsEl.innerHTML = '';
  Object.entries(report.categoryScores).forEach(([name, value]) => {
    const card = document.createElement('div');
    const state = scoreState(value);
    card.className = 'category';
    card.innerHTML = `
      <div class="top">
        <div>
          <div class="name">${name[0].toUpperCase() + name.slice(1)}</div>
          <div class="value">${value}</div>
        </div>
        <span class="dot ${state}"></span>
      </div>
      <div class="mini-meter"><span style="width:${value}%"></span></div>
    `;
    categoryCardsEl.appendChild(card);
  });

  checksListEl.innerHTML = '';
  report.checks.forEach(check => {
    const item = document.createElement('div');
    item.className = 'check';
    let resultDot = '<span class="dot warn"></span>';
    if (check.passed === true) resultDot = '<span class="dot good"></span>';
    if (check.passed === false) resultDot = '<span class="dot bad"></span>';
    const typeMap = { auto: 'Automático', heur: 'Heurístico', manual: 'Manual' };
    item.innerHTML = `
      <div class="head">
        <div>
          <div class="title">${resultDot} ${check.title}</div>
          <div class="msg">${check.message}</div>
          ${check.extra ? `<div class="extra">${check.extra}</div>` : ''}
        </div>
        <span class="badge ${check.type}">${typeMap[check.type]}</span>
      </div>
    `;
    checksListEl.appendChild(item);
  });
}

function drawChart(categoryScores) {
  const ctx = chart.getContext('2d');
  const entries = Object.entries(categoryScores);
  const w = chart.width;
  const h = chart.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, w, h);

  const max = 100;
  const gap = 14;
  const barW = Math.floor((w - gap * (entries.length + 1)) / entries.length);
  entries.forEach(([name, value], idx) => {
    const x = gap + idx * (barW + gap);
    const barH = Math.round((value / max) * 100);
    const y = h - 28 - barH;
    const grad = ctx.createLinearGradient(0, y, 0, h - 28);
    grad.addColorStop(0, '#14b4ff');
    grad.addColorStop(1, '#2b6dff');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#dbe6ff';
    ctx.font = '11px sans-serif';
    ctx.fillText(String(value), x + 4, y - 6);
    ctx.fillStyle = '#9fb3d9';
    ctx.fillText(name.slice(0, 5), x, h - 10);
  });
}

async function loadHistory() {
  const { seoHistory = [] } = await chrome.storage.local.get('seoHistory');
  historyListEl.innerHTML = '';
  if (!seoHistory.length) {
    historyListEl.innerHTML = '<div class="muted">Aún no hay URLs analizadas.</div>';
    return;
  }
  seoHistory.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'hist-item';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${entry.hostname}</strong><br><span class="muted">${new Date(entry.generatedAt).toLocaleString()}</span>`;
    const btn = document.createElement('button');
    btn.textContent = `Ver ${entry.globalScore}`;
    btn.addEventListener('click', () => renderReport(entry));
    row.append(left, btn);
    historyListEl.appendChild(row);
  });
}

async function saveHistory(report) {
  const { seoHistory = [] } = await chrome.storage.local.get('seoHistory');
  const next = [report, ...seoHistory.filter(x => x.url !== report.url)].slice(0, 12);
  await chrome.storage.local.set({ seoHistory: next });
  await loadHistory();
}

function exportReport() {
  if (!latestReport) {
    setStatus('Primero analiza una URL.', 'bad');
    return;
  }
  const lines = [
    `URL: ${latestReport.url}`,
    `Fecha: ${new Date(latestReport.generatedAt).toLocaleString()}`,
    `Puntuación global: ${latestReport.globalScore}`,
    '',
    'Categorías:'
  ];
  for (const [key, value] of Object.entries(latestReport.categoryScores)) lines.push(`- ${key}: ${value}`);
  lines.push('', 'Comprobaciones:');
  latestReport.checks.forEach(c => lines.push(`- [${c.type}] ${c.title}: ${c.message} ${c.extra ? `| ${c.extra.replace(/<[^>]+>/g, '')}` : ''}`));
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `seo_auditoria_${latestReport.hostname.replace(/[^a-z0-9.-]/gi, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

analyzeBtn.addEventListener('click', async () => {
  try {
    const url = normalizeUrl(urlInput.value);
    setStatus('Analizando…', 'work');
    analyzeBtn.disabled = true;
    const report = await analyze(url);
    renderReport(report);
    await saveHistory(report);
    setStatus(`Análisis listo para ${report.hostname}.`, report.globalScore >= 70 ? 'good' : 'work');
  } catch (e) {
    setStatus(e.message || 'No se pudo analizar la URL.', 'bad');
  } finally {
    analyzeBtn.disabled = false;
  }
});

exportBtn.addEventListener('click', exportReport);
clearHistoryBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ seoHistory: [] });
  await loadHistory();
  setStatus('Historial borrado.', 'idle');
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
});
