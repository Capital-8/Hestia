/* eslint-disable max-lines -- o datum reúne duas linhas, bolha, texto, plano e cota no mesmo módulo. */
import * as THREE from 'three';
import type { Id, Project } from '@hestia/model';
import { LEVEL_LINE_OFFSET, levelDataOf, levelProjectBox, type LevelBox, type LevelDatum } from './levelsData.ts';

/**
 * Datum de nível no 3D (revisão 2): **duas linhas** por nível — a da esquerda (com a bolha e o texto) e a de trás,
 * formando um L no canto que está atrás/à esquerda da câmera. O texto é um billboard rotacionado no plano da tela para
 * ficar na mesma direção da linha da esquerda. A cota real fica no eixo das bolhas; o plano do nível é o retângulo
 * entre as duas linhas (a caixa da obra expandida até elas).
 */

/** Lado da caixa da obra. */
export type LevelSide = 'S' | 'N' | 'W' | 'E';

/** Canto da caixa: o L do datum é montado em um deles (os 4 alinhamentos). */
export type LevelCorner = 'SW' | 'SE' | 'NW' | 'NE';

/** Intervalo da cota: do nível selecionado para o de baixo ou para o de cima. */
export type DimensionSide = 'below' | 'above';

/** Dados de uma cota clicável no 3D. */
export interface DimensionInfo {
  levelId: Id;
  neighborId: Id;
  side: DimensionSide;
  /** Δ em metros (positivo). */
  value: number;
}

/** Objetos de um nível: linha da esquerda, linha de trás, bolha e texto. */
export interface LevelView {
  datum: LevelDatum;
  line: THREE.Line;
  lineBack: THREE.Line;
  bubble: THREE.Sprite;
  text: THREE.Sprite;
}

/** Objetos de uma cota entre dois níveis. */
export interface DimensionView {
  info: DimensionInfo;
  line: THREE.Line;
  extensions: THREE.LineSegments;
  ticks: THREE.LineSegments;
  label: THREE.Sprite;
}

/** Estado guardado no grupo: objetos, caixa e o último canto/lado/ponta (histerese). */
export interface LevelsGroupData {
  levels: true;
  views: LevelView[];
  dimensions: DimensionView[];
  data: LevelDatum[];
  box: LevelBox;
  layout: { corner: LevelCorner | null; leftSide: LevelSide | null; bubbleEnd: 'a' | 'b' | null };
}

/** Cores do datum de níveis: linha, seleção, texto, bolha, cota e plano. */
export interface LevelPalette {
  /** Linha de datum dos níveis não selecionados. */
  line: number;
  /** Azul do nível selecionado: linha, bolha, cota e plano. */
  selected: number;
  /** Texto do nome e da cota do nível. */
  text: number;
  /** Fundo da bolha. */
  bubble: number;
  /** Borda e quadrantes da bolha. */
  bubbleBorder: number;
  /** Fundo da etiqueta da cota. */
  dimension: number;
  /** Borda da etiqueta e texto da cota. */
  dimensionBorder: number;
  /** Texto da etiqueta da cota. */
  dimensionText: number;
  /** Plano do nível selecionado. */
  plane: number;
}

/** Paleta clara (visual atual, fundo claro do editor). */
const PALETA_CLARA: LevelPalette = {
  line: 0x374151,
  selected: 0x1565c0,
  text: 0x1f2937,
  bubble: 0xffffff,
  bubbleBorder: 0x1565c0,
  dimension: 0xffffff,
  dimensionBorder: 0x1565c0,
  dimensionText: 0x0d47a1,
  plane: 0x1565c0,
};

/** Paleta escura: linhas e texto claros, fundos escuros e azul claro para a seleção. */
const PALETA_ESCURA: LevelPalette = {
  line: 0xcbd5e1,
  selected: 0x60a5fa,
  text: 0xe5e7eb,
  bubble: 0x0f172a,
  bubbleBorder: 0x93c5fd,
  dimension: 0x0f172a,
  dimensionBorder: 0x93c5fd,
  dimensionText: 0xe5e7eb,
  plane: 0x60a5fa,
};

/** Paleta do datum de níveis; `dark` acompanha o tema do editor. Devolve uma cópia para não ser mutada. */
export function levelPalette(dark: boolean): LevelPalette {
  return { ...(dark ? PALETA_ESCURA : PALETA_CLARA) };
}

