const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const scoreEl = document.getElementById('score');
const scoreTextEl = document.getElementById('scoreText');
const copyBtn = document.getElementById('copyReport');

// Configuración de los checks con sus pesos
const CHECKS = [
  { key: 'headings', weight: 10, type: 'automatic', title: 'Jerarquía H1-H3', desc: 'Verifica la presencia de un único H1 y la existencia de H2.' },
  { key: 'metaDescription', weight: 8, type: 'automatic', title: 'Meta Description', desc: 'Verifica existencia y longitud adecuada (120-160 caracteres).' },
  { key: 'openGraph', weight: 6, type: 'automatic', title: 'Open Graph', desc: 'Comprueba etiquetas og:title y og:description.' },
  { key: 'wordCount', weight: 6, type: 'automatic', title: 'Extensión del Contenido', desc: 'Evalúa si el volumen de texto es suficiente para evitar el thin content.' },
  { key: 'morePages', weight: 8, type: 'automatic', title: 'Densidad de enlaces', desc: 'Busca enlaces internos para confirmar que no es una única página.' },
  { key: 'googleAnalytics', weight: 8, type: 'heuristic', title: 'Google Analytics', desc: 'Detecta scripts de GA4 o Google Tag Manager.' },
  { key: 'robots', weight: 8, type: 'automatic', title: 'Existe robots.txt', desc: 'Comprueba si el archivo /robots.txt es accesible.' },
  { key: 'sitemap', weight: 8, type: 'automatic', title: 'Existe sitemap.xml', desc: 'Busca la declaración del mapa del sitio.' },
  { key: 'errorHandling', weight: 7, type: 'heuristic', title: 'Manejo de Errores 404', desc: 'Requiere revisión de redirecciones controladas.' },
  { key: 'links', weight: 8, type: 'heuristic', title: 'Enlaces externos', desc: 'Evalúa la conexión con otros dominios.' },
  { key: 'accessibility', weight: 12, type: 'heuristic', title: 'Accesibilidad (ALT)', desc: 'Comprueba etiquetas lang, title y atributos ALT en imágenes.' },
  { key: 'social', weight: 6, type: 'heuristic', title: 'Redes Sociales', desc: 'Busca presencia de perfiles sociales comunes.' },
  { key: 'bing', weight: 5, type: 'heuristic', title: 'Bing Webmaster Tools', desc: 'Busca meta de verificación msvalidate.01.' },
  { key: 'searchPresence', weight: 4, type: 'manual', title: 'Presencia en Buscadores', desc: 'Revisión manual recomendada mediante comando site:.' },
  { key: 'githubRoot', weight: 3, type: 'manual', title: 'Raíz del Repositorio', desc: 'Verificar manualmente si es la raíz del proyecto.' },
  { key: 'trends', weight: 3, type: 'manual', title: 'Google Trends', desc: 'Revisar tendencia de búsqueda de la temática.' },
  { key: 'sitemapIndexed', weight: 4, type: 'manual', title: 'Indexación de Sitemap', desc: 'Cruzar datos de Search Console.' }
];

document.getElementById('analyzeBtn').addEventListener('click', analyze);

function setStatus(text) {
  statusEl.textContent = text;
}

function toDoc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function pick(base, path) {
  return new URL(path, base).toString();
}

