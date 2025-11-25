// Função para substituir apenas &#8211; por '-'
function replace8211(text) {
  if (!text) return '';
  return text.replace(/&#8211;/g, '-');
}
const { app, BrowserWindow, Menu, shell, ipcMain, Notification, dialog, session, globalShortcut } = require('electron');

if (process.platform === 'win32') {
  try {
    app.setAppUserModelId('Franguxo Gestor de Pedidos');
  } catch (e) {
    console.warn('Não foi possível definir AppUserModelId:', e && e.message ? e.message : e);
  }
}

// Habilita recarregamento automático apenas em desenvolvimento
if (!app.isPackaged) {
  try {
    require('electron-reload')(__dirname);
  } catch (e) {
    console.warn('electron-reload indisponível em modo dev:', e && e.message ? e.message : e);
  }
}

const path = require('path');
const { autoUpdater } = require('electron-updater');
const configPath = path.join(app.getPath('userData'), 'config.json');
console.log('Config path:', configPath);
const keytar = require('keytar');
const fs = require('fs');

// Carregar configuração do aplicativo
let appConfig = {};
try {
  const appConfigPath = path.join(__dirname, 'app-config.json');
  appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
  console.log('App config loaded:', appConfig);
} catch (e) {
  console.error('Failed to load app config:', e);
  // Fallback para valores padrão
  appConfig = {
    wordpress: { url: "https://dev.franguxo.app.br", loginPath: "/pedido" },
    auth: { serviceName: "franguxo-gestor", accountName: "refreshToken" },
    printServer: { port: 3420 }
  };
}

// Constantes derivadas da configuração
const WP_URL = appConfig.wordpress.url;
const WP_HOSTNAME = new URL(WP_URL).hostname;
const SERVICE_NAME = appConfig.auth.serviceName;
const ACCOUNT_NAME = appConfig.auth.accountName;

async function getNewAccessToken() {
  const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${WP_URL}/wp-json/custom-auth/v1/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.access_token && data.refresh_token) {
      // Salvar novo refresh token (token rotation)
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, data.refresh_token);
      console.log('Token refreshed successfully');
      return data.access_token;
    }

    return null;
  } catch (e) {
    console.error('Error refreshing token:', e);
    return null;
  }
}
function getSavedPrinter() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.printer || null;
  } catch (e) {
    return null;
  }
}
let printer = null;
try{
  // native module may not be compatible with Electron's Node ABI; load if available
  printer = require('@niick555/node-printer');
}catch(e){
  console.warn('Aviso: módulo nativo @niick555/node-printer não pôde ser carregado no processo Electron. Irei encaminhar impressões ao servidor local via HTTP.', e && e.message ? e.message : e);
}
const http = require('http');
const { spawn } = require('child_process');

// Função para centralizar texto
function centerText(text, width = 32) {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

// Função para remover acentos e caracteres especiais
function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
}

// Função para imprimir recibo de teste
function printTestReceipt() {
  const texto = normalizeText('Recibo de Teste\nValor: R$ 123,45\nObrigado pela preferência!');
  const savedPrinter = getSavedPrinter();
  if(printer){
    printer.printDirect({ data: texto, type: 'RAW', printer: savedPrinter, success: function(jobID){ console.log('Impressão enviada, JobID:', jobID); }, error: function(err){ console.error('Erro ao imprimir:', err); } });
  } else {
    // forward to local print server
    sendToLocalPrintServer({ text: texto, printer: savedPrinter }).catch(err => console.error('Erro encaminhando para print-server:', err));
  }
}

// Função para formatar linha com preço na direita
function formatItemLine(name, price, width = 32) {
  const priceStr = 'R$ ' + price;
  const nameLength = name.length;
  const priceLength = priceStr.length;
  const spaces = Math.max(1, width - nameLength - priceLength);
  return name + ' '.repeat(spaces) + priceStr;
}

