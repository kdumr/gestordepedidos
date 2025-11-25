# Franguxo Gestor de Pedidos

Aplicativo Electron para gestão de pedidos com integração ao servidor de impressão local.

## Pré-requisitos

- Node.js 18 ou superior (inclui npm)

## Instalação

```bash
npm install
```

## Desenvolvimento

Inicie o app em modo desenvolvimento (com `electron-reload`):

```bash
npm start
```

## Build portátil

Gera a pasta `dist/` com a versão portátil (zipável) do aplicativo:

```bash
npm run build
```

## Instalador Windows

Gera o instalador NSIS em `release/Franguxo Gestor Setup.exe`:

```bash
npm run dist
```

## Servidor de impressão

- O servidor local (`print-server/server.js`) é inicializado automaticamente quando o app inicia.
- Caso queira rodá-lo manualmente:

```bash
cd print-server
npm install
node server.js
```

## Publicação

1. Atualize a versão em `package.json`.
2. Gere o instalador com `npm run dist`.
3. Publique no GitHub criando uma nova tag/release e anexe o instalador.
