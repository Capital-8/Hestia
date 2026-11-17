# Estudo de esquadrias · A1 · Auditoria do que o Hestia tem hoje

Data: 2026-11-17. Escopo: portas, janelas e vãos do Hestia (`/home/user/Hestia`). Somente leitura do código; este é o único arquivo escrito.
Método: leitura dos arquivos citados, `grep` e duas consultas executadas com `vite-node` (contagem do catálogo). **Não rodei a suíte de testes nem abri o app**: nada aqui foi observado em execução.

Legenda das marcações:

- **[V]** verificado no código (arquivo:linha citado; a linha é a do início do trecho lido).
- **[D]** declarado em documento (`docs/...`) e não reconferido no código.
- **[S]** suposição ou inferência minha; precisa de teste ou de conferência antes de virar decisão.

---

## 0. Resumo executivo

1. **O vão é sempre um retângulo.** Largura × altura × peitoril, nada mais. Não existe campo de forma no `OpeningType` nem na `Opening` [V]. A forma retangular é assumida em oito pontos independentes (tabela da seção 2): corte da parede, retorno do acabamento, modelo das peças, planta, corte/elevação, 3D, kernel Rust e IFC (export e import). O checklist do projeto já registra "vão em arco e formas não retangulares" como fora de escopo (`docs/paridade/aberturas.md` D5, e `docs/paridade/paredes.md` D5) [D].
2. **A fonte única do vão** é `openingGeometry` (`packages/engine/src/resolve.ts:230`), que devolve centro, eixo `u`, normal `n`, `width`, `height`, `roughWidth`, `roughHeight`, `sill` [V]. Tudo (parede, planta, corte, 3D, DXF, IFC, cotas) deriva daí e do modelo de peças `buildOpeningModel` (`packages/engine/src/openingModel.ts:25`). Isso é bom para a mudança: há poucos pontos de entrada.
3. **O furo da parede é um prisma vertical por faixa de altura**: o motor quebra a parede em faixas `z` nos limites do vão (`resolve.ts:279`) e fura cada faixa com o retângulo `openingHole` (`resolve.ts:343`, `openingCut.ts:39`). Um vão com topo curvo ou inclinado exigiria outra representação do furo (faixas muito finas ou subtração 3D).
4. **O catálogo tem 154 tipos** (94 portas, 60 janelas) em 19 famílias [V, contado por script]. Larguras de vão de 0,40 a 3,00 m, alturas de 0,40 a 2,80 m. Detalhe na seção 3.
5. **O `OpeningType` tem ~75 campos**, quase todos opcionais com padrão por leitura; a tabela `openingOptionSupport` diz quais valem para cada família (`packages/model/src/openingSupport.ts:60`). A instância (`Opening`) não tem largura própria: só altura (`heightOverride`) e peitoril (`sillOverride`) [V].
6. **Dois achados de inconsistência** que importam para o estudo:
   - `projectIssues` trata `offset` como borda inicial, o resto do código como centro (seção 9, A-1).
   - o furo bruto cresce só para cima na parede, mas o IFC o centraliza (seção 9, A-2).
7. A documentação de pendências está desatualizada em dois pontos: o IFC já exporta as peças (não é "caixa única") e o ADR 0056 ainda diz "fase 0" embora a esquadria em célula de cortina exista no código (seção 9).

---

## 1. Modelo (`packages/model`)

| Tema | O que existe | Arquivos-chave | Limites conhecidos |
|---|---|---|---|
| Tipo (`OpeningType`) | `kind`, `name`, `code`, `width`, `height`, `sill`, `leaves` (0 a 4), `plan` (símbolo/família), materiais, mais ~60 campos opcionais (batente, folha, vidro, acabamento, ferragens, detalhe 2D/3D, dados BIM). Ver tabela de parâmetros na seção 4. | `packages/model/src/openingTypes.ts:16` | Largura e altura são escalares. Sem forma, sem polígono, sem perfil de contorno do vão. |
| Instância (`Opening`) | `kind`, `typeId`, `hostId`, `offset` (centro ao longo da parede), `flipHand`, `flipFacing`, `sillOverride`, `heightOverride`, `plano` (vertical/inclinado), `mark`, `ifcProperties`. | `openingTypes.ts:155` | **Sem `widthOverride`** (grep por `widthOverride` não acha nada) [V]. Largura só muda trocando ou editando o tipo. `kind` duplicado no tipo e na instância (já listado como L-15 em `docs/aberturas/B-estado-atual.md`) [D]. |
| Hospedeiro | Só `Wall`. `addOpening` recusa hospedeiro que não seja parede. | `packages/model/src/commands.ts:513` | Não há esquadria hospedada em telhado, laje ou piso (clarabóia/zenital). Os "vãos" de laje/piso/forro são só de escada e rampa (`packages/engine/src/levelOpenings.ts:12`). Furo livre de piso/laje é do próprio elemento (`holes`), fora do modelo de esquadria [V]. |
| Famílias | 19 ids: 10 de porta (`door_swing`, `door_double`, `door_sliding`, `door_pivot`, `door_void`, `door_dblact`, `door_pocket`, `door_bifold`, `door_accordion`, `door_garage`) e 9 de janela (`window_fixed`, `window_hinged`, `window_tilt`, `window_casement`, `window_sliding`, `window_hung`, `window_pivot`, `window_louver`, `window_void`). Cada uma fixa símbolo de planta e contagens de folhas aceitas. | `packages/model/src/opening.ts:114` (ids), `:154` (lista), `:190` (`openingFamilyOf`) | **Schema fechado** (decisão 0017 §9): combinação símbolo × folhas fora da lista é recusada ao salvar (`openingTypeIssue`, `opening.ts:217`). Não há família autoral. Porta pivotante e `double` são legado mantido por decisão do dono. |
| Folhas por família | `door_swing` 1; `door_double` 2; `door_sliding` 2 ou 1; `door_dblact` 1 ou 2; `door_bifold` 2 ou 4; `window_hinged` 1 ou 2; `window_sliding` 2, 3 ou 4; `window_hung` 2; demais 1; vão livre 0. | `opening.ts:156` a `:174` | Veneziana e basculante aceitam só 1 folha (comentário em `catalogoJanelas.ts:89`). |
| Vão nominal × folha | `nominalRef: 'opening'` (padrão) ou `'leaf'`; com `'leaf'`, vão = folha + `spanGap` (padrão 8 cm na largura e 5 cm na altura, NBR 15930-2). Uma única função define o vão. | `packages/model/src/openingNominal.ts:30` (`openingSpanOf`), `:142` (padrões) | O motor lê o tipo já normalizado (`openingType`/`openingTypeById` aplicam `spanTypeOf`). 80 dos 154 tipos do catálogo usam `'leaf'` [V]. |
| Vão bruto | `roughOversize {w,h}`: o furo na parede cresce, a esquadria não. Limite 20 cm. | `packages/model/src/openingExtras.ts:41` (`openingRough`), `:83` (limites) | Ver achado A-2 (altura cresce só para cima na parede). |
| Composição (células e perfis) | `OpeningType.composition`: árvore de `split` (`cols`/`rows`) e `cell` (folha, vidro, painel, veneziana), 18 presets de perfil (madeira, alumínio, PVC, vidro sem perfil), alizar por face, nominal por célula. Ausente = derivada dos campos simples por `openingCompositionOf`. | `packages/model/src/openingComposition.ts` (contrato), `openingCompositionLayout.ts` (`resolveLayout`, `compositionSpan`), `openingCompositionOf.ts`, `openingCompositionSync.ts`, `openingProfiles.ts` | **Layout é grade ortogonal**: cada divisão é `cols` ou `rows`, cada célula é um retângulo `Rect {t0,t1,z0,z1}` (`openingComposition.ts:240`). Bay, bow e janela de canto (F8) ficam de fora: exigem células não coplanares [D: `PENDENCIAS...md` §D]. |
| Regras de validação | Faixas de ângulo (0 a 120), grade 1 a 8, bandeira < altura, lateral < largura, recuo ≤ 50 cm, folga ≤ 30 cm. | `opening.ts:67` (`openingStyleIssue`), `openingExtras.ts:100` | Validação só do tipo; a validação da instância é `openingIssues` em `packages/model/src/validate.ts:116` (hospedeiro, tipo, cabe na parede, sobreposição). |
| Defaults e padrões por leitura | Getters que aplicam padrão: `openingLeafStyle`, `openingHandle`, `openingFrameStyle`, `openingFrameDepth`, `openingGrid`, `openingTransom`, `openingSidelights`, `openingAngle2d/3d`, `openingDetail2d/3d`, etc. | `packages/model/src/openingStyle.ts:45` a `:215`; `defaults.ts` (`OPENING_FRAME_DEFAULTS` = batente 5 × 9 cm, folha de porta 4 cm, janela 3 cm, vidro 12 mm) | `SCHEMA_VERSION` = 28 (`types.ts:35`); campos novos entram sem migração. |
| Biblioteca e templates | Duplicar tipo, exportar/importar tipos em JSON (`hestia-opening-types` v1), favoritos do projeto, template "Mostruário de esquadrias". | `packages/model/src/openingTypeLibrary.ts`, `templateEsquadrias.ts` | Biblioteca é por arquivo; não há catálogo de fabricante. |
| Parede cortina | Esquadria em célula é **sobrescrita de célula** (`OpeningCellOverride`), não `Opening`; reaproveita o mesmo `OpeningType`. A validação acusa `Opening` com hospedeiro de cortina (`opening-host-curtain`). | `packages/model/src/curtainOpening.ts`, `curtainOpeningCommands.ts`, `wallCurtain.ts:191` | O vão virtual é um retângulo da célula (ADR 0056 §7.6) [D]; região de células fundidas precisa ser retângulo (§4.3) [D]. |

