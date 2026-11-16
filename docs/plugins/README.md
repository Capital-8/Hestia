# Plugins e suplementos do Hestia

| Documento | Conteúdo |
|---|---|
| [01-api.md](01-api.md) | Pacote `@hestia/plugin-api`, manifesto, contrato de cena, portas |
| [02-protocolo.md](02-protocolo.md) | Quadros, versão, ack, heartbeat, cancelamento, reconexão, erros |
| [03-permissoes-e-fluxo.md](03-permissoes-e-fluxo.md) | Capacidades, estados na tela, fluxo de conexão |
| [04-runtime-web.md](04-runtime-web.md) | Limites do navegador, segurança, decisões e pendências |
| [05-plugin-de-teste.md](05-plugin-de-teste.md) | Como criar um plugin de teste e rodar os testes |
| [06-validacao-processo-rust.md](06-validacao-processo-rust.md) | Processo Rust separado: o que foi validado, comandos, limitações, próximo passo |
| [07-pareamento-por-token.md](07-pareamento-por-token.md) | Proposta (1.1) de token de pareamento; obrigatório antes de uso real (fase I, em andamento) |
| [08-suplementos-v2.md](08-suplementos-v2.md) | Suplementos 2.0: manifesto 2.0, permissões, contribuições, `.hestiapkg`, ciclo de vida. **EXISTE** nas fases B a H e J; a fase I segue PROPOSTA |
| [09-guia-do-autor.md](09-guia-do-autor.md) | Passo a passo para quem escreve suplementos: criar, testar, empacotar, instalar; runtimes, permissões, limites e segurança |
| [10-referencia-da-api.md](10-referencia-da-api.md) | Referência: `ctx`, handlers, comandos permitidos, campos de verificações e quantitativos, códigos de erro |

Decisões: [0047](../decisoes/0047-plugins-de-integracao.md) (plugins de integração) e [0057](../decisoes/0057-suplementos-geral.md) (plataforma de suplementos, **Aceito e implementado** em 2026-11, exceto a fase I).

Para o autor: `sdk/` (tipos `hestia-plugin.d.ts`, `template/`, testkit), `npm run suplementos:novo -- <id>` e `npm run suplementos:empacotar`. Exemplos em `plugins-exemplo/`. Para o usuário: aba Suplementos › Gerenciar suplementos (atalho Alt+Shift+P).
