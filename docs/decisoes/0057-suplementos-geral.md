# 0057 · Suplementos: plataforma geral (declarativos, script e processo externo)

**Data:** 2026-11-13 · **Estado:** PROPOSTO (Fase 0, só documentação; nada disto está implementado).
**Relação com o 0047:** **estende, não substitui**. Tudo que o [0047](0047-plugins-de-integracao.md) decidiu continua valendo (host
com portas, cena como dados, menor privilégio, loopback, substituições de visualização). Este ADR acrescenta runtimes,
escrita no modelo e contribuição de UI. Especificação concreta: [docs/plugins/08-suplementos-v2.md](../plugins/08-suplementos-v2.md).
Numeração: o maior número visto em `docs/decisoes` é 0056; há números duplicados históricos (0046, 0047, 0042). Se 0057 colidir na mesclagem, renumere.

## Contexto
Hoje o sistema de plugins serve a um único ramo, o **renderizador** (`kind: 'renderer'`): cinco capacidades
(`scene.read`, `camera.read`, `events.subscribe`, `camera.write`, `overrides.write`, em `packages/plugin-api/src/permissions.ts`),
nenhuma escrita geral no documento e nenhuma contribuição de interface (a aba Suplementos tem só a entrada `externalTools`,
em `apps/web/src/ui/ribbon/tabsSoon.ts`). O dono do projeto quer uma **plataforma de suplementos** para vários ramos.

## Decisões (já tomadas pelo dono)

1. **Objetivo.** Plataforma para: normas, verificações, quantitativos, importar/exportar, famílias e bibliotecas, ferramentas
   de desenho, IA e renderização. O renderizador Rust vira apenas um suplemento entre outros.
2. **Três runtimes.**
   - **declarativo:** só JSON, sem código (tabelas de norma, famílias, materiais, quantitativos em regras, verificações em regras). Mais seguro; roda dentro do host.
   - **script:** JavaScript/TypeScript em **Worker isolado** (sem DOM, sem rede, sem armazenamento), com limite de tempo e de memória e isolamento de falha (o Worker é encerrado, o app segue).
   - **processo externo:** o que já existe (JSON sobre WebSocket em loopback). O **token de pareamento** ([07](../plugins/07-pareamento-por-token.md)) passa a ser **obrigatório antes de qualquer uso real** (a regra do 07 é mantida e estendida a todo suplemento de processo externo).
3. **Distribuição.** Extensão `.hestiapkg` (zip com `manifest.json`, código e recursos). Em desenvolvimento, uma **pasta** com `manifest.json`.
4. **Manifesto 2.0:** `id`, `name`, `version`, `hestiaApi`, `runtime`, `capabilities`, `contributes {commands, ribbon, panels, dialogs, tools, importers, exporters, families, materials, schedules, checks}`.
   **Compatibilidade:** o manifesto 1.x (`kind` em vez de `runtime`/`contributes`) continua válido e é lido como `runtime: 'external'`; os **11 casos** de `tests/integration/rustRenderer.integ.ts` e `packages/plugin-api/src/plugins.test.ts` não podem quebrar.
5. **Permissões por ramo** (famílias `model.read`, `model.write`, `ui.*`, `io.*`, `checks.*`, `content.*`, mais as 5 atuais mantidas), **menor privilégio**, **concessão pelo usuário** a cada suplemento, e **dependências entre permissões** (generaliza `CAPABILITY_REQUIRES`).
6. **Escrita no modelo SÓ por comandos** de `packages/model` (`Command` em `commands.ts`). Cada ação de plugin é **um único passo de desfazer** (`ProjectStore.transaction`, em `history.ts`). O host **valida os argumentos**; o plugin **nunca** escreve direto no documento. Cada suplemento tem um **espaço de dados próprio e versionado** em `Project.plugins`, salvo no projeto.
7. **Falha isolada.** Suplemento quebrado nunca impede o app de abrir (carregamento tolerante, estado "falhou"); há **log por suplemento**.
8. **Versionamento da API:** semver (`major.minor`, como `version.ts`), com política de depreciação; o **manifesto é dado não confiável** e é validado como hoje (`validateManifest`), agora também em campos aninhados e limites de tamanho.
9. **Não-objetivos desta fase** (pendências): loja ou índice da comunidade; Python embutido; **tipos novos de elemento definidos por plugin**. Mitigação: o **espaço de dados por plugin** guarda dados próprios do suplemento (por elemento, por id), sem mudar `Project.elements`.
10. **"IA desenha".** A IA (suplemento de processo externo ou script) **emite uma lista de comandos** no formato de `Command`; o host valida cada um, mostra uma **prévia**, e aplica a lista inteira como **um passo de desfazer**. A IA nunca recebe permissão de escrever fora de comandos validados; um comando inválido recusa o lote inteiro (atômico).

## Alternativas descartadas
- **Só processo externo** (extensão do 0047): exige instalar programa para cada pequeno suplemento e não funciona no navegador sem o usuário iniciar processos. Fica como um dos três runtimes.
- **`eval`/`new Function` no thread principal:** sem isolamento de falha nem de tempo; um laço infinito trava o editor.
- **iframe com `sandbox`:** isola DOM, mas custa mais memória, não mede tempo de CPU por chamada e complica a ponte de mensagens; Worker basta, pois o script não precisa de DOM (a UI é declarada em `contributes`).
- **Plugin escreve no documento (patches Immer):** quebra a regra do `docs/01 §5` (só comandos), o desfazer e a validação. Descartado.
- **Concessão automática pelo manifesto:** contraria menor privilégio (já descartada no 0047).
- **Python embutido (Pyodide):** pesado (dezenas de MB) e fora do escopo; fica como pendência.

## Consequências
- `plugin-api` cresce (manifesto 2.0, registro, portas de escrita) mas continua sem dependência de React/store; o app liga por portas.
- `Command` ganha um comando de espaço de dados por plugin (PROPOSTO: `setPluginData`/`deletePluginData`, ver 08 §Dados) e `Project.plugins` ganha `data?: Record<pluginId, {schema:number; values}>` (opcional; sem mudar `SCHEMA_VERSION`).
- Segurança: Worker sem rede; rede só no runtime externo (loopback) e por permissão futura `net.fetch` (fora desta fase).
- Custo: três caminhos de execução a testar; mitigado por um contrato único de **porta do host** que os três usam.
- Substitui "Plugins e scripting" em *Fora da v1* (`docs/04-ROTEIRO.md`) apenas no que o 0047 já cobria; scripting passa a ser planejado aqui.

## Decisões do dono (registradas após a revisão)
- `.wasm` recusado no pacote nesta fase; liberar depois é compatível.
- `checks` e `schedules` usam **JSONLogic restrito** (lista branca de operadores), sem linguagem própria e sem sintaxe em pt-BR.
- Uma única permissão de escrita, `model.write` (sem divisão em `elements` e `types`).
- Demais padrões da proposta aceitos; detalhes em `docs/plugins/08-suplementos-v2.md` §12.
