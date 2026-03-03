# SEO Slider Auditor Plus

Extensión de Chrome en formato **side panel** para hacer una **auditoría rápida de SEO, visibilidad, rastreo, accesibilidad y señales técnicas** de un sitio web desde una interfaz visual tipo dashboard.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Side Panel](https://img.shields.io/badge/UI-Side%20Panel-purple)
![Estado](https://img.shields.io/badge/Estado-Listo%20para%20probar-brightgreen)

---

## Qué hace

**SEO Slider Auditor Plus** analiza una URL y genera un informe visual con puntuación global, categorías y comprobaciones automáticas, heurísticas y manuales.

Está pensado para:

- demos educativas
- pruebas rápidas de SEO técnico
- revisión de visibilidad web
- enseñanza de conceptos de indexación, rastreo y accesibilidad
- revisiones rápidas de proyectos web, blogs, landing pages y sitios en GitHub Pages

La extensión abre un **panel lateral en Chrome** y desde ahí permite lanzar el análisis, revisar el historial y exportar resultados.

---

## Funcionalidades principales

### Auditoría SEO y técnica

La extensión comprueba, entre otras cosas:

- si el sitio tiene **más páginas internas** además de la portada
- si existe **robots.txt**
- si existe **sitemap.xml**
- si el `robots.txt` hace referencia al sitemap
- si el `robots.txt` bloquea todo el sitio
- si la portada aparece dentro del sitemap
- si hay señales de **Google Analytics** o **Google Tag Manager**
- si la web tiene una **gestión razonable de errores / 404**
- si hay **enlaces internos y externos**
- si existe **title**, **meta description**, **canonical** y **H1**
- si hay metadatos sociales como **Open Graph** y **Twitter Card**
- si se detectan señales de **anuncios**
- si hay enlace a **LinkedIn**
- si aparece una meta de verificación de **Bing Webmaster Tools**
- si se detecta un **chatbot** por señales técnicas básicas
- si hay **JSON-LD / datos estructurados**
- si existe **favicon**
- si el contenido visible parece suficiente

### Accesibilidad básica

También incorpora una revisión rápida de accesibilidad, por ejemplo:

- atributo `lang` en el HTML
- `alt` en imágenes
- `label` en formularios
- meta `viewport`
- detección básica de `skip link`

### Panel visual tipo dashboard

La interfaz muestra:

- **puntuación global**
- **gráfico por categorías**
- **tarjetas de puntuación**
- **lista de comprobaciones**
- **historial de análisis** guardado localmente
- **exportación de informe**

### Historial persistente

Los análisis se almacenan en `chrome.storage.local`, así que puedes mantener un pequeño histórico de URLs revisadas y reutilizarlo dentro de la extensión.

---

## Enfoque de uso

Esta extensión no pretende sustituir herramientas SEO profesionales. Su objetivo es ofrecer una **revisión rápida, visual y didáctica** para detectar señales técnicas importantes y abrir comprobaciones manuales cuando haga falta.

Por eso mezcla tres tipos de validación:

- **Automáticas**: comprobaciones directas que sí puede revisar la extensión.
- **Heurísticas**: señales orientativas que ayudan a detectar posibles problemas o buenas prácticas.
- **Manuales**: comprobaciones que requieren validación externa o revisión humana, como la presencia en buscadores.

---

## Instalación

### Opción 1: cargar en modo desarrollador

1. Descarga o descomprime la carpeta de la extensión.
2. Abre Chrome.
3. Entra en `chrome://extensions/`.
4. Activa **Modo desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta del proyecto.

### Requisitos

- Google Chrome reciente
- soporte para **Manifest V3**
- soporte para **Side Panel API**

---

## Uso

1. Haz clic en el icono de la extensión.
2. Se abrirá el **panel lateral**.
3. Introduce una URL, por ejemplo:
   - `https://tudominio.com`
   - `https://tusitio.github.io`
4. Pulsa **Analizar**.
5. Revisa:
   - la puntuación global
   - las categorías
   - la lista de comprobaciones
   - el historial guardado
6. Si quieres, pulsa **Exportar informe**.

---

## Ejemplos de uso educativo

Este proyecto encaja muy bien en clases o talleres sobre:

- SEO técnico básico
- rastreo e indexación
- accesibilidad web
- GitHub Pages
- visibilidad digital
- analítica y etiquetas
- revisión rápida de proyectos de alumnos

También es útil para enseñar diferencias entre:

- lo que una herramienta puede comprobar automáticamente
- lo que solo puede estimar por heurística
- lo que debe verificarse manualmente en buscadores o plataformas externas

---

## Estructura del proyecto

Un despliegue básico del proyecto suele incluir estos archivos:

- `manifest.json`
- `background.js`
- `sidepanel.html`
- `sidepanel.css`
- `sidepanel.js`

### Descripción rápida

- **manifest.json**: define la extensión, permisos, acción y side panel.
- **background.js**: configura el comportamiento del panel lateral al pulsar el icono.
- **sidepanel.html**: estructura visual del panel.
- **sidepanel.css**: estilos de la interfaz tipo dashboard.
- **sidepanel.js**: lógica principal del análisis, render del informe, historial y exportación.

---

## Permisos usados

La extensión utiliza permisos mínimos para su función:

- `storage`: guardar historial e informes localmente
- `sidePanel`: mostrar la interfaz lateral
- `host_permissions: <all_urls>`: poder revisar URLs indicadas por el usuario

---

## Limitaciones

Conviene tener en cuenta estas limitaciones:

- algunas comprobaciones son **heurísticas**, no validaciones absolutas
- la presencia real en Google, Bing u otros buscadores no puede garantizarse solo desde la extensión
- algunas webs pueden restringir comportamientos por configuración del servidor, cabeceras o medidas anti-bot
- no sustituye herramientas como Search Console, Bing Webmaster Tools o una auditoría profesional profunda
- ciertos puntos, como anuncios, chatbot o errores personalizados, se detectan por señales aproximadas

---

## Mejoras futuras

Ideas fáciles de añadir en próximas versiones:

- exportación a **CSV**
- más señales de accesibilidad
- análisis de rendimiento básico
- comprobación de favicon y manifest web app más detallada
- revisión de schema.org más profunda
- integración con checklist de alumnos
- modo comparativa entre dos URLs
- versión con **semáforo de prioridades**
- recomendaciones accionables por bloques

---

## Casos ideales para probarla

Puedes probarla con:

- una web propia
- un proyecto en **GitHub Pages**
- una landing sencilla
- una web de prácticas de alumnos
- un blog
- una tienda pequeña

---

## Nota

Esta extensión está pensada como una herramienta **práctica, visual y rápida**, muy útil para enseñar conceptos técnicos de forma clara sin entrar en plataformas complejas desde el principio.

Si quieres una evolución más avanzada, se puede ampliar con:

- side panel todavía más completo
- exportación avanzada
- reglas de recomendación automática
- integración con más señales SEO y de accesibilidad
- módulo combinado de **SEO + seguridad web**

---

## Autor

- Autor: Jesusninoc
- Web: `https://jesusninoc.com`

---

## Resumen rápido

**SEO Slider Auditor Plus** es una extensión de Chrome con panel lateral que permite revisar de forma rápida:

- SEO técnico básico
- rastreo e indexación
- accesibilidad mínima
- metadatos sociales
- analítica
- señales de visibilidad
- historial de auditorías

Todo ello con una interfaz visual, moderna y muy útil para demos, pruebas y enseñanza.