// Função para imprimir recibo de pedido específico
function printOrderReceipt(orderData) {
  console.log('=== INICIANDO IMPRESSÃO DE PEDIDO ===');
  console.log('Dados do pedido recebidos:', JSON.stringify(orderData, null, 2));

  let texto = '';
  if (orderData.store_name) {
    texto += centerText(orderData.store_name) + '\n';
  }
  texto += ' -------------------------------\n';
  texto += centerText('Pedido #' + (orderData.id || 'N/A')) + '\n';
  texto += ' -------------------------------\n';
  texto += 'Cliente: ' + (orderData.customer_name || 'N/A') + '\n';
  texto += 'Telefone: ' + (orderData.customer_phone || 'N/A') + '\n';
  texto += 'Data: ' + (orderData.date || new Date().toLocaleString()) + '\n';

  // Endereço de entrega
  if (orderData.address) {
    texto += 'Endereço: ' + orderData.address;
    if (orderData.address_number) texto += ', ' + orderData.address_number;
    texto += '\n';
    if (orderData.address_complement && orderData.address_complement.trim() !== '') {
      texto += 'Comp: ' + orderData.address_complement + '\n';
    }
    if (orderData.neighborhood) {
      texto += 'Bairro: ' + orderData.neighborhood + '\n';
    }
    if (orderData.zipcode) {
      texto += 'CEP: ' + orderData.zipcode + '\n';
    }
  }

  texto += ' -------------------------------\n';
  texto += ' ITENS DO PEDIDO:\n';

  if (orderData.items && orderData.items.length > 0) {
    console.log('Número de itens:', orderData.items.length);
    orderData.items.forEach((item, index) => {
      console.log('Item ' + index + ':', item);
      // Extrair quantidade e nome limpo
  // Substitui apenas &#8211; por '-'
  let fixedProductName = replace8211(item.product_name);
  let match = fixedProductName.match(/^(\d+)\s*x\s*(.*)$/);
  let quantidade = match ? match[1] : '1';
  let cleanName = match ? match[2] : fixedProductName;
      // Linha principal: quantidade, nome, preço alinhados
      const colPreco = 9; // ex: 'R$61,99'
      const width = 32;
      let precoStr = 'R$' + (typeof item.product_price === 'string' ? item.product_price : Number(item.product_price).toFixed(2).replace('.', ','));
      let nomeCol = quantidade + 'x ' + cleanName;
      if (nomeCol.length + precoStr.length > width) {
        // Nome muito longo: quebra em linha extra
        texto += nomeCol + '\n';
        texto += ' '.repeat(Math.max(1, width - precoStr.length)) + precoStr + '\n';
      } else {
        let espacos = width - nomeCol.length - precoStr.length;
        texto += nomeCol + ' '.repeat(Math.max(1, espacos)) + precoStr + '\n';
      }

      

      // Extras agrupados
      if (item.extras && item.extras.groups && item.extras.groups.length > 0) {
        item.extras.groups.forEach(group => {
          // Nome do grupo: exibir se houver pelo menos 1 extra no grupo
          if (group.group && group.group.trim() !== '' && group.items && group.items.length > 0) {
            texto += '    ' + group.group.trim() + '\n';
          }
          // Itens do grupo (se houver)
          if (group.items && group.items.length > 0) {
            group.items.forEach(extraItem => {
              if (parseInt(extraItem.quantity) > 0) {
                const extraTotal = parseFloat(extraItem.price) * parseInt(extraItem.quantity);
                let extraNome = extraItem.quantity + ' ' + extraItem.name;
                let extraPreco = 'R$' + extraTotal.toFixed(2).replace('.', ',');
                let extraEspacos = width - 4 - extraNome.length - extraPreco.length; // 4 = indent
                texto += '    ' + extraNome + ' '.repeat(Math.max(1, extraEspacos)) + extraPreco + '\n';
              }
            });
          }
        });
      }

      // Nota/observação
      if (item.product_note && item.product_note.trim() !== '') {
        texto += '    *Obs: ' + item.product_note.trim() + '\n';
      }
    });
  } else {
    console.log('Nenhum item encontrado');
    texto += ' Nenhum item encontrado\n';
  }

  // Mapeamento especial para status SumUp
  let paymentStatusDisplay = orderData.payment_status || 'N/A';
  if (typeof paymentStatusDisplay === 'string') {
    if (paymentStatusDisplay.toLowerCase() === 'sumup - pix') {
      paymentStatusDisplay = 'pix';
    } else if (paymentStatusDisplay.toLowerCase() === 'sumup - cartão de crédito' || paymentStatusDisplay.toLowerCase() === 'sumup - cartao de credito') {
      paymentStatusDisplay = 'Cartão de Crédito';
    } else if (paymentStatusDisplay.toLowerCase() === 'sumup - cartão de débito' || paymentStatusDisplay.toLowerCase() === 'sumup - cartao de debito') {
      paymentStatusDisplay = 'Cartão de Débito';
    }
  }

  // Aviso de cobrança se pagamento pendente
  if (orderData.payment_status && orderData.payment_status.toLowerCase() === 'waiting') {
    texto += centerText('-------------------------------') + '\n';
    texto += centerText('*COBRAR DO CLIENTE*') + '\n';
    texto += centerText(orderData.payment_method || '') + '\n';
    texto += centerText('-------------------------------') + '\n';
  }
  // Aviso de cobrança se pagamento realizado
  if (orderData.payment_status && orderData.payment_status.toLowerCase() === 'paid') {
    texto += centerText('-------------------------------') + '\n';
    texto += centerText('*PAGO ONLINE*') + '\n';
    texto += centerText(orderData.payment_method || '') + '\n';
    texto += centerText('-------------------------------') + '\n';
  }

  // Valor total do pedido sem desconto
  if (orderData.subtotal && parseFloat(orderData.subtotal) > 0) {
    texto += 'Valor total do:'.padEnd(22) + 'R$ ' + orderData.subtotal + '\n';
    texto += 'pedido\n';
  }

  // Taxa de entrega
  if (orderData.delivery_price && parseFloat(orderData.delivery_price) > 0) {
    texto += 'Taxa de entrega:'.padEnd(22) + 'R$ ' + orderData.delivery_price + '\n';
  }

  // Cupom e desconto
  if (orderData.coupon_name) {
    texto += 'Cupom: ' + orderData.coupon_name + '\n';
  }
  if (orderData.coupon_discount && parseFloat(orderData.coupon_discount) > 0) {
    texto += 'Desconto cupom: '.padEnd(21) + '-R$ ' + orderData.coupon_discount + '\n';
  }

  // Total final
  texto += 'Total:'.padEnd(22) + 'R$ ' + (orderData.total || '0,00') + '\n';

  // Forma de pagamento
  if (orderData.payment_method) {
    if (orderData.payment_change && parseFloat(orderData.payment_change) > 0) {
      texto += ' Troco para: R$ ' + orderData.payment_change + '\n';
    }
  }

  // Aviso de cobrança se pagamento pendente
  if (orderData.payment_status && orderData.payment_status.toLowerCase() === 'waiting') {
    texto += centerText('-------------------------------') + '\n';
    texto += 'Cobrar do cliente: *' + 'R$ ' + (orderData.total || '0,00') + '\n';
    texto += centerText('-------------------------------') + '\n';
  }

  
  

  // Comando ESC/POS para corte de papel (total cut)
  const CUT_PAPER = '\x1D\x56\x00';
  
  const textoNormalizado = normalizeText(texto);
  const savedPrinter = getSavedPrinter();
  if(printer){
    printer.printDirect({ data: textoNormalizado, type: 'RAW', printer: savedPrinter, success: function(jobID){ console.log('Impressão do pedido enviada, JobID:', jobID); console.log('ADICIONAR CORTE DE PAPEL NO FINAL') }, error: function(err){ console.error('Erro ao imprimir pedido:', err); } });
  } else {
    // forward the structured order to the local print server (server will format)
    sendToLocalPrintServer({ orderData: orderData, escpos: true, printer: savedPrinter }).then(res => {
      console.log('Encaminhado para print-server:', res);
    }).catch(err => {
      console.error('Erro ao encaminhar pedido para print-server:', err);
    });
  }
}

