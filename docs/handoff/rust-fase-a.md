# Retomada — kernel Rust, fatia A (estado de 2026-11-02, fim do dia)

Branch de trabalho: `claude/great-ptolemy-cngq9y` (PR de rascunho #5, empilhado sobre o #4 da Fase 0). Worktree local:
`Hestia\wt\rust-faseA`. Nunca trabalhar em `Hestia\Hestia` (tem alterações de outra linha).

## Regras do dono (não mudar sem perguntar)
Ordem fixa 0 → A → B → C → D → E, fatias grossas, sem versão intermediária em TS do que vai para Rust; TypeScript é a referência e o
plano B. Equivalência por tolerância (1 µm; 1e-6 m² / m³), nunca afrouxar; exceções só pelas decisões 0048 e 0049, com medição
registrada. Falha leve volta só a chamada ao TS; falha grave recria a instância (máx. 3 em 5 min). Rust só liga por
`?kernelFatias=A`, `?kernel=rust` ou `localStorage hestia:kernel:fatias`; padrão TS. Liberar fatia exige zero divergência e validação
visual do dono no projeto real. Medição de ganho só no fim de toda a migração. O `.wasm` é commitado, só uma branch o regenera por vez
(`node scripts/build-wasm.mjs`; conflito se resolve recompilando). Repositório PÚBLICO: nunca commitar projetos reais.
Método (decidido nesta sessão): testes do passo (cargo test + equivalência do passo) em cada sub-etapa; mutação, suíte completa e
binário commitado só no fim da fatia. Modelos: DeepSeek flash (opencode) para volume/leitura, Haiku médio para o simples, Sonnet médio
para motor/ABI/equivalência; o orquestrador confere tsc, eslint, cargo test e testes wasm antes de aceitar relatório.

## Feito
A1 (quadros, junções, grupos), A2 (itens e pintor; 0048), A3a (vãos, esquema v4), A3b (retornos, v5), A3c (faixas verticais,
`solveCluster`, regiões; v6), A3d (`ResolvedLevel`, membranas, perfis, `resolver_nivel`; v7; 0049), A4 (interruptor por fatia no diálogo
"Experimentais", despacho de `resolveLevel` para o Rust e modo sombra; ver 0047 §12). Mutações A3a–A3d: 32 rodadas, 28 mortas, 4
sobreviventes (3 fechados por testes de limiar, 1 equivalente com prova; 0047 §13). Binário final commitado: `6b0ac466`
(fontes `b385ff3a9615`).

## Pendente (nesta ordem)
1. ~~Config pesado dos testes wasm~~ FEITO (0047 §14): `npm run test:wasm` (normal, 300 testes, 0 erros) e `npm run test:wasm:pesado`
   (retas puras de 60 paredes; 1 aviso de RPC `onTaskUpdate` documentado) com job `wasm-pesado` no CI.
2. ~~Testes de limiar do A3c/A3d~~ FEITO (cherry-pick de `claude/a-mutacoes`; 0047 §13).
3. Conferir o CI do PR #5 depois do push (`gh pr checks 5`): `wasm` e `wasm-pesado` devem passar.
4. **Harness no projeto real** (só na máquina do dono; arquivo `edificio-dwg_v2.hestia.json` na raiz de `Hestia`, nunca commitar):
   `npx vite-node scripts/kernel-harness.mts -- <arquivo> --wasm packages/geom/assets/geom_wasm.wasm` e a versão A3 em
   `scripts/kernel-harness-nucleo.mts`. Em 2026-11-02 o harness A1/A2 deu 0 divergências nas 1278 paredes (11 pavimentos). Conferir paredes
   curvas e esquinas em miter, mal cobertas pelos fixtures.
5. **Validação visual do dono** (parada obrigatória): `?kernelFatias=A`, e `localStorage.setItem('hestia:kernel:sombra','true')` para o
   modo sombra; e2e com WebGL (`tests/e2e`) e `npm run test:visual`. Olhar planta e 3D, vãos, retornos de acabamento, perfis de topo.
   O modo sombra pode mostrar divergências reais do TS (defeito do `unionClipper` e do `polygon-clipping`, ver 0049 e 0047 §11-§12).
6. Pendências não-Rust: ver `docs/handoff/pendencias-antigas-main.md` na branch `fix/pendencias-antigas-main`
   (porta/altura de parede sem caminho rápido; `exportarVetores` já corrigido em `dc9eeedb`; teste de regressão do fluxo
   "editar porta" ainda falta). Defeitos do TS a corrigir depois, separado, subindo `VERSAO_MOTOR_GEOMETRIA`: `polygon-clipping` perde
   área (`projetoDeEstresseA2(100,{paredes:60,pavimentos:1,curvas:0,ruido:false})`, item 274) e ganha área em `intersection`
   (retas, semente 101, parede 18, camada 4); `unionClipper` infla região (semente 1, nível 0, material 2).
7. Planos das fatias B a E (DeepSeek, só leitura): não foram gerados por completo; refazer com a 0047 §1-§2 como molde.

## Outras linhas abertas
- `claude/a4-interruptor`: já integrada (cherry-pick `eeb07a76`, `f542e479`, `e8e522bf`).
- Componentes/editor de famílias (menu Arquitetura > Construir > "Componente"): desenho a fazer em sessão própria com pesquisa do Promob
  e do editor de famílias do Revit; prompt de pesquisa entregue ao dono.
