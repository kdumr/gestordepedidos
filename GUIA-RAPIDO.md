# 🐔 Franguxo Gestor de Pedidos - Guia Rápido

## 🚀 Como usar

### Primeira execução:
1. Abra o terminal no VS Code (`Ctrl + '`)
2. Execute: `npm install` (se ainda não instalou)
3. Execute: `npm start`

### Executar novamente:
- **Via VS Code**: Pressione `Ctrl+Shift+P` → Digite "Tasks" → Selecione "Executar Aplicação"
- **Via Terminal**: `npm start`

## 📋 Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm start` | Executa a aplicação |
| `npm run dev` | Modo desenvolvimento com auto-reload |
| `npm run build` | Gera executável para distribuição |
| `npm run pack` | Gera arquivos sem instalador |

## ⌨️ Atalhos no app

- **F5 / Ctrl+R**: Recarregar
- **F11**: Tela cheia
- **F12**: Ferramentas do desenvolvedor
- **Ctrl+Plus/Minus**: Zoom
- **Ctrl+Q**: Sair

## 🛠️ Personalizar

### Trocar ícone:
1. Coloque seus ícones na pasta `assets/`
2. Renomeie para: `icon.png`, `icon.ico`, `icon.icns`

### Configurações no `package.json`:
- Nome da aplicação
- Versão
- Configurações de build

## 📱 Status atual

✅ **Funcionando:**
- Carregamento do site franguxo.app.br
- Interface nativa
- Menu personalizado
- Atalhos de teclado
- Segurança (links externos abrem no navegador)

## 🆘 Problemas comuns

**App não abre:** 
- Verifique se o Node.js está instalado
- Execute `npm install` novamente

**Site não carrega:**
- Verifique conexão com internet
- Teste se franguxo.app.br está acessível no navegador

**Build falha:**
- Execute `npm install electron-builder` separadamente
- Verifique se todas as dependências estão instaladas

---
*Desenvolvido com Electron* ⚡