function sendToLocalPrintServer(payload){
  return new Promise((resolve, reject) => {
    try{
      const data = JSON.stringify(payload);
      const opts = {
        hostname: '127.0.0.1',
        port: 3420,
        path: '/print',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      const req = http.request(opts, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try{ const parsed = JSON.parse(body || '{}'); resolve(parsed); }catch(e){ resolve(body); }
        });
      });
      req.on('error', (e) => reject(e));
      req.write(data);
      req.end();
    }catch(e){ reject(e); }
  });
}

// Handler IPC para impressão
ipcMain.handle('impressao:printTestReceipt', async () => {
  printTestReceipt();
});

ipcMain.handle('impressao:printOrderReceipt', async (event, orderData) => {
  printOrderReceipt(orderData);
});
// Expor logout via IPC para eventual botão no renderer
ipcMain.handle('logout', async () => {
  await logoutUser();
  return { success: true };
});
function openImpressaoWindow() {
  const printWindow = new BrowserWindow({
    width: 500,
    height: 350,
    resizable: false,
    minimizable: true,
    maximizable: false,
    title: 'Configurar Impressão',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  printWindow.setMenuBarVisibility(true);
  printWindow.loadFile('impressao.html');
}


let mainWindow;
let manualUpdateCheck = false;

async function getSavedToken() {
  return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
}

async function createSessionWithToken(accessToken) {
  try {
    const res = await fetch(`${WP_URL}/wp-json/custom-auth/v1/login`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      console.error('Session creation failed:', res.status);
      const text = await res.text();
      console.error('Response text:', text);
      return false;
    }

    const data = await res.json();
    console.log('Session data:', data);

    // Definir cookie com expirationDate para que persista entre reinícios do app
    const cookieConfig = {
      url: WP_URL,
      name: data.cookieName,
      value: data.cookieValue,
      domain: '.' + WP_HOSTNAME, // Adicionar ponto para subdomínios
      path: '/',
      httpOnly: false, // Permitir acesso pelo JS
      secure: true,
      sameSite: 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 86400 // 1 dia
    };
    
    console.log('createSessionWithToken - Setting cookie:', cookieConfig);
    await session.defaultSession.cookies.set(cookieConfig);
    
    // Verificar
    const allCookies = await session.defaultSession.cookies.get({ url: WP_URL });
    console.log('Cookies after createSessionWithToken:', allCookies.map(c => ({ name: c.name, value: c.value.substring(0, 20) + '...', domain: c.domain })));

    return true;
  } catch (e) {
    console.error('Error creating session:', e);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: false
  });

  mainWindow.loadURL(WP_URL + appConfig.wordpress.loginPath);



  mainWindow.once('ready-to-show', async () => {
    // Verificar cookies antes de mostrar a janela
    const cookies = await session.defaultSession.cookies.get({ url: WP_URL });
    console.log('=== Window ready to show ===');
    console.log('Cookies available for', WP_URL + ':', cookies.map(c => ({ 
      name: c.name, 
      domain: c.domain, 
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite
    })));
    
    mainWindow.maximize();
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const currentUrl = new URL(mainWindow.webContents.getURL());
    if (parsedUrl.hostname !== WP_HOSTNAME && parsedUrl.hostname !== currentUrl.hostname) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  createMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  ipcMain.on('restore-window-on-notification', () => {
    if (mainWindow && mainWindow.isMinimized()) {
      mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Handlers expostos no preload
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
  ipcMain.handle('show-notification', (_e, { title, body }) => {
    const notif = new Notification({ title, body });
    notif.show();
  });
  ipcMain.handle('savePrinter', (event, payload) => {
    let config = {};
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
    // payload can be a string (printer) or an object { printer, copies }
    try {
      if (payload && typeof payload === 'object') {
        if (Object.prototype.hasOwnProperty.call(payload, 'printer')) {
          if (payload.printer === null || payload.printer === undefined || payload.printer === '') {
            delete config.printer;
          } else {
            config.printer = payload.printer;
          }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'copies')) {
          if (payload.copies === null || payload.copies === undefined || payload.copies === '') {
            delete config.copies;
          } else {
            config.copies = payload.copies;
          }
        }
      } else {
        // legacy string payload
        if (payload === null || payload === undefined || payload === '') delete config.printer; else config.printer = payload;
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (e) {
      console.error('Failed to save printer config:', e);
      return { success: false, error: e && e.message };
    }
  });
  ipcMain.handle('loadConfig', () => {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) { return {}; }
  });
}

function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Recarregar',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload()
        },
        {
          label: 'Forçar Recarregar',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow && mainWindow.reload()
        },
        { type: 'separator' },
        {
          label: 'Deslogar',
          accelerator: 'CmdOrCtrl+L',
          click: () => logoutUser()
        },
        { type: 'separator' },
        {
          label: 'Sair',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Configurar impressão',
      click: () => {
        openImpressaoWindow();
      }
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Refazer', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copiar', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Colar', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Tela Cheia', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Aumentar Zoom', accelerator: 'CmdOrCtrl+Plus', role: 'zoomin' },
        { label: 'Diminuir Zoom', accelerator: 'CmdOrCtrl+-', role: 'zoomout' },
        { label: 'Zoom Padrão', accelerator: 'CmdOrCtrl+0', role: 'resetzoom' },
        { type: 'separator' },
        {
          label: 'Ferramentas do Desenvolvedor',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Buscar Atualizações…',
          click: () => {
            if (app.isPackaged) {
              manualUpdateCheck = true;
              checkForUpdates();
              // Feedback leve (notificação) sem bloquear a UI
              const notif = new Notification({
                title: 'Atualizações',
                body: 'Verificando atualizações…'
              });
              notif.show();
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Atualizações',
                message: 'Atualizações automáticas só funcionam no app empacotado.',
                buttons: ['OK']
              });
            }
          }
        },
        {
          label: 'Sobre',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre',
              message: 'Franguxo Gestor de Pedidos',
              detail: `Versão ${app.getVersion()}\n\nAplicativo para acessar o sistema Franguxo de gestão de pedidos.`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- Funções de atualização automática ---
function registerAutoUpdaterEvents() {
  autoUpdater.on('update-available', (info) => {
    const title = 'Atualização disponível';
    const body = `Versão ${info.version} encontrada. Baixando atualização...`;
    if (manualUpdateCheck) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title, message: body, buttons: ['OK']
      });
      manualUpdateCheck = false;
    } else {
      const notif = new Notification({ title, body });
      notif.show();
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualizações',
        message: 'Você já está na última versão.',
        buttons: ['OK']
      });
      manualUpdateCheck = false;
    } else {
      console.log('Nenhuma atualização disponível.');
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Reiniciar agora', 'Mais tarde'],
      defaultId: 0,
      cancelId: 1,
      message: `A nova versão ${info.version} foi baixada. Deseja reiniciar e aplicar agora?`
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Erro no autoUpdater:', err);
    if (manualUpdateCheck) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Erro nas atualizações',
        message: 'Ocorreu um erro ao verificar por atualizações.',
        detail: String(err?.message || err),
        buttons: ['OK']
      });
      manualUpdateCheck = false;
    }
  });
}

