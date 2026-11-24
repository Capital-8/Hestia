# Retomada em máquina local

Para continuar o criador de famílias paramétricas (ADR 0061) fora da sessão em nuvem. Escrito em 2026-11-24, com a fase 1 concluída e a fase 2 aprovada para depois.

## 1. Pegar o código
```bash
git clone <url do repositório> hestia && cd hestia
git checkout claude/lucid-euler-ddb7j6
npm ci --ignore-scripts
```
Node 22 (a sessão usou 22.23.5). Nada de `cargo` é necessário: o `.wasm` do kernel já está em `packages/geom/assets/`. Não houve pull request; o trabalho está só nessa branch. Quando quiser integrar, abra o PR a partir dela.

## 2. Ler, nesta ordem
1. `docs/decisoes/0061-criador-de-familias-parametricas.md` (decisões D1 a D11).
2. `docs/familias-parametricas/ESTADO.md`: o que foi feito, ficha por ficha, e o **registro de decisões** (é o histórico fiel; leia a seção inteira).
3. `docs/familias-parametricas/PLANO-FASE-2.md`: o que vem agora (aprovado, não iniciado).
4. `docs/familias-parametricas/CONTRATO.md` (semântica e números de aceitação) e `MANUAL.md` (o que o usuário vê).
5. `docs/familias-parametricas/REGRAS.md` e `EXECUCAO.md`: o protocolo usado com subagentes. Em máquina local você não precisa dele para trabalhar sozinho, mas as regras de código valem (limite de 420 linhas, sem `any`, textos em português, mm no texto e metros no resolvido).

## 3. Verificar que está tudo verde
```bash
npx tsc -p tsconfig.json --noEmit
node scripts/check-boundaries.mjs && node scripts/check-units.mjs && node scripts/check-parity.mjs
npx vitest run packages/model/src/familia packages/engine/src/componentes
npx vitest run apps/web/src/ui apps/web/src/editor/i18n packages/tools
```
A suíte inteira (`npx vitest run`) leva vários minutos; na nuvem a última execução completa que terminou (antes das fichas D6 a H2) deu 1.373 arquivos e 17.442 testes verdes. A execução completa mais recente foi interrompida e **não tem resultado registrado**: rode-a uma vez para ter a linha de base.

## 4. Roteiros de navegador (Playwright, Chromium)
Cada roteiro sobe o app numa porta fixa; suba o vite na porta que o script espera e encerre-o depois:
```bash
cd apps/web && npx vite --port 4700 --host 127.0.0.1   # familias-editor.mjs, familias-abas.mjs
cd apps/web && npx vite --port 5199 --host 127.0.0.1   # tubo.mjs, familias-corpos/ligacoes/simbolos.mjs
# familias-tubo (5201), familias-caixa (5202), familias-perfil (5203)
node tests/e2e/familias-editor.mjs
```
Na nuvem o Chromium ficava em `/opt/pw-browsers/chromium` (variável `CHROME_PATH`); na sua máquina use o seu. O app **precisa do kernel WASM** (`geom_wasm.wasm` na raiz do `dist`; em desenvolvimento o vite serve sozinho).

## 5. Armadilhas já encontradas (não repita)
- **Pontos de junção** onde várias mudanças tocam a mesma linha: `biblioteca/index.ts` (`BIBLIOTECA_MEP` tem **uma entrada por linha**; some uma linha `...NOVA,`), `componentes/index.ts`, `validar.ts`, `edicao.ts` e `i18n/areas/familias.ts`. Merge automático que "mantém os dois lados" duplicou constantes mais de uma vez: confira com `tsc`.
- **i18n:** cada dicionário novo vai num shard próprio com as **sete línguas** (PT, EN, ES, DE, FR, IT, PL) e só import + spread em `familias.ts`; o tipo de paridade reprova chave faltando.
- **Testes-guarda** que reprovam ao acrescentar algo: `apps/web/src/ui/contratoPaineisFamilia.test.ts` (todo `*Properties.tsx`), `apps/web/src/editor/toolKeys.test.ts` (toda ferramenta tem atalho nos dois perfis), `apps/web/src/ui/paletaFamiliasNovas.test.ts` (contagens da paleta), `packages/engine/src/componentes/bibliotecaMep.motor.test.ts` (resolve TODA família de `BIBLIOTECA_MEP` em todos os tipos; novas famílias entram sozinhas), `scripts/check-units.mjs` (reprova `m²` etc. em código; use `// units-ok: motivo`).
- **Subir `SCHEMA_VERSION`** exige trocar os `toBe(34)` dos testes de esquema e o hash do IFC sem plantas de disciplina em `packages/io/src/ifc/ifcPlanViews.test.ts`.
- **IFC legado:** famílias de categoria antiga sem `ifc`, corpos e ligações exportam `IFCFURNITURE` (decisão do orquestrador; ver ESTADO). As famílias de exemplo migradas pela F8 têm `ifc` explícito e passam a exportar classes novas.
- **Família** exige `L`, `A` e `P` como parâmetros de instância do tipo comprimento (não podem ser fórmula); fórmula de texto usa aspas duplas e não concatena.
- Em worktrees, `node_modules` copiado (`cp -a`) mantém os links `@hestia/*` apontando para o próprio worktree.

## 6. Onde ficaram as lacunas conhecidas
Estão em `ESTADO.md` (procure "NÃO", "LIMITAÇÃO", "CONFERIR", "pendente") e em `MANUAL.md` ("O que ainda não existe"). Resumo: valores de norma e catálogo são todos "CONFERIR" (nenhuma família afirma atender a norma); mover e alinhar peças com o mouse no editor e captura de pontos não existem; conexão automática só para esgoto; abas Sistemas e Aço seguem placeholders; todo corpo no 3D do projeto sai com o material de madeira.

## 7. Como seguir
1. Peça (ou decida) começar a fase 2. A ordem sugerida está no fim de `PLANO-FASE-2.md`: **desempenho (N) → conexão pelas ligações (O) → medidas reais e bolsa (P) com planta (Q) → menus (J) e materiais (K) → declividade (M) e tipo de tubulação (L) → perfil como Viga/Pilar nativos (J5b)**.
2. Cada item vira uma ficha como as de `docs/familias-parametricas/fichas/` (contexto, faça, aceitação, arquivos permitidos, parada). O modelo de ficha está em qualquer arquivo daquela pasta; `portao.mjs` confere uma ficha entregue (`node docs/familias-parametricas/portao.mjs <ID>` num worktree dela).
3. Comece pelo N1 (medir): sem números, não dá para saber o que otimizar.
4. A cada item integrado: `tsc`, os testes da área, atualizar o `ESTADO.md` (estado, commit e decisões) e fazer commit e push.

## 8. Link de teste (Artifact)
Há um Artifact privado do app construído com `npm run build:artifact` (https://claude.ai/artifact/WU6HxzwWsfFKw368ew3W1c). Não se sabe se o kernel WASM carrega dentro do viewer; foi publicado para teste e ainda não foi confirmado. Em máquina local, prefira `npm run dev` em `apps/web`.
