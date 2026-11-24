# Regras para os executores (subagentes Haiku e Sonnet)

Valem junto com `docs/handoff/regras-gerais.md`. Se conflitarem, **vale este arquivo**, e a ficha vale sobre ambos (por exemplo, a ficha B1 PODE subir o esquema).

1. **Você executa UMA ficha.** Trabalhe só no seu worktree (o orquestrador o cria e coloca você nele). Nunca escreva em `/home/user/Hestia` fora dele. Nada de `git push`, `checkout`/`switch` para outras branches, `reset --hard`, `stash`, `rebase`, `git config`.
2. **Só edite os arquivos de "Arquivos permitidos".** Os pontos de junção (`index.ts`, `edicao.ts`, `validar.ts`, `i18n/areas/familias.ts`) aceitam só linhas ADITIVAS e mínimas (o orquestrador resolve conflitos). Testes existentes: só ACRESCENTAR casos; nunca altere ou apague um teste para passar. Teste que você acha errado ou ambíguo: PARE e relate.
3. **Primeiro passo obrigatório:** `cp -a /home/user/Hestia/node_modules ./node_modules` (os links relativos de `@hestia/*` passam a apontar para os pacotes do SEU worktree). Se `npx tsc --version` falhar, relate e pare. Confirme `git branch --show-current` (a branch do seu worktree) e `git log --oneline -1`.
4. Sem dependência nova, sem `console.log`, sem arquivo de depuração, sem `any`, sem `@ts-ignore`, sem `eslint-disable`. Comentários e textos em português. Máximo 420 linhas por arquivo (o eslint reprova): divida em arquivos novos com o prefixo da ficha. `noUncheckedIndexedAccess` está ligado. Unidades: texto da família em mm e graus; resolvido em metros e radianos (`scripts/check-units.mjs` confere).
5. Antes de terminar rode e deixe verde (corrija o código, nunca o teste): `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0 <seus arquivos>`, `npx vitest run <os testes da ficha e os do pacote que você tocou>`, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`.
6. **Commits pequenos em português** (`feat(familias): …`; `wip: …` a cada marco que passa em tsc e nos testes — o contêiner pode reiniciar). Termine com tudo commitado. Mensagens terminam com as linhas de atribuição que o orquestrador pedir no prompt.
7. **Relatório final** (português, curto): arquivos criados e alterados; a última linha de cada comando da regra 5 (cole, não resuma); decisões que você tomou onde a ficha deixou margem; o que NÃO conseguiu fazer. Não diga que algo passou se não rodou. O orquestrador roda tudo de novo no portão.
8. **Teste cego** (fichas `*-cego`): você NÃO lê a implementação nem os testes dela; só o CONTRATO e os tipos. Ambiguidade: `it.skip` + comentário `AMBIGUIDADE:`. O orquestrador roda seu teste contra a implementação e arbitra.
9. **Determinismo e segurança:** nenhuma função nova lança por entrada do usuário no caminho de resolução (devolve diagnóstico); sem `Math.random`, sem `Date.now`; todo laço tem limite (`LIMITES*`).
10. Não mexa em `crates/`, `*.wasm`, `resolve.ts`, camadas do motor, `docs/paridade/ORDEM.json`, `package.json`, `@hestia/geom` (salvo a ficha H3 para `crates/`).
11. Ambiente: Linux; use `/` nos caminhos; rode testes com `npx vitest run <arquivo>` (sem `timeout` curto). Servidor de teste do navegador: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`. Chromium pré-instalado em `/opt/pw-browsers/chromium` (não rode `playwright install`).

## Pontos de junção (conflitos esperados, resolvidos pelo orquestrador)
`packages/model/src/familia/index.ts`, `edicao.ts`, `validar.ts`, `packages/engine/src/componentes/index.ts`, `apps/web/src/editor/i18n/areas/familias.ts`, `biblioteca/index.ts`, `tipos.ts` (A1 só `TipoParametro`; A9 só `FAMILIA_VERSAO`).