const isGA = (html) => /(googletagmanager\.com|google-analytics\.com|gtag\(|ga\(|G-[A-Z0-9]+)/i.test(html);

async function analyze() {
  resultsEl.innerHTML = '';
  scoreEl.textContent = '...';
  scoreTextEl.textContent = 'Analizando';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) {
    setStatus('Por favor, abre una página web válida (http/https).');
    return;
  }

  const baseUrl = tab.url;
  const base = new URL(baseUrl);
  setStatus(`Analizando: ${base.hostname}...`);

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          html: document.documentElement.outerHTML,
          text: document.body.innerText || "",
          h1s: document.querySelectorAll('h1').length,
          h2s: document.querySelectorAll('h2').length,
          lang: document.documentElement.getAttribute('lang'),
          hasTitle: !!document.querySelector('title'),
          imgsWithoutAlt: document.querySelectorAll('img:not([alt])').length,
          totalImgs: document.images.length
        };
      }
    });

    const doc = toDoc(result.html);

    // META DESCRIPTION
    const metaDescTag = doc.querySelector('meta[name="description"]');
    const metaDescContent = metaDescTag ? metaDescTag.getAttribute('content') : '';
    const metaDescLength = metaDescContent ? metaDescContent.length : 0;

    let metaDescStatus = 'bad';
    if (metaDescLength >= 120 && metaDescLength <= 160) {
      metaDescStatus = 'ok';
    } else if (metaDescLength > 0) {
      metaDescStatus = 'warn';
    }

    // OPEN GRAPH
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    const ogDesc = doc.querySelector('meta[property="og:description"]');
    const openGraphStatus = (ogTitle && ogDesc) ? 'ok' : 'warn';

    const anchors = [...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    const internalLinks = anchors.filter(h => h && (h.startsWith('/') || h.includes(base.hostname)));
    const externalLinks = anchors.filter(h => h && h.includes('://') && !h.includes(base.hostname));

    let robotsOk = false;
    try {
      const r = await fetch(pick(base, '/robots.txt'));
      robotsOk = r.ok;
    } catch (e) { }

    let sitemapOk = false;
    try {
      const s = await fetch(pick(base, '/sitemap.xml'));
      sitemapOk = s.ok;
    } catch (e) { }

    const wordCountNum = result.text.split(/\s+/).filter(w => w.length > 0).length;
    const hasSocialLinks = /linkedin\.com|twitter\.com|facebook\.com|instagram\.com/i.test(result.html);
    const bingMeta = !!doc.querySelector('meta[name="msvalidate.01"]');
    const accOk = !!result.lang && result.hasTitle && result.imgsWithoutAlt === 0;

    const payload = {
      headings: {
        status: result.h1s === 1 ? 'ok' : (result.h1s > 1 ? 'bad' : 'warn'),
        detail: `H1: ${result.h1s} (Ideal: 1). H2: ${result.h2s}.`
      },
      metaDescription: {
        status: metaDescStatus,
        detail: metaDescContent
          ? `Longitud: ${metaDescLength} caracteres.`
          : 'No se encontró meta description.'
      },
      openGraph: {
        status: openGraphStatus,
        detail: (ogTitle && ogDesc)
          ? 'Etiquetas Open Graph principales detectadas.'
          : 'Faltan etiquetas og:title u og:description.'
      },
      wordCount: {
        status: wordCountNum > 300 ? 'ok' : 'warn',
        detail: `Se detectaron ~${wordCountNum} palabras.`
      },
      morePages: {
        status: internalLinks.length > 5 ? 'ok' : 'warn',
        detail: `Enlaces internos encontrados: ${internalLinks.length}.`
      },
      googleAnalytics: {
        status: isGA(result.html) ? 'ok' : 'warn',
        detail: isGA(result.html) ? 'Patrón de GA/GTM detectado.' : 'No se detecta código de seguimiento.'
      },
      robots: { status: robotsOk ? 'ok' : 'bad', detail: robotsOk ? 'Archivo robots.txt presente.' : 'No se pudo acceder a robots.txt' },
      sitemap: { status: sitemapOk ? 'ok' : 'bad', detail: sitemapOk ? 'Sitemap.xml detectado.' : 'No se encuentra sitemap en la raíz.' },
      errorHandling: { status: 'warn', detail: 'Verificar manualmente la página 404.' },
      links: {
        status: externalLinks.length > 0 ? 'ok' : 'warn',
        detail: `Internos: ${internalLinks.length} | Externos: ${externalLinks.length}`
      },
      accessibility: {
        status: accOk ? 'ok' : 'warn',
        detail: `Lang: ${!!result.lang} | Imágenes sin ALT: ${result.imgsWithoutAlt}.`
      },
      social: {
        status: hasSocialLinks ? 'ok' : 'warn',
        detail: hasSocialLinks ? 'Redes sociales detectadas.' : 'No se ven enlaces sociales comunes.'
      },
      bing: {
        status: bingMeta ? 'ok' : 'warn',
        detail: bingMeta ? 'Meta de Bing detectada.' : 'Falta meta de verificación de Bing.'
      },
      searchPresence: { status: 'manual', detail: 'Revisar comando site: en buscadores.' },
      githubRoot: { status: 'manual', detail: 'Verificar repositorio fuente.' },
      trends: { status: 'manual', detail: 'Consultar relevancia en Google Trends.' },
      sitemapIndexed: { status: 'manual', detail: 'Cruzar datos de Search Console.' }
    };

    renderResults(payload, base.hostname);
    setStatus(`Análisis finalizado para ${base.hostname}.`);

  } catch (err) {
    console.error(err);
    setStatus('Error: Recarga la página activa e intenta de nuevo.');
  }
}

function renderResults(payload) {
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

    const statusLabel =
      data.status === 'ok' ? 'Cumple' :
      data.status === 'bad' ? 'Error' :
      data.status === 'warn' ? 'Mejorable' : 'Manual';

    item.innerHTML = `
      <div class="item-head">
        <div class="item-info">
          <div class="title-row">
            ${iconSvg}
            <h3>${check.title}</h3>
          </div>
          <p>${check.desc}</p>
        </div>
        <span class="pill ${data.status}">${statusLabel}</span>
      </div>
      <div class="meta">
        <strong>Resultado:</strong> ${data.detail}
      </div>
    `;

    resultsEl.appendChild(item);
  }

  const finalScore = Math.round((score / maxScore) * 100);
  scoreEl.textContent = finalScore;
  scoreTextEl.textContent =
    finalScore >= 80 ? 'Muy bien' :
    (finalScore >= 60 ? 'Aceptable' : 'A mejorar');
}
