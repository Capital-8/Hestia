# 0047 · Plugins de integração (Ferramentas externas)

**Data:** 2026-11-07 · **Estado:** fundação implementada; o renderizador Rust ainda não existe como plugin.

## Decisão
O Hestia é **hospedeiro**. Programas externos (primeiro caso: o renderizador arquitetônico independente em Rust) rodam
em **processo separado** e se conectam ao Hestia por um **protocolo de mensagens** (JSON sobre WebSocket em loopback).
A entrada **Suplementos › Ferramentas externas** (a única `soon` habilitada) abre o gerenciador.

- **API pública** em um pacote sem dependências, `@hestia/plugin-api` (tipos, protocolo, sessão do host, gerenciador).
  Plugins e sessões não importam store, React nem estruturas mutáveis do editor; o app liga tudo por **portas**
  (`ScenePort`, `CameraPort`, `OverridesPort`) em `apps/web/src/plugins/appPorts.ts`.
- **Cena como dados, não imagens.** Snapshot completo + deltas por revisão; câmera e substituições têm mensagens
  próprias. Imagem (PNG, data URI, `frame`, `pixels`) é **proibida** como meio de sincronização e recusada no decodificador.
- **Menor privilégio.** O plugin pede capacidades no manifesto; o usuário concede na tela; o host confere a *concessão*
  a cada mensagem. Não existe escrita geral no documento: a única escrita é `overrides.write`, num espaço do plugin.
- **Web honesto.** O navegador não instala, descobre nem inicia aplicativos nativos. A conexão é **explícita**: o
  usuário abre o programa; o Hestia conecta a `127.0.0.1:<porta>`. Nenhum caminho de executável é aceito.
- **Substituições de visualização** ficam em `Project.plugins.viewOverrides[pluginId][materialId]` (opcional, sem mudar
  `SCHEMA_VERSION`) e nunca alteram `Project.materials`. O ID estável do projeto é `Project.plugins.projectUid`.

## Alternativas descartadas
- Serviço que devolve PNG (o do renderizador atual): não é integração, só imagem.
- Ler `Project` e stores direto no plugin: acopla ao interior mutável e impede processo separado.
- Concessão automática pelo manifesto: contraria menor privilégio.

## Consequências
Substitui "Plugins e scripting" em *Fora da v1* de `docs/04-ROTEIRO.md`. Limitações e pendências: `docs/plugins/04-runtime-web.md`.
