# 0031 · Ferramentas de modificar sobre linhas de croqui (piso, laje, telhado, forro)

Origem: pedido do dono (2026-10-24) para as ferramentas de modificar (aparar, dividir, alinhar, deslocar, mover, copiar,
junção) atuarem sobre as linhas de croqui de piso, laje, telhado e forro, como no Revit. Pesquisa e opções em conversa.

Status: **DECIDIDA** (opções aprovadas pelo dono). Substitui, para edição manual do contorno, a regra de §8.2b da
[0023](0023-juncao-piso-laje-parede.md) (soltar o vínculo ao editar). Escadas e ambientes ficam para a fase 2 (§5).

## 1. Contorno vinculado às paredes: travado (opção A)

Aresta de piso ou laje vinculada às paredes fica **travada**, como a linha de croqui presa à parede no Revit. Editar
é recusado com a mensagem "Contorno travado nas paredes. Use Desvincular nas propriedades para editar." Desvincular
(`detachOutline`, que já existe) libera a edição. Quem desvincula decide, e o desfazer continua num passo.

Diferença para a 0023 §8.2b: lá, a edição solta o vínculo sozinha. Esta decisão troca isso por um passo explícito.
Código: `commitOutlineBoundary` em `packages/tools/src/outlineEdit.ts`, com testes em `outlineEdit.test.ts`.

## 2. Dividir piso ou laje: dois elementos (opção C)

Dividir por uma linha gera **dois elementos** do mesmo tipo, cada um com o seu contorno. Como no Vectorworks e na
prática do ArchiCAD, e pelo nosso modelo (tipo, camadas e quantitativos por elemento). Não é o Split Region do Revit,
que mantém um elemento só com regiões.

Código: `splitRingByLine` em `packages/tools/src/splitRing.ts` (puro); a ferramenta de dividir chama essa função.

## 3. Escopo da primeira entrega: piso, laje, telhado e forro e, depois, ambientes e escadas (opção B)

Esta entrega cobre os quatro tipos com contorno (`boundary` e `holes`). **Escadas e ambientes entram no mesmo
conjunto de ferramentas, mas dependem de modelo próprio** (ver §5). Não são parte da entrega atual, e isso fica
explícito para não ser lido como concluído.

## 4. Operações sobre aresta (Revit, croqui)

| Ferramenta | Operação sobre a aresta `i` |
|---|---|
| Aparar/Estender | move o vértice da extremidade até a interseção com outra linha |
| Dividir | insere um vértice na aresta |
| Deslocar | desloca a aresta pela normal; vértices vão à interseção com as vizinhas |
| Alinhar | encosta a aresta numa referência |
| Mover/Copiar | move os dois vértices da aresta |
| Junção | aparar as duas arestas até a interseção |

As operações puras estão em `ringOps.ts` (interface `RingOps` em `ringEdge.ts`).

## 5. Fase 2: escadas e rampas (entregue) e ambientes (pendente)

- **Escada e rampa**: o croqui é uma sequência de componentes (`StairRun`/`StairLanding`), não um anel. A edição
  por aresta foi implementada em `componentEdge.ts` (pick e referência), `componentOps.ts` (mover, deslocar,
  dividir, aparar e alinhar) e `componentEdit.ts` (commit por `updateStairComponents`/`updateRampComponents`).
  As ferramentas Mover (sem seleção), Deslocar, Dividir e Aparar reconhecem a aresta do croqui antes de olhar
  piso/laje/parede; a reconexão atravessa limites, espelhos e caminhada para manter o croqui contínuo.
  Formas livres (`freePath`/`shape: 'free'`) continuam sendo editadas pelas alças; Aparar aresta curva é
  recusado com mensagem.
- **Ambiente**: o contorno vem do circuito de paredes (`point`); não há contorno próprio. Para editar uma linha de
  ambiente é preciso o equivalente ao Room Separation Line do Revit, um elemento novo. Fora desta entrega.

## 6. Estado da implementação

Feito (testes em `packages/tools/src/*Edge.test.ts`, `ringOps.test.ts`, `splitRing.test.ts`, `ringEdgePick.test.ts`):

- **Aparar entre duas arestas** (`trimAlign.ts`): a parte clicada fica (como na parede); sai a extremidade mais distante do clique. Mistura de parede e aresta é recusada.
- **Alinhar** a aresta a uma referência de mesma natureza (`trimAlign.ts`).
- **Dividir aresta** insere vértice; **dividir piso/laje** por uma linha gera dois elementos (`splitTool.ts`). Telhado acompanha o vetor por aresta.
- **Mover aresta** sem seleção (`transformTools.ts`) e **Deslocar aresta** (`offsetTool.ts`, com o lado pelo cursor).
- Piso ou laje vinculados às paredes ficam travados em todas essas operações (§1).

Não suportado nesta versão (avisa na barra de status, sem gravar):

- Copiar aresta, e deslocar com cópia.
- Dividir furos (os furos saem do original) e dividir laje com caimento.
- Junção de paredes com arestas continua só entre paredes (`joinTool.ts`).

Pendente: ambientes (§5). Escadas e rampas foram entregues com testes de unidade e de ferramenta
(`modificarEscadaRampa.regressao.test.ts`, `rampEdgeTool.test.ts`, `componentEdge/componentOps/componentEdit`).
Resta a validação visual na tela (checklist em `docs/verificacao-modificar-escada-rampa.md`).

**Atualização (mesmo dia):** resolvidos nesta rodada: furos na divisão de piso e laje (ficam na parte que contém o seu centro; furo cortado pela linha é descartado), laje com caimento (as duas partes mantêm o plano de caimento) e junção de arestas (feita pelo Aparar entre duas arestas, que é como o Revit une linhas de croqui). Ainda em aberto: copiar aresta e deslocar com cópia (depende de decidir se a cópia vai para outro elemento ou gera um contorno novo, porque no mesmo contorno fechado a cópia ficaria sobreposta); escadas e ambientes (fase 2).