---

## 2. Onde o motor assume que o vão é um retângulo

Esta é a tabela central para quem for propor formas não retangulares (arco, círculo, trapézio, triângulo, polígono). "Impacto" é a minha leitura do que mudaria; é [S].

| # | Ponto | O que faz hoje [V] | Arquivo:linha | Impacto de uma forma não retangular [S] |
|---|---|---|---|---|
| R1 | **Geometria do vão** | `OpeningGeometry` só tem `width`, `height`, `roughWidth`, `roughHeight`, `sill`. | `packages/engine/src/types.ts:103`; montada em `resolve.ts:230` | Precisa de um campo de contorno (ex.: anel em coordenadas `t,z`) ou de uma função de forma. Toca todos os consumidores abaixo. |
| R2 | **Furo da parede, planta** | `openingHole` = um anel retangular (`orientedRect` em parede reta; setor radial em parede curva) com `roughWidth/2` e profundidade `espessura/2 + 0,02`. | `packages/engine/src/openingCut.ts:39`, `:28` (`openingBandRing`), `:23` (`openingRect`) | A planta corta na altura do plano de corte: com topo curvo, a largura do furo varia com `z`. O anel seria função de `z`. |
| R3 | **Furo da parede, 3D e camadas** | O motor quebra a parede em faixas `z` nos pontos `sill` e `sill + roughHeight`, e fura cada faixa com o retângulo. Cada faixa é um prisma vertical. | `resolve.ts:279` (`breakpoints`), `:293`, `:340` a `:349`, `:367` | Um topo em arco vira muitas faixas (custo e "degraus") ou exige o furo como sólido 3D subtraído. É o ponto mais caro da mudança. |
| R4 | **Parede inclinada** | O furo vertical é remapeado vértice a vértice por `tiltCutZ` (peitoril e topo deslocados). Continua sendo um retângulo em `(u, z)`. | `packages/engine/src/openingCut.ts:45` (`openingTiltCut`), `openingTilt.ts:112` (`tiltCutZ`) | `tiltCutZ` só trata os vértices do furo na cota do peitoril ou do topo (`openingTilt.ts:112`); forma intermediária não é remapeada. |
| R5 | **Retorno do acabamento** | O retorno nas laterais, topo e soleira é montado com `rect(f, offset, t0, t1, s0, s1)` e `ringRect`. | `packages/engine/src/wrap.ts:109` (`ringRect`), `:121` (`rect`), `:135` (`insertReturns`) | Reescrever como faixa em torno de um contorno arbitrário. O Rust tem porte do mesmo código (`crates/geom-wasm/src/a3b.rs`). |
| R6 | **Batente** | Seção em L por ombreira (`jambSection`, `:158`) mais `head` e `sillFrame`. Posição por `frameDepthMode` e `core`. Ombreiras verticais com largura `J`; `head` horizontal. | `packages/engine/src/openingModelContext.ts:158`, `:93` (`openingFramePlacementBase`), `openingModelDoors.ts:68` (`jambProfile`) | O batente é três peças retas (2 ombreiras + travessa) e, em janela, mais o peitoril. Um arco exige batente curvo (perfil extrudado ao longo de curva), hoje inexistente. |
| R7 | **Vidro, folha e divisões** | Folha e vidro são caixas (`PartBox`) com `t0<t1`, `s0<s1`, `z0<z1`. Região interna: `windowInner` = retângulo; `leafZ` e `innerT` descontam o batente retangular. | `packages/engine/src/openingModelTypes.ts:40`; `openingModelContext.ts:230` (`leafZ`), `:243` (`innerT`), `:255` (`windowInner`) | Folha e vidro precisam ser recortados pela forma. A exceção existente é `PartProfile` (prisma com seção poligonal `ts`, `sz` ou `tz`, `openingModelTypes.ts:76`), usado hoje só para batente em L e maçanetas. É o único precedente de peça não caixa e serve de ponto de partida. |
| R8 | **Alizar** | Anéis retangulares: porta com 3 lados, janela com 4; interno = envoltória da luz das células; externo = interno + largura. | `packages/engine/src/openingModelCasing.ts:94`; `CASING_RULES` em `openingComposition.ts:222` | O anel é `CasingRing {inner, outer: Rect}`; precisa virar contorno. |
| R9 | **Composição** | Tudo é `Rect`: `ResolvedCell.luz`, `ResolvedMember.rect`. Divisão só em `cols`/`rows`. | `packages/model/src/openingComposition.ts:240`, `:265` | Célula não retangular (arco no topo) não existe. Alternativa [S]: célula retangular com "recorte superior" como propriedade. |
| R10 | **Planta (símbolo)** | Anéis de caixas (`boxRing`) para batente, folha, soleira, alizar, peitoril. Arco de giro é arco de círculo (`addOpeningArc`), independente do vão. | `packages/engine/src/openingPlanNew.ts:95` a `:100` (`boxRing`), `:178` (`addFrameCut`), `:206` (`addHighExtras`) | Na planta o vão aparece pela largura; só o plano de corte `z` decide o que se vê. Forma só importa se o plano de corte atravessar a parte curva (peitoril ou topo). |
| R11 | **Corte e elevação** | O retângulo do vão: `polygons: [[rect(t0, t1, z0, zTop)]]`. A pegada usa `g.width` (não o vão bruto). As peças saem de `projectParts` e são projeção de caixas. | `packages/engine/src/section.ts:394` (`foot`), `:419`; `packages/render/src/section/build.ts:196` (`drawOpening`) | Contorno e hachura do vão em elevação precisam do contorno real. |
| R12 | **Alças de elevação** | 4 alças: peitoril, topo, ombreira A e B, no meio de cada lado do retângulo. | `packages/render/src/section/handles.ts:23`, `:62`; só `sill` e `head` editam (`apps/web/src/editor/sectionHandles.ts:45`, `:51`) | Alças de forma livre não existem. |
| R13 | **3D** | Cada peça vira `THREE.BoxGeometry` (ou prisma por `PartProfile`) dentro de um grupo rotacionado pela tangente do vão. | `packages/render/src/model3d/aberturas3d.ts:71` (`grupo.rotation.z`), `:100` a `:115` (caixa × perfil) | Vidro em arco precisa de geometria própria; o caminho instanciado (`caixasDaAbertura`) trata cada peça como caixa unitária e despacha prismas à parte (`PrismaDeAbertura`). |
| R14 | **Kernel Rust** | `retangulo_do_vao(g)` constrói um retângulo orientado com `vao_largura` e profundidade; `kernelA3.ts` extrai `openingRect` do TS como referência. A3a/A3b/A3c/A3d portam `openingGeometry`, `insertReturns`, `solveCluster`. | `crates/geom-wasm/src/a3.rs:88`, `:101`; `packages/engine/src/kernelA3.ts:193` a `:201` | Qualquer forma nova precisa ser portada ao Rust com o mesmo código (decisão 0047 §7: "mesmas contas na mesma ordem") e ao contrato `cena-v*.json` (colunas `largura`, `altura`, `vaoLargura`, `vaoAltura` em `tipos_abertura`/`aberturas`). |
| R15 | **Cotas** | Cotas do vão são ao longo da parede (`t`): `OpeningExtents {center, clear, frame, casing}` = meias-larguras. Não há cota vertical de esquadria nas cotas temporárias nem nas automáticas. | `packages/engine/src/openingExtents.ts:48`; `packages/tools/src/dims/providers/opening.ts` | Forma curva exigiria referência "ponto mais alto" ou "tangente". |
| R16 | **IFC exportação** | Furo = `IFCOPENINGELEMENT` com sólido extrudado retangular (`rectOf(roughWidth, espessura + 0,02)` por `roughHeight`). Porta/janela = vários sólidos retangulares (uma caixa por peça). Eixo `u` reto. | `packages/io/src/ifc/ifcExport.ts:215`, `:227` a `:235` (peças; `roughHeight` em `:212`); geometria de entrada em `apps/web/src/editor/ifcExport.ts:107` a `:146` | Forma não retangular exigiria perfil não retangular em `IFCEXTRUDEDAREASOLID` (por exemplo `IFCARBITRARYCLOSEDPROFILEDEF`). |
| R17 | **IFC importação** | A forma do `IFCOPENINGELEMENT` vira **caixa envolvente**: largura = extensão em `t`, altura = extensão em `z`, mínimo 0,30 m. Só parede reta (`segment([wall.a, wall.b])`). Cria tipo `iot_<nome>_<mm>` com plano `swing`/`double`/`sliding`/`fixed`. | `packages/io/src/ifcImport/openingImport.ts:44`, `:56`, `:58`; `elementTypes.ts:95`, `:113` | Arco e círculo importados viram retângulo (perde forma e volume); `IfcWindow` com partição e `OverallWidth` não são lidos (a largura vem do vazio). |
| R18 | **DXF** | O vão de corte sem símbolo vira retângulo (`openingRect`); com símbolo, usa os traços do modelo. DXF de corte/elevação recebe só `polygons` do vão. | `packages/io/src/dxf.ts:289`; `apps/web/src/editor/dxfExport.ts:135` a `:163`; `packages/io/src/dxfSection.ts:128` | Contorno vem do `SectionOpening.polygons` (R11). |
| R19 | **Quadro** | Área do vão = `largura × altura`; áreas, vergas e contravergas por comprimento retilíneo. | `packages/engine/src/openingSchedule.ts` (`unitArea`, `lintelLength`) | Área de forma não retangular exigiria cálculo próprio. |
| R20 | **Validação e colocação** | Cabe na parede: `centro ± largura/2`; sobreposição por intervalo em `t`; sobreposição vertical por `[sill, sill+height]`. | `packages/model/src/validate.ts:139`; `packages/model/src/openingHost.ts:16`; `packages/tools/src/infer.ts:708` (`occupiedRanges`) | Um vão com largura variável em `z` ainda cabe pelo seu máximo; a regra de sobreposição pode continuar usando a caixa envolvente. |

