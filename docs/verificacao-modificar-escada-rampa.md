# Verificação — aba Modificar, escada/rampa e snaps

Documento da frente **D (verificação)**. Base: `dc33e03c`. Nenhum código de produção foi alterado;
a proteção está em `packages/tools/src/modificarEscadaRampa.regressao.test.ts` e os comportamentos
ainda não entregues ficaram em `describe.skip` para a fase final habilitar.

## Linha de base (medida em 2026-10-31)

```powershell
npx vitest run packages/tools/src packages/model/src --testTimeout=120000
```

Resultado exato: **220 arquivos, 2568 testes, 2568 passando, 0 falhas** (137,37 s).
Não há falhas pré-existentes nesses dois pacotes.

## Comandos de verificação

```powershell
# Regressão específica de escada/rampa na aba Modificar
npx vitest run packages/tools/src/modificarEscadaRampa.regressao.test.ts --testTimeout=120000

# Pacotes afetados (tools + model)
npx vitest run packages/tools/src packages/model/src --testTimeout=120000

# Tipos e estilo
npx tsc -p tsconfig.json --noEmit
npx eslint packages/tools/src/modificarEscadaRampa.regressao.test.ts
npx eslint packages/tools/src packages/model/src

# E2E de escadas (usa apps/web/dist: rode npm run build antes)
npm run build
node tests/e2e/escadas.mjs
node tests/e2e/escadas-closeup.mjs
```

Observação: `npm run lint` também roda os verificadores de limites/paridade/unidades do repositório;
use-o antes do commit final, não só o eslint dos arquivos alterados.

## Checklist manual curto

Pré-requisito: uma planta com uma escada (reta ou caracol) e uma rampa, ambas com um piso/parede logo abaixo.

1. **Selecionar escada/rampa** — clique na escada e na rampa com Selecionar (também por janela).
   A aba contextual deve abrir e os comandos de Modificar devem ficar habilitados.
2. **Mover / Copiar** — mover a escada e a rampa alguns metros; copiar (Ctrl) e conferir que a cópia
   nasce completa, com todos os lances/patamares, sem arrastar o piso/parede embaixo.
3. **Girar / Espelhar** — girar 90° e espelhar; conferir limites, espelhos, caminhada, seta de subida
   e, na rampa, o lado do giro (`turn`) invertido só no espelho.
4. **Matriz** — matriz linear e radial com escada e rampa selecionadas: cada item deve ser um croqui
   completo; o original fica no lugar.
5. **Snap em canto de escada/rampa** — com Parede/Laje/Piso ativo, aproximar o cursor das extremidades
   e arestas da escada e da rampa: os pontos devem capturar como os de parede, com o mesmo indicador.
6. **Aresta com Aparar/Dividir/Deslocar** — clicar diretamente numa aresta da escada/rampa com cada
   comando e conferir que a ação atinge a escada/rampa, **não** o piso ou a parede coincidente embaixo.
   Desfazer (Ctrl+Z) deve devolver o croqui original em um passo.
7. **Cancelar** — Esc no meio de Mover/Girar/Espelhar/Matriz não deve gravar nada.

## O que ficou em `describe.skip` (habilitar na fase final)

Os testes abaixo já descrevem o comportamento esperado e falham na base atual de propósito:

| Grupo | O que verifica | Depende de |
| --- | --- | --- |
| `snap global de escada e rampa` | `pickLinesOf` lista também as linhas da rampa; `alignFeaturesAt` reconhece aresta de rampa | frente B |
| `guardas de aresta em Aparar/Dividir/Deslocar` | Deslocar/Dividir na aresta da escada não altera o piso coincidente embaixo | frente C |
| `ids remapeados na cópia de escada e rampa` | copiar escada gera ids novos também para os componentes do croqui | frente C (ou A, conforme a entrega) |

Ao habilitar, troque `describe.skip` por `describe`; não afrouxe as expectativas. Se um teste falhar
por bug real, registre o bug e mantenha o teste em skip com comentário até a correção.

## Riscos conhecidos (estado da base)

- `selectedMovables` já inclui escada e rampa, e `transformStair`/`transformRamp` já movem, giram e
  espelham componentes + `freePath`. O risco está na **cópia**: `transformEach` copia o elemento com
  id novo, mas os `id` internos de lances/patamares não são remapeados (ids duplicados entre original
  e cópia). Isso pode confundir edição por componente e seleção de linhas.
- `pickLinesOf` só monta linhas de **escada**; a rampa ainda não entra no pick global (Aparar/Dividir/
  Alinhar por linha e snap de aresta).
- `alignFeaturesAt` só gera `arestaEscada`; rampa não é feição alinhável ainda.
- `OffsetTool`/`SplitTool`/`TrimTool` usam `edgeAtCursor` de anéis (piso/laje/telhado/forro). Se a
  aresta da escada/rampa coincidir com uma aresta de anel, o comando pode atingir o anel embaixo:
  é exatamente a guarda que falta.
- A cópia de escada/rampa pela Matriz usa o mesmo caminho de `transform ... copy`, então herda o
  problema de ids internos.
- O `transform` do modelo não valida o croqui depois de mover/girar/espelhar; geometrias degeneradas
  (por exemplo, espelhar no próprio eixo) não são recusadas nesse caminho.

## Entregas esperadas por frente

- **A — aba Modificar / UI:** habilitar Mover, Copiar, Girar, Espelhar, Matriz e Excluir para escada e
  rampa selecionadas; rótulos/atalhos coerentes com o resto da aba; prévia (fantasmas) ligada nesses
  comandos.
- **B — snaps globais:** incluir escada **e** rampa em `pickLinesOf` (limites, espelhos, caminhada,
  patamares) e nas feições do Alinhar; alimentar o snap global com `stairSnapPoints`/`rampSnapPoints`;
  manter `pickStairAt`/`pickRampAt`/janela como estão.
- **C — guardas e offset de aresta:** fazer Aparar/Dividir/Deslocar enxergarem aresta de escada/rampa
  sem atingir piso/parede/laje embaixo; deslocar aresta com `offsetChain` preservando o croqui válido;
  remapear ids dos componentes nas cópias (e cobrir com os testes que hoje estão em skip).

## Arquivos desta frente

- `packages/tools/src/modificarEscadaRampa.regressao.test.ts` — 12 testes ativos + 5 em `describe.skip`.
- `docs/verificacao-modificar-escada-rampa.md` — este documento.