function checkForUpdates() {
  // logger básico para depuração
  try { autoUpdater.logger = console; } catch {}
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdates();
}

// --- Local print server management ---
let _printServerProc = null;

// Checa se a porta está aberta (retorna true se há um servidor respondendo)
function isPortOpen(port, host = '127.0.0.1', timeout = 500){
  return new Promise((resolve) => {
    try{
      const net = require('net');
      const socket = new net.Socket();
      let done = false;
      socket.setTimeout(timeout);
      socket.on('connect', () => { done = true; socket.destroy(); resolve(true); });
      socket.on('timeout', () => { if(!done){ done = true; socket.destroy(); resolve(false); } });
      socket.on('error', () => { if(!done){ done = true; resolve(false); } });
      socket.connect(port, host);
    }catch(e){ resolve(false); }
  });
}

async function startLocalPrintServer(){
  // Corrigido: usar pasta `print-server` dentro do diretório atual, não o pai
  const serverDir = path.join(__dirname, 'print-server');
  const serverScript = path.join(serverDir, 'server.js');
  const port = (appConfig && appConfig.printServer && appConfig.printServer.port) ? appConfig.printServer.port : 3420;

  try{
    const open = await isPortOpen(port);
    if(open){
      console.log(`Local print-server já está escutando em http://127.0.0.1:${port} — não irei spawnar uma nova instância.`);
      return;
    }

    // Prefer the system 'node' executable to avoid native module ABI mismatch with Electron
    const nodeExe = 'node';
    _printServerProc = spawn(nodeExe, [serverScript], { cwd: serverDir, detached: false, stdio: ['ignore','pipe','pipe'] });

    _printServerProc.on('error', (err) => {
      console.error('Failed to start print-server process:', err);
      // If node is not found, give a friendly hint
      if(err && (err.code === 'ENOENT' || String(err).includes('spawn'))){
        console.warn('Node.js não foi encontrado no PATH. Inicie o servidor manualmente com `node server.js` dentro da pasta print-server, ou instale o Node.js.');
      }
    });

    // Forward child stdout/stderr to the Electron console instead of writing to server.log
    if(_printServerProc.stdout){
      _printServerProc.stdout.on('data', (chunk) => {
        try{ console.log('[print-server]', String(chunk).trim()); }catch(e){}
      });
    }
    if(_printServerProc.stderr){
      _printServerProc.stderr.on('data', (chunk) => {
        try{ console.error('[print-server][ERR]', String(chunk).trim()); }catch(e){}
      });
    }
    _printServerProc.on('close', (code) => {
      console.log('Local print-server exited with code', code);
    });
    console.log('Started local print-server (no file logging), pid=', _printServerProc && _printServerProc.pid);
  }catch(e){
    console.error('Error starting local print server:', e);
  }
}

