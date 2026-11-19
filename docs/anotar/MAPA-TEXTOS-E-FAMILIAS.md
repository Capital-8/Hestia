# Mapa de textos e famílias (abas Anotar e Massa e terreno)

Levantamento feito na branch `anotar/familias-e-apagar` (base: integração completa, SCHEMA_VERSION 29). Colunas: S = seleciona,
D = destaca, A = apaga (Delete e menu de contexto, desfazer em 1 passo), M/C = mover/copiar. "Antes" é o estado encontrado;
"Depois" é o estado ao fim desta frente (ver a seção de estado no fim).

## O que "ter família" exige (contrato)

`docs/contratos/familias-e-ferramentas.md` regra 2 e `docs/06-PROPRIEDADES-E-DIALOGOS.md`: (1) tipo em `ProjectSettings` com id estável,
lista padrão e `...Of`/`...For`/`default...IdOf` em `packages/model/src/annotationFamilies.ts`; (2) comandos de upsert/remover/padrão com desfazer;
(3) diálogo de tipos por `FamilyTypeDialog` (duplicar, renomear, excluir, aplicar/OK); (4) painel do elemento abre com `TypeSelector`
e botão "Editar tipo" (`onEdit`), nunca `<select>` solto; (5) o desenho lê fonte/altura/cor/estilo da família; (6) campos mínimos de texto:
altura (mm de papel), fonte, cor, estilo (negrito/itálico), prefixo, unidade, casas decimais; de símbolo: tipo e tamanho.

## Tabela

| Item | Ferramenta / ToolId | Dado e onde fica | Quem desenha | Família / tipo | Painel (TypeSelector + Editar tipo) | S | D | A | M/C | Lacuna (antes) |
|---|---|---|---|---|---|---|---|---|---|---|
| Texto (nota) | `text` | `TextNote` em `level.texts`, `plan.annotations.texts`, `view.annotations.texts` | `render/plan/notes.ts` | `TextFamily` (`settings.textFamilies`) | sim (`AnnotationProps`) | sim | sim | sim | sim | nenhuma |
| Cota linear/angular/alinhada | `dimension` etc. | `Dimension` (idem) | `render/plan/dimDraw.ts` | `DimensionFamily` (`dimensionFamilies`) | sim | sim | sim | sim | sim | nenhuma |
| Etiqueta de elemento | `tag` | `ElementTag` | `render/plan/tags.ts` | `TagFamily` | sim | sim | sim | sim | sim | nenhuma |
| Cota de elevação | `spotElevation` | `SpotAnnotation` (`level.spots`, `plan.annotations.spots`, `view.annotations.spots`) | `render/plan/extraAnnotations.ts` (planta e corte) | `SpotFamily` kind elevation | sim | sim | sim | planta de piso sim; PLANTA DE ÁREA e CORTE NÃO | sim | exclusão (corrigida) |
| Cota de coordenada | `spotCoordinate` | `SpotAnnotation` | idem | `SpotFamily` kind coordinate | sim | sim | sim | idem | sim | exclusão (corrigida); localização (ver abaixo) |
| Nuvem de revisão | `revisionCloud` | `RevisionCloud` | `extraAnnotations.ts` | `RevisionCloudFamily` | sim | sim | sim | idem (área e corte NÃO) | sim | exclusão (corrigida) |
| Símbolo de norte | `northArrow` | `SymbolAnnotation` | `extraAnnotations.ts` | `NorthArrowFamily` | sim | sim | sim | idem (área e corte NÃO) | sim | exclusão (corrigida) |
| Linha de detalhe / região | `detailLine`, `detailRegion` | `DetailLine`/`DetailRegion` | `notes.ts` | estilo da própria linha (sem texto) | n/a (não gera texto) | sim | sim | sim | sim | nenhuma |
| Etiqueta de ambiente | `roomTag` | `RoomTag` em `plan.tags` | `render/plan/rooms.ts` | corpo fixo `ROOM_TEXT_MM`; sem família | não | sim | sim | sim | parcial | SEM FAMÍLIA (texto fixo 1,6 mm) |
| Cota de ponto do terreno | `terrainSpot` | `Terrain.pontosCotados` (vetor x,y; sem id) | `render/plan/terreno.ts` + `terrenoRotulos.ts` (`rotuloDeCota`) | NENHUMA (`COTA_TEXTO_MM` = 1,8 fixo) | não | SÓ no modo Editar terreno | SÓ no modo Editar terreno | SÓ no modo Editar terreno | arrasto no Editar terreno | NÃO seleciona/destaca/apaga na Selecionar; SEM FAMÍLIA |
| Rótulo de curva de nível | `terrainLabel` | `Terrain.linhasRotulo` (x1,y1,x2,y2; sem id) | `terrenoRotulos.ts` (`rotulosDeCurva`) | NENHUMA (1,8 fixo) | não | idem | idem | idem | idem | idem |
| Curvas de nível (linhas) | `terrain` | `Terrain` (elemento) | `terreno.ts` | n/a (linha) | `TerrainProperties` (intervalo, mestra) | sim | sim | sim | sim | nenhuma |
| Lote: rumos/medidas dos lados | `lot` | `Lot.lados[i].papel` + comprimento | `render/plan/lote.ts` (`LOTE_TEXTO_MM` = 1,5) | NENHUMA | `LotProperties` sem tipo | sim (contorno) | sim | sim | sim | SEM FAMÍLIA de texto |
| Linha de propriedade (contorno do lote) | `lot` | `Lot.contorno` + `Lot.color` | `lote.ts` (traço `LOTE_TRACO`) | NENHUMA (só `color`) | não | sim | sim | sim | sim | SEM FAMÍLIA de linha |
| Marca de nível (corte/elevação) | `level` | `Level` (nome + `z`) | `render/section/build.ts` (`SECTION_TEXT_MM`) | fixa | não | sim (nível) | sim | sim | sim | texto fixo (documentado) |
| Marca de corte/elevação | `section` | `SectionView` | `render/plan/sectionMarks.ts` | `settings.sectionMarkStyle` | diálogo próprio | sim | sim | sim | sim | nenhuma |
| Bolhas de eixo | `grid` | `Grid` | `render/plan/grids.ts` | `GridType` (`bubbleTextMm`) | sim | sim | sim | sim | sim | nenhuma |
| Textos de escada/rampa/piso/telhado | n/a (automáticos) | derivados do elemento | `stairs.ts`, `ramps.ts`, `floors.ts`, `roofsRotulos.ts` | tipo do próprio elemento; corpo 1,6 fixo | painel do elemento | sim | sim | sim | sim | corpo do texto fixo (fora do escopo) |
| Etiqueta de abertura | `tag` | derivada | `openingTags.ts` | `TagFamily` | sim | sim | sim | sim | sim | nenhuma |
| Massa (cotas) | `mass` | cotas base/topo são campos numéricos | `massa.ts` (só contorno/hachura) | n/a | `MassProperties` | sim | sim | sim | sim | não gera texto em desenho |
| Tabelas (quadros) | `schedule` | `Schedule` | prancha | estilo do quadro | diálogo de quadro | n/a | n/a | n/a | n/a | nenhuma |

