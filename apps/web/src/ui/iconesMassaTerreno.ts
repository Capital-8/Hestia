/**
 * Ícones da aba "Massa e terreno" (modelo de massa, modelo por massa, terreno, lote e análise do terreno).
 * Mesma linguagem de Icon.tsx: 32×32, sólidos cinza sombreados com luz de cima-esquerda (topo s1, face esquerda s2,
 * face direita s3), azul (`bl`) para superfícies de projeto, cinza-azulado (`gl`) para o solo, laranja para a ação
 * (setas, esboço, pontos). Cada ícone mostra o que a ferramenta FAZ e nenhum reaproveita o de outra ferramenta.
 * Marcação estática deste arquivo (nunca vem de dados do usuário).
 */
const p = (c: string, d: string, x = ''): string => `<path class="ic-${c}" d="${d}"${x ? ` ${x}` : ''}/>`;
const circ = (c: string, cx: number, cy: number, r: number): string => `<circle class="ic-${c}" cx="${cx}" cy="${cy}" r="${r}"/>`;
const txt = (x: number, y: number, s: string, size = 8): string => `<text class="ic-tx" x="${x}" y="${y}" text-anchor="middle" style="font-size:${size}px">${s}</text>`;
const grupo = (t: string, inner: string): string => `<g transform="${t}">${inner}</g>`;
/** Traço-ponto da divisa de lote (convenção de linha de propriedade). */
const DIVISA = 'style="stroke-dasharray:6 2 1.5 2"';

/** Cubo fantasma (a massa de onde saem as faces): topo em y=6..18, base em y=18..30. */
const CUBO_FANTASMA = p('ln ic-ds', 'M4 12L16 6L28 12L16 18Z') + p('ln ic-ds', 'M4 12V24L16 30L28 24V12M16 18V30');

/** Lápis laranja/cinza do modo "no local" (o mesmo desenho do editperimeter, sem o contorno). */
const LAPIS =
  p('s1', 'M16.6 22.6L24.6 14.6L27.4 17.4L19.4 25.4Z') +
  p('s3', 'M24.6 14.6L26.2 13L29 15.8L27.4 17.4Z') +
  p('s3', 'M16.6 22.6L19.4 25.4L13.5 28.5Z') +
  p('fa', 'M15.2 25.3L16.7 26.8L13.5 28.5Z');

/** Solo (superfície de terreno) como losango com espessura; `y` é o vértice esquerdo. */
const solo = (y: number): string =>
  p('s2', `M2 ${y}L16 ${y + 7}V${y + 11}L2 ${y + 4}Z`) + p('s3', `M16 ${y + 7}L30 ${y}V${y + 4}L16 ${y + 11}Z`) + p('gl', `M2 ${y}L16 ${y - 7}L30 ${y}L16 ${y + 7}Z`);

