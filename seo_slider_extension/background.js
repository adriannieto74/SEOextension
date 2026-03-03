// Service Worker para SEO Slider Auditor Pro
// Maneja inicialización y eventos de fondo

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Primera instalación
    chrome.storage.local.set({ 
      analyses: [],
      version: '2.0.0'
    });
    console.log('SEO Slider Auditor Pro v2.0.0 instalado');
  } else if (details.reason === 'update') {
    // Actualización de versión
    console.log('SEO Slider Auditor Pro actualizado a v2.0.0');
  }
  //jaja niggnoc,
});

// Escuchar cambios de pestaña activa
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      // Se puede usar para análisis automático si se implementa
      console.log('Pestaña activa:', tab.url);
    }
  });
});
