const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const printer = require('@niick555/node-printer');
const iconv = require('iconv-lite');
const fs = require('fs');
const crypto = require('crypto');

// Configuração do webhook do MercadoPago
// O secret pode ser definido via variável de ambiente ou arquivo de configuração
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';

/**
 * Valida a assinatura do webhook do MercadoPago
 * Baseado na documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * 
 * @param {string} xSignature - Header x-signature do webhook
 * @param {string} xRequestId - Header x-request-id do webhook
 * @param {string} dataId - ID dos dados do webhook (data.id)
 * @param {string} secret - Secret key configurado no MercadoPago
 * @returns {boolean} - true se a assinatura for válida, false caso contrário
 */
function validateMercadoPagoSignature(xSignature, xRequestId, dataId, secret) {
  if (!xSignature || !secret) {
    console.warn('[MercadoPago Webhook] Assinatura ou secret não fornecidos');
    return false;
  }

  try {
    // 1. Extrair ts (timestamp) e v1 (hash) do header x-signature
    // Formato: ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839
    const signatureParts = xSignature.split(',');
    let ts = null;
    let v1 = null;

    for (const part of signatureParts) {
      const [key, value] = part.split('=').map(s => s.trim());
      if (key === 'ts') ts = value;
      if (key === 'v1') v1 = value;
    }

    if (!ts || !v1) {
      console.error('[MercadoPago Webhook] Formato de assinatura inválido - ts ou v1 não encontrados');
      return false;
    }

    // 2. Construir a string de validação (manifest)
    // Formato: id:[data.id];request-id:[x-request-id];ts:[ts];
    const manifestParts = [];
    
    if (dataId) {
      manifestParts.push('id:' + dataId);
    }
    
    if (xRequestId) {
      manifestParts.push('request-id:' + xRequestId);
    }
    
    manifestParts.push('ts:' + ts);
    
    const manifest = manifestParts.join(';') + ';';

    // 3. Calcular HMAC SHA256 com o secret
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    // 4. Comparar hash calculado com hash recebido
    const isValid = calculatedHash === v1;

    if (!isValid) {
      console.error('[MercadoPago Webhook] Validação de assinatura falhou', {
        expected: v1,
        calculated: calculatedHash,
        manifest: manifest
      });
    } else {
      console.log('[MercadoPago Webhook] Assinatura validada com sucesso');
    }

    return isValid;
  } catch (error) {
    console.error('[MercadoPago Webhook] Erro ao validar assinatura:', error);
    return false;
  }
}

/**
 * Middleware para validar assinatura do webhook do MercadoPago
 * Este middleware deve ser usado antes de qualquer handler de webhook
 */
function mercadoPagoWebhookAuth(req, res, next) {
  // Verificar se o secret está configurado
  if (!MERCADOPAGO_WEBHOOK_SECRET) {
    console.error('[MercadoPago Webhook] MERCADOPAGO_WEBHOOK_SECRET não configurado. Configure a variável de ambiente.');
    return res.status(500).json({ 
      ok: false, 
      error: 'Webhook secret não configurado no servidor' 
    });
  }

  // Obter headers necessários para validação
  const xSignature = req.headers['x-signature'] || req.headers['X-Signature'];
  const xRequestId = req.headers['x-request-id'] || req.headers['X-Request-Id'];
  
  // Obter o data.id do body ou query parameter
  const dataId = (req.body && req.body.data && req.body.data.id) 
    || (req.query && req.query['data.id']) 
    || (req.query && req.query.id)
    || '';

  // Validar assinatura
  const isValid = validateMercadoPagoSignature(
    xSignature,
    xRequestId,
    String(dataId),
    MERCADOPAGO_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.warn('[MercadoPago Webhook] Requisição rejeitada - assinatura inválida', {
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      hasSignature: !!xSignature,
      hasRequestId: !!xRequestId,
      hasDataId: !!dataId
    });
    return res.status(401).json({ 
      ok: false, 
      error: 'Assinatura do webhook inválida' 
    });
  }

  // Assinatura válida, prosseguir
  next();
}

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

function normalizeText(text){
  if(!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
}

  function replace8211(text){
    if(!text) return '';
    return String(text).replace(/&#8211;/g, '-');
  }

  function centerText(text, width = 32){
    const s = String(text || '');
    const padding = Math.max(0, width - s.length);
    const leftPad = Math.floor(padding/2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + s + ' '.repeat(rightPad);
  }

  function parseMoney(v){
    if(v === undefined || v === null) return 0;
    if(typeof v === 'number') return v;
    var s = String(v).trim();
    if(s === '') return 0;
    // accept '12,34' or '12.34' or 'R$ 12,34'
    s = s.replace(/[^0-9,.-]/g, '');
    // if contains comma and not dot, replace comma with dot
    if(s.indexOf(',') !== -1 && s.indexOf('.') === -1) s = s.replace(',', '.');
    s = s.replace(',', ''); // remove thousands if any
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function formatMoney(n){
    return Number(n || 0).toFixed(2).replace('.', ',');
  }

  function formatReceipt(o, width = 32){
    // Builds the receipt exactly in the user's requested layout
    const lines = [];
    function push(line){ lines.push(line); }
    function pushSep(){ push('-------------------------------'); }

    // *CARDÁPIO PRÓPRIO*
    push(centerText('* CARDÁPIO PRÓPRIO *', width));
    // Nome da loja
    if(o.store_name) push(centerText(o.store_name, width));
    pushSep();

    // PEDIDO: {numero pedido}
    push(centerText('PEDIDO: #' + (o.id || '(sem id)'), width));
    pushSep();

    // Data: {data do pedido} {hora do pedido}
    var dateStr = '';
    if(o.date){
      try{
        // Parse DD-MM-YYYY HH:MM format
        var parts = String(o.date).split(' ');
        if(parts.length === 2){
          var datePart = parts[0].split('-');
          var timePart = parts[1].split(':');
          if(datePart.length === 3 && timePart.length >= 2){
            // Create Date object: year, month-1, day, hour, minute
            var d = new Date(parseInt(datePart[2]), parseInt(datePart[1]) - 1, parseInt(datePart[0]), parseInt(timePart[0]), parseInt(timePart[1]));
            if(!isNaN(d.getTime())){
              dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            }else{
              dateStr = String(o.date);
            }
          }else{
            dateStr = String(o.date);
          }
        }else{
          // Fallback to standard Date parsing
          var d = new Date(o.date);
          if(!isNaN(d.getTime())){
            dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
          }else{
            dateStr = String(o.date);
          }
        }
      }catch(e){
        dateStr = String(o.date);
      }
    }
    push('Data: ' + dateStr);

    // Entrega prevista: (exibir mensagem "Cfg depois")
    push('Entrega prevista: Cfg depois');

    // Localizador: {localizador do pedido}
    var locator = o.localizador || o.localizador_pedido || o.tracking || o.hash || o.order_key || '';
    if(locator){
      // Format locator with spaces every 4 characters
      var formattedLocator = String(locator).replace(/\s/g, ''); // remove existing spaces
      var parts = [];
      for(var i = 0; i < formattedLocator.length; i += 4){
        parts.push(formattedLocator.slice(i, i + 4));
      }
      push('Localizador: ' + parts.join(' '));
    }

    // {Nome cliente}
    if(o.customer_name) push(o.customer_name);

    // Tel. {telefone registrado no post do pedido}
    if(o.customer_phone) push('Tel. ' + o.customer_phone);

    // Endereço: {Rua do cliente, N° cliente}
    if(o.address){
      var addr = o.address + (o.address_number ? ', ' + o.address_number : '');
      push('Endereço: ' + addr);
    }

    // Bairro: {bairro cliente}
    if(o.neighborhood) push('Bairro: ' + o.neighborhood);

    // Ref: {Ponto de referência se tiver} (Só exiba ref se tiver ponto de referência)
    if(o.reference && String(o.reference).trim() !== '') push('Ref: ' + o.reference);

    // Cidade: {cidade cliente}, {Estado cliente}
    if(o.city || o.state) push('Cidade: ' + (o.city || '') + (o.city && o.state ? ', ' : '') + (o.state || ''));

    // CEP: {cep cliente}
    if(o.zipcode) push('CEP: ' + o.zipcode);

    pushSep();

    // ITENS DO PEDIDO (quantidade)
    var totalItems = 0;
    if(o.items && o.items.length) totalItems = o.items.reduce(function(acc,it){ var q = parseInt(it.quantity || it.qty || '1')||0; return acc+q; },0);
    push('ITENS DO PEDIDO (' + totalItems + ')');

    // helper for aligned price at right with name wrapping
    function formatItemLines(name, price){
      var p = 'R$ ' + formatMoney(price);
      name = String(name || '');
      var maxNameLen = 22; // reserve 10 chars for values
      var valueSpace = 10;
      var lines = [];
      if(name.length <= maxNameLen){
        var space = Math.max(1, width - name.length - p.length);
        lines.push(name + ' '.repeat(space) + p);
      }else{
        // first line with price
        var firstPart = name.substring(0, maxNameLen);
        var space = Math.max(1, width - maxNameLen - p.length);
        lines.push(firstPart + ' '.repeat(space) + p);
        // subsequent lines
        var remaining = name.substring(maxNameLen);
        var indent = name.startsWith('  ') ? '  ' : ''; // for extras, keep indent
        while(remaining.length > 0){
          var partLen = maxNameLen - indent.length;
          var part = remaining.substring(0, partLen);
          var line = indent + part + ' '.repeat(valueSpace);
          lines.push(line);
          remaining = remaining.substring(part.length);
        }
      }
      return lines;
    }

    if(o.items && o.items.length){
      o.items.forEach(function(it){
        var qty = parseInt(it.quantity || it.qty || '1') || 1;
        var productName = String(it.product_name || it.name || '').trim();
        var lineName = (qty > 1 ? (qty + ' x ') : '') + productName;
        var unitPrice = parseMoney(it.product_price || it.price || it.total || 0);
        // if item has total price field, use it; else unitPrice * qty
        var itemTotal = it.total ? parseMoney(it.total) : (unitPrice * qty);
        formatItemLines(lineName, itemTotal).forEach(push);
        // extras if any
        var extras = it.product_extras || it.extras;
        if(extras){
          if(typeof extras === 'string'){
            // parse the string
            var lines = extras.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l; });
            var currentGroup = null;
            var groups = [];
            lines.forEach(function(line){
              if(line.includes(':')){
                // new group
                currentGroup = { name: line.replace(':', '').trim(), items: [] };
                groups.push(currentGroup);
              } else if(currentGroup){
                // cover legacy plain-text extras where only the item label is provided
                // try to extract quantity markers like "2x" or "(2x)"
                var quantity = 1;
                var qtyMatch = line.match(/\(\s*(\d+)x\s*\)/i) || line.match(/^(\d+)x\s+/i);
                if(qtyMatch){
                  quantity = parseInt(qtyMatch[1] || qtyMatch[0].replace(/[^0-9]/g, ''), 10) || 1;
                  line = line.replace(qtyMatch[0], '').trim();
                }
                // remove trailing quantity markers like "x2"
                var suffixQty = line.match(/x\s*(\d+)$/i);
                if(suffixQty){
                  quantity = parseInt(suffixQty[1], 10) || quantity;
                  line = line.replace(suffixQty[0], '').trim();
                }
                if(line){
                  currentGroup.items.push({
                    name: line,
                    quantity: quantity
                  });
                }
              }
            });
            // now print the groups
            groups.forEach(function(group){
              // print group name
              push('  ' + group.name + ':');
              group.items.forEach(function(extra){
                var eqty = extra.quantity || 1;
                var ename = '    ' + (eqty > 1 ? (eqty + 'x ') : '') + extra.name;
                var eprice = 0; // assume free
                formatItemLines(ename, eprice).forEach(push);
              });
            });
          } else {
            // existing logic for array or groups
            var extrasArray = [];
            if(Array.isArray(extras)){
              extrasArray = extras;
            } else if(extras.groups && Array.isArray(extras.groups)){
              extras.groups.forEach(function(group){
                if(group.items && Array.isArray(group.items)){
                  extrasArray = extrasArray.concat(group.items);
                }
              });
            }
            extrasArray.forEach(function(extra){
              var eqty = parseInt(extra.quantity || '1') || 1;
              var ename = '  ' + (eqty > 1 ? (eqty + ' x ') : '') + (extra.name || extra.product_name || '');
              var eprice = parseMoney(extra.price || 0) * eqty;
              formatItemLines(ename, eprice).forEach(push);
            });
          }
        }
        // No notes as per user spec
      });
    }
    pushSep();

    // Payment status messaging
    var ps = (o.payment_status || o.order_payment_status || '').toString().toLowerCase();
    if(ps === 'paid'){
      push(centerText('*Pagamento realizado*', width));
    } else if(ps === 'waiting'){
      push(centerText('*Pagamento na entrega*', width));
    } else if(ps === 'failed'){
      push(centerText('*Pagamento falhou*', width));
    }
    pushSep();

    // Totals
    var subtotal = parseMoney(o.subtotal || o.sub_total || 0);
    var delivery = parseMoney(o.delivery_price || o.shipping || o.shipping_total || 0);
    var couponDiscount = parseMoney(o.coupon_discount || o.coupon_discount_value || 0);
    var total = parseMoney(o.total || o.order_total || (subtotal + delivery - couponDiscount));

    push('00000000000000000000000000000000000000000000000000')
    push('Valor total do'.padEnd(22) + 'R$ ' + formatMoney(subtotal));
    push('pedido:');
    push('Taxa de entrega:'.padEnd(22) + 'R$ ' + formatMoney(delivery));
    if(o.coupon_name){ push('Cupom:'.padEnd(22) + (o.coupon_name || '')); }
    if(couponDiscount > 0){ push('Desconto cupom'.padEnd(22) + 'R$ ' + formatMoney(couponDiscount)); }
    pushSep();

    // Cobrar do cliente logic
    var cobrar = 0;
    if(ps === 'paid') cobrar = 0;
    else cobrar = total;
    push('Cobrar do cliente: R$ ' + formatMoney(cobrar));
    pushSep();

    return lines.join('\n') + '\n';
  }

app.post('/print', (req, res) => {
  try{
    const payload = req.body || {};
    console.log('[print-server] Received print request:', { hasOrderData: !!payload.orderData, hasText: !!payload.text, printer: payload.printer });
    // se vier orderData (mesmo formato do main.js), construir recibo detalhado
    let text = payload.text || '';
    if(payload.orderData){
      text = formatReceipt(payload.orderData, 32);
    }
  const normalized = normalizeText(text);
  console.log('DEBUG: normalized length=', (normalized||'').length, 'preview=', JSON.stringify((normalized||'').slice(0,200)));


    const targetPrinter = payload.printer || process.env.PRINT_PRINTER || undefined;

    // detecta impressora POS (nome contém pos/star/epson) ou flag escpos no payload
    const isPosPrinter = (targetPrinter && /pos|star|epson|thermal|tm-/i.test(String(targetPrinter))) || payload.escpos === true;

    // preparar dados: para POS enviamos Buffer com comandos ESC/POS (init + texto + corte)
    let dataToSend = normalized;
    if(isPosPrinter){
      try{
        // init escpos
        const init = Buffer.from([0x1B, 0x40]); // ESC @
        // tentar codificar em CP850 (muitas térmicas usam), senão CP437
        let textBuf;
        try{
          textBuf = iconv.encode(normalized + '\n\n', 'cp850');
        }catch(e){
          console.warn('CP850 encode failed, trying CP437', e);
          textBuf = iconv.encode(normalized + '\n\n', 'cp437');
        }
        const cut = Buffer.from([0x1D, 0x56, 0x00]); // GS V 0 (full cut)
        dataToSend = Buffer.concat([init, textBuf, cut]);
        console.log('Using ESC/POS mode for printer:', targetPrinter, 'bufferLength:', dataToSend.length);
      }catch(e){
        console.warn('Failed to build ESC/POS buffer, falling back to text', e);
        dataToSend = normalized;
      }
    }

    function doPrint(type, data, cb){
      printer.printDirect({
        data: data,
        type: type,
        printer: targetPrinter,
        success: function(jobID){ cb(null, jobID); },
        error: function(err){ cb(err); }
      });
    }

    // Primeiro tenta RAW (com nome da impressora se enviado), senão tenta TEXT
    doPrint('RAW', dataToSend, function(err, jobID){
      if(!err){
        console.log('Impressão enviada (RAW), JobID:', jobID, 'printer:', targetPrinter);
        return res.json({ ok:true, jobID, printer: targetPrinter, type: 'RAW' });
      }
      console.warn('RAW print failed, trying TEXT fallback', err);
      // se dataToSend é Buffer e falhar, tentar enviar texto simples
      const fallbackData = Buffer.isBuffer(dataToSend) ? Buffer.from(normalized + '\n\n', 'utf8') : normalized;
      doPrint('TEXT', fallbackData, function(err2, jobID2){
        if(!err2){
          console.log('Impressão enviada (TEXT), JobID:', jobID2, 'printer:', targetPrinter);
          return res.json({ ok:true, jobID: jobID2, printer: targetPrinter, type: 'TEXT' });
        }
        console.error('Both RAW and TEXT printing failed', err, err2);
        // fallback: try Windows Out-Printer via PowerShell (uses printer driver)
        try{
          const fs = require('fs');
          const os = require('os');
          const { exec } = require('child_process');
          const tmp = os.tmpdir();
          const filePath = require('path').join(tmp, `franguxo_print_${Date.now()}.txt`);
          fs.writeFileSync(filePath, normalized, { encoding: 'utf8' });
          console.log('Attempting PowerShell Out-Printer fallback with file', filePath);
          // Use Out-Printer to send the file content via Windows printing subsystem
          const psCmd = `Get-Content -Raw -LiteralPath '${filePath}' | Out-Printer -Name "${targetPrinter || ''}"`;
          exec(`powershell -NoProfile -Command ${psCmd}`, { windowsHide:true }, (execErr, stdout, stderr) => {
            if(execErr){
              console.error('PowerShell print fallback failed', execErr, stderr);
              return res.status(500).json({ ok:false, error: String(err) + ' | ' + String(err2) + ' | PS:' + String(execErr) });
            }
            console.log('PowerShell Out-Printer fallback sent (file):', filePath);
            return res.json({ ok:true, fallback:'powershell-out-printer', file:filePath });
          });
        }catch(e){
          console.error('Fallback printing failed', e);
          return res.status(500).json({ ok:false, error: String(err) + ' | ' + String(err2) + ' | ' + String(e) });
        }
      });
    });
  }catch(err){
    console.error('Erro no endpoint /print', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

const PORT = process.env.PORT || 3420;
app.listen(PORT, () => {
  console.log(`Franguxo local print server listening on http://localhost:${PORT}`);
});

// Add global handlers to capture unexpected exits and rejections for debugging
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : String(err));
  try{ fs.appendFileSync('server-error.log', `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err && err.stack ? err.stack : String(err)}\n`); }catch(e){}
});

process.on('unhandledRejection', (reason, p) => {
  console.error('UNHANDLED REJECTION at Promise', p, 'reason:', reason);
  try{ fs.appendFileSync('server-error.log', `[${new Date().toISOString()}] UNHANDLED REJECTION: ${String(reason)}\n`); }catch(e){}
});

process.on('exit', (code) => {
  console.log('PROCESS EXIT with code', code);
  try{ fs.appendFileSync('server-error.log', `[${new Date().toISOString()}] PROCESS EXIT code=${code}\n`); }catch(e){}
});

// Heartbeat so we can see the process is alive in logs
setInterval(() => {
  try{ console.log('HEARTBEAT', new Date().toISOString()); }catch(e){}
}, 30000);

// Diagnostic: list printers
app.get('/printers', (req, res) => {
  try{
    const list = printer.getPrinters();
    return res.json({ ok:true, printers: list });
  }catch(e){
    console.warn('printer.getPrinters() failed', e);
    return res.status(500).json({ ok:false, error: String(e) });
  }
});

// Diagnostic: deterministic test-print route for debugging encoding and buffer
app.post('/test-print', (req, res) => {
  try{
    const payload = req.body || {};
    const sample = payload.text || 'Teste Franguxo - Linha 1\nLinha 2 \u00E7 \n1234567890\n';
    const printerName = payload.printer || process.env.PRINT_PRINTER || undefined;
    const forceEscPos = payload.escpos === true || (printerName && /pos|star|epson|thermal|tm-/i.test(String(printerName)));

    const normalized = normalizeText(sample + '\n---END---\n');
    console.log('TEST-PRINT: normalized length=', normalized.length, 'preview=', JSON.stringify(normalized.slice(0,200)));

    // build buffer if escpos
    let dataToSend = normalized;
    let usedEncoding = 'utf8';
    let bufferHex = '';
    if(forceEscPos){
      const init = Buffer.from([0x1B,0x40]);
      let textBuf;
      try{
        textBuf = iconv.encode(normalized, 'cp850');
        usedEncoding = 'cp850';
      }catch(e){
        textBuf = iconv.encode(normalized, 'cp437');
        usedEncoding = 'cp437';
      }
      const cut = Buffer.from([0x1D,0x56,0x00]);
      const full = Buffer.concat([init, textBuf, cut]);
      dataToSend = full;
      bufferHex = full.toString('hex');
      console.log('TEST-PRINT: built ESC/POS buffer len=', full.length, 'encoding=', usedEncoding);
    }else{
      const b = Buffer.from(normalized, 'utf8');
      dataToSend = b;
      bufferHex = b.toString('hex');
      usedEncoding = 'utf8';
      console.log('TEST-PRINT: using plain text utf8 buffer len=', b.length);
    }

    console.log('TEST-PRINT: bufferHex (first 200 chars)=', bufferHex.slice(0,200));

    // attempt RAW print
    printer.printDirect({ data: dataToSend, type: Buffer.isBuffer(dataToSend) ? 'RAW' : 'RAW', printer: printerName, success: function(jobID){
      console.log('TEST-PRINT: RAW print success, jobID=', jobID, 'printer=', printerName);
      return res.json({ ok:true, jobID, printer: printerName, encoding: usedEncoding, bufferLength: dataToSend.length, bufferHex: bufferHex.slice(0,1000) });
    }, error: function(err){
      console.error('TEST-PRINT: RAW print error', err);
      return res.status(500).json({ ok:false, error: String(err), encoding: usedEncoding, bufferLength: dataToSend.length, bufferHex: bufferHex.slice(0,1000) });
    }});
  }catch(err){
    console.error('TEST-PRINT failed', err);
    return res.status(500).json({ ok:false, error: String(err) });
  }
});

// Force sending as TEXT (not RAW) to test driver text handling
app.post('/print-text', (req, res) => {
  try{
    const payload = req.body || {};
    const sample = payload.text || 'Teste TEXT Franguxo\nLinha 2\n';
    const printerName = payload.printer || process.env.PRINT_PRINTER || undefined;
    const normalized = normalizeText(sample + '\n--END--\n');
    const buf = Buffer.from(normalized, 'utf8');
    console.log('PRINT-TEXT: sending TEXT length=', buf.length, 'printer=', printerName);
    printer.printDirect({ data: buf, type: 'TEXT', printer: printerName, success: function(jobID){
      console.log('PRINT-TEXT: success jobID=', jobID);
      return res.json({ ok:true, jobID, printer: printerName, type: 'TEXT' });
    }, error: function(err){
      console.error('PRINT-TEXT: error', err);
      return res.status(500).json({ ok:false, error: String(err) });
    }});
  }catch(e){ console.error('PRINT-TEXT failed', e); return res.status(500).json({ ok:false, error: String(e) }); }
});

// Force PowerShell Out-Printer fallback (write file and use Out-Printer)
app.post('/print-ps', (req, res) => {
  try{
    const payload = req.body || {};
    const sample = payload.text || 'Teste PS Franguxo\nLinha 2\n';
    const printerName = payload.printer || process.env.PRINT_PRINTER || undefined;
    const normalized = normalizeText(sample + '\n--END--\n');
    const fs = require('fs');
    const os = require('os');
    const { exec } = require('child_process');
    const tmp = os.tmpdir();
    const filePath = require('path').join(tmp, `franguxo_print_ps_${Date.now()}.txt`);
    fs.writeFileSync(filePath, normalized, { encoding: 'utf8' });
    console.log('PRINT-PS: sending file', filePath, 'printer=', printerName);
    const psCmd = `Get-Content -Raw -LiteralPath '${filePath}' | Out-Printer -Name "${printerName || ''}"`;
    exec(`powershell -NoProfile -Command ${psCmd}`, { windowsHide:true }, (execErr, stdout, stderr) => {
      if(execErr){ console.error('PRINT-PS: execErr', execErr, stderr); return res.status(500).json({ ok:false, error: String(execErr), stderr }); }
      console.log('PRINT-PS: sent via Out-Printer file:', filePath);
      return res.json({ ok:true, fallback:'powershell-out-printer', file:filePath });
    });
  }catch(e){ console.error('PRINT-PS failed', e); return res.status(500).json({ ok:false, error: String(e) }); }
});

// ============================================================
// MercadoPago Webhook Endpoint com Validação de Assinatura
// ============================================================
// Endpoint para receber notificações do MercadoPago
// A assinatura é validada antes de processar qualquer requisição
// Configure MERCADOPAGO_WEBHOOK_SECRET como variável de ambiente

app.post('/webhook/mercadopago', mercadoPagoWebhookAuth, (req, res) => {
  try {
    console.log('[MercadoPago Webhook] Notificação recebida:', {
      type: req.body.type,
      action: req.body.action,
      dataId: req.body.data && req.body.data.id
    });

    const payload = req.body || {};
    
    // Processar diferentes tipos de notificação
    // Tipos comuns: payment, merchant_order, subscription, preapproval, etc.
    const notificationType = payload.type || payload.action;
    const dataId = payload.data && payload.data.id;

    // Aqui você pode adicionar a lógica específica para cada tipo de notificação
    // Por exemplo, atualizar status de pagamento, processar pedido, etc.
    
    switch (notificationType) {
      case 'payment':
        console.log('[MercadoPago Webhook] Notificação de pagamento recebida, ID:', dataId);
        // Adicione aqui a lógica para processar pagamentos
        break;
      
      case 'merchant_order':
        console.log('[MercadoPago Webhook] Notificação de ordem de comerciante recebida, ID:', dataId);
        // Adicione aqui a lógica para processar ordens
        break;
      
      default:
        console.log('[MercadoPago Webhook] Tipo de notificação:', notificationType, 'ID:', dataId);
    }

    // Responder com sucesso (200 OK) para que o MercadoPago saiba que recebemos
    return res.status(200).json({ 
      ok: true, 
      message: 'Webhook processado com sucesso',
      type: notificationType,
      dataId: dataId
    });

  } catch (err) {
    console.error('[MercadoPago Webhook] Erro ao processar notificação:', err);
    // Mesmo em caso de erro, retornamos 200 para evitar retries desnecessários
    // O MercadoPago reenvia webhooks que retornam erro
    return res.status(200).json({ 
      ok: false, 
      error: 'Erro interno ao processar webhook' 
    });
  }
});
