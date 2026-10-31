# 07 · Status da versão de teste

Estado em 2026-10-31, conferido no código, nos testes e nos documentos de decisão desta árvore (esquema 19). Os
checklists de [docs/paridade](paridade/) são a fonte por elemento; `docs/paridade/ORDEM.json` registra o portão, e os
nove elementos estão `concluido` e em 100% (`npm run parity`). Os itens que sobram são não bloqueantes (ver
"Pendências"). A revisão de 2026-10-30 acrescenta visibilidade por vista, prewarm da 3D e CAD importado; os números de
teste citados abaixo continuam os das rodadas de 2026-10-22/23.

## O que está pronto

**Fundação**
- Monorepo npm workspaces com CI (lint, tipos, testes, build); fronteiras entre camadas por `scripts/check-boundaries.mjs`;
  limite de 420 linhas por arquivo (ESLint `max-lines`, sem linhas em branco nem comentários; testes fora).
- Modelo versionado (`SCHEMA_VERSION` 19) com desfazer/refazer e migrações v15→v16 (caracol), v16→v17 (ambientes),
  v17→v18 (forros) e v18→v19 (contorno associativo). Ida e volta de arquivo em `esquema.test.ts`. Autosave e `.hestia.json`.

**Paredes** — 68 feitos, 15 fora de escopo, 0 pendentes (`docs/paridade/paredes.md`). E3 (junção com piso e laje) fechado em 2026-10-23.
- Reta, em arco e por retângulo; alturas, deslocamentos de base e topo; linha de localização (6 opções).
- Camadas com função, material, espessura, prioridade e "envolve"; membranas de espessura zero; faixas verticais; perfil superior.
- Junções L/T/X por prioridade, com encosto, esquadria, cortes oblíquos de 30° a 150° e paredes empilhadas. Arco no
  domínio suportado (raio ≥ 3 m, quina de 60° a 120°); fora dele vale CV-2.
- Aberturas hospedadas com recorte em todas as camadas; ferramentas de edição (mover, copiar, aparar, dividir, juntar,
  medir, anexar topo ao telhado etc.); planta, corte, 3D, DXF, tabela com CSV e painel de avisos.
- Parede anexada a piso ou laje por trecho, com perfil de base (0023 P9).

**Pisos** — 42 feitos, 7 fora de escopo, 0 pendentes (`docs/paridade/pisos.md`). C6 (junção com parede) fechado em 2026-10-23.
- Contorno por cliques, retângulo, medida, seleção de paredes ou área fechada; furos; edição por alças.
- Contorno associativo às paredes (0023 P1–P3): "Desvincular" e "Revincular às paredes"; avisos de contorno aberto e duplicado.
- Tipo em camadas com seção ao vivo; tipo `ft_acab` sobre laje (P5); quantitativos líquidos por camada; membrana de
  espessura zero (P4); "Término na junção" por camada (P8) e piso único com término de cada camada contra as paredes
  (face, núcleo, passa, até prioridade N, cm; 0025 P10; tipos `ft_unico` e `ls_unica`).
- Planta com hachura, 3D por camada, corte, subpavimento, etiqueta, DXF, quantitativos e tabela com CSV.

**Lajes** — 40 feitos, 3 fora de escopo, 0 pendentes (`docs/paridade/lajes.md`). C8 (junção com parede) fechado em 2026-10-23.
- Contorno por cliques, retângulo, medida, automático pelo perímetro ou por área fechada; furos; mesmo vínculo, membrana
  e término dos pisos. Inclinação por linha e percentual; parede anexada à laje.
- Planta, 3D com inclinação e furos, corte com hachura por camada, DXF, quantitativos e tabela com CSV.
- Junção piso/laje × parede (0023, fechada em 2026-10-23): prioridade efetiva e regra B no corte, no 3D e nos quantitativos.
  Parede que atravessa o nível é cortada pela laje do pavimento de cima (F1b) e a junção entre níveis vale só entre parede
  e piso/laje. A planta não recorta a parede na altura de corte padrão (decisão de escopo, F2). Lajes com caimento ficam
  de fora da junção (ver pendências).
