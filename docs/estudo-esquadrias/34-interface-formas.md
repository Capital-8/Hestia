# Interface das formas do vão: seletor, validação ao vivo, prévia com cotas, polígono e catálogo

Data: 2026-11-19. Continua `32` (formas novas) e cumpre a etapa 7 da fase 2 de `00-sintese.md` (§4: UI). Marcas: [V] verificado nesta sessão (código lido ou teste rodado); [I] inferência ou decisão a validar. Branch `claude/lucid-bell-hwk4ln`.

## 1. O que foi feito

### 1.1 Painel "Forma do vão" no diálogo do tipo [V]

Novo componente `shape` na lista do diálogo (logo após a Visão geral; vale para porta e janela, inclusive vão livre). Arquivos (todos em `apps/web/src/ui/dialogs/openingType/`):

| Arquivo | Papel |
|---|---|
| `panels/ShapePanel.tsx` | seletor das 9 formas (`OPENING_SHAPE_KINDS`), parâmetros de cada uma (`OPENING_SHAPE_PARAMS`: flecha, pescoço, largura do topo e da base, simétrico), lista de problemas, prévia e editor de pontos |
| `openingTypeShape.ts` | funções puras sobre o rascunho: `withShapeKind`, `withShapeNumber`, `withPolygon*`, `addPolygonPoint`, `removePolygonPoint`, `movePolygonPoint`, `reversePolygon`, `shapeIssues`, chaves de i18n |
| `shapePreview.ts` | geometria da prévia (contorno, esquadria, recuo, cotas) e conversão pixel/metro |
| `ShapePreview.tsx` | SVG da prévia, cotas e alças do polígono (arraste e setas) |
| `PolygonPointsEditor.tsx` | lista de pontos: u, v, adicionar, remover, inverter sentido |
| `components.ts`, `OpeningTypeDialog.tsx` | registro do painel e bloqueio do salvar |
| `apps/web/src/editor/i18n/areas/dialogs-opening-shape.ts` | textos em pt, en, es, de, fr, it, pl (`dsh_*`, `oc_shape`) |

Regras:
- **Retangular tira o campo `shape`** do tipo. Tipo sem forma e tipo retangular são o mesmo tipo: todo tipo existente fica byte a byte igual enquanto ninguém escolhe outra forma (teste: `withShapeKind(x, 'rect')` devolve o tipo original). Escolher a forma já ativa não muda nada.
- Trocar de forma grava `defaultOpeningShape(kind, largura, altura)`; a forma gravada acompanha a largura e a altura do tipo (`resizeOpeningShape`), igual à leitura do motor (`openingShapeOf`).
- Parâmetros de outra forma são ignorados (sem mudar o tipo). `baseWidth` vazio volta ao padrão (largura do vão).

### 1.2 Validação ao vivo e bloqueio do salvar [V]

`shapeIssues(d)` = `openingShapeProblems(d)`, isto é, `validateOpeningShape` na forma efetiva do vão bruto (a mesma checagem do aviso `forma-vao-invalida`). Cada um dos 17 códigos de `OpeningShapeIssue` tem mensagem própria (`dsh_issue_<código>`) nos 7 idiomas, mostrada em lista `role="alert"`. Forma válida mostra "Forma válida."; esquadria que não cabe na forma mostra o aviso de que ficará retangular (`forma-esquadria-retangular`).

Com problema, o diálogo desabilita **Aplicar** e **OK** (dica `dsh_blocked`), recusa duplicar e mostra a mensagem também fora do painel (se o usuário invalidou a forma mexendo na largura, na Visão geral). Nada inválido chega ao `upsertOpeningType` pelo diálogo.

### 1.3 Prévia 2D [V]

