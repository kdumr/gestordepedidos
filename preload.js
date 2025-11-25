const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Método para comunicação com o processo principal
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // Informações da aplicação
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Notificações
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  // Solicitar restauração da janela ao receber notificação
<<<<<<< HEAD
  restoreWindowOnNotification: () => ipcRenderer.send('restore-window-on-notification'),
  // Imprimir recibo de teste
  printTestReceipt: () => ipcRenderer.invoke('impressao:printTestReceipt'),
  // Imprimir recibo de pedido específico
  printOrderReceipt: (orderData) => ipcRenderer.invoke('impressao:printOrderReceipt', orderData),
  // Salvar impressora
  savePrinter: (printer) => ipcRenderer.invoke('savePrinter', printer),
  // Carregar configuração
  loadConfig: () => ipcRenderer.invoke('loadConfig'),
  // Login
  login: (username, password) => ipcRenderer.invoke('login', { username, password })
=======
  restoreWindowOnNotification: () => ipcRenderer.send('restore-window-on-notification')
>>>>>>> bc00745323966873f4ffc73ff90d4073980dcb3d
});


// --- Monitorar DOM por novos pedidos e restaurar janela ---
window.addEventListener('DOMContentLoaded', () => {
  let lastOrderId = null;
  const checkNewOrder = () => {
    // Seleciona todos os pedidos com status "Novo"
    const pedidos = Array.from(document.querySelectorAll('.fdm-orders-items'));
    let foundNew = false;
    let maxId = lastOrderId;
    pedidos.forEach(div => {
      const statusDiv = div.querySelector('.fdm-order-list-items-status');
      if (statusDiv && statusDiv.textContent && statusDiv.textContent.includes('Novo')) {
        const id = parseInt(div.id, 10);
        if (!lastOrderId || (id && id > lastOrderId)) {
          foundNew = true;
          if (!maxId || id > maxId) maxId = id;
        }
      }
    });
    if (foundNew && maxId) {
      lastOrderId = maxId;
      ipcRenderer.send('restore-window-on-notification');
    }
  };
  // Observar mudanças no DOM
  const observer = new MutationObserver(() => {
    checkNewOrder();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Checar também periodicamente (caso AJAX não altere DOM diretamente)
  setInterval(checkNewOrder, 3000);
  // Log
  console.log('Preload: monitorando novos pedidos...');
});