- **Revisão 2026-10-22 (correções aplicadas e verificadas)**: no término por camada, a faixa de cota
  para escolher as paredes passou a ser a de cada camada (`floors.ts`/`slabs.ts`; 0025 §2), e camada com término
  explícito não recorta parede nem é recortada por ela — sem corte mútuo (0025 §5). O `passa` vinculado ancora a
  união das paredes no elemento, não na camada. Na seleção de cortes/elevações, o realce é por origem
  (`highlightOps`, `packages/render/src/section/build.ts`).
- **Revisão 2026-10-23 (duas correções na borda da laje):** (1) o topo da parede anexada ao piso ou à laje passou a ser
  decidido pelas camadas **sem** regra de término — antes a cota saía das camadas que a própria parede recorta, e o topo
  ficava em dois níveis no mesmo eixo (2,91/2,93 m na casa de alto padrão, com fresta de 2 cm acima de aberturas);
  (2) campo novo por camada, **limite no perímetro externo** (decisão 0027), para a laje ir só até a face externa da
  parede ou até a face externa do núcleo, deixando o acabamento externo contínuo por fora dela. Evidência:
  `packages/engine/src/wallAttachTermino.test.ts`, `limiteExterno.test.ts`, `apps/web/src/ui/dialogs/terminoForm.test.ts`.

**Telhados** — 43 feitos, 1 fora de escopo, 0 pendentes (`docs/paridade/telhados.md`).
- Formas uma, duas e quatro águas, contorno qualquer e extrusão de perfil; cumeeira, espigões e rincões; furos; beiral.
- Topo da parede ajustado ao telhado; planta com águas e setas, 3D, corte, planta de cobertura, DXF, quantitativos e CSV.

**Escadas (inclui caracol)** — 40 feitos, 4 fora de escopo, 0 pendentes (`docs/paridade/escadas.md`).
- Croqui de lance com patamar, "Pegar linhas" e validação com as mensagens do Revit.
- Geradores reto, L, U, leque e caracol (até duas voltas, varredura ≤ 4π, decisão 0014), com dois estilos de caracol.
- Tipos de escada com seção ao vivo; corpo monolítico; furo derivado por laje/piso; avisos de norma e folga de cabeça.
- Planta com numeração contínua, 3D, corte, DXF, quantitativos e tabela com CSV.
- Nível de topo por id; editar a cota do nível reajusta os espelhos no modo automático em uma transação e informa, e a escada inválida continua visível/selecionável (decisão 0041).

**Rampas**
- Ferramenta Rampa com formas reta, L, U e livre, modo por comprimento ou inclinação, patamares e chegada.
- Tipo com norma editável (NBR 9050, ADA ou personalizada), largura, inclinação e desnível; avisos do modo ao vivo.
- Representação em planta, corte, 3D e DXF; mover/copiar/colar, seleção e alças de vértices.
- Nível de topo por id; mudar o nível regenera o comprimento no modo inclinação e, no modo comprimento, mantém a rampa com o aviso `ramp-slope-differs` (decisão 0041; `docs/paridade/rampas.md`).

**Aberturas por família** — 35 feitos, 7 fora de escopo, 0 pendentes (`docs/paridade/aberturas.md`; decisão 0017).
- Dez famílias em `OPENING_FAMILIES`: portas giro, dupla, correr, pivotante e vão livre; janelas fixa, basculante,
  maxim-ar, correr (2 ou 3 folhas) e vão livre. Combinação fora das famílias é recusada.
- Basculante: a família existe, mas por decisão do dono (2026-10-22, 0017 §11) nenhum dos 14 tipos padrão a usa, e não
  há janela de giro vertical nova.
- **Acabamento por tipo** (seção "Acabamento" da tela de editar tipo): folga do vão bruto (`roughOversize`), alizar
  (`casing`), soleira saliente só de janela (`sillBoard`), verga e contraverga com transpasse (`lintel`, `sillBeam`).
  Sem o campo, nada é desenhado. Aparecem no 3D e no corte; na planta, verga e peitoril ainda não (P13).
- Favoritos no seletor (`favoriteOpeningTypes`, desfazível).
- Giro em elevação e X de furo (0024): o giro é o símbolo em "V" (vértice no lado da dobradiça, a meia altura; pontas no lado do
  trinco; decisão 0024 §2), tracejado quando a folha abre para o observador e contínuo quando abre para o lado oposto; o vão livre de parede
  não leva X (planta: parede interrompida e duas linhas tracejadas nas faces; corte e elevação: contorno; 0024 §3); o X de furo de piso/laje segue o Shaft Opening
  do Revit.