export const ICONES_MASSA_TERRENO: Record<string, string> = {
  // ---- Modelo de massa ----
  // Massa: volume conceitual em dois corpos (um baixo e largo, um alto atrás).
  mass:
    p('s2', 'M13 7L21 11V23L13 19Z') + p('s3', 'M21 11L29 7V19L21 23Z') + p('s1', 'M13 7L21 3L29 7L21 11Z') +
    p('s1', 'M3 18L12 13.5L21 18L12 22.5Z') + p('s2', 'M3 18L12 22.5V29L3 24.5Z') + p('s3', 'M12 22.5L21 18V24.5L12 29Z'),
  // Extrusão: perfil azul no chão, prisma que sobe dele e seta laranja de extrusão.
  massExtrude:
    p('bl', 'M2 24L16 31L30 24L16 17Z') + p('s2', 'M8 10L16 14V28L8 24Z') + p('s3', 'M16 14L24 10V24L16 28Z') + p('s1', 'M8 10L16 6L24 10L16 14Z') +
    p('ac', 'M28 21V8') + p('fa', 'M28 3.5L24.5 9H31.5Z'),
  // Mistura: perfil quadrado embaixo e circular em cima, ligados por uma superfície.
  massBlend:
    p('s2', 'M5 25L8 8A8 4 0 0 0 24 8L27 25L16 30Z') + p('s3', 'M16 30L27 25L24 8A8 4 0 0 1 16 12Z') +
    p('s1', 'M8 8A8 4 0 1 0 24 8A8 4 0 1 0 8 8Z') + p('ac', 'M8 8A8 4 0 1 0 24 8A8 4 0 1 0 8 8Z') + p('ac', 'M5 25L16 30L27 25'),
  // Loft: três perfis em planos paralelos varridos por um caminho laranja.
  massLoft:
    p('s2', 'M8 14L13 10V22L8 26Z') + p('s2', 'M18 8L23 6V18L18 20Z') +
    p('s1', 'M3 16L8 14V26L3 28Z') + p('s1', 'M13 10L18 8V20L13 22Z') + p('s1', 'M23 6L28 4V16L23 18Z') +
    p('ac', 'M5.5 22C9 22 11 15 15.5 15C20 15 22 11 25.5 11'),
  // Bulbo: sólido de revolução em torno de um eixo tracejado; o perfil laranja é a geratriz.
  massBulb:
    p('s2', 'M16 4C8 8 4 16 8 22C10 26 13 28 16 28Z') + p('s3', 'M16 4C24 8 28 16 24 22C22 26 19 28 16 28Z') +
    p('ln', 'M8 20A8 3 0 0 0 24 20') + p('ac', 'M16 4C8 8 4 16 8 22C10 26 13 28 16 28') + p('ln ic-ds', 'M16 1V31'),
  // Mostrar massa: o volume com um olho (liga/desliga a visibilidade da massa).
  massShow:
    p('s2', 'M2 9L13 14V25L2 20Z') + p('s3', 'M13 14L24 9V20L13 25Z') + p('s1', 'M13 4L24 9L13 14L2 9Z') +
    p('s1', 'M15 24Q22 16 29 24Q22 32 15 24Z') + circ('fa', 22, 24, 3),
  // Massa no local: o volume em edição, com o lápis.
  massInPlace:
    p('s2', 'M2 8L13 13V24L2 19Z') + p('s3', 'M13 13L24 8V19L13 24Z') + p('s1', 'M13 3L24 8L13 13L2 8Z') + LAPIS,
  // Colocar massa: volume que desce (seta laranja) sobre o ponto de inserção no chão.
  massPlace:
    p('bl', 'M2 25L16 32L30 25L16 18Z') + p('s2', 'M8 12L16 16V27L8 23Z') + p('s3', 'M16 16L24 12V23L16 27Z') + p('s1', 'M8 12L16 8L24 12L16 16Z') +
    p('ac', 'M27 3V12') + p('fa', 'M27 17L23.5 11H30.5Z'),

  // ---- Modelo por massa ----
  // Pisos da massa: a massa em tracejado cortada por lajes azuis a cada nível.
  massFloors:
    p('bl', 'M4 23L16 29L28 23L16 17Z') + p('bl', 'M4 16L16 22L28 16L16 10Z') + p('ln ic-ds', 'M4 9L16 3L28 9L16 15Z') + p('ln ic-ds', 'M4 9V23M28 9V23M16 15V17'),
  // Paredes da massa: caixa oca, só as paredes do contorno (borda do topo com espessura, interior à vista).
  massWalls:
    p('s2', 'M4 11L16 17V29L4 23Z') + p('s3', 'M16 17L28 11V23L16 29Z') + p('s1', 'M4 11L16 5L28 11L16 17Z') + p('s3', 'M9 11L16 7.5L23 11L16 14.5Z'),
  // Telhado por face: massa em tracejado e uma cobertura de quatro águas sobre a face superior.
  massRoofFace:
    CUBO_FANTASMA + p('s2', 'M4 12L16 18L16 3Z') + p('s3', 'M16 18L28 12L16 3Z'),
  // Parede por face: a face lateral vira uma parede com espessura.
  massWallFace:
    CUBO_FANTASMA + p('s2', 'M4 12L16 18V30L4 24Z') + p('s3', 'M16 18L19 16.5V28.5L16 30Z') + p('s1', 'M4 12L16 18L19 16.5L7 10.5Z'),
  // Forro por face: forro azul com a grelha em X (como o ícone de forro) sob a face superior.
  massCeilFace:
    CUBO_FANTASMA + p('bl', 'M4 12L16 18L28 12L16 6Z') + p('ln', 'M10 9L22 15M22 9L10 15'),
  // Piso por face: laje azul com espessura na face superior.
  massFloorFace:
    CUBO_FANTASMA + p('s2', 'M4 12L16 18V21L4 15Z') + p('s3', 'M16 18L28 12V15L16 21Z') + p('bl', 'M4 12L16 18L28 12L16 6Z'),

  // ---- Terreno ----
  // Topografia: superfície do solo com curvas de nível concêntricas e espessura.
  terrTopo:
    p('s2', 'M3 16L16 23V28L3 21Z') + p('s3', 'M16 23L29 16V21L16 28Z') + p('gl', 'M3 16L16 9L29 16L16 23Z') +
    p('ln', 'M8 16A8 4 0 1 0 24 16A8 4 0 1 0 8 16Z') + p('ln', 'M11.5 16A4.5 2.3 0 1 0 20.5 16A4.5 2.3 0 1 0 11.5 16Z') + circ('fa', 16, 16, 1.4),
  // Colocar pontos: pontos topográficos (laranja) em cotas diferentes sobre o plano.
  terrPoints:
    p('gl', 'M2 22L16 29L30 22L16 15Z') +
    p('ln', 'M9 22V13M17 25V16M24 21V9') + circ('fa', 9, 12.5, 2.3) + circ('fa', 17, 15.5, 2.3) + circ('fa', 24, 8.5, 2.3),
  // Desenhar curvas: curvas de nível concêntricas; a de fora (laranja) é a que se está desenhando.
  terrContours:
    p('gl', 'M2 17L16 10L30 17L16 24Z') +
    p('ln', 'M11 17C11 15 14 14.5 17 15C20 15.5 21 17 19.5 18C17 19.5 12.5 19 11 17Z') +
    p('ac', 'M6 17C6 13.5 12 11.5 17 12C23 12.5 26 16 23.5 19C20 22 8 21.5 6 17Z'),
  // Importar levantamento: folha de levantamento (curvas no papel) e seta laranja entrando.
  terrImport:
    p('s1', 'M4 3H18L24 9V29H4Z') + p('ln', 'M18 3V9H24') +
    p('ln', 'M8 22A5 2.5 0 1 0 18 22A5 2.5 0 1 0 8 22Z') + p('ln', 'M10.5 22A2.5 1.2 0 1 0 15.5 22A2.5 1.2 0 1 0 10.5 22Z') +
    p('ac', 'M31 14H22') + p('fa', 'M19 14L24.5 10.5V17.5Z'),
  // Editar terreno: malha triangulada com os vértices de edição (quadrados laranja).
  terrEdit:
    p('gl', 'M2 18L16 11L30 18L16 25Z') + p('ln', 'M2 18H30M16 11V25M9 14.5L23 21.5M23 14.5L9 21.5') +
    p('fa', 'M14.4 16.4H17.6V19.6H14.4ZM7.4 12.9H10.6V16.1H7.4ZM21.4 19.9H24.6V23.1H21.4Z'),
  // Subdivisão: um trecho da superfície (azul) destacado dentro do solo, para outro material.
  terrSubregion:
    solo(16) + p('bl', 'M8 16L15 12.5L24 15L19 20L12 19.5Z'),
  // Região de terreno: o mesmo trecho em modo de esboço (contorno laranja e vértices).
  terrRegion:
    solo(16) + p('bl', 'M8 16L15 12.5L24 15L19 20L12 19.5Z') + p('ac', 'M8 16L15 12.5L24 15L19 20L12 19.5Z') +
    p('fa', 'M6.8 14.8H9.2V17.2H6.8ZM13.8 11.3H16.2V13.7H13.8ZM22.8 13.8H25.2V16.2H22.8ZM17.8 18.8H20.2V21.2H17.8ZM10.8 18.3H13.2V20.7H10.8Z'),
  // Plataforma: laje plana do edifício sobre o solo (bordas verticais, corta e aterra).
  terrPad:
    solo(17) + p('s2', 'M9 14.5L16 18V21L9 17.5Z') + p('s3', 'M16 18L23 14.5V17.5L16 21Z') + p('s1', 'M9 14.5L16 11L23 14.5L16 18Z'),
  // Plataforma por elemento: a plataforma pega o contorno de um elemento (cursor laranja).
  terrPadElem:
    grupo('translate(0 3)', solo(17) + p('s2', 'M9 14.5L16 18V21L9 17.5Z') + p('s3', 'M16 18L23 14.5V17.5L16 21Z') + p('s1', 'M9 14.5L16 11L23 14.5L16 18Z')) +
    p('fa', 'M20 2V15L23.5 11.5L26 17L28 16L25.5 10.5L30 10.5Z'),
  // Região nivelada: platô plano com taludes inclinados descendo até o solo.
  terrGraded:
    p('gl', 'M2 22L16 15L30 22L16 29Z') + p('s2', 'M10 13L16 16L16 25L6 20Z') + p('s3', 'M16 16L22 13L26 20L16 25Z') + p('s1', 'M10 13L16 10L22 13L16 16Z') +
    p('ac', 'M6 20L16 25L26 20'),
  // Componente de terreno: elemento de paisagem (árvore) assentado no solo.
  terrSiteComp:
    p('gl', 'M3 27L16 20.5L29 27L16 33.5Z') + p('s3', 'M14.3 17H17.7V28H14.3Z') +
    circ('s2', 9.5, 14, 5.5) + circ('s2', 22.5, 14, 5.5) + circ('s2', 16, 9, 7) + circ('s1', 13.5, 7.5, 3.2) + circ('s1', 8, 12.5, 2),

  // ---- Lote ----
  // Linhas de propriedade: o polígono do lote, em traço-ponto de divisa, com os marcos nos vértices.
  lotLines:
    p('s1', 'M5 9L21 5L28 15L23 27L7 24Z') + p('ln2', 'M5 9L21 5L28 15L23 27L7 24Z', DIVISA) +
    p('fa', 'M3.8 7.8H6.2V10.2H3.8ZM19.8 3.8H22.2V6.2H19.8ZM26.8 13.8H29.2V16.2H26.8ZM21.8 25.8H24.2V28.2H21.8ZM5.8 22.8H8.2V25.2H5.8Z'),
  // Desenhar (lote): polígono em andamento (laranja) com o lado seguinte elástico.
  lotDraw:
    p('ac', 'M5 25L8 8L24 5L27 19') + p('ac ic-ds', 'M27 19L15 26') +
    p('fa', 'M3.8 23.8H6.2V26.2H3.8ZM6.8 6.8H9.2V9.2H6.8ZM22.8 3.8H25.2V6.2H22.8ZM25.8 17.8H28.2V20.2H25.8Z'),
  // Por tabela: tabela de rumos (azimute e distância) que gera o polígono.
  lotTable:
    p('s1', 'M4 4H28V28H4Z') + p('s3', 'M4 4H28V10H4Z') + p('ln', 'M4 16H28M4 22H28M13 10V28') +
    p('ac', 'M16 26H25M16 26L20.5 20.5') + p('ac ic-ds', 'M16 26V19'),
  // Índices do lote: tabela com barras de ocupação e permeabilidade.
  lotIndices:
    p('s1', 'M4 4H28V28H4Z') + p('s3', 'M4 4H28V10H4Z') + p('ln', 'M4 16H28M4 22H28M13 10V28') +
    p('fa', 'M15 12H24V14H15ZM15 18H21V20H15ZM15 24H26V26H15Z'),
  // Envelope legal: a divisa com os recuos e o volume máximo edificável (azul) dentro dela.
  lotEnvelope:
    p('ln2', 'M3 21L16 14L29 21L16 28Z', DIVISA) + p('ln ic-ds', 'M9 16V23M23 16V23M16 19.5V26.5') +
    p('bl', 'M9 16L16 12.5L23 16L16 19.5Z') + p('bl', 'M9 16L16 19.5V26.5L9 23Z') + p('bl', 'M16 19.5L23 16V23L16 26.5Z'),

  // ---- Análise do terreno ----
  // Corte e aterro: seção do terreno; o corte (laranja) está abaixo da cota original tracejada, o aterro (azul) acima.
  terrCutFill:
    p('s2', 'M2 16H6L12 21H20L26 11H30V29H2Z') + p('fa', 'M6 16L12 21H20V16Z') + p('bl', 'M20 16L26 11H30V16Z') + p('ln ic-ds', 'M2 16H30'),
  // Mapa de corte e aterro: a planta pintada, corte em laranja e aterro em azul, separados pela cota de passagem.
  terrCutFillMap:
    p('fa', 'M4 4H16C12 10 19 14 15 20C11 26 17 26 14 28H4Z') + p('bl', 'M16 4H28V28H14C17 26 11 26 15 20C19 14 12 10 16 4Z') + p('ln', 'M4 4H28V28H4Z'),
  // Rótulo de curva: uma curva de nível com a etiqueta da cota sobre ela.
  terrContourLabel:
    p('ln2', 'M2 25C10 25 12 16 16 16S24 8 30 8') + p('s1', 'M7 12H25V20H7Z') + txt(16, 18.6, '120', 7.5),
  // Cota de ponto: marca em cruz no ponto, linha de chamada e o valor da cota.
  terrSpot:
    p('ac', 'M5 24H13M9 20V28') + p('ln', 'M9 24L15 14H30') + txt(22.5, 11.8, '1.2', 8),
};