Observação [S]: R1 a R3 e R14 são o núcleo. Todo o resto (R5 a R13, R16 a R19) consome o modelo de peças (`OpeningModel`) e poderia, em tese, reagir a um contorno novo no `OpeningModel` sem mudar cada vista separadamente, porque o projeto já segue o princípio "modelo único" (decisão 0034 §1).

---

## 3. Catálogo

Fonte: `DEFAULT_OPENING_TYPES` (`packages/model/src/defaults.ts:194`) = `openingTypeCatalog` = base + portas + janelas + composições (`defaults.ts:188`). Contagem e dimensões obtidas por script `vite-node` que importa o catálogo [V].

**Totais:** 154 tipos = 94 portas + 60 janelas. Por fonte: base 24 (`defaults.ts`, P-01..P-11, V-01, V-02, J-01..J-11), portas brasileiras 67 (`catalogoPortas.ts`), janelas brasileiras 39 (`catalogoJanelas.ts`), composições 24 (`catalogoComposicoes.ts`: P-47..P-61 e J-51..J-59). Materiais do batente: alumínio 67, madeira 48, PVC 14, vidro 14, aço 11. `F-PROGRESSO.md` ainda diz "130 no total" [D, desatualizado].

Dimensões abaixo são do **vão** (`openingSpanOf`: nos 80 tipos com `nominalRef: 'leaf'` o vão é folha + 8 cm de largura e + 5 cm de altura). Formato `largura x altura` em cm; janelas com `@peitoril` em cm.

### 3.1 Portas (94)

| Família | Tipos | Vãos (cm) | Códigos / observação |
|---|---|---|---|
| `door_swing` (giro 1 folha) | 41 | 70x210, 80x210, 90x210 (base); 68x215, 78x215, 88x215, 98x215, 108x215 (folhas 60 a 100 cm); 72/82/92 cm de folha em vidro temperado (blindex 8 e 10 mm) = 80x215, 90x215, 100x215; corta-fogo PF-30/60/90/120 folha 80 e 90 = 88x215 e 98x215; composições com bandeira/lateral: 98x260, 98x280, 133x215, 143x215, 178x215, 188x215, 188x260, 98x258, 98x263, 183x215 | P-01..P-03, P-12..P-16, P-39..P-44, PF-xx-80/90, P-47..P-56, P-59..P-61 e variantes de material (alumínio, PVC, vidro) P-62 a P-85 |
| `door_double` (giro 2 folhas) | 15 | 160x210 (base); 128x215, 148x215, 168x215, 188x215 (conjunto 120/140/160/180); porta-balcão 158x215, 208x215 (150 e 200); 128x260 (balcão com bandeira) | P-04, P-17..P-23, P-57 |
| `door_sliding` (correr) | 10 | 160x210 (base); 168x215, 188x215; 168x260 (com bandeira) | P-05, P-24, P-25, P-58 |
| `door_pivot` (pivotante) | 9 | 80x210 (base); 108x215, 128x215 | P-06, P-28, P-29 |
| `door_dblact` (vai-e-vem) | 4 | 90x210; 88x215, 98x215, 108x215 | P-07, P-32..P-34 |
| `door_pocket` (embutir) | 3 | 80x210; 88x215, 98x215 | P-08, P-26, P-27 |
| `door_bifold` (dobrável/camarão) | 3 | 120x210; 168x215 (2 folhas); 248x215 (4 folhas) | P-09, P-30, P-31 |
| `door_accordion` (sanfonada PVC) | 5 | 90x210; 68x215, 78x215, 88x215, 98x215 | P-10, P-35..P-38 |
| `door_garage` (portão) | 3 | 300x220 (seccionado); 250x210 (basculante); 280x225 (enrolar) | P-11, P-45, P-46. Medida do vão, sem `nominalRef`. |
| `door_void` (vão livre) | 1 | 90x210 | V-01 |