- 3D por família; folha aberta com "Abrir vãos" (vidro, giro, correr e pivotante corrigidos, 0017 §11).
- Instância com lado da dobradiça, sentido de abertura e marca; "Tabela de portas e janelas" com CSV.

**Ambientes** - 33 feitos, 3 fora de escopo, 0 pendentes (`docs/paridade/ambientes.md`; decisões 0018 e 0037).
- Contorno derivado do circuito fechado pelas paredes do nível; ferramenta **Ambiente** (**Z**) e "Ambientes em todos os
  circuitos fechados"; área líquida, perímetro e volume; tabela com filtros e CSV; DXF nas camadas `AMBIENTES` e `AMBIENTES_TEXTO`.
- **Plantas de área** (0037): vista própria por pavimento, diagonais de referência, rótulo compartilhado com todas as vistas
  (posição, rotação e chamada), sem cor por padrão, esquema de cores com legenda, quadro e prancha geral.

**Forros e planta de forro** — 33 feitos, 0 fora de escopo, 0 pendentes (`docs/paridade/forros.md`; decisão 0021).
- Forro por contorno, retângulo ou "No ambiente"; botão **"Forro em todos os ambientes"** (um Ctrl+Z); cota do topo
  (padrão 2,60 m); tipos em camadas (gesso 12,5 mm, PVC, laje aparente).
- **Planta de forro** em "Direção da vista → Para cima"; 3D, corte, quantitativos por camada, tabela e CSV; DXF na camada `FORRO`.

**Pranchas e PDF** — 34 feitos, 2 fora de escopo, 0 pendentes (`docs/paridade/pranchas.md`); editor de layout na
decisão 0039 e 3D vetorial na 0040.
- Prancha A0–A4 com margem, carimbo (com disciplina e tabela de revisões) e logo reservado; vistas de planta, corte ou
  3D (o 3D não tem escala); **3D vetorial** na prancha, com pontos de vista salvos, linhas ocultas por raio no BVH da
  própria cena e
  legenda "Sem escala" (0040).
- **Editor de layout** (0039): zoom no cursor e pan (roda/botão do meio/Espaço), redimensionar o recorte com 8 alças,
  pan do conteúdo (Alt), recorte e moldura ligáveis, legenda por vista, travar vista, encaixe e guias, alinhar/distribuir,
  setas (1/10 mm), Delete, Z/G/0. Câmera por prancha na sessão.
- **Mover na prancha** (0039): escolher a vista pela moldura ou por um ponto do desenho, ponto base → destino, captura de
  pontos, cota e distância digitada. Com prancha aberta a faixa fica contextual (só Selecionar, Mover e Alinhar).
- **Alinhar na prancha** (0039): referência → alvo reaproveitando a captura do Alinhar do modelo (faces, eixos, ombreiras,
  arestas) + moldura + folha; Ctrl+clique, Tab, Esc; move só a vista. Âncora do conteúdo: redimensionar recorta sem
  mover o desenho e o arraste grava o ponto do ponteiro.
- **Inserção e numeração**: arrastar a vista do Navegador para a prancha (prévia com escala, estilo Revit), adicionar
  várias vistas com escala automática, prancha por nível, renumerar em lote,
  reordenar e emitir revisão.
- **Exportar PDF**: PDF 1.4 vetorial sem dependências, uma página por prancha; **Publicar** escolhe pranchas, ordem e
  um arquivo por prancha (`tests/e2e/prancha-editor.mjs`).

**Anotações** — cota (**Y**, com referência à parede) e texto (**X**), na planta e no DXF (camadas `COTAS` e `TEXTOS`).
Cotas automáticas do nível ativo pelo botão **Cotas auto** (0028): diálogo de critérios (o que cotar, referência da parede
e lados); camadas aberturas → paredes → contorno → total, só nos lados que têm parede paralela. Marcas de corte e
elevação são anotações de primeira classe (0030): número, título, rótulo, aparência, referências de parede e papel
estável das elevações; seleção, propriedades, mover/copiar/girar/espelhar, prancha e DXF (`CORTES`/`ELEVACOES`) usam a
mesma geometria em mm de papel. Etiquetas de parede, rótulos de ambiente e rótulos de escada também usam fonte em
mm de papel (e as etiquetas de parede seguem a visibilidade da categoria `anotação`).
- **Edição no corte/elevação**: Medir, Cota, Texto, Detalhe, Etiqueta, Nível, Alinhar e Mover trabalham na própria
  vista, em coordenadas `(t,z)`, sem voltar à planta. Cotas/textos/detalhes pertencem à vista; peitoril e altura do vão
  aceitam exceção por instância; alças verticais editam o vão; mover parede acompanha as aberturas. O comando **Nível
  (LL)** cria o nível e as extensões da linha no mesmo Ctrl+Z (`tests/e2e/corte-editavel.mjs`).