SVG de 300 x 260: contorno real do vão (`outline()` da forma efetiva, vão bruto), esquadria na mesma forma (tracejada, verde) e a esquadria **recuada** pela largura do perfil (`outlineInset(forma da esquadria, frameWidth)`, verde cheio) em cor diferente do vão (azul), com legenda. Cotas: largura, altura, flecha (arco pleno, abatido, ogival, empena) e topo (trapézio); valores nas unidades do projeto (`cmTexto`). Recalcula a cada mudança do rascunho (sem debounce: o contorno é barato). Forma inválida: sem contorno, só as cotas, sem quebrar. A esquadria usa `formaDaEsquadria` (agora exportada por `@hestia/engine`, `index.ts`: uma linha).

### 1.4 Editor de pontos do polígono [V]

Lista com u e v (campos `NumField` por grandeza), **Adicionar** (ponto no meio da aresta mais longa), **Remover** (não passa de 3 pontos), **Inverter sentido** (corrige `polygon-clockwise`), "Simétrico". Na prévia cada vértice é uma alça: arraste com o ponteiro (limitado à caixa, 0,1 mm) ou setas do teclado (1 cm); a validação roda a cada mudança. Respeita o vão bruto com folga (razão `kx`, `ky` entre o tipo e o vão). Limite de 4096 pontos como no modelo.

### 1.5 Alças no desenho do vão na planta e na elevação: **não implementado** [V]

Busca por `handle`/`grip` em `apps/web/src` e `packages/tools`: o único mecanismo para abertura é `OpeningFlipGrips.tsx` (botões DOM de inverter dobradiça e sentido, só na planta), mais alças de seção (`sectionHandles.ts`) e de parede-cortina (`curtainHandles.ts`). Não existe gancho de alças na elevação para aberturas, e a planta não desenha o contorno da forma (ele é vertical, no plano da parede). Criar alças de flecha e de largura do topo exige antes um desenho de elevação interativo para vãos, que está além de "gancho simples". Ficou só o diálogo. Caminho sugerido [I]: um `OpeningShapeGrips` na vista de elevação, no molde de `curtainHandles.ts` (função pura de alças + comando `upsertOpeningType` num passo de desfazer).

## 2. Catálogo com forma [V]

`packages/model/src/catalogoFormas.ts` (lista entra em `openingTypeCatalog`), 8 tipos novos, ids `ot_*`, códigos únicos:

| Código | Tipo | Forma | Dimensão (vão) | Fonte da forma |
|---|---|---|---|---|
| P-86 | Porta em arco pleno | `round` | 90 x 210 | Lapin Romanesque (`20` §3.1) |
| P-87 | Porta em arco abatido | `segmental`, flecha 0,15 (w/6) | 90 x 210 | Lapin Victorian |
| P-88 | Porta em arco ogival | `pointed`, flecha 0,78 (w·√3/2) | 90 x 210 | Lapin Gothic (equilátero) |
| J-60 | Janela em arco pleno | `round` | 120 x 150, peitoril 0,90 | Lapin Romanesque |
| J-61 | Janela em arco abatido (2 folhas) | `segmental`, flecha 0,30 (w/4) | 120 x 150, peitoril 0,90 | Lapin Arched casement |
| J-62 | Janela em arco ogival | `pointed`, flecha 0,69 | 80 x 150, peitoril 0,90 | Lapin Gothic |
| J-63 | Janela circular (óculo) | `circle` | 80 x 80, peitoril 1,10 | Lapin Round window (altura = largura) |
| J-64 | Janela em empena | `gable`, flecha 0,25 (w/4) | 100 x 100, peitoril 1,00 | Lapin gable (padrão w/4) |

**Dimensões ilustrativas.** Nenhuma fonte (`20` §6, coletas 13 e 15) dá medida de porta ou janela em arco, ogival, óculo ou empena. As formas e as razões da flecha vêm do Lapin (software, não norma); as medidas reaproveitam as padrão do Lapin (porta 0,90 x 2,10; janela 1,20 x 1,50, peitoril 0,90) ou são escolhidas só para caber na forma. **Todos os 8 levam "Dimensão ilustrativa" no campo de nota (`description`)**, visível em "Quadro e dados". [I] Confirmar com fabricante antes de usar como medida de projeto.