Todas as portas têm peitoril 0.

### 3.2 Janelas (60)

| Família | Tipos | Vãos (cm @ peitoril) | Códigos / observação |
|---|---|---|---|
| `window_sliding` (correr 2, 3, 4 folhas) | 14 | 120x120@110, 150x100@110, 200x120@100, 240x120@110 (3 folhas), 120x100@110, 150x120@110, 120x150@100, 200x100@110 (4 folhas), 180x120@100 e 200x150@100 (composições) | J-01, J-02, J-04, J-06, J-12..J-19, J-52, J-55 |
| `window_casement` (maxim-ar) | 7 | 60x60, 40x40, 50x50, 80x60, 80x80, 100x100 @150; 100x50@180 (banheiro) | J-03, J-20..J-24, J-50 |
| `window_tilt` (basculante) | 9 | 80x50@170; 40x40, 60x40, 80x40, 100x40, 60x60, 80x60, 100x60, 100x100 @150 | J-11, J-25..J-32 |
| `window_fixed` (fixa) | 5 | 60x60@150, 80x60@150, 120x120@110; bandeira fixa 90x40@210 e 90x60@210 | J-05, J-44, J-45, J-48, J-49 |
| `window_hinged` (de abrir) | 12 | 120x120@110 (2 folhas), 60x60@110, 80x80@110, 100x100@110, 150x120@110; composições: 150x120@100, 160x120@100, 100x150@100, 80x210@50 | J-07, J-40..J-43, J-51, J-53, J-54, J-56..J-59 |
| `window_hung` (guilhotina) | 4 | 90x150, 60x120, 80x120, 100x150 @90 | J-08, J-37..J-39 |
| `window_pivot` (pivotante) | 5 | 80x120@100; 60x60, 80x80, 100x100, 120x120 @100 | J-09, J-33..J-36 |
| `window_louver` (veneziana) | 3 | 80x60@150, 120x100@150, 150x100@150 | J-10, J-46, J-47 |
| `window_void` (vão livre) | 1 | 120x120@100 | V-02 |

### 3.3 Lacunas do catálogo em relação a formas

[V] O catálogo não contém nenhum tipo cuja forma não seja retangular: nada circular, em arco, triangular, trapezoidal, nem "óculo". Também não há janela de canto, bay/bow, pele de vidro (isso é a parede cortina), porta de correr com folha fixa lateral fora das composições, nem portão basculante com folha de passagem. O ADR 0034 listou "bay, bow e janela de canto" como pendência (F8) [D].

---

## 4. Parâmetros do tipo e quem os lê

Tabela dos campos de `OpeningType` (`packages/model/src/openingTypes.ts:16`). "Leitores" são os módulos que consomem o campo (levantado por `grep` e leitura; **lista não exaustiva**, mostra os principais). "Aplica a" é o que `openingOptionSupport` marca (`openingSupport.ts:60`); o motor ignora o que não se aplica.

| Grupo | Campo(s) | Leitores principais | Aplica a (família) |
|---|---|---|---|
| Dimensão | `width`, `height`, `sill`, `nominalRef`, `spanGap` | `openingNominal.ts:30` (vão), `resolve.ts:230` (geometria), `openingSchedule.ts`, `openingChecks.ts`, `kernelA3.ts:193`, diálogo `OverviewPanel.tsx` | Todas; `nominalRef` nas portas com folha e em todas as janelas |
| Vão bruto | `roughOversize` | `openingExtras.ts:41`, `resolve.ts:234`, `kernelA3.ts:53`, IFC (`ifcExport.ts:211`), quadro | Todas (diálogo `WallPanel.tsx:26`) |
| Fechamento | `closure` (`inherit`/`none`/`interior`/`exterior`/`both`) | `wrap.ts:54` (`insertMode`), `kernelA3.ts:60`, `openingTypeWarning` (`opening.ts:230`) | Todas; exclusivo com alizar |
| Batente | `frameWidth`, `frameDepth`, `frameDepthMode` (`wall`/`core`/`fixed`), `frameStyle` (`rebate`/`simple`/`aduela`/`block`), `reveal` | `openingModelContext.ts:93`, `openingModelDoors.ts`, `openingReveal.ts` (model e engine), `wrap.ts:66` (`insertFrameFootprint`), `openingChecks.ts:112`, kernel A3b | `frame` e `reveal`: todas menos `door_void`/`window_void` |
| Folha | `leafStyle`, `leafThickness`, `leafSide`, `leafMaterialId`, `leafUndercut`, `glassRatio` | `openingModelDoors*.ts`, `openingModelWindows*.ts`, `openingModelCells.ts`, `openingHardware.ts`, `render/section/build.ts` (`leafMaterialId`) | Portas com folha; `glassRatio` só porta |
| Vidro | `glassMaterialId`, `glassThickness`, `glassKind`, `grid` | `openingModelContext.ts`, `openingModelDetails.ts`, `render/model3d/glassAppearance.ts`, `ifcExport.ts` (material) | `grid` só janela; `glassKind` janelas e portas com folha |
| Bandeiras | `transom {height, fixed}`, `sidelights {left,right,width}` | `openingModelDetails.ts:26`, `openingModelContext.ts:240` | `door_swing`, `door_double`, `door_pivot`, `door_sliding`; janelas menos guilhotina e veneziana (laterais só em `window_fixed`, `door_swing`, `door_double`) |
| Ferragens | `handle`, `handleHeight`, `handleInset`, `hinges`, `threshold` | `openingModelHandles.ts`, `openingModelDoorsNew.ts`, `openingModelDetails.ts` (dobradiças, soleira), `openingHardware.ts` | `handle`: giro e dupla; `hinges`: giro, dupla, vai-e-vem; `threshold`: portas |
| Acabamento externo | `casing {width, thickness, sides}`, `sillBoard`, `lintel`, `sillBeam` | `openingModelCasing.ts:94`, `openingModelDetails.ts`, `openingPlanNew.ts:206`, `openingSchedule.ts`, `kernelA3.ts` (`tem_alizar`) | Quase todas; `sillBoard` e `sillBeam` só janela |
| Movimento | `angle2d`, `angle3d`, `tiltAxis` | `openingPlan.ts`, `render/model3d/openingParts.ts` (`angle3d`), `openingModelWindows.ts` (`tiltAxis`) | `angle`: famílias com giro; `tiltAxis`: só `window_tilt` |
| Exibição | `planDisplay`, `detail2d`, `detail3d`, `showSwing`, `swingStyle`, `leafPlan` | `openingPlanNew.ts`, `render/plan/build.ts:227`, `render/model3d/openingParts.ts:44`, DXF (`dxfExport.ts:151`) | Todas (`PlanPanel.tsx`) |
| Dados BIM | `fireRating`, `acousticRw`, `uValue`, `solarFactor`, `cost`, `manufacturer`, `code`, `description` | Quadro (colunas opcionais, `openingScheduleExtras.ts:12`), IFC (`ifcOpeningTypes.ts:150`, psets `Pset_DoorCommon`/`Pset_WindowCommon`), importador IFC (`elementTypes.ts`) | Todas (`DataPanel.tsx`) |
| Composição | `composition` | `openingModelComposition.ts:48`, `openingNominal.ts:30`, `openingSchedule.ts`, `wrap.ts:41` (`compositionCasing`) | Famílias aceitas por `openingCompositionOf` |