- **Grades/eixos**: criação, seleção, alças, mover/copiar, captura e painel de propriedades; entram na planta e no IFC
  de entrada/saída quando o arquivo traz `IfcGrid`.

**Avisos do projeto** (0029): o painel soma aos avisos do modelo três leituras da geometria resolvida —
`abertura-fora-da-parede` (offset + largura passa do eixo), `parede-topo-desnivelado` (paredes colineares do mesmo
nível com topos diferentes) e `parede-dentro-da-laje` (parede cruzando camada de laje com término `passa`).

**Vistas, gráficos e seleção**
- **Planta** por nível com intervalo de vista, direção para cima ou para baixo, subpavimento e projeção da cobertura (0013).
- **Cortes e elevações**: corte por dois cliques; as quatro elevações em um passo; linha oculta; seleção e realce (0016).
  A marca tem número, título, rótulo, estilo e referências de parede (0030), com geometria em mm de papel na tela, na
  prancha e no DXF.
- **3D** orbital com plano próximo dinâmico, sombras, sol e estilos (0015); seleção por clique com BVH (`triBvh.ts`);
  ViewCube com 26 zonas e alternância entre perspectiva e ortográfica.
- **Gráficos de vista** (0015): escala, detalhe, estilo e substituições por categoria; pesos de linha reais nas pranchas,
  PDF e DXF (código 370). **Linhas finas** vêm ligadas por padrão em todo projeto e valem só na tela (botão na aba
  Vista; desabilitado no 3D e na prancha); o usuário desliga na vista quando quiser.
- **IFC (entrada)**: **Arquivo → Importar IFC…** abre IFC4/IFC2X3 e monta um projeto editável. O mapeamento cobre
  `IfcBuildingStorey`, `IfcWall`, `IfcDoor`, `IfcWindow`, `IfcSlab` (piso/laje), `IfcCovering` de forro, `IfcSpace` e
  `IfcGrid`; objetos sem classe nativa entram como geometria genérica quando têm representação. A leitura roda no
  `ifcWorker` e devolve o relatório do que entrou, do que ficou aproximado e do que foi ignorado
  (`apps/web/src/editor/ifcImport.ts`, `packages/io/src/ifcImport/`).
- **IFC4 (exportação)**: **Exportar IFC** com IfcSite, IfcBuilding, IfcBuildingStorey, IfcWall, IfcDoor, IfcWindow,
  IfcOpeningElement (com relações de vazio e preenchimento), IfcSlab, IfcRoof, IfcStair, IfcStairFlight e camadas de
  material. Não exporta IfcSpace nem IfcCovering.
- **Entrega de arquivos** (`entregarArquivo.ts`): capability `downloads` do artefato; sem ela ou recusada, `<a download>`;
  se também falhar, o texto vai para a área de transferência. Nome sem acento (`nomeArquivo.ts`). Pelo código, DXF e IFC
  caem nessa cadeia dentro do link; a lista de extensões aceitas pela plataforma não foi conferida.
- **GPU/CPU**: WebGL2 por padrão; WebGPU com `?gpu=webgpu`; planta em CPU com `?cpu=1`.
- **Visibilidade por vista** (estilo Revit): **Ocultar na vista** permanente, com desfazer, em planta, planta de área,
  planta de cobertura, corte/elevação e 3D. O alvo fica no modelo (`level.hidden`, `level.roofHidden`,
  `areaPlan.hidden`, `view.hidden` e `view3d.hidden`; `viewHiddenCommands.ts`). Ocultação e isolamento temporários por
  elemento ou categoria (**HH/HC/HI/IC**), restauração (**HR**) e **Revelar elementos ocultos** (**RH**) com contorno
  azul; reexibir seleção/categoria (**EU/VU**) e reexibir tudo na vista. Menu de contexto (Ocultar na vista →
  Elementos/Categoria, Isolar temporariamente, Reexibir) e barra de controle da vista com os mesmos controles. Atalhos
  configuráveis (HH, HR, EH, RH etc.) na tela **Atalhos de teclado**, com perfis Revit (padrão) e Simples, importar e
  exportar. O estado temporário é por vista e não é gravado no arquivo do projeto.