function stopLocalPrintServer(){
  try{
    if(_printServerProc && !_printServerProc.killed){
      _printServerProc.kill();
      console.log('Stopped local print-server pid=', _printServerProc.pid);
    }
  }catch(e){ console.warn('Failed stopping print server', e); }
}

// --- Logout (deslogar) ---
async function logoutUser() {
  console.log('Iniciando logout do usuário...');
  try {
    // 0) Tentar revogar no servidor primeiro (se houver sessão/cookies)
    try {
      const ses = session.defaultSession;
      const currentCookies = await ses.cookies.get({ url: WP_URL });
      const cookieHeader = currentCookies.map(c => `${c.name}=${c.value}`).join('; ');
      const localRefresh = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      const revokePayload = JSON.stringify({ token: localRefresh || null, revoke_all: true });
        try {
        const revokeRes = await fetch(`${WP_URL}/wp-json/custom-auth/v1/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // enviar cookies para autenticar a requisição no servidor
            ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
          },
          body: revokePayload
        });
        try {
          const txt = await revokeRes.text().catch(() => '<no-body>');
          // Log raw response for debugging
          console.log('Revocation endpoint response status:', revokeRes.status);
          try { console.log('Revocation endpoint response body:', JSON.parse(txt)); } catch (_) { console.log('Revocation endpoint response body (raw):', txt); }
          if (revokeRes.ok) {
            console.log('Revocation endpoint returned OK');
          } else {
            console.warn('Revocation endpoint returned non-OK status:', revokeRes.status);
          }
        } catch (e) {
          console.warn('Erro ao processar resposta de revogação (text):', e);
        }
      } catch (e) {
        console.warn('Falha ao chamar endpoint de revogação no servidor:', e);
      }

      // TENTATIVA ADICIONAL: chamar a rota de revogação apenas com o token em body (sem cookies),
      // útil quando a sessão por cookie já não estiver disponível no momento do logout.
      try {
        if (localRefresh) {
          const tokenOnlyPayload = JSON.stringify({ token: localRefresh });
          const simpleRes = await fetch(`${WP_URL}/wp-json/custom-auth/v1/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: tokenOnlyPayload
          });
          const simpleTxt = await simpleRes.text().catch(() => '<no-body>');
          console.log('Revocation (token-only) status:', simpleRes.status);
          try { console.log('Revocation (token-only) body:', JSON.parse(simpleTxt)); } catch (_) { console.log('Revocation (token-only) body (raw):', simpleTxt); }
        } else {
          console.log('Nenhum refresh token local disponível para revogação token-only.');
        }
      } catch (e) {
        console.warn('Erro na tentativa token-only de revogação:', e);
      }
    } catch (e) {
      console.warn('Erro ao preparar revogação no servidor:', e);
    }
    // 1) Remover refresh token salvo com keytar (tenta algumas vezes e verifica)
    try {
      // utilitário pequeno de espera
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let removed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          removed = await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
        } catch (e) {
          console.warn(`Tentativa ${attempt}: erro ao deletar refresh token do keytar:`, e);
        }
        // checar se realmente foi removido
        const still = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        if (!still) {
          console.log(`Refresh token removido do keytar (attempt ${attempt}):`, removed);
          removed = true;
          break;
        }
        console.warn(`Refresh token ainda presente após tentativa ${attempt}. Retentando...`);
        await sleep(200);
      }
      if (!removed) {
        console.error('Falha ao remover refresh token do keytar após múltiplas tentativas.');
      }
    } catch (e) {
      console.warn('Falha inesperada ao tentar remover refresh token do keytar:', e);
    }

    // 2) Limpar cookies e storage do domínio do WP
    try {
      const ses = session.defaultSession;
      // Remover cookies individuais do domínio principal
      const cookieList = await ses.cookies.get({ domain: WP_HOSTNAME });
      for (const c of cookieList) {
        const scheme = c.secure ? 'https://' : 'http://';
        const host = (c.domain || WP_HOSTNAME).replace(/^\./, '');
        const url = scheme + host + (c.path || '/');
        try {
          await ses.cookies.remove(url, c.name);
          console.log('Cookie removido:', c.name, '->', url);
        } catch (e) {
          console.warn('Falha ao remover cookie', c.name, e);
        }
      }
      // Limpar storage (localstorage, cache, etc) somente da origem do WP
      await ses.clearStorageData({
        origin: WP_URL,
        storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'serviceworkers', 'websql']
      });
      console.log('Storage limpo para a origem:', WP_URL);
    } catch (e) {
      console.warn('Falha ao limpar cookies/storage:', e);
    }

    // 3) Parar o print-server local, se ativo
    try { stopLocalPrintServer(); } catch (e) { console.warn('Erro ao parar print-server no logout:', e); }

    // 4) Fechar janela principal e abrir janela de login
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }
    } catch (e) {
      console.warn('Falha ao fechar mainWindow:', e);
    }

    if (!loginWindow || loginWindow.isDestroyed()) {
      createLoginWindow();
    } else {
      loginWindow.show();
      loginWindow.focus();
    }

    try {
      const notif = new Notification({ title: 'Sessão encerrada', body: 'Você saiu da conta.' });
      notif.show();
    } catch (_) {}
  } catch (e) {
    console.error('Erro inesperado no logout:', e);
  }
}