Parâmetros **da instância** (`Opening`): `offset`, `flipHand`, `flipFacing`, `sillOverride`, `heightOverride`, `plano`, `mark`. A UI de propriedades da instância mostra distância ao início, peitoril, altura, plano (só em parede inclinada), inversões, marca e tipo (`apps/web/src/ui/Properties.tsx:286` a `:350`). **A largura aparece como somente leitura, "do tipo"** (`Properties.tsx:337`).

Parâmetros **do projeto** que afetam esquadria: `ProjectSettings.openingLine` (convenção do V: `apex` e `dashed`), `showOpeningTags`, `favoriteOpeningTypes`, `dimensionSettings.openingRef` (`center`/`clear`/`frame`/`casing`) em `packages/model/src/dimensionSettings.ts:20`.

---

## 5. Planta, corte, elevação e 3D

### 5.1 Planta

| Item | Estado [V] | Arquivos |
|---|---|---|
| Fonte do desenho | `openingPlanPaths(model, opts)` desenha o modelo único; `openingPlanPathsAt` leva os traços locais ao mundo. | `packages/engine/src/openingPlan.ts:227`; `openingPreview.ts:121` |
| Níveis de detalhe | Por tipo (`detail2d`) ou por zoom: baixo até 20 px/m, médio até 100 px/m, alto acima. | `render/plan/symbols.ts:41` (`openingPlanDetail`); ADR 0034 |
| Estados da vista | `cut` (símbolo normal), `projection-above` (tracejado), `projection-below`/`beyond` (leve), `hidden`. | `render/plan/view.ts:211` (`openingViewOps`) |
| Famílias | Cada família tem desenho próprio: giro com folha e arco, dupla com dois arcos, correr com retângulos defasados e seta, pivotante, embutir (cavidade tracejada), dobrável, sanfonada, portão (linhas tracejadas e trilho), janela de abrir, guilhotina, pivotante, veneziana, vão livre com duas linhas tracejadas. | `openingPlanNew.ts:285` (`addNewDoorPlan`), `:382` (`addHingedPlan`), `openingPlan.ts` |
| Convenção | Planta de porta de giro mostra só a folha aberta (padrão `leafPlan: 'open'`); alternativas `closed` e `both`; `planDisplay: 'projected'` mostra folha fechada com espessura. | ADR 0035 §5; `openingTypes.ts:81` a `:90` |
| Alizar, peitoril saliente, verga | Aparecem só no nível "alto" (`addHighExtras`). | `openingPlanNew.ts:206` |
| Etiquetas | Código do tipo ou marca (`showOpeningTags`), posicionadas por `openingTagPoint`. | `render/plan/openingTags.ts:17`; `engine/tagPlacement.ts:14` |
| Parede curva | Os traços locais são mapeados sobre o arco (`mapCurvedPath`, `mapAnchoredRigid` para a folha rígida). | `packages/engine/src/openingPreview.ts:97` (`mapCurvedPath`) a `:121` (`openingPlanPathsAt`) |
| Parede inclinada | A planta corta na cota do corte; o símbolo é deslocado pelo desvio `z·tanθ`. | `render/plan/tiltOps.ts:26` (`simboloNaCotaDoCorte`) |
| Células de cortina | `esquadriasDaCortina` entrega `Opening` virtual e geometria do vão virtual; mesmo desenho. | `render/plan/build.ts:204`; `engine/src/cortinaEsquadrias.ts:81`, `:149` |

Limites [D, do checklist e do ADR 0017]: "peitoril saliente e pingadeira sem peça de planta própria" (P13 do checklist: verga e peitoril na planta quando o corte passa por eles, fora de escopo); "vidro de bandeira acima do plano de corte aparece como linha: convenção a confirmar" (`PENDENCIAS...md` §D).

### 5.2 Corte e elevação

| Item | Estado [V] | Arquivos |
|---|---|---|
| Fonte | `SectionOpening` carrega `model` (o `OpeningModel`), convenção do V, `viewSide`, `sSign`, `cutT`, `tiltFrame`. | `packages/engine/src/section.ts:100` a `:125`, `:391` a `:432` |
| Vista face × transversal | O render decide por heurística: `faceOn = |t1−t0 − largura| ≤ |t1−t0 − espessura|`. Só dois casos (face ou transversal). | `render/section/build.ts:216` |
| O que é desenhado | Peças projetadas do modelo (batente com rebaixo, folha, vidro, divisões, maçaneta, alizar, peitoril, vergas) com hachura nas peças cortadas; linhas de abertura (V, seta de correr) por `openingLinePaths`. | `build.ts:196` a `:325`; `openingLines.ts:99` |
| Convenção do V | Vértice no lado do trinco (padrão), tracejado quando a folha abre para o observador; configurável. | ADR 0034 §2; `openingTypes.ts:148` |
| Parede inclinada | Peças seguem o referencial inclinado do 3D (`tiltFrame`, `vistaInclinada`). | `section.ts:403` a `:407`, `:422`; `render/section/referencialInclinadoVista.ts` |
| Alças | Peitoril e topo editam `sillOverride`/`heightOverride`; ombreiras desenham alça mas não editam. | `render/section/handles.ts`, `apps/web/src/editor/sectionHandles.ts:45`, `:51` |

Limites [S]: a heurística `faceOn` não trata linha de seção oblíqua à parede (a projeção ficaria entre largura e espessura). O ADR 0034 registra: "V de abertura no corte transversal não é desenhado (só na vista de face)" [D]. Folha aberta em corte/elevação não existe (só o 3D abre a folha) [D, ADR 0017 §8].

### 5.3 3D

| Item | Estado [V] | Arquivos |
|---|---|---|
| Montagem | `montarAbertura` → `buildOpeningModel` → `pecasDoModelo` → grupo com `rotation.z = atan2(u)`; peças fixas viram lotes por material; folhas articuladas ficam num pivô. | `render/model3d/aberturas3d.ts:31`, `:71` |
| Caminho instanciado | `caixasDaAbertura`: cada peça é caixa unitária com matriz; peças com seção (`profile`) saem como prisma à parte. | `aberturas3d.ts:153`; `scene3d.ts:1355` a `:1371` |
| Detalhe 3D | `detail3d`: `view`, `schematic`, `simple`, `full`, `off`; ferragens só no completo. | `render/model3d/openingParts.ts:44` |
| Folha aberta | Vista com "Abrir vãos" (`View3DSettings.openOpenings`); giro por `angle3d`, correr por deslizamento, dobrável em cadeia. | `openingParts.ts`; `openingModelTransforms.ts` (`partTransformed`) |
| Altura | A altura do vão é limitada à altura da parede menos o peitoril (`H − sill`). | `aberturas3d.ts:44`, `apps/web/src/editor/ifcExport.ts:111` |
| Parede inclinada | Referencial `referencialDaEsquadria`; modo `inclinado` corta perpendicular às faces, `vertical` mantém o caixilho em prumo. | `render/model3d/referencialInclinado3d.ts`; `engine/openingTilt.ts` |
| Parede curva | **As peças da esquadria são retas (tangentes ao centro do vão)**; só o furo da parede é radial. `grep` por `arc`/`curve` nos módulos 3D da esquadria não acha uso [V]. A planta, ao contrário, mapeia sobre o arco. | `aberturas3d.ts:71`; `openingCut.ts:14` (`cutHalfOf` compensa o desvio das faces) |

---

## 6. Quadro de esquadrias