- **Prewarm da 3D**: ao abrir o projeto, a resolução dos níveis ainda não prontos é agendada em tempo ocioso, sem as
  junções (`preaquecerNiveis`, `fluxoEdicao.ts`). Se ela termina antes da primeira abertura do 3D, a montagem aplica
  todos os níveis num único `update` e o primeiro quadro já vem completo (`montagem3dProgressiva.ts`); se faltar algum,
  a montagem progressiva por fatias continua valendo. Depois da primeira montagem, uma edição refaz só o nível editado
  e os vizinhos por cota.

**CAD importado (DXF)** — desenho de referência por nível, integrado à seleção, ao Navegador e à captura (revisão de
2026-10-30).
- Importação DXF (`apps/web/src/editor/cadImport.ts`, `packages/io/src/dxfImport.ts`): traços e textos em metros,
  camadas com cor ACI, unidade do `$INSUNITS` e `offsetZ`; o desenho é um objeto só (`CadDrawing`) e entra no desfazer.
  Sai na planta e no 3D (os traços; os textos ficam fora do 3D) e no DXF com camadas `CAD_<DESENHO>_<CAMADA>`.
- **Seleção e gerenciador**: clique na linha e seleção por janela na planta, mover/girar/espelhar com os demais
  elementos, Enquadrar/Excluir nas Propriedades; diálogo **Gerenciar CAD** (nome, nível, visibilidade e conteúdo) e nó
  **CAD importado** no Navegador com mostrar/ocultar, selecionar, enquadrar e excluir (`cadActions.ts`,
  `ManageCadDialog.tsx`). "Gerenciar links" segue desativado: no Revit ele é para CAD vinculado, não importado.
- **Captura nas linhas e vértices** (`packages/tools/src/snapCad.ts`): extremidade, ponto médio, ponto sobre a linha,
  perpendicular e cruzamento entre traços, com índice espacial de 1 m por desenho e a opção `cad` no Snap, ligada por
  padrão.

## O que ainda não existe

- **Interoperabilidade e nuvem**: mapeamento nativo completo de todas as classes IFC (telhados, escadas e rampas
  podem entrar como geometria genérica), importador do Hestia 1 (J3), nuvem e link de compartilhamento (Fase 8). O CAD
  importado é DXF e entra como referência por nível; não há DWG nem CAD vinculado (link), e o desenho não vira elemento
  BIM.
- **Guarda-corpo e corrimão** (escadas C4, decisão do dono de 2026-10-21); **escada de vários andares** (C6).
- **Pilares, vigas, sapatas e cortina de vidro**: o modelo não tem esses elementos.
- **Aberturas**: vão em arco e formas não retangulares (0017 §8); verga e peitoril na planta quando o corte passa por
  eles (P13); janela de giro como família (P14); tipo basculante no catálogo; X no DXF de corte (X4) e X dos furos de
  piso/laje no DXF de planta (X5); porta pivotante com eixo provisório a W/4 (0024 §7). P13, X4 e X5 estão `[-]` por
  limite de escopo e não estão feitos.
- **Símbolo de giro**: em "V" (convenção própria: a NBR 6492:2021 é paga e não foi acessada; 0024 §2).
- **Junções**: "Inverter corte/Não cortar" por par (P-4, adiada; 0023 §13 e P10).
- **Ambientes**: sem geometria 3D própria (D2); sem piso de acabamento gerado (C3). A linha separadora (A5) está implementada.
- **Forros**: o forro criado a partir de ambiente acompanha o contorno dele (0021 §4; decisão P-5 de 2026-10-22, 0023 §13),
  implementada: soltar (alça, propriedade ou mover) e revincular ao ambiente no painel "Contorno".
- **Pranchas**: carimbo com logotipo e campos personalizados, modelos (E1); quantitativos na prancha (E2). No 3D
  vetorial da prancha faltam hachura, sombreado e transparência; as linhas ocultas são omitidas (não tracejadas), a
  espessura é única (0,18 mm), a amostragem de 0,35 mm pode perder oclusores finos, não há escala métrica e o pan do
  conteúdo não desloca o 3D (0040 §6–7).
