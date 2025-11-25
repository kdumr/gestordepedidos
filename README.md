# Franguxo Gestor de Pedidos

Aplicação Electron para acessar o sistema Franguxo de gestão de pedidos.

## Funcionalidades

- ✅ Acesso direto ao site franguxo.app.br
- ✅ Interface nativa do Windows/Mac/Linux
- ✅ Menu personalizado com atalhos
- ✅ Tela de carregamento personalizada
- ✅ Tratamento de erros de conexão
- ✅ Segurança: links externos abrem no navegador padrão
- ✅ Zoom in/out e controles de visualização
- ✅ Ferramentas do desenvolvedor (F12)
- ✅ Recarregamento da página (Ctrl+R / F5)

## Pré-requisitos

- Node.js (versão 16 ou superior)
- NPM ou Yarn

## Instalação

1. Navegue até a pasta do projeto:
   ```cmd
   cd "e:\Meus Documentos\Desktop\Franguxo Gestor de Pedidos"
   ```

2. Instale as dependências:
   ```cmd
   npm install
   ```

## Executando a aplicação

### Modo de desenvolvimento
```cmd
npm start
```

### Modo de desenvolvimento com auto-reload
```cmd
npm run dev
```

## Construindo a aplicação

### Gerar executável para Windows
```cmd
npm run build
```

### Gerar apenas os arquivos (sem instalador)
```cmd
npm run pack
```

### Gerar para distribuição
```cmd
npm run dist
```

## Estrutura do projeto

```
├── main.js           # Processo principal do Electron
├── preload.js        # Script de preload para segurança
├── renderer.js       # Script do renderer process
├── index.html        # Página HTML principal
├── styles.css        # Estilos da aplicação
├── package.json      # Configurações do projeto
├── assets/           # Recursos da aplicação
│   ├── icon.png      # Ícone da aplicação (PNG)
│   ├── icon.ico      # Ícone para Windows
│   └── icon.icns     # Ícone para macOS
└── dist/            # Arquivos de distribuição (gerados)
```

## Atalhos de teclado

- **Ctrl+R / F5**: Recarregar página
- **Ctrl+Shift+R**: Forçar recarregamento (limpar cache)
- **F11**: Alternar tela cheia
- **F12**: Abrir ferramentas do desenvolvedor
- **Ctrl+Plus/Minus**: Zoom in/out
- **Ctrl+0**: Resetar zoom
- **Ctrl+Q**: Sair da aplicação

## Recursos de segurança

- Navegação restrita ao domínio franguxo.app.br
- Links externos abrem automaticamente no navegador padrão
- Context isolation habilitado
- Node integration desabilitado no renderer
- Web security habilitado

## Personalização

### Ícones
Substitua os arquivos na pasta `assets/`:
- `icon.png` - Ícone geral (512x512 recomendado)
- `icon.ico` - Ícone para Windows
- `icon.icns` - Ícone para macOS

### Configurações de build
Edite a seção `build` no `package.json` para personalizar:
- ID da aplicação
- Nome do produto
- Configurações de instalador
- Arquivos a incluir

## Solução de problemas

### Erro de instalação
Se ocorrerem erros durante `npm install`, tente:
```cmd
npm cache clean --force
npm install
```

### Erro de certificado (desenvolvimento)
Se houver problemas de SSL, adicione a flag:
```cmd
npm start -- --ignore-certificate-errors
```

### Performance
Para melhor performance em máquinas antigas, edite `main.js` e adicione:
```javascript
webPreferences: {
  experimentalFeatures: false,
  enableBlinkFeatures: ''
}
```

## Suporte

Para suporte técnico, entre em contato com a equipe do Franguxo.

## Licença

MIT License - veja o arquivo LICENSE para detalhes.