| Item | Estado [V] | Arquivos |
|---|---|---|
| Motor | `buildOpeningSchedule(p, lang)`: uma linha por tipo e **medida efetiva** (largura, altura, peitoril da instância); instância com altura/peitoril próprios vira linha à parte com `variant`. Totais por categoria e área. | `packages/engine/src/openingSchedule.ts:326`; `OpeningScheduleRow` em `:43` |
| Colunas | Código, tipo, família, vão, altura, folha nominal, vão bruto, peitoril, folhas, quantidade, área unitária e total, material do batente, sentido, material da folha, ferragens, composição, verga/contraverga (comprimento), mais colunas opcionais: fogo, Rw, U, descrição, fabricante, custo, fator solar. | `openingSchedule.ts:43`; `openingScheduleExtras.ts:12` |
| CSV | `;`, decimal com vírgula, BOM UTF-8, unidades do projeto. | `openingSchedule.ts:393` |
| UI | Diálogo com ordenação, filtro por categoria, colunas opcionais e totais. | `apps/web/src/ui/dialogs/OpeningScheduleDialog.tsx:128` |
| Cortina | A esquadria de célula de cortina entra no quadro (ADR 0056 §7.8) [D]. | `engine/src/cortinaEsquadrias.ts` |

Limites: [V] a linha traz medidas e área do vão, mas **não traz desenho da esquadria** (sem miniatura nem elevação por tipo). [S] não achei referência a esquadria em `packages/render/src/sheet/` (inserção do quadro em prancha não localizada). [D] "Sentido no quadro de esquadrias em porta de correr/janela e a convenção 'abre para fora'" ainda pendente (`PENDENCIAS...md` §D).

---

## 7. IFC e DXF

### 7.1 IFC exportação

| Item | Estado [V] | Arquivos |
|---|---|---|
| Estrutura | `IFCOPENINGELEMENT` (vão bruto) + `IFCRELVOIDSELEMENT` à parede + `IFCDOOR`/`IFCWINDOW` + `IFCRELFILLSELEMENT`. | `packages/io/src/ifc/ifcExport.ts:199` a `:245` |
| Corpo da esquadria | **Vários sólidos extrudados retangulares num só `IFCDOOR`/`IFCWINDOW`**, cada peça com `IFCSTYLEDITEM` (cor do material, vidro transparente). Sem `parts` (contrato antigo) volta a caixa única. Pocket, peças tracejadas, verga e contraverga ficam de fora. | `ifcExport.ts:222` a `:235`; `apps/web/src/editor/ifcExport.ts:107` |
| Tipos | `IFCDOORTYPE`/`IFCWINDOWTYPE` por tipo, `OperationType`/`PartitioningType`, `IFCWINDOWPANELPROPERTIES`, `Pset_ManufacturerTypeInformation`, relação `IFCRELDEFINESBYTYPE`. | `ifcOpeningTypes.ts:23` (`doorOperation`), `:49` (`windowOperation`), `:70` (`windowPartition`), `:105` (`openingTypeEntity`) |
| Psets | `Pset_DoorCommon`/`Pset_WindowCommon` (`Reference`, `IsExternal`, `FireRating`, `ThermalTransmittance`, `AcousticRating`, `GlazingAreaFraction`, `SolarHeatGainTransmittance`). `GlazingAreaFraction` é **estimativa** (não há área medida). | `ifcOpeningTypes.ts:150`, `:86` |
| Cortina | `IFCDOOR`/`IFCWINDOW` por célula, agregado em `IFCCURTAINWALL`. | `packages/io/src/ifc/ifcCurtainWall.ts`; ADR 0056 §11 [D] |
| Não existe | `IFCDOORLININGPROPERTIES`, `IFCWINDOWLININGPROPERTIES`, `IFCDOORPANELPROPERTIES` (grep sem ocorrência no export); peças viram sólidos, não `IFCMEMBER`/`IFCPLATE` por peça. | grep em `packages/io/src` [V] |

### 7.2 IFC importação

Detalhe na tabela R17. Em resumo: `IFCDOOR`/`IFCWINDOW` são lidos por `addOpening`; hospedeiro vem de `IfcRelVoidsElement` ou por geometria (`hostByGeometry`); vão = caixa envolvente do `IFCOPENINGELEMENT`; operação do tipo vira `plan` e `flipHand`; tudo que não cabe vira `Generic` (`fallbackOpening`). Dados BIM (`FireRating` etc.) entram via `bimFieldsOf`. `packages/io/src/ifcImport/openingImport.ts:20`, `:44` a `:79`; `elementTypes.ts:95`.

### 7.3 DXF

| Item | Estado [V] | Arquivos |
|---|---|---|
| Planta | O mesmo símbolo do modelo único (nível médio, ângulo/estilo do tipo) nas camadas `ABERTURA_SIMBOLO` (corte) e `ABERTURA_ACIMA`/`ABAIXO`/`ALEM` (projeção); sem símbolo, retângulo em `ABERTURAS`. | `dxfExport.ts:135` a `:163`; `packages/io/src/dxf.ts:186` a `:195`, `:289` |
| Corte e elevação | `dxfSection.ts` recebe só `polygons` do vão (retângulo); sem V nem seta de correr no DXF (X4 do checklist) [D]. | `packages/io/src/dxfSection.ts:128` |
| Cortina | Camada `CORTINA-ESQUADRIA`. | `dxf.ts:172` |
| Importação | **O importador de DXF não cria esquadrias**: `grep` por `opening`/`porta`/`janela` em `dxfImport.ts` não acha nada; blocos viram traços (`INSERT` expandido). | `packages/io/src/dxfImport.ts:557` |

---

## 8. Diálogos, UI, cotas e snaps

### 8.1 Diálogo "Editar tipo"

[V] Árvore de componentes à esquerda, painel à direita, prévias (planta, elevação, corte, 3D). `visibleComponents(kind, familia)` mostra só o que `openingOptionSupport` permite. Componentes: Visão geral, Batente, Folha (só porta), Folhas/Divisões (`sashes`), Vidro (só janela), Exterior, Interior, Parede (acabamento, vão bruto, verga/contraverga), Planta e 3D, Dados. Mais o editor de composição (células e perfis) para tipos de 2 ou mais células.

Arquivos: `apps/web/src/ui/dialogs/openingType/` (`OpeningTypeDialog.tsx` 272 linhas, `OpeningTypeSections.tsx`, `components.ts:53` a `:73`, `panels/*.tsx`, `composition/*`, `Preview3D.tsx`, `previewViews.ts`); lógica de formulário em `apps/web/src/ui/dialogs/openingTypeForm.ts`. Biblioteca (duplicar, importar/exportar JSON, favoritos): `OpeningTypeLibrary*.tsx`.

Limite: o diálogo edita **escalares**; não há campo de forma do vão. O campo de largura é `NumField` com mínimo 0,20 m (`OverviewPanel.tsx:20`).

### 8.2 Colocação e edição