- **Paredes**: parede inclinada (A6), espessura variável (A9), contorno vertical livre (A10), regiões gráficas na elevação
  (B9), cotas associativas de parede (H5).
- **Telhados**: seta de inclinação e águas livres na tela (A5, fora da v1); mansarda automática (v2).
- **Limites conhecidos**: CV-2 e CV-3; seleção em corte unido por material pode apontar o vizinho do mesmo material; sem
  seleção por janela no 3D; intervalo de vista por nível, não por vista.
- **Visibilidade**: "Ocultar na vista → Por filtro" ainda não existe (o submenu mostra Elementos e Categoria); a
  ocultação permanente vale nas vistas de modelo, não na prancha; a temporária é por vista e não é gravada no arquivo.
- **Modelos de exemplo no app**: o diálogo **Novo** mostra só Em branco, Abrir projeto e o último projeto salvo no
  navegador; os modelos de exemplo/teste saíram da UI. A Casa de alto padrão continua como fixture de teste
  (`packages/model/src/templateCasaAltoPadrao.ts`, `packages/engine/src/casaAltoPadrao.test.ts`) e o site publica um
  `.hestia.json` para download.
- **Checklists desatualizados**: `aberturas.md` C3 e C4 estão `[-]`, mas os campos existem no tipo e na tela; `escadas.md`
  C7, `paredes.md` J1 e `pisos.md` E5 marcam IFC como fora de escopo, mas a exportação IFC4 existe.

## Correções recentes (2026-10-30)

- **Cliques no canvas**: o `pointerdown` é adiado até a vista existir (máximo de 30 quadros, sem duplicar); a cota
  dinâmica somente leitura não captura mais o clique; o fantasma da prévia é indexado pela instância da ferramenta e só
  aparece para cota acionável; o limiar de arraste passou de 3 para 6 px; Espaço é resetado em blur e
  `visibilitychange`; `pointercancel` cancela sem clique fantasma. `suppressNextClick` e `tagDrag` zeram em
  activate/setTool/setView/load/Esc, e o editor de cota do nível fecha sem aplicar fora da vista, do nível ou do
  projeto de origem. As alças de abertura só respondem ao botão esquerdo (meio = pan, direito = menu) e o ViewCube não
  engole mais as margens transparentes.
- **Diálogo Novo**: mostra apenas **Em branco**, **Abrir projeto** e o último projeto salvo no navegador; os modelos de
  exemplo/teste saíram da UI.
- Evidências: `tests/e2e/cliques-perdidos.mjs` (6 cenários), `rotuloArraste.test.ts`, `cliqueAdiado.test.ts`,
  `planGestosLimiar.test.ts`, `dimsHit.test.ts`, `nivelCotaEditorContexto.test.ts`, `OpeningFlipGrips.test.ts` e
  `viewcubePonteiro.test.ts`; `tests/e2e/flow.mjs` foi atualizado para o menu Arquivo, os treeitems e a tolerância de
  1 cm.

## Pendências não bloqueantes

- **Junção com piso e laje (fechada em 2026-10-23, 0023):** corte e 3D seguem a regra B (hierarquia, como Revit e
  ArchiCAD), parede que atravessa o nível é cortada pela laje do pavimento de cima (F1b), a junção entre níveis vale só
  entre parede e piso/laje, e a planta não recorta a parede na altura de corte padrão (F2, decisão de escopo). Restam, sem
  bloquear: o caso raro de plano de corte dentro da zona de sobreposição na planta (F2), lajes com caimento fora da junção
  (decisão pendente), o desempenho com muitos níveis (item 1b) e a decisão do item 14 (`auto` no perímetro), já fechada
  pelo dono: fica na face de acabamento, e a estrutura vai ao núcleo só quando a camada pede `nucleo`.
- **Recorte da parede** (E3, C6 e C8, feito na P7c parte 2 e em F1–F4): o corte, a elevação e o 3D usam as mesmas partes da
  junção que os quantitativos, e o desenhado coincide com o quantificado (`desenhoQuantitativo.test.ts`). Ficam de fora, sem
  bloquear: camada com topo ou base inclinados (perfil P9; a faixa inclinada não se recorta por aproximação plana) e parede
  curva (entra só pelo polígono).