let loginWindow = null;

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 985,
    height: 630,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Login - Franguxo',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: true
  });

  loginWindow.loadFile('login.html');

  loginWindow.once('ready-to-show', () => {
    loginWindow.show();
  });

  // Em desenvolvimento, abra DevTools automaticamente também no login
  if (process.env.NODE_ENV === 'development') {
    try { loginWindow.webContents.openDevTools(); } catch {}
  }

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
}

function proceedToMainApp() {
  createWindow();
  if (app.isPackaged) {
    registerAutoUpdaterEvents();
    checkForUpdates();

    // Checar atualizações a cada 10 minutos
    setInterval(() => {
      checkForUpdates();
    }, 1000 * 60 * 10);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Register global IPC handlers
ipcMain.handle('login', async (event, { username, password }) => {
  try {
    // Primeiro: obter token JWT do plugin
    const jwtRes = await fetch(`${WP_URL}/wp-json/jwt-auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!jwtRes.ok) {
      const error = await jwtRes.json();
      console.error('JWT Login failed:', jwtRes.status, error);
      return { success: false, message: error.message || 'Erro de login' };
    }

    const jwtData = await jwtRes.json();
    console.log('JWT response:', jwtData);

    if (!jwtData.token) {
      return { success: false, message: 'Token JWT não recebido' };
    }

    // Segundo: usar token JWT no endpoint customizado para obter refresh token e sessão
    const sessionRes = await fetch(`${WP_URL}/wp-json/custom-auth/v1/login`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtData.token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Session request status:', sessionRes.status);
    console.log('Session request headers:', Object.fromEntries(sessionRes.headers.entries()));

    if (!sessionRes.ok) {
      const errorText = await sessionRes.text();
      console.error('Session creation failed - Response text:', errorText);
      return { success: false, message: 'Falha ao criar sessão' };
    }

    const sessionData = await sessionRes.json();
    console.log('Session response:', sessionData);

    if (sessionData.refresh_token) {
      // Salvar refresh token (mais seguro e duradouro)
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, sessionData.refresh_token);
      console.log('Refresh token saved securely');
    } else {
      // Fallback: salvar access token
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, jwtData.token);
      console.log('Access token saved as fallback');
    }

    // Definir cookie de sessão no Electron
    if (sessionData.cookieName && sessionData.cookieValue) {
      const cookieConfig = {
        url: WP_URL,
        name: sessionData.cookieName,
        value: sessionData.cookieValue,
        domain: '.' + WP_HOSTNAME, // Adicionar ponto para subdomínios
        path: '/',
        httpOnly: false, // Permitir acesso pelo JS (WordPress precisa ler)
        secure: true,
        sameSite: 'no_restriction', // Importante para requisições cross-origin
        expirationDate: Math.floor(Date.now() / 1000) + 86400 // 1 dia
      };
      
      console.log('Setting cookie with config:', cookieConfig);
      await session.defaultSession.cookies.set(cookieConfig);
      
      // Verificar se o cookie foi realmente definido
      const allCookies = await session.defaultSession.cookies.get({ url: WP_URL });
      console.log('All cookies after setting:', allCookies.map(c => ({ name: c.name, domain: c.domain, path: c.path })));
      
      const sessionCookie = allCookies.find(c => c.name === sessionData.cookieName);
      if (sessionCookie) {
        console.log('Session cookie verified:', sessionCookie);
      } else {
        console.error('Session cookie NOT found after setting!');
      }
    }

    // Notificar sucesso e fechar tela de login
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
    }
    proceedToMainApp();
    return { success: true };
  } catch (e) {
    console.error('Login error:', e);
    return { success: false, message: 'Erro de conexão' };
  }
});

// --- Inicialização ---
app.whenReady().then(async () => {
  // Atalhos globais para DevTools funcionarem em qualquer janela
  try {
    globalShortcut.register('F12', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.webContents.toggleDevTools();
    });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win) win.webContents.toggleDevTools();
    });
  } catch (e) {
    console.warn('Falha ao registrar atalhos globais de DevTools:', e);
  }

  // Garantir que o print-server local suba assim que o app estiver pronto
  try {
    await startLocalPrintServer();
  } catch (e) {
    console.warn('Failed to start local print server:', e);
  }

  try {
    // 1) Verifica se já existe cookie de sessão do WordPress
    const cookies = await session.defaultSession.cookies.get({ url: WP_URL });
    const hasSessionCookie = cookies.some(c => c.name && c.name.startsWith('wordpress_logged_in_'));

    if (hasSessionCookie) {
      console.log('Sessão ativa detectada (cookie encontrado). Pulando login.');
      proceedToMainApp();
      return;
    }

    // 2) Se não há cookie, tenta renovar usando refresh_token salvo
    const refreshToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (refreshToken) {
      console.log('Refresh token encontrado. Tentando renovar sessão...');
      const accessToken = await getNewAccessToken();
      if (accessToken) {
        console.log('Access token obtido via refresh. Tentando criar sessão...');
        const sessionCreated = await createSessionWithToken(accessToken);
        if (sessionCreated) {
          console.log('Sessão renovada com sucesso.');
          proceedToMainApp();
          return;
        }
      }
    }

    // 3) Nenhuma sessão ativa e não foi possível renovar → mostrar login
    console.log('Nenhuma sessão ativa. Mostrando tela de login.');
    createLoginWindow();
  } catch (e) {
    console.error('Erro durante verificação de sessão inicial:', e);
    // Em caso de erro não bloqueante, abrir a tela de login como fallback
    createLoginWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ navigationUrl }) => {
    shell.openExternal(navigationUrl);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.hostname !== WP_HOSTNAME) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});

app.on('before-quit', () => {
  // Limpeza se necessário
  try{ stopLocalPrintServer(); }catch(e){}
  try{ globalShortcut.unregisterAll(); }catch(e){}
});