**Não entraram: ferradura e trapézio.** As fontes pedidas (`20`, coletas 13 e 15) não os tratam como tipo de esquadria (só `04` §3.6 e §3.8, [I]). Continuam disponíveis no diálogo a partir de qualquer tipo.

Decisão: as portas com forma são medidas pelo **vão** (sem `nominalRef: 'leaf'`), porque `openingShapeOf` dimensiona a forma por `width x height` do tipo, não pela folha derivada. Isso exigiu mudar uma asserção (ver §4).

Os nomes são traduzidos nos 6 idiomas por `OPENING_NAME_BLOCKS` (`packages/model/src/i18n.ts`, 8 linhas novas). Os 154 tipos anteriores não foram tocados [V: teste `catalogoFormas.test.ts` confere que nenhum tem `shape` e que a lista deles é prefixo da nova].

## 3. Testes e checks rodados [V]

Só as áreas, sem a suíte inteira:
- `vitest`: `apps/web/src/ui/dialogs`, `apps/web/src/editor/i18n*` (53 arquivos, 495 testes verdes); `packages/model` inteiro (108 arquivos, verdes); `packages/engine` `openingCatalogo`, `openingModel*`, `openingShape*`, `schedule*` (verdes). Novos: `openingTypeShape.test.ts` (14), `shapePreview.test.ts` (10, inclui render do painel), `catalogoFormas.test.ts` (7).
- `tsc --noEmit` (raiz): sem erros. `eslint` nos arquivos tocados: limpo. `check-boundaries`, `check-parity`, `check-props-density`, `check-ribbon-i18n`: ok. `check-units`: o arquivo novo não tem ocorrência (a de `openingShapeIssues.ts` é anterior). `check-i18n` e `check-i18n-placeholders`: sem ocorrência nos arquivos novos. `check-lixo` acusa `crates/geom-wasm/target`, anterior e alheio.
- Não há teste de interface leve com Playwright para este diálogo (os `tests/e2e/*.mjs` pedem navegador e servidor); no lugar, testes de componente por `renderToStaticMarkup` (ambiente node, sem jsdom): o arraste é coberto pelas funções puras (`pxToPolygonUV`, `movePolygonPoint`), não por eventos reais do navegador.

## 4. Testes existentes alterados (e por quê)

- Contagem do catálogo 154 -> 162 (154 + 8): `openingCatalogo.test.ts` (engine, mais os 8 ids no mapa de família esperada), `openingCompositionMigracao.test.ts` (3 asserções). Só contagens.
- `catalogoAberturas.test.ts`: a asserção "portas novas têm `nominalRef: 'leaf'`" passou a excluir as portas com `shape`, e a seguinte ("medidas pelo vão") passou a incluí-las (§2).
- `components.test.ts` e `OpeningTypeDialog.test.ts`: o novo componente `shape` entra na lista (12 -> 13 itens na porta de giro).

## 5. O que ficou de fora e pendências

1. Alças de flecha e largura do topo na planta/elevação (§1.5).
2. Prévia 3D e as vistas do diálogo (elevação, seção) já desenham o contorno pelo motor; não ganharam teste visual das formas novas.
3. Tipos com `nominalRef: 'leaf'` e forma: a forma é dimensionada por `width x height` do tipo e não pelo vão derivado (comportamento do motor, `openingShapeOf`); a prévia segue o motor. [I] Vale unificar.
4. Esquadria menor que o vão bruto: a prévia alinha a esquadria pela base e pelo centro; o alinhamento vertical real do motor não foi conferido quando `roughOversize.h > 0`. [I]
5. Dimensões do catálogo são ilustrativas (§2); ferradura e trapézio sem tipo de catálogo.
6. Os textos em es, de, fr, it e pl são de tradução própria, sem revisão por falante nativo. [I]