- **Término na junção** (0023 P8 e F6, 0025 P10): o término por camada vale no interior e no perímetro externo; falta cor e
  hachura por camada na planta (decisão de escopo da F7.2) e o IFC por camada (`IfcMaterialLayerSet`/`IfcCovering`, item 15
  de 0023 §6.2). O DXF de piso e laje já sai com a região resolvida (F7.1).
- **Piso + laje no mesmo nível, sobrepostos** (decisão pendente do dono, Revisão 2026-10-22): com, por exemplo,
  `ft_acab` + `ls_mac12` no mesmo nível, o piso perde todas as camadas e some. A regra piso × laje não foi alterada
  pelas correções de 2026-10-22; o aviso `slab-floor-overlap` sinaliza o caso. Relacionado: "Inverter corte/Não
  cortar" por par (P-4) seguem adiados (0023 §13).
- **Canto reentrante de um L** (achado do P8, não corrigido): o circuito de paredes deixa um quadrado d × d sem parede
  (d = meia espessura) que entra no cômodo. A área do L em `layerOutline.test.ts` inclui esse quadrado de propósito.
- **Close-ups 3D do L** (`tests/e2e/escadas-closeup.mjs`): tolerância própria de 1,5% (d) e 25% (f), porque o WebGL por
  software rasteriza sombras de outro jeito.

## Roteiro de teste manual (cerca de 15 minutos)

1. `npm run dev`; em **Novo**, escolha **Abrir projeto** e abra um `.hestia.json` de exemplo (o site publica um; a Casa
   de alto padrão é fixture em `packages/model/src/templateCasaAltoPadrao.ts`). Com ela, confira os dois níveis, 32
   paredes, 38 aberturas, 2 pisos, 1 laje, 1 telhado, 1 escada e as vistas (contagens conferidas em
   `casaAltoPadrao.test.ts`).
2. **Aberturas**: selecione uma janela e abra **Editar tipo…**; confira família, folhas, símbolo e a seção **Acabamento**.
   Marque um tipo como favorito (estrela). Com **D** e **J**, insira porta e janela (**Tab** troca o lado, **Espaço** a
   dobradiça) e abra a **Tabela de portas e janelas**.
3. **Ambientes**: com **Z**, clique numa sala fechada e confira nome, número e área. Em **Tabela de ambientes**, altere
   o pé-direito e confira área e volume. Use "Ambientes em todos os circuitos fechados" e confira os avisos.
4. **Forros**: use **Forro em todos os ambientes** e confira o forro no 3D e no corte. Em **Direção da vista**, escolha
   **Para cima (planta de forro)** e confira que a planta baixa não mostra o forro.
5. **Pranchas e PDF**: em **Pranchas**, crie uma **Nova prancha** A3 paisagem, adicione uma planta 1:100 e um corte 1:50,
   arraste a vista e troque a escala. Insira também uma vista 3D por ponto de vista e confira os traços e a legenda
   "Sem escala". Clique em **Exportar PDF** e confira o carimbo e os pesos de linha.
6. **Cotas e DXF**: na planta, use **Y** e **X**; apague uma anotação (Ctrl+Z desfaz). Clique em **Exportar DXF** e
   confira as camadas `COTAS`, `TEXTOS`, `AMBIENTES` e, na planta de forro, `FORRO`.
7. **Cortes e 3D**: com **K**, desenhe um corte e use **Gerar elevações** para abrir a Sul; clique numa parede e numa
   janela. No **Modelo 3D**, orbite, use o **ViewCube**, alterne **Perspectiva/Ortogonal** e selecione elementos com Shift/Esc/Delete.
8. **Paredes, pisos e tipos**: selecione uma parede e use **Editar tipo…** para mudar uma camada (seção ao vivo). Com **F**,
   crie um piso pelas paredes, confira "Desvincular" e mova uma parede para ver o contorno acompanhar. Desfaça com Ctrl+Z.
9. **Escadas**: em **Tipos de escada**, altere um tipo e confira a numeração dos degraus.
10. **Exportação e arquivo**: clique em **Exportar IFC** e confira que o arquivo abre; grave o `.hestia.json`, feche, reabra
    e confira que ambientes, forros e pranchas voltaram. Abra o painel de avisos e use **Ir para**.
