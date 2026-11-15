# Paridade · Terrenos

Legenda: `[x]` feito e testado · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha. Onde o ESTADO diz que a parte não foi conferida visualmente, a linha traz a nota "sem conferência visual".
Fonte: [docs/05](../05-REFERENCIA-REVIT-ARCHICAD.md) (Revit: Toposurface, Subregion, Building Pad, Property Line; ArchiCAD: Mesh, gravidade, Rastreamento e Referência). Decisão em [docs/decisoes/0058](../decisoes/0058-terreno-e-lote.md). As fichas entre parênteses (M1, R2, U2...) vêm de [docs/terreno/ESTADO.md](../terreno/ESTADO.md).

## A · Modelo e comandos
- [x] A1 Terreno como elemento (`kind: 'terrain'`) com pontos, curvas, linhas de quebra e borda (M1)
- [x] A2 Região de terreno (`terrainRegion`) com os três papéis: subdivisão, plataforma e região nivelada (M1, T3)
- [x] A3 Localização do projeto: leste, norte, altitude da cota zero e norte verdadeiro, no diálogo de Gerenciar projeto (M1, U1)
- [x] A4 Migração de arquivo: SCHEMA_VERSION sobe de 25 para 26 sem alterar dados (M1). Teste de ida e volta em `packages/model/src/esquema.test.ts` ("migração 25 → 26").
- [x] A5 Comandos com desfazer: `addTerrain`, `updateTerrain`, `editTerrainFontes`, `addTerrainRegion`, `updateTerrainRegion`, `setTerrainRegionContorno`, `setLocalizacao` (M1)
- [x] A6 Mover, copiar, girar, espelhar, matriz e apagar o terreno levam junto as suas regiões (T1)

## B · Kernel
- [x] B1 Triangulação TIN com curvas, linhas de quebra e borda como arestas obrigatórias, pela biblioteca `spade` (R1)
- [x] B2 Curvas de nível com curva mestra a cada intervalo fixado (R2). Nota: tempo em relevo realista ainda não medido, fica para Q1.
- [x] B3 Corte vertical do solo proposto e do perfil existente (R2, R3)
- [x] B4 Volumes de corte e aterro por terreno e por região (R2, R3)
- [x] B5 Avisos do kernel: pontos coincidentes, linha que cruza outra, regiões sobrepostas, precisão reduzida, terreno sem triângulos e região fora do terreno (R1, R2, R3). A consulta `terreno_avisos` (168) existe desde a R2 e os seis avisos chegam ao painel com "Ir para" (U1b; `useIssues.terreno.test.ts`).

## C · Entrada
- [x] C1 Importar DXF: tabela de camadas, destino de cada camada, unidade e simplificação das polilinhas (I1, U1). Nota: blocos INSERT só geram aviso.
- [x] C2 Importar CSV (`x y z` ou `n e z`). Nota: sem coluna de unidade; com localização já existente, as coordenadas entram cruas (I1).
- [x] C3 Colocar pontos na cota do campo "Cota" da barra de opções (T1, U1)
- [x] C4 Desenhar curvas como polilinha com cota (T1)
- [x] C5 Menu Topografia no Ribbon: Colocar pontos, Desenhar curvas e Importar levantamento (U1). Nota: sem conferência visual.

## D · Edição
- [x] D1 Modo Editar terreno, por botão ou duplo clique (T2, U1). Nota: sem conferência visual.
- [x] D2 Escolher o vértice mais próximo (tolerância de 8 px), arrastar em planta e apagar com Delete (T2, U1)
- [x] D3 Botões do modo: Ponto, Curva, Linha de quebra, Borda, Editar e Remover borda na barra de opções (U1a, `TerrainOptionsBar.tsx`; T2).
- [x] D4 Campo Cota do modo edita a cota do ponto ou da curva inteira (T2, ligado na barra de opções pela U1a).
- [x] D5 Acima de 500 vértices na tela, mensagem "aproxime para editar pontos" e sem alças (T2, `LIMITE_ALCAS`; ligada à vista pela U1b, `edicaoParaAVista`).
- [x] D6 Cada gesto concluído é um só desfazer (T2). Excluir vértice de curva ou quebra usa `removeCurva` mais `addCurva` no mesmo comando, sem operação própria; a linha vai para o fim da lista.
- [x] D7 Rótulo de curva por linha, com botão ativo na faixa (T2, U1)
- [x] D8 Cota de ponto por clique, com botão ativo na faixa (T2, U1)