## Lacunas priorizadas

1. Exclusão (e Delete/menu) de cota de elevação, coordenada, nuvem e símbolo na planta de área e no corte (`deleteIds.ts`, `sectionHandles.ts`). Corrigida.
2. Cota de ponto e rótulo de curva do TERRENO sem seleção/destaque/exclusão na Selecionar. Corrigida (ids sintéticos `<terreno>#cotado:i`).
3. Sem família: cota de ponto do terreno e rótulo de curva (texto fixo 1,8 mm).
4. Sem família: linha de propriedade/lote (contorno) e texto dos lados (1,5 mm fixo).
5. Localização: ver a seção "Localização" abaixo.
6. Etiqueta de ambiente, textos de escada/rampa/piso/telhado e marca de nível com corpo fixo: ficam como pendência documentada.

## Localização e bases

`Project.localizacao` (origem E/N, cota zero, norte verdadeiro) é o sistema real. Bases da família de cota de ponto:

- `project`: valor REAL do sistema da localização (E/N reais; elevação = z + cotaZero). Sem localização, relativo ao `settings.projectBasePoint`.
- `survey`: relativo ao ponto de levantamento `settings.surveyPoint`, girado pelo norte do levantamento.
- `relative`: relativo ao nível da vista (elevação = z menos a cota do pavimento).

## Estado ao fim da frente

Corrigido: lacunas 1 a 5 (exclusão, seleção e destaque; famílias do terreno e do lote; bases e Localização).
Esquema: não mudou (SCHEMA_VERSION 29). Todos os campos novos são opcionais com padrão que reproduz o desenho anterior:
`settings.terrainTextFamilies`, `defaultTerrainContourFamilyId`, `defaultTerrainSpotFamilyId`, `settings.lotFamilies`, `defaultLotFamilyId`,
`Terrain.rotuloFamilyId`/`cotadoFamilyId`, `Lot.familyId`, `SpotAnnotation.z`.

Famílias novas: `TerrainTextFamily` (kind `contour` ou `spot`: fonte, altura, cor, negrito, itálico, prefixo, unidade, casas) e `LotFamily` (linha de
propriedade: estilo, espessura, cor; texto dos lados: fonte, altura, cor, negrito, itálico, unidade, casas, mostrar papel e medida).
Painéis: `TerrainProperties` (dois `TypeSelector`) e `LotProperties` (um), todos com "Editar tipo" (`onEdit`).

Defeito da Localização, causa e correção: a cota de elevação em PLANTA ignorava o z medido (o desenho sempre usava a cota do nível), e a base
`relative` de coordenada e a `survey` sem ponto de levantamento ignoravam o ponto-base e a Localização. Agora `cotasBase.ts` (modelo) define
uma única conta usada pelo desenho e pela prévia da ferramenta. O texto só muda depois que o desenho da vista é refeito (poucos centésimos de segundo
no navegador de teste).

Pendências: etiqueta de ambiente, textos de escada/rampa/piso/telhado e marca de nível com corpo de texto fixo (sem família); mover e copiar cota de
ponto e rótulo do terreno pela Selecionar; o traço-dois-pontos exato do lote.

- **Tipo de terreno** (`terrainTypes`): reúne superfície, solo, curvas e a família de rótulo de curva (`contour`) acima; ver decisão 0059.