11. **Visibilidade**: na planta, selecione uma parede e use **EH** (Ocultar na vista); confira que ela some e que Ctrl+Z
    a traz de volta. Use **HH**, **HI** e **HR**; ligue **RH** (Revelar) e confira o contorno azul. Repita no 3D e abra o
    menu de contexto e a barra de controle da vista.
12. **CAD importado**: em **Inserir → Importar CAD (DXF)**, importe um DXF; clique numa linha na planta e confira
    **Gerenciar CAD** (também na aba **Gerenciar**, painel **Gerenciar projeto**) e o nó **CAD importado** no
    Navegador. Com uma ferramenta de desenho, aproxime o cursor de uma extremidade, do meio e de um cruzamento e confira
    a captura nas linhas.
13. **IFC de entrada**: em **Arquivo → Importar IFC…**, abra um IFC4/IFC2X3 e confira níveis, paredes, aberturas,
    lajes, forros, ambientes e grades. Leia o relatório do que entrou, do que ficou aproximado e do que foi ignorado.

## Como rodar

```bash
npm install
npm run dev            # servidor de desenvolvimento
npm run check          # lint + tipos + testes (portão do CI)
npm run test:rapido    # testes sem property.test.ts e perf.test.ts
npm run test:completo  # suíte inteira, com as 60 sementes de property.test.ts (~8 min)
npm run test:perf      # desempenho (K4 e captura de faces), fora do check
npm run build          # build da aplicação em apps/web/dist
npm run build:artifact # gera apps/web/dist/artifact.html
npm run e2e            # fluxo no navegador (requer Chromium do Playwright)
node tests/e2e/pranchas.mjs            # pranchas: aba, vistas, carimbo e PDF (requer build e Chromium)
node tests/e2e/pranchas-3d.mjs         # 3D vetorial na prancha, sem imagem e "Sem escala" (requer build e Chromium)
node tests/e2e/cliques-perdidos.mjs    # cliques no canvas e diálogo Novo (requer build e Chromium)
node tests/e2e/visual-regression.mjs   # regressão visual da planta (--update regrava as referências)
node tests/e2e/visual-regression-gpu.mjs   # regressão visual da planta no caminho GPU, 6 casos (--update regrava as referências em baseline-gpu/)
npm run parity         # percentual de paridade por elemento
```

Os fluxos de navegador e as capturas estão em `tests/e2e/*.mjs` (`helpers.mjs` é auxiliar).

## Qualidade e verificação

- Checklists (feitos + fora de escopo + pendentes): paredes 68+15+0, pisos 44+7+0, lajes 42+3+0, telhados 43+1+0,
  escadas 40+4+0, aberturas 36+7+0, ambientes 24+4+0, forros 33+0+0, pranchas 34+2+0. O portão de 95% e os bloqueantes
  são verificados por `scripts/check-parity.mjs` no lint e no CI.
- `npx vitest run --maxWorkers=4` em 2026-10-23: 293 arquivos e 3577 testes, todos passando (120 s). O `npm run check`
  padrão estourou dois timeouts por carga nesta máquina (`predio10` e `ifcExport`); os mesmos testes passam em
  paralelismo menor.
- `npm run test:rapido` em 2026-10-22: 277 arquivos e 3373 testes, todos passando (70,8 s; `test:rapido`, sem property e perf).
- `npm run test:completo` em 2026-10-22: 278 arquivos e 3675 testes, todos passando, com as 60 sementes (700 s, código de saída 0).
- Build em 2026-10-22 (Windows, esbuild 0.28.2 do lockfile): `npm run build` falha na minificação com
  `[vite:esbuild-transpile] remove ... Acesso negado` (limitação local do esbuild ao apagar o diretório temporário;
  não é erro de código). O build usado nos e2e é `npm run build -w @hestia/web -- --target esnext --minify false`:
  `dist/index.html` com 6.418,48 kB (kB decimais, medidos em bytes). `build:artifact` não foi refeito nesta rodada.
- Desempenho e regressão visual: os números estão na atualização de [08](08-PENDENCIAS-E-CORRECOES.md) e não foram
  repetidos nesta revisão, salvo onde indicado acima.
- A conferência visual final em navegador real continua manual: os testes cobrem geometria, unidade e desenho, não a
  aparência em todas as combinações de zoom, tema e GPU.