| Item | Estado [V] | Arquivos |
|---|---|---|
| Ferramenta | `OpeningTool` (porta/janela): `hostUnder` acha a parede sob o cursor (tolerância 16 px); lado do cursor define o sentido com histerese; Espaço inverte dobradiça; Tab inverte sentido; âncora; prévia com a esquadria real do tipo (cache por tipo e inversões). | `packages/tools/src/openingTool.ts`; `infer.ts:689`; `openingPlacement.ts:116`, `:122`, `:129` |
| Snaps de colocação | Início e fim da parede (± 1 cm), folga a paredes perpendiculares (`perpendicularNeighbors`, `freeSpans`), alinhamento a outras esquadrias da parede, centro do trecho. | `openingTool.ts` (`snapOffset`), `openingPlacement.ts:41`, `:84` |
| Snaps sobre esquadrias existentes | Pontos da dobradiça e da ponta do arco de giro; segmentos de ombreira como `face`. | `packages/tools/src/openingSnapPoints.ts:106` |
| Cotas temporárias | Duas cotas laterais por esquadria (parede→esquadria) com referência de parede (`WALL_DIM_REFS`) e de esquadria (`center`, `clear`, `frame`, `casing`); clicar no valor e digitar move o elemento; recusa se sair da parede, sobrepor outra esquadria ou cruzar parede perpendicular. | `packages/tools/src/dims/providers/opening.ts`; `openingExtents.ts:48` (meias-larguras a partir do modelo real) |
| Cotas automáticas | Aberturas entram na cadeia só do lado da parede que as hospeda; centro ou arestas. | ADR 0028; `engine/src/autoCotas.ts` |
| Alças | Alças de inversão (⇅ ⇄) na planta (`openingGrips.ts:27`, `apps/web/src/ui/OpeningFlipGrips.tsx`). Mover é ao longo da parede (`offset`); trocar de parede por `setOpeningHost` (`openingHost.ts:207`). | `packages/tools/src/openingGrips.ts` |
| Propriedades | Tipo, distância do início, peitoril, altura, plano (parede inclinada), inversões, marca. | `apps/web/src/ui/Properties.tsx:286` |
| Ribbon / opções | Seletor de tipo com favoritos agrupado por família; botão "Editar tipo"; quadro. | `apps/web/src/ui/OptionsBar.tsx:149`; `Ribbon.tsx` |

Limites [S]: não achei cota vertical (peitoril e altura) como cota temporária da esquadria; peitoril e altura só se editam nas Propriedades e nas alças de elevação.

### 8.3 Validações e avisos

| Código | Onde | O que checa |
|---|---|---|
| `opening-host-missing`, `opening-type-missing`, `opening-out-of-wall`, `opening-overlap` | `packages/model/src/validate.ts:116`, `:155` | Hospedeiro, tipo, cabe (centro ± largura/2 contra o comprimento do eixo), sobreposição em `t` (**não considera altura**) |
| `abertura-fora-da-parede` | `packages/engine/src/projectIssues.ts:57` | Ver achado A-1 |
| `opening-host-curtain` | `packages/model/src/wallCurtain.ts:191` | Esquadria nativa em cortina |
| `cortina-colide-abertura` | `packages/model/src/curtainHost.ts:207` | Cortina embutida sobre esquadria |
| `aberturaPlanoVerticalNoArco` | `packages/engine/src/openingPlaneIssues.ts:22` | Modo inclinado não cabe em arco |
| Verificações do tipo (largura livre ≥ 0,80, altura livre ≥ 2,10, ventilação, profundidade do batente, recuo, verga) | `packages/engine/src/openingChecks.ts:75` | Avisos não bloqueantes (NBR 9050, NBR 10821 usuais) |
| Maçaneta, altura da maçaneta | `packages/model/src/openingHardware.ts` | 0,80 a 1,10 m aviso; erro fora de 0,50 a 1,50 |

---

## 9. Parede cortina, parede inclinada e parede curva

### 9.1 Parede curva (`Wall.sag`)

| Camada | Comportamento [V] | Arquivos |
|---|---|---|
| Furo da parede | Setor radial: `openingBandRing` amostra o arco nas duas faces; profundidade `cutHalfOf` = `espessura/2 + 0,02 + desvio` (`R − √(R² − h²)`). | `openingCut.ts:14`, `:28` |
| Planta | Traços mapeados sobre o arco; folha de giro por âncora rígida (escala pela corda). | `openingPreview.ts:50` a `:121` |
| 3D | **Esquadria reta (tangente)** sobre parede curva; só o furo é curvo. | `aberturas3d.ts:71` |
| Retorno | Mesma geometria radial do furo. | `openingCurva.test.ts:8` (comentário do teste) |
| Limite | O ADR 0010/`paredes.md` C13 declara junção de arco só para raio ≥ 3 m e quina de 60 a 120 graus; fora, "melhor esforço" [D]. Para esquadria em arco o modo inclinado só vale com `w² ≤ 0,4·R` (`ARC_PLANE_RATIO`, `openingTilt.ts:11`). | |
| Posição | `offset` é comprimento de arco; `validate.ts:138` e `projectIssues.ts:64` usam `dist(a,b)` (corda), não o comprimento de arco [V]. Em parede curva a validação de "cabe na parede" usa a corda. | achado A-1 |

### 9.2 Parede inclinada (`Wall.tilt`, até ±60 graus)

| Camada | Comportamento [V] | Arquivos |
|---|---|---|
| Plano do vão | `Opening.plano`: `'inclinado'` (corta perpendicular às faces, padrão) ou `'vertical'` (caixilho em prumo ancorado na face). | `openingPlane.ts:10`; `commands.ts:544` (`setOpeningPlane`) |
| Geometria | `openingTiltGeom` calcula topo, deslocamento do plano, volume retirado, referencial do caixilho e recuo. | `engine/openingTilt.ts:53` |
| Furo | `tiltCutZ` remapeia os vértices do furo (peitoril e topo). | `openingCut.ts:45`; `openingTilt.ts:112` |
| 3D, corte | Referencial inclinado e `tiltFrame`. | `referencialInclinado3d.ts`; `section.ts:403` |
| Limites [D] | Tilt não coexiste com `topProfile` até a fase 3 (`types.ts:446`); modo `inclinado` em arco só com `w² ≤ 0,4·R`; aviso `aberturaPlanoVerticalNoArco`. |

### 9.3 Parede cortina

[V] existem: `Wall.curtain`, `OpeningCellOverride`, `cortinaEsquadrias.ts` (esquadria virtual por célula), ferramenta `curtainOpeningTool.ts`, comandos `curtainOpeningCommands.ts`, esquadria no 3D, planta e clique (commit `83e98be`), contrato do kernel v17 com seções 112 e 113 (commit `b1354ff`), IFC e DXF.
[D] regras: o **montante é o batente** nos lados em que existe (opção `keepOpeningFrame`); folga da folha de 4 mm; "Preencher célula" (esquadria assume a luz da célula) ou "Ajustar grade à porta" (cria linhas de grade); região fundida tem de ser retângulo; cortina inclinada e superfície livre ficam fora (§13).
**Divergência de documentação:** o cabeçalho do ADR 0056 ainda diz "fase 0 implementada" (`0056-parede-cortina.md:3`) enquanto o `git log` mostra a esquadria virtual e o contrato da fase 5 [V: `git log --oneline -- packages/engine/src/cortinaEsquadrias.ts`]. Usei o código, não o cabeçalho, como referência de estado. `keepOpeningFrame` **não foi encontrado** em nenhum `.ts` (`grep -rn keepOpeningFrame packages` vazio) [V], embora o ADR §14.3 o dê como implementado na fase 5: [S] a opção ainda não existe.

### 9.4 Parede com perfil superior (`topProfile`, empena)

[S] Não verifiquei como a esquadria interage com o topo poligonal da parede. O 3D limita a altura do vão a `H − sill` onde `H` é a altura passada pela cena (`aberturas3d.ts:44`); não li se `H` considera o perfil. Merece um teste (esquadria perto de empena) antes de qualquer estudo de vão com topo inclinado ou curvo.

---

## 10. Achados e inconsistências