/** Tracejado da linha de datum (m). */
const DASH = 0.3;
const GAP = 0.15;
const DASH_SELECIONADO = 0.4;

/** Bolha (m), texto (altura em m; largura pela proporção 6:1) e folga entre os dois. */
const LADO_BOLHA = 0.5;
const ALTURA_TEXTO = 0.7;
const PROPORCAO_TEXTO = 6;
const LARGURA_TEXTO = ALTURA_TEXTO * PROPORCAO_TEXTO;
const GAP_TEXTO = 0.25;

/** Etiqueta da cota (m): maior, para ser fácil de clicar/editar no 3D. */
const LARGURA_COTA = 2.6;
const ALTURA_COTA = 0.8;

/** Margem da linha de trás além do canto (m). */
const MARGEM_LINHA = 1.5;

/** Afastamento da linha de cota em relação ao eixo das bolhas (m). */
const AFASTAMENTO_COTA = LADO_BOLHA / 2 + 0.35;

/** Histereses (NDC): canto, lado esquerdo e ponta da bolha. */
const HISTERESE_CANTO = 0.08;
const HISTERESE_LADO = 0.05;
const HISTERESE_PONTA = 0.01;

/** Opacidade do plano azul do nível selecionado. */
const OPACIDADE_PLANO = 0.18;

