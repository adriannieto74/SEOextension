const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const scoreEl = document.getElementById('score');
const scoreTextEl = document.getElementById('scoreText');
const copyBtn = document.getElementById('copyReport');

// Configuración de los checks con sus pesos para la puntuación
const CHECKS = [
  { key: 'headings', weight: 10, type: 'automatic', title: 'Jerarquía H1-H3', desc: 'Verifica la presencia de un único H1 y la existencia de H2.' },
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
  { key: 'sitemapIndexed', weight: 4, type: 'manual', title: 'Indexación de Sitemap', desc: 'Comparar URLs del sitemap con el índice de Google.' }
];

// Event Listeners
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

  // Obtener la pestaña activa
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.startsWith('http')) {
    setStatus('Por favor, abre una página web válida (http/https).');
    return;
  }

  const baseUrl = tab.url;
  const base = new URL(baseUrl);
  setStatus(`Analizando: ${base.hostname}...`);

  try {
    // Inyectar script para extraer datos del DOM real
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
    const anchors = [...doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    const internalLinks = anchors.filter(h => h && (h.startsWith('/') || h.includes(base.hostname)));
    const externalLinks = anchors.filter(h => h && h.includes('://') && !h.includes(base.hostname));

    // Verificaciones técnicas externas (robots y sitemap)
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

    // Lógica de validación previa al Payload
    const wordCountNum = result.text.split(/\s+/).filter(w => w.length > 0).length;
    const hasSocialLinks = /linkedin\.com|twitter\.com|facebook\.com|instagram\.com/i.test(result.html);
    const bingMeta = !!doc.querySelector('meta[name="msvalidate.01"]');
    const accOk = !!result.lang && result.hasTitle && result.imgsWithoutAlt === 0;

    // Construcción del objeto de resultados
    const payload = {
      headings: {
        status: result.h1s === 1 ? 'ok' : (result.h1s > 1 ? 'bad' : 'warn'),
        detail: `H1: ${result.h1s} (Ideal: 1). H2: ${result.h2s}.`
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

const ICONS = {
  ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon ok-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon warn-icon"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  bad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon bad-icon"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  manual: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon manual-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
};

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
    const statusLabel = data.status === 'ok' ? 'Cumple' : data.status === 'bad' ? 'Error' : data.status === 'warn' ? 'Mejorable' : 'Manual';
    const iconSvg = ICONS[data.status] || ICONS.manual;

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

    // Botón de acción interactiva para accesibilidad
    if (check.key === 'accessibility' && data.status !== 'ok') {
      const btnAction = document.createElement('button');
      btnAction.textContent = "Resaltar imágenes sin ALT";
      btnAction.style.cssText = "font-size:10px; margin-top:8px; padding:6px 10px; background:#ef4444; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:bold;";
      btnAction.onclick = highlightMissingAlt;
      item.appendChild(btnAction);
    }

    resultsEl.appendChild(item);
  }

  const finalScore = Math.round((score / maxScore) * 100);
  scoreEl.textContent = finalScore;

  let moodText = '';
  if (finalScore >= 90) {
    moodText = '¡Menudo jefe! Tu SEO está tan limpio que da crema. Pura élite. 😎';
    scoreTextEl.style.color = '#22c55e';
  } else if (finalScore >= 80) {
    moodText = 'Oye, ni tan mal. Te lo has currado, pero no te flipes que siempre hay algo que rascar. 🚀';
    scoreTextEl.style.color = '#22c55e';
  } else if (finalScore >= 60) {
    moodText = 'A ver, cumple, pero esto es un poco de principiante. Dale una vuelta si no quieres ser un "don nadie". 🛠️';
    scoreTextEl.style.color = '#eab308';
  } else if (finalScore >= 40) {
    moodText = 'Madre mía... Esto está más flojo que un muelle de guita. O espabilas o te comen en Google. ⚠️';
    scoreTextEl.style.color = '#f97316';
  } else {
    moodText = '¡Vaya tela! Esto es un desastre total. ¿Quieres hundir la web o qué? ¡Ponte a currar ya! 🛑';
    scoreTextEl.style.color = '#ef4444';
  }

  scoreTextEl.textContent = moodText;
}

async function highlightMissingAlt() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const targetImgs = document.querySelectorAll('img:not([alt])');
      targetImgs.forEach(img => {
        img.style.outline = "5px solid red";
        img.style.outlineOffset = "2px";
        img.style.boxShadow = "0 0 15px red";
      });
      alert(`Se han resaltado ${targetImgs.length} imágenes sin atributo ALT.`);
    }
  });
}

// Lógica para el botón de copiar informe
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    const report = Array.from(document.querySelectorAll('.item'))
      .map(i => `${i.querySelector('h3').innerText}: ${i.querySelector('.pill').innerText}`)
      .join('\n');
    const header = `Auditoría SEO Pro\nNota: ${scoreEl.textContent}/100 (${scoreTextEl.textContent})\n\n`;
    navigator.clipboard.writeText(header + report);
    alert("¡Informe copiado al portapapeles!");
  });
}