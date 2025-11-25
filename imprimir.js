// imprimir.js
// Script Node.js para imprimir um recibo de teste usando @niick555/node-printer

const printer = require('@niick555/node-printer');

function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
}

function printTestReceipt() {
  const texto = normalizeText('Recibo de Teste\nValor: R$ 123,45\nObrigado pela preferência!');
  printer.printDirect({
    data: texto,
    type: 'RAW',
    success: function(jobID) {
      console.log('Impressão enviada, JobID:', jobID);
    },
    error: function(err) {
      console.error('Erro ao imprimir:', err);
    }
  });
}

printTestReceipt();