## E · Regiões
- [x] E1 Subdivisão: polígono sobre um terreno, com material e área, sem alterar a cota (R3, T3)
- [x] E2 Plataforma: plano com bordas verticais que corta e aterra (R3, T3)
- [x] E3 Plataforma por elemento: clicar numa laje ou piso copia o contorno (T3)
- [x] E4 Região nivelada: plano com taludes de corte e aterro (R3, T3)
- [x] E5 Valores padrão dos taludes: 0 na plataforma; 1,5 de corte e 2 de aterro na nivelada; subdivisão permeável, os outros dois não (T3, `PADROES_REGIAO` em `terrainRegionTool.ts`).
- [x] E6 Seta de direção de subida quando a inclinação é maior que zero (T3)
- [x] E7 Vértice da região fora do terreno avisa na barra de status (T3). Nota: a área que passa da borda do terreno some (limitação da R3).
- [x] E8 Alças de vértice e de meio de aresta na região (T3)
- [x] E9 Regra 3 da região: mover, copiar, girar, espelhar, matriz, alinhar, apagar, copiar e colar (T3)
- [-] E10 Aparar, estender, dividir e deslocar: não se aplicam, a região é polígono fechado (contrato de T3)

## F · Vistas
- [x] F1 Planta com curvas de nível e borda (V2). Nota: sem captura visual da planta.
- [x] F2 Snaps no terreno em planta (V2)
- [ ] F3 Terreno no 3D, com seleção e realce. Pendente: a V1 montou a cena com malha falsa; o ESTADO não registra teste com malha real do kernel no 3D.
- [ ] F4 Sem tremor entre plataforma e laje no 3D (A.8, item 6). Pendente: a V1 não conferiu.
- [x] F5 Corte com solo cortado em hachura (V3). Nota: sem capturas de corte e elevação; traços do terreno atrás do edifício podem aparecer sobre a hachura.
- [x] F6 Perfil existente tracejado no corte, só quando há plataforma ou região nivelada (V3; `section/terreno.test.ts` e o teste de kernel real `kernel-terreno-corte-vista`).
- [x] F7 Clicar dentro do terreno não o seleciona; só a borda e as curvas (A.8, item 7) (V2, T1; teste "clique no INTERIOR" em `terrainPick.test.ts`).
- [x] F8 Seleção do terreno no corte (U1). Nota: sem conferência visual.

## G · Saídas
- [x] G1 Tabela "Terreno: corte e aterro", por região e por terreno, com totais, saldo e CSV (U2)
- [x] G2 Mapa de corte e aterro na planta, em vermelho e azul, ligado pela caixa "Mapa" (U2). Nota: a liga é global; as pranchas também mostram o mapa enquanto ligado.
- [x] G3 IFC: terreno como `IFCGEOGRAPHICELEMENT` com predefinido TERRAIN, contido no IFCSITE, com RefElevation pela cota zero (X1). Nota: sem kernel, o terreno não sai e aparece um aviso.
- [x] G4 DXF: camadas TERRENO_CURVAS, TERRENO_CURVAS_MESTRAS, TERRENO_BORDA e TERRENO_REGIAO na planta, e CORTE_TERRENO no corte (X1)
- [x] G5 Terreno e regiões na prancha: planta, corte e 3D vetorial geram o PDF com o terreno (X1; teste de kernel real `kernel-terreno-x1`). Sem conferência visual.

## H · Integração
- [x] H1 Gravidade no piso e na laje: cota inicial do terreno sob o primeiro clique, sem vínculo depois (G1)
- [x] H2 Gravidade na parede, na plataforma, na região nivelada, no piso e na laje (G1; `gravidade.test.ts`, parede e região; `perimeter.test.ts`, piso e laje).
- [x] H3 Cota exibida igual a z mais a cota zero, formatada pela unidade do projeto (M1, X1)
- [x] H4 Norte verdadeiro usado na direção dos rumos do lote (U1, P3). Nota: o sinal foi decidido pelo fiscal (E4); o dono não respondeu.

## I · Fora de escopo
- [-] I1 Tipos de terreno com camadas de solo: A.9, fora desta entrega
- [-] I2 Furos na borda (lagos, ilhas): A.9, fora desta entrega
- [-] I3 Vínculo persistente da base da parede ao terreno e reanexação automática: A.9. A gravidade é só valor inicial, sem vínculo (A.7).
- [-] I4 Componentes de terreno (árvore, poste, vaga): A.9; o botão continua `soon` (A.6)
- [-] I5 Terreno a partir de nuvem de pontos, de imagem de satélite ou de serviço de mapas: A.9
- [-] I6 Importação de terreno por IFC ou LandXML: A.9
- [-] I7 Hidrologia e drenagem; terraplenagem com camadas ou fases de obra: A.9
- [-] I8 Suavização de curvas (spline) e correção de triângulos planos entre curvas: A.9
- [-] I9 Curvas de nível desenhadas no 3D: A.9
- [-] I10 Lote e regiões no IFC: A.9 (v1); a X1 não exporta
- [-] I11 Perfis de recuo por município e cálculo do gabarito real: A.9; os recuos são digitados por lote (decisão 0058, D7)
- [-] I12 Rótulo de curva arrastável: A.9; rótulos e pontos cotados não se arrastam (T2)
- [-] I13 Imagem ou PDF como fundo: A.9; o DXF importado já serve de fundo para traçar
- [-] I14 Terreno visível na planta de outros níveis: A.9; o terreno aparece no nível em que foi desenhado (decisão 0058, §3)
- [ ] I15 Rastreamento e Referência (Fase 7): opcional (fase 7), depende do aceite do dono (decisão 0058, D9)
