# Verificação — aba Modificar, escada/rampa e snaps

Documento da frente **D (verificação)**, atualizado na integração das frentes A/B/C.
Base: `dc33e03c`. Branch de integração: `feat/mod-integ`.

## O que foi entregue

- **A — snap global:** `componentSnapGeometry` leva pontas (`endpoint`) e arestas amostradas (`nearest`) de
  escadas **e** rampas para o `extraPoints`/`extraSegments` de `ToolBase.ctx`, com `hostId` e cache por
  projeto/nível. Vale para Parede, Piso, Laje, Forro, Telhado, Rampa, Escada reta/L/U/caracol, Mover,
  Copiar, Girar, Espelhar, Matriz, cotas e textos.
- **B — segurança e transformações:** as ferramentas de aresta não caem mais no piso/parede embaixo;
  `OffsetTool` usa tolerância de cursor (5 px + meia espessura), não 5 m; cópia por `transform` remapeia os
  `components[].id`; Alinhar reconhece aresta de rampa (translada a rampa inteira, como a escada).
- **C — edição de aresta:** `componentEdge.ts`/`componentOps.ts`/`componentEdit.ts` dão pick, prévia pura e
  commit de aresta de escada/rampa. A integração ligou:
  - **Deslocar** numa aresta do croqui (curva reta ou arco, com reconexão dos espelhos/limites vizinhos);
  - **Dividir** numa aresta do croqui (insere vértice; reta e arco);
  - **Mover** sem seleção numa aresta do croqui (move a aresta e mantém a cadeia contínua);
  - **Aparar** entre duas arestas do croqui (retas; a parte clicada fica).
- **D — regressão:** `packages/tools/src/modificarEscadaRampa.regressao.test.ts` cobre seleção,
  transformações, fantasmas, Alinhar, pick e as guardas/edições de aresta. Os cinco casos que estavam em
  `describe.skip` foram habilitados e passam.

## Resultados da integração

```powershell
npx vitest run packages/tools/src packages/model/src --testTimeout=120000
# 231 arquivos, 2641 testes, 2641 passando, 0 falhas

npx vitest run apps/web/src --testTimeout=120000
# 181 arquivos, 1509 testes, 1509 passando, 0 falhas

npx tsc -p tsconfig.json --noEmit
# limpo
```

Novos testes de integração: `rampEdgeTool.test.ts` (Deslocar/Dividir/Mover em rampa), além dos testes das
frentes A/B/C (`componentSnap`, `componentTarget`, `componentEdge`, `componentOps`, `componentEdit`,
`offsetTool`, `stairEdgeGuard`, `alignRamp`, `componentCopy`).

## Checklist manual curto

Pré-requisito: uma planta com uma escada (reta ou caracol) e uma rampa, ambas com um piso/parede logo abaixo.

1. **Selecionar escada/rampa** — clique na escada e na rampa com Selecionar (também por janela).
2. **Mover / Copiar** — mover a escada e a rampa alguns metros; copiar e conferir que a cópia nasce completa,
   com todos os lances/patamares, sem arrastar o piso/parede embaixo.
3. **Girar / Espelhar** — girar 90° e espelhar; conferir limites, espelhos, caminhada, seta de subida e, na
   rampa, o lado do giro (`turn`) invertido só no espelho.
4. **Matriz** — matriz linear e radial com escada e rampa selecionadas: cada item completo; o original fica.
5. **Snap em canto/aresta de escada/rampa** — com Parede/Laje/Piso ativo, aproximar o cursor das
   extremidades e arestas da escada e da rampa: os pontos devem capturar com o mesmo indicador dos pisos.
6. **Aresta com Aparar/Dividir/Deslocar/Mover** — clicar diretamente numa aresta da escada/rampa e conferir
   que a ação atinge o croqui, **não** o piso ou a parede coincidente embaixo. Ctrl+Z devolve o croqui em um
   passo. Escada/rampa **livre** continua sendo editada pelas alças do trajeto, não por aresta.
7. **Cancelar** — Esc no meio de Mover/Girar/Espelhar/Matriz não deve gravar nada.

## Limitações conhecidas (conscientes)

- **Formas livres** (`freePath` na escada, forma `free`/`freePath` na rampa): a edição por aresta é recusada
  com mensagem; use as alças do trajeto.
- **Aparar aresta curva:** recusado com mensagem; use Editar croqui. Aparar reta entre duas arestas retas
  funciona.
- **Aparar em lance de escada:** o resultado passa pelo validador (`analyzeDraft`); se o corte deixaria
  espelhos coincidentes ou o croqui inválido, a edição é recusada e nada é gravado. Isso é intencional.
- **Copiar aresta** continua recusado (a cópia sobreporia a linha ou deixaria o croqui aberto).
- **Parede paralela / Junção:** continuam sendo ferramentas de parede; clicar numa linha de escada/rampa não
  cria parede nem une paredes por engano.
- Caracol: mover/deslocar/aparar limites e espelhos preserva `spiral`; a edição manual do croqui continua
  descartando o caracol pelo caminho existente (`discardSpiralOnEdit`).

## Comandos de verificação

```powershell
npx vitest run packages/tools/src/modificarEscadaRampa.regressao.test.ts --testTimeout=120000
npx vitest run packages/tools/src/rampEdgeTool.test.ts --testTimeout=120000
npx vitest run packages/tools/src packages/model/src --testTimeout=120000
npx vitest run apps/web/src --testTimeout=120000
npx tsc -p tsconfig.json --noEmit
npx eslint <arquivos alterados>
```

`npm run lint` também roda os verificadores de limites/paridade/unidades do repositório; use-o antes do
commit final, não só o eslint dos arquivos alterados.

## Arquivos desta frente

- `packages/tools/src/modificarEscadaRampa.regressao.test.ts` — 17 testes ativos.
- `packages/tools/src/rampEdgeTool.test.ts` — 3 testes de integração da rampa.
- `docs/verificacao-modificar-escada-rampa.md` — este documento.