/** Grupo do datum: duas linhas, bolha e texto por nível, o plano do selecionado e as cotas dos vizinhos. */
export function buildLevels(p: Project, selected: Id | null, dark = false): THREE.Group {
  const grupo = new THREE.Group();
  const cores = levelPalette(dark);
  const data = levelDataOf(p);
  const box = levelProjectBox(p, LEVEL_LINE_OFFSET);
  const views: LevelView[] = [];
  const dimensions: DimensionView[] = [];
  const texturaBolha = texturaDaBolha(cores);
  const materialBolha = new THREE.SpriteMaterial({
    ...(texturaBolha ? { map: texturaBolha } : {}),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  for (const d of data) {
    const selecionado = d.levelId === selected;
    const line = linhaDoDatum(d, selecionado, 'line', cores);
    const lineBack = linhaDoDatum(d, selecionado, 'lineBack', cores);
    const bubble = bolhaDoDatum(d, materialBolha);
    const text = textoDoDatum(d, cores);
    grupo.add(line, lineBack, bubble, text);
    if (selecionado) grupo.add(planoDoNivel(d, cores));
    views.push({ datum: d, line, lineBack, bubble, text });
  }
  if (selected !== null) {
    const i = data.findIndex((d) => d.levelId === selected);
    if (i >= 0) {
      if (i > 0) dimensions.push(dimensao(data[i]!, data[i - 1]!, 'below', cores));
      if (i < data.length - 1) dimensions.push(dimensao(data[i]!, data[i + 1]!, 'above', cores));
    }
    for (const dim of dimensions) grupo.add(dim.line, dim.extensions, dim.ticks, dim.label);
  }
  const info: LevelsGroupData = {
    levels: true,
    views,
    dimensions,
    data,
    box,
    layout: { corner: null, leftSide: null, bubbleEnd: null },
  };
  grupo.userData = info;
  return grupo;
}

/** Linha tracejada do datum (esquerda ou fundo); as pontas são atualizadas em `layoutLevels`. */
function linhaDoDatum(d: LevelDatum, selecionado: boolean, kind: 'line' | 'lineBack', cores: LevelPalette): THREE.Line {
  const material = new THREE.LineDashedMaterial({
    color: selecionado ? cores.selected : cores.line,
    dashSize: selecionado ? DASH_SELECIONADO : DASH,
    gapSize: GAP,
  });
  const geometria = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const linha = new THREE.Line(geometria, material);
  linha.userData = { levelId: d.levelId, datumKind: kind };
  linha.frustumCulled = false;
  return linha;
}

/** Bolha (sprite) no eixo do nível; sempre de frente para a câmera. */
function bolhaDoDatum(d: LevelDatum, material: THREE.SpriteMaterial): THREE.Sprite {
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(LADO_BOLHA, LADO_BOLHA, 1);
  sprite.renderOrder = 21;
  sprite.userData = { levelId: d.levelId, datumKind: 'bubble' };
  sprite.frustumCulled = false;
  return sprite;
}

/** Texto (nome + cota) em billboard; a rotação no plano da tela é ajustada em `layoutLevels` para seguir a linha. */
function textoDoDatum(d: LevelDatum, cores: LevelPalette): THREE.Sprite {
  const textura = texturaDoTexto(d.text, cores);
  const material = new THREE.SpriteMaterial({
    ...(textura ? { map: textura } : {}),
    transparent: true,
    depthWrite: false,
    // Anotação: fica sempre legível, na frente do modelo (como o level head do Revit).
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  // Pivô na borda esquerda: o texto cresce a partir dela e a rotação não desloca o início.
  sprite.center.set(0, 0.5);
  sprite.scale.set(LARGURA_TEXTO, ALTURA_TEXTO, 1);
  sprite.renderOrder = 20;
  sprite.userData = { levelId: d.levelId, datumKind: 'text' };
  sprite.frustumCulled = false;
  return sprite;
}

/** Plano azul do nível selecionado: a caixa da obra com a margem curta (`d.plane`), mais perto da obra que as linhas. */
function planoDoNivel(d: LevelDatum, cores: LevelPalette): THREE.Mesh {
  const { minX, maxX, minY, maxY } = d.plane;
  const largura = maxX - minX;
  const altura = maxY - minY;
  const material = new THREE.MeshBasicMaterial({
    color: cores.plane,
    transparent: true,
    opacity: OPACIDADE_PLANO,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const malha = new THREE.Mesh(new THREE.PlaneGeometry(largura, altura), material);
  malha.position.set(minX + largura / 2, minY + altura / 2, d.elevation);
  malha.userData = { levelsPlane: true, levelId: d.levelId };
  return malha;
}

/** Cota entre o nível selecionado e um vizinho: linha de cota, linhas de chamada, tiques e etiqueta. */
function dimensao(
  sel: LevelDatum,
  vizinho: LevelDatum,
  side: DimensionSide,
  cores: LevelPalette,
): DimensionView {
  const info: DimensionInfo = {
    levelId: sel.levelId,
    neighborId: vizinho.levelId,
    side,
    value: Math.abs(sel.elevation - vizinho.elevation),
  };
  const material = new THREE.LineBasicMaterial({ color: cores.selected, depthTest: false });
  const geometria = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geometria, material);
  line.userData = { dimension: info };
  line.frustumCulled = false;
  line.renderOrder = 24;
  const extensions = segmentos(material);
  extensions.userData = { dimension: info };
  extensions.renderOrder = 24;
  const ticks = segmentos(material);
  ticks.userData = { dimension: info };
  ticks.renderOrder = 24;
  const textura = texturaDaCota(info.value, cores);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      ...(textura ? { map: textura } : {}),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  label.scale.set(LARGURA_COTA, ALTURA_COTA, 1);
  label.renderOrder = 25;
  label.userData = { dimension: info };
  label.frustumCulled = false;
  return { info, line, extensions, ticks, label };
}

/** `LineSegments` vazio (4 pontos) para as linhas de chamada e os tiques da cota. */
function segmentos(material: THREE.LineBasicMaterial): THREE.LineSegments {
  const geometria = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const linha = new THREE.LineSegments(geometria, material);
  linha.frustumCulled = false;
  return linha;
}

interface Vec2 {
  x: number;
  y: number;
}

interface SideDef {
  id: LevelSide;
  a: Vec2;
  b: Vec2;
  /** Normal para fora da obra. */
  n: Vec2;
}

interface CornerDef {
  id: LevelCorner;
  p: Vec2;
  /** Os dois lados que se encontram no canto. */
  sides: [SideDef, SideDef];
}

/** Os 4 lados da caixa da obra, com a normal para fora. */
function ladosDaCaixa(box: LevelBox): SideDef[] {
  return [
    { id: 'S', a: { x: box.minX, y: box.minY }, b: { x: box.maxX, y: box.minY }, n: { x: 0, y: -1 } },
    { id: 'N', a: { x: box.minX, y: box.maxY }, b: { x: box.maxX, y: box.maxY }, n: { x: 0, y: 1 } },
    { id: 'W', a: { x: box.minX, y: box.minY }, b: { x: box.minX, y: box.maxY }, n: { x: -1, y: 0 } },
    { id: 'E', a: { x: box.maxX, y: box.minY }, b: { x: box.maxX, y: box.maxY }, n: { x: 1, y: 0 } },
  ];
}

/** Os 4 cantos da caixa, cada um com os dois lados que se encontram nele. */
function cantosDaCaixa(box: LevelBox, lados: SideDef[]): CornerDef[] {
  const [s, n, w, e] = lados as [SideDef, SideDef, SideDef, SideDef];
  return [
    { id: 'SW', p: { x: box.minX, y: box.minY }, sides: [s, w] },
    { id: 'SE', p: { x: box.maxX, y: box.minY }, sides: [s, e] },
    { id: 'NW', p: { x: box.minX, y: box.maxY }, sides: [w, n] },
    { id: 'NE', p: { x: box.maxX, y: box.maxY }, sides: [e, n] },
  ];
}

/**
 * Recalcula o L do datum para a câmera: escolhe o canto atrás/à esquerda (4 alinhamentos), a linha da esquerda e a de
 * trás, a ponta da bolha (sempre a mais à esquerda) e move linhas, bolha, texto e cota. A escolha tem histerese; as
 * posições são contínuas, então durante a órbita o conjunto acompanha a câmera sem tremer.
 */
export function layoutLevels(group: THREE.Group, camera: THREE.Camera, forward: THREE.Vector3): void {
  const info = group.userData as LevelsGroupData;
  if (!info?.views?.length) return;
  const { box, data } = info;
  camera.updateMatrixWorld();
  const zRef = (Math.min(...data.map((d) => d.elevation)) + Math.max(...data.map((d) => d.elevation))) / 2;
  const projetar = (p: Vec2, z = zRef): THREE.Vector3 => new THREE.Vector3(p.x, p.y, z).project(camera);
  const lados = ladosDaCaixa(box);
  const cantos = cantosDaCaixa(box, lados);
  const xCanto = new Map<LevelCorner, number>();
  for (const c of cantos) {
    xCanto.set(c.id, projetar(c.p).x);
  }
  // Canto atrás da obra: os DOIS lados precisam estar atrás (o canto oposto à câmera). Entre eles, o mais à esquerda.
  const atrasDe = (c: CornerDef): number =>
    Math.min(
      c.sides[0].n.x * forward.x + c.sides[0].n.y * forward.y,
      c.sides[1].n.x * forward.x + c.sides[1].n.y * forward.y,
    );
  const candidatos = cantos.filter((c) => atrasDe(c) >= -0.001);
  const lista = candidatos.length ? candidatos : cantos;
  let melhor = lista[0]!;
  for (const c of lista) if ((xCanto.get(c.id) ?? 0) < (xCanto.get(melhor.id) ?? 0)) melhor = c;
  const atual = info.layout.corner === null ? undefined : cantos.find((c) => c.id === info.layout.corner);
  if (atual && atrasDe(atual) >= -0.05 && (xCanto.get(atual.id) ?? 0) <= (xCanto.get(melhor.id) ?? 0) + HISTERESE_CANTO) {
    melhor = atual;
  }

  // Dos dois lados do canto, o da esquerda é o que aponta mais para a esquerda da tela; o outro é o de trás.
  const esquerdaTela = { x: -forward.y, y: forward.x };
  const score = (s: SideDef): number => s.n.x * esquerdaTela.x + s.n.y * esquerdaTela.y;
  const [s1, s2] = melhor.sides;
  let esquerda = score(s1) >= score(s2) ? s1 : s2;
  if (info.layout.corner === melhor.id && info.layout.leftSide !== null && Math.abs(score(s1) - score(s2)) < HISTERESE_LADO) {
    const anterior = info.layout.leftSide === s1.id ? s1 : info.layout.leftSide === s2.id ? s2 : null;
    if (anterior) esquerda = anterior;
  }
  const tras = esquerda.id === s1.id ? s2 : s1;

  // A bolha fica na ponta da esquerda do lado esquerdo; a linha vai dela até o canto (o outro extremo do lado).
  const xa = projetar(esquerda.a).x;
  const xb = projetar(esquerda.b).x;
  const pontaEsquerda: 'a' | 'b' = xa <= xb ? 'a' : 'b';
  let ponta = pontaEsquerda;
  if (info.layout.leftSide === esquerda.id && info.layout.bubbleEnd !== null) {
    const anterior = info.layout.bubbleEnd;
    const xAtual = anterior === 'a' ? xa : xb;
    const xOutra = anterior === 'a' ? xb : xa;
    if (xAtual <= xOutra + HISTERESE_PONTA) ponta = anterior;
  }
  info.layout = { corner: melhor.id, leftSide: esquerda.id, bubbleEnd: ponta };

  const bubbleP = ponta === 'a' ? esquerda.a : esquerda.b;
  const otherP = ponta === 'a' ? esquerda.b : esquerda.a;
  // A linha de trás sai do canto e passa do outro extremo do lado de trás.
  const backOther = tras.a.x === melhor.p.x && tras.a.y === melhor.p.y ? tras.b : tras.a;
  const alongBack = normalizar({ x: backOther.x - melhor.p.x, y: backOther.y - melhor.p.y });
  const backEnd = { x: backOther.x + alongBack.x * MARGEM_LINHA, y: backOther.y + alongBack.y * MARGEM_LINHA };
  const along = normalizar({ x: otherP.x - bubbleP.x, y: otherP.y - bubbleP.y });
  const aspecto = aspectoDaCamera(camera);

  // O pivô do texto é a borda esquerda (centro em (0, 0.5)): o texto começa depois da bolha, na direção da linha, e
  // gira em torno desse ponto sem deslocar o início.
  const inicioTexto = LADO_BOLHA / 2 + GAP_TEXTO;
  for (const view of info.views) {
    const z = view.datum.elevation;
    // Rotação no plano da tela para o texto seguir a linha da esquerda (billboard continua de pé e legível). A
    // projeção é feita na elevação do próprio nível; em NDC o y já está para cima e o x é esticado pelo aspecto,
    // então o ângulo em pixels é atan2(Δy, Δx * aspecto).
    const a = projetar(bubbleP, z);
    const b = projetar(otherP, z);
    const angulo = anguloLegivel(Math.atan2(b.y - a.y, (b.x - a.x) * aspecto));
    moverLinha(view.line, bubbleP.x, bubbleP.y, z, otherP.x, otherP.y, z);
    moverLinha(view.lineBack, melhor.p.x, melhor.p.y, z, backEnd.x, backEnd.y, z);
    view.bubble.position.set(bubbleP.x, bubbleP.y, z);
    view.text.position.set(bubbleP.x + along.x * inicioTexto, bubbleP.y + along.y * inicioTexto, z);
    (view.text.material as THREE.SpriteMaterial).rotation = angulo;
  }
  const n = esquerda.n;
  for (const dim of info.dimensions) {
    const sel = data.find((d) => d.levelId === dim.info.levelId);
    const vizinho = data.find((d) => d.levelId === dim.info.neighborId);
    if (!sel || !vizinho) continue;
    const z1 = Math.min(sel.elevation, vizinho.elevation);
    const z2 = Math.max(sel.elevation, vizinho.elevation);
    const cx = bubbleP.x + n.x * AFASTAMENTO_COTA;
    const cy = bubbleP.y + n.y * AFASTAMENTO_COTA;
    moverLinha(dim.line, cx, cy, z1, cx, cy, z2);
    moverSegmentos(dim.extensions, [
      bubbleP.x, bubbleP.y, z1, cx, cy, z1,
      bubbleP.x, bubbleP.y, z2, cx, cy, z2,
    ]);
    const tique = 0.26;
    moverSegmentos(dim.ticks, [
      cx - along.x * tique, cy - along.y * tique, z1, cx + along.x * tique, cy + along.y * tique, z1,
      cx - along.x * tique, cy - along.y * tique, z2, cx + along.x * tique, cy + along.y * tique, z2,
    ]);
    // Etiqueta sobre a própria linha de cota, no meio do intervalo entre os dois níveis.
    dim.label.position.set(cx, cy, (z1 + z2) / 2);
  }
}

/** Normaliza um vetor 2D. */
function normalizar(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/** Ângulo de uma reta no intervalo (−π/2, π/2], para o texto nunca ficar de cabeça para baixo. */
function anguloLegivel(angulo: number): number {
  let a = angulo;
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

/** Proporção largura/altura da tela, para a rotação do texto ser a mesma da linha em pixels. */
function aspectoDaCamera(camera: THREE.Camera): number {
  const p = camera as THREE.PerspectiveCamera;
  if (typeof p.aspect === 'number' && p.aspect > 0) return p.aspect;
  const o = camera as THREE.OrthographicCamera;
  return Math.max(1e-6, (o.right - o.left) / Math.max(1e-6, o.top - o.bottom));
}

/** Atualiza uma linha de 2 pontos (e as distâncias do tracejado). */
function moverLinha(linha: THREE.Line, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  const pos = linha.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, ax, ay, az);
  pos.setXYZ(1, bx, by, bz);
  pos.needsUpdate = true;
  linha.geometry.computeBoundingSphere();
  linha.computeLineDistances();
}

/** Atualiza uma `LineSegments` de 4 pontos (12 números). */
function moverSegmentos(linha: THREE.LineSegments, valores: readonly number[]): void {
  const pos = linha.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < valores.length / 3; i++) pos.setXYZ(i, valores[i * 3]!, valores[i * 3 + 1]!, valores[i * 3 + 2]!);
  pos.needsUpdate = true;
  linha.geometry.computeBoundingSphere();
}

/** Canvas 2D do tamanho pedido; `null` fora do navegador (testes em node) ou sem contexto 2D. */
function canvasComContexto(
  largura: number,
  altura: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

/** Cor numérica do three.js em `#rrggbb`, para o canvas 2D. */
function hex(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}

/**
 * Textura da bolha do nível: círculo com a cor de fundo da paleta, borda azul e 4 quadrantes, 2 opostos preenchidos
 * (como o Level Head–Circle do Revit). Sem canvas (testes), devolve `null` e a bolha fica só com o material.
 */
function texturaDaBolha(cores: LevelPalette): THREE.CanvasTexture | null {
  const alvo = canvasComContexto(128, 128);
  if (!alvo) return null;
  const { ctx } = alvo;
  const centro = 64;
  const raio = 60;
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(centro, centro, raio, 0, Math.PI * 2);
  ctx.fillStyle = hex(cores.bubble);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(centro, centro, raio, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = hex(cores.bubbleBorder);
  ctx.fillRect(centro - raio, centro - raio, raio, raio);
  ctx.fillRect(centro, centro, raio, raio);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centro, centro, raio - 2, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = hex(cores.bubbleBorder);
  ctx.stroke();
  return texturaDeCanvas(alvo.canvas);
}

/** Textura do texto do nível: fundo transparente, fonte legível, cor da paleta, alinhado à esquerda. */
function texturaDoTexto(texto: string, cores: LevelPalette): THREE.CanvasTexture | null {
  const alvo = canvasComContexto(768, 128);
  if (!alvo) return null;
  const { ctx } = alvo;
  ctx.clearRect(0, 0, 768, 128);
  ctx.font = 'bold 64px sans-serif';
  // Encolhe a fonte se o nome for comprido, para o texto não ser cortado pelo canvas.
  const largura = ctx.measureText(texto).width;
  if (largura > 748) ctx.font = `bold ${Math.floor((64 * 748) / largura)}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hex(cores.text);
  ctx.fillText(texto, 10, 64);
  return texturaDeCanvas(alvo.canvas);
}

/** Textura da etiqueta da cota: valor em fundo e borda da paleta. */
function texturaDaCota(value: number, cores: LevelPalette): THREE.CanvasTexture | null {
  const alvo = canvasComContexto(320, 96);
  if (!alvo) return null;
  const { ctx } = alvo;
  ctx.clearRect(0, 0, 320, 96);
  ctx.fillStyle = hex(cores.dimension);
  ctx.fillRect(2, 2, 316, 92);
  ctx.strokeStyle = hex(cores.dimensionBorder);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 316, 92);
  // units-ok: rótulo da cota de nível no 3D (m)
  const texto = `${value.toFixed(2).replace('.', ',')} m`;
  ctx.fillStyle = hex(cores.dimensionText);
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 160, 50);
  return texturaDeCanvas(alvo.canvas);
}

/** Textura sRGB a partir do canvas desenhado. */
function texturaDeCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

/** Libera geometrias, materiais e texturas (inclusive as de canvas) do grupo de níveis, sem liberar duas vezes. */
export function disposeLevels(group: THREE.Group): void {
  const geometrias = new Set<THREE.BufferGeometry>();
  const materiais = new Set<THREE.Material>();
  const texturas = new Set<THREE.Texture>();
  group.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry;
    if (geo) geometrias.add(geo);
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      materiais.add(m);
      const mapa = (m as THREE.MeshBasicMaterial).map;
      if (mapa) texturas.add(mapa);
    }
  });
  for (const t of texturas) t.dispose();
  for (const m of materiais) m.dispose();
  for (const g of geometrias) g.dispose();
  group.clear();
}