| ID | Achado | Evidência | Gravidade [S] |
|---|---|---|---|
| A-1 | **`offset` tem duas leituras.** O modelo diz "distância do centro da abertura ao início" (`openingTypes.ts:160`, comentário do campo `offset`) e `openingGeometry` usa `pointAt(f, o.offset, ...)` como centro (`resolve.ts:239`); `validate.ts:139` e `openingHost.ts:16` (corpo) usam centro ± metade. Mas `projectIssues.openingOutside` calcula `end = e.offset + type.width` e testa `e.offset >= 0` como se `offset` fosse a borda inicial (`projectIssues.ts:65`), e os templates comentam "8,5 + 1,5 = 10,0: no limite do eixo" (`templates.ts:88`, `:124`). Além disso usa `dist(host.a, host.b)` (corda) mesmo em parede curva. | leitura direta | Média: aviso `abertura-fora-da-parede` incorreto (falso positivo/negativo); templates foram escritos pela convenção errada. |
| A-2 | **O vão bruto cresce só para cima na parede, mas é centralizado no IFC.** O furo da parede vai de `sill` a `sill + roughHeight` (`resolve.ts:293`, `:341`), com a esquadria começando em `sill`. No IFC `roughBottomZ = sillZ − (roughHeight − height)/2` (`apps/web/src/editor/ifcExport.ts:143`). A folga de altura fica toda acima da esquadria no Hestia, mas dividida em cima e embaixo no IFC. | leitura direta | Baixa a média: só afeta quem usa `roughOversize.h`. |
| A-3 | **Pendência desatualizada: "IFC: cada vão sai como caixa única".** O exportador escreve cada peça do modelo como sólido separado dentro de um só `IFCDOOR`/`IFCWINDOW` (`ifcExport.ts:222` a `:235`; caixa única só como fallback sem `parts`). Continua verdade que não há `IfcMember`/`IfcPlate` por peça nem `IfcWindowLiningProperties`. | `docs/PENDENCIAS-2026-10-28-cotas-padroes-esquadrias.md` §D × código | Informativa. |
| A-4 | **Contagem do catálogo desatualizada em `F-PROGRESSO.md`** ("24 tipos, 130 no total"); o código tem 154. | `defaults.ts:188` | Informativa. |
| A-5 | **Largura da instância não é editável.** Para fazer "uma janela de 1,35 m" é preciso criar tipo; no quadro isso aparece como tipos distintos. Em Revit e ArchiCAD a largura é de tipo, com overrides por instância em famílias paramétricas. | `openingTypes.ts:155`; `Properties.tsx:337` | Escolha de projeto, não bug. |
| A-6 | **Sobreposição de esquadrias na validação só olha `t`** (`validate.ts:155` a `:180`): uma janela sobre uma porta é "sobreposta" mesmo com alturas disjuntas (porta 0 a 2,10; janela de bandeira a 2,10). A ferramenta de colocação já considera a altura (`infer.ts:708`, parâmetro `vertical`). | leitura direta | Baixa. |
| A-7 | **`keepOpeningFrame` previsto no ADR 0056 não existe no código** (`grep` vazio). | seção 9.3 | Baixa, só se a cortina for relevante. |

Itens abertos que a própria documentação lista e que continuam relevantes para um estudo de formas [D]: validar o alizar no 3D com o dono; IFC com membros por peça; bay, bow e janela de canto; vidro (rebaixo, folga e baguete são estimativas "a validar"); aço e catálogos de fabricantes sem pesquisa; NBR 10821 e 7199 não lidas; ids de célula com hífen podem colidir com ids internos da folha; baselines visuais não regravadas.

---

## 11. Lista de arquivos-chave (para consulta rápida)

**Modelo:** `packages/model/src/openingTypes.ts` (tipos), `opening.ts` (famílias e regras), `openingSupport.ts` (tabela família × opção), `openingStyle.ts` (getters com padrão), `openingExtras.ts` (acabamento e bruto), `openingNominal.ts` (vão nominal), `openingHardware.ts`, `openingReveal.ts`, `openingComposition*.ts` (composição), `openingProfiles.ts`, `catalogoPortas.ts`, `catalogoJanelas.ts`, `catalogoComposicoes.ts`, `catalogoAberturasBase.ts`, `defaults.ts:188`, `openingTypeLibrary.ts`, `openingHost.ts`, `curtainOpening*.ts`, `validate.ts:116`.

**Motor:** `packages/engine/src/resolve.ts:230` (geometria), `openingCut.ts` (furo), `openingModel*.ts` (peças: `Context`, `Doors`, `DoorsNew`, `Windows`, `WindowsNew`, `Details`, `Casing`, `Cells`, `Composition`, `Handles`, `Transforms`, `Types`), `openingPlan.ts` + `openingPlanNew.ts` (planta), `openingLines.ts` (V e seta), `openingPreview.ts`, `openingTilt.ts`, `openingExtents.ts` (cotas), `openingSchedule.ts` + `openingScheduleExtras.ts` (quadro), `openingChecks.ts`, `section.ts:391` (corte e elevação), `wrap.ts` (retorno), `kernelA3.ts`, `cortinaEsquadrias.ts`. **Rust:** `crates/geom-wasm/src/a3.rs`, `a3b.rs`, `a3c.rs`, `a3d.rs`, `cortina_porta.rs`.

**Render:** `packages/render/src/plan/build.ts:176` e `symbols.ts`, `plan/view.ts:211`, `section/build.ts:196`, `section/handles.ts`, `model3d/aberturas3d.ts`, `model3d/openingParts.ts`, `model3d/referencialInclinado3d.ts`.

**I/O:** `packages/io/src/ifc/ifcExport.ts:199`, `ifcOpeningTypes.ts`, `ifcImport/openingImport.ts`, `ifcImport/elementTypes.ts:95`, `dxf.ts`, `apps/web/src/editor/dxfExport.ts:135`, `apps/web/src/editor/ifcExport.ts:107`.

**Ferramentas e UI:** `packages/tools/src/openingTool.ts`, `openingPlacement.ts`, `openingSnapPoints.ts`, `openingGrips.ts`, `dims/providers/opening.ts`; `apps/web/src/ui/dialogs/openingType/*`, `OpeningScheduleDialog.tsx`, `Properties.tsx:286`, `OptionsBar.tsx:149`, `OpeningFlipGrips.tsx`.

**Documentos lidos:** `docs/aberturas/B-estado-atual.md`, `F-PROGRESSO.md`, `HANDOFF-ESQUADRIAS-v3-2026-10-27.md` (e inventário de `docs/aberturas/`); `docs/PENDENCIAS-2026-10-28-cotas-padroes-esquadrias.md`; `docs/decisoes/0017`, `0024`, `0034`, `0035-esquadrias-v3`, `0056`; `docs/paridade/aberturas.md` e `paredes.md`. Lidos em parte (por trechos e `grep`): `0056` (833 linhas), `B-estado-atual.md`. **Não lidos:** `A-pesquisa.md`, `C-representacao-tecnica.md`, `D-editor...`, `E-spec-modelo-unico.md`, `E3`, `F1-spec-composicao.md`, `archicad/`, `pesquisa-f0/`, `relatorios-v2/`.

---

## 12. O que eu NÃO verifiquei (para não virar fato)

- Nenhum teste foi executado; o estado verde/vermelho da suíte é desconhecido para mim.
- Nenhuma tela foi aberta: o desenho real em planta, corte, elevação e 3D não foi visto.
- Interação da esquadria com `topProfile` (empena) e com paredes de base inclinada (`bottomProfile`).
- Linha de seção oblíqua à parede (heurística `faceOn`).
- Desempenho (orçamento de draw calls, cache do modelo de peças).
- Formato do arquivo `.hestia` (migração, `SCHEMA_VERSION` 28) além de confirmar que campos novos de tipo são opcionais.
- Inserção do quadro de esquadrias em pranchas (`render/sheet`): não achei referência, mas não rastreei o módulo de pranchas do app.
- Comportamento em outros idiomas (i18n sete idiomas): fora do escopo.
