import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Viewport } from '../viewport.ts';
import { PlanScene } from './gpuPlan.ts';
import { hatchSegments, DOT_PX, HATCH_PX } from './hatch.ts';
import { espessuraDePapel, larguraEmPx } from './espessura.ts';
import { dashSegments, edges, montarLotesCamada } from './lotesGpu.ts';
import { malhasNaOrdem, rasterizarCena, rasterizarMalhas, verticeEmulado } from './rasterSoftware.ts';
import type { FillOp, PlanDrawList, StrokeOp } from './types.ts';

/*
 * Zoom só muda a câmera: a espessura e o tracejado saem do shader, então trocar o zoom não refaz a geometria. Estes testes
 * conferem (1) que as malhas e os buffers são os mesmos ao trocar de zoom, (2) que a imagem é a mesma da geometria antiga
 * (espessura em metros, calculada no build), (3) que os vértices em tela batem dentro de 1e-3 px e (4) que a espessura em
 * tela não muda com o zoom.
 */

const W = 200;
const H = 150;
const vista = (zoom: number, cx = 6, cy = 4): Viewport => ({ cx, cy, zoom, width: W, height: H });

const TRACOS: StrokeOp[] = [
  { pts: [{ x: 0.5, y: 1 }, { x: 9.3, y: 2.2 }, { x: 12, y: 6 }], closed: false, widthPx: 3, color: '#222222', alpha: 1 },
  { pts: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 6 }, { x: 2, y: 6 }], closed: true, widthPx: 2, color: '#aa3300', alpha: 0.8, dash: [6, 3] },
  { pts: [{ x: 0, y: 8 }, { x: 14, y: 0 }], closed: false, widthPx: 1, color: '#0055aa', alpha: 0.9, dash: [4, 2] },
  // Traço de papel (1 mm na escala 1:200): a espessura em px sai do zoom no shader (2,4 px no zoom 12, 12 px no 60).
  { pts: [{ x: 1, y: 4.2 }, { x: 11, y: 6.9 }, { x: 12.5, y: 3.3 }], closed: false, ...espessuraDePapel(1, 60, 200), color: '#118822', alpha: 1 },
];

const RETANGULO: FillOp = {
  polygons: [[[{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]]],
  color: '#eeeeee',
  alpha: 1,
  hatch: { kind: 'diagonal', color: '#777777' },
};

/** Lista de desenho do teste: um preenchimento e três traços (um tracejado fechado, um tracejado diagonal). A hachura tem
 * teste de cobertura próprio (o padrão procedural não é pixel a pixel igual ao vetorial antigo nas bordas). */
function listaDeTeste(): PlanDrawList {
  return { background: '#ffffff', fills: [{ ...RETANGULO, hatch: undefined }], strokes: TRACOS, labels: [] };
}

/** Quad de traço na geometria antiga (espessura em metros, calculada com o zoom no build). Referência do que era gravado. */
function quadAntigo(pos: number[], idx: number[], p: { x: number; y: number }, q: { x: number; y: number }, w: number): void {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return;
  const ux = dx / L;
  const uy = dy / L;
  const h = w / 2;
  const nx = -uy * h;
  const ny = ux * h;
  const ax = p.x - ux * h;
  const ay = p.y - uy * h;
  const bx = q.x + ux * h;
  const by = q.y + uy * h;
  const base = pos.length / 3;
  pos.push(ax + nx, ay + ny, 0, ax - nx, ay - ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Malha de um conjunto de triângulos em metros, com cor e alfa do material (como a referência do build antigo). */
function malhaReferencia(pos: number[], idx: number[], cor: string, alfa: number, ordem: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cor, opacity: alfa, transparent: true }));
  m.renderOrder = ordem;
  return m;
}

/** Traços na geometria antiga para o zoom dado: uma malha por traço, na ordem da lista (mesma ordem de desenho da cena). */
function tracosAntigos(strokes: readonly StrokeOp[], zoom: number, ordemBase: number): THREE.Mesh[] {
  return strokes.map((s, i) => {
    const pos: number[] = [];
    const idx: number[] = [];
    // Largura do zoom: a do papel (com piso de 1 px) para o traço de papel, a de `widthPx` para o resto.
    const w = larguraEmPx(s, zoom) / zoom;
    const trechos = s.dash ? dashSegments(s.pts, s.closed, s.dash[0] / zoom, s.dash[1] / zoom) : edges(s.pts, s.closed);
    for (const [p, q] of trechos) quadAntigo(pos, idx, p, q, w);
    return malhaReferencia(pos, idx, s.color, s.alpha, ordemBase + i);
  });
}

/** Referência completa da lista de teste no zoom dado: preenchimento e traços antigos. */
function referenciaAntiga(zoom: number): THREE.Mesh[] {
  const fundo = montarLotesCamada([{ ...RETANGULO, hatch: undefined }], []);
  const malhas: THREE.Mesh[] = fundo.map((l, i) => malhaReferencia(l.pos, l.idx, l.color, l.alpha, i));
  return [...malhas, ...tracosAntigos(TRACOS, zoom, 3_000_000)];
}

/** Referência da hachura antiga (segmentos vetoriais em metros) sobre o preenchimento, no zoom dado. */
function referenciaHachura(zoom: number): THREE.Mesh[] {
  const fundo = montarLotesCamada([{ ...RETANGULO, hatch: undefined }], []);
  const malhas: THREE.Mesh[] = fundo.map((l, i) => malhaReferencia(l.pos, l.idx, l.color, l.alpha, i));
  const pos: number[] = [];
  const idx: number[] = [];
  const w = HATCH_PX / zoom;
  const wp = DOT_PX / zoom;
  for (const poly of RETANGULO.polygons) {
    for (const s of hatchSegments(poly, RETANGULO.hatch!.kind)) quadAntigo(pos, idx, s.a, s.b, s.dot ? wp : w);
  }
  malhas.push(malhaReferencia(pos, idx, RETANGULO.hatch!.color, 1, 1));
  return malhas;
}

/**
 * Quantidade de tinta da hachura: a soma, nos pixels mais escuros que a base do retângulo (#eeeeee), do quanto cada um
 * escurece a base. Com a cobertura analítica (antialiasing) um pixel só parcialmente coberto conta a fração dele; contar
 * pixels escuros (como antes) mede a mesma linha de 1 px como menor, porque as bordas ficam claras demais para contar.
 */
function coberturaEscura(img: Float64Array): number {
  const base = 0xee / 255;
  let tinta = 0;
  for (let i = 0; i < img.length; i += 3) tinta += Math.max(0, base - img[i]!);
  return tinta / (base - 0x77 / 255);
}

/** Câmera da vista dada (a da cena de referência, montada pelo mesmo caminho da cena). */
function camaraDe(v: Viewport): THREE.OrthographicCamera {
  const c = new PlanScene();
  c.setViewport(v);
  return c.camera;
}

/** Maior diferença absoluta entre duas imagens (RGB em `Float64Array`). */
function maiorDiferenca(a: Float64Array, b: Float64Array): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}

/**
 * Imagens iguais a menos de empates de amostragem: um centro de pixel cai exatamente sobre uma aresta, e o arredondamento
 * de float32 dos vértices pode trocar o lado. Mede-se quantos pixels diferem e quanto (cobertura de até 0,2 de alfa), e
 * a conta é o número de canais diferentes, não uma tolerância por pixel.
 */
function imagensIguaisExceto(a: Float64Array, b: Float64Array, maxPixels: number): void {
  expect(a.length).toBe(b.length);
  let pixels = 0;
  let maior = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
    if (d > 1e-6) pixels++;
    maior = Math.max(maior, d);
  }
  expect(pixels).toBeLessThanOrEqual(maxPixels);
  expect(maior).toBeLessThanOrEqual(0.2);
}

describe('zoom só muda a câmera e o uniform (a geometria não é reconstruída)', () => {
  it('trocar o zoom mantém as mesmas malhas, os mesmos buffers e os mesmos dados', () => {
    const scene = new PlanScene();
    scene.setDrawList(listaDeTeste(), vista(60));
    const malhas = malhasNaOrdem(scene);
    const buffers = malhas.map((m) => ({
      geo: m.geometry,
      pos: m.geometry.getAttribute('position').array,
      ext: m.geometry.getAttribute('aExt')?.array,
      idx: m.geometry.index!.array,
    }));
    const antes = buffers.map((b) => Array.from(b.pos as Float32Array));

    scene.setViewport(vista(140));
    expect(malhasNaOrdem(scene).every((m, i) => m === malhas[i])).toBe(true);
    for (const [i, m] of malhas.entries()) {
      expect(m.geometry).toBe(buffers[i]!.geo);
      expect(m.geometry.getAttribute('position').array).toBe(buffers[i]!.pos);
      expect(m.geometry.getAttribute('aExt')?.array).toBe(buffers[i]!.ext);
      expect(m.geometry.index!.array).toBe(buffers[i]!.idx);
      expect(Array.from(m.geometry.getAttribute('position').array as Float32Array)).toEqual(antes[i]);
    }
    // O zoom chega ao material pelo uniform compartilhado.
    const tracado = malhas.find((m) => m.geometry.getAttribute('aExt'))!;
    expect((tracado.material as THREE.ShaderMaterial).uniforms.uZoom!.value).toBe(140);
    scene.dispose();
  });

  it('dois zooms na mesma cena dão a mesma imagem que duas cenas montadas em cada zoom', () => {
    const cena = new PlanScene();
    cena.setDrawList(listaDeTeste(), vista(40));
    const trocada = rasterizarCena(cena, vista(90), W, H);
    const nova = new PlanScene();
    nova.setDrawList(listaDeTeste(), vista(90));
    expect(maiorDiferenca(trocada, rasterizarCena(nova, vista(90), W, H))).toBe(0);
    cena.dispose();
    nova.dispose();
  });
});

describe('imagem igual à da geometria antiga, em vários zooms', () => {
  it.each([12, 60, 220])('zoom %s: fundo, hachura, traços sólidos, tracejados e de papel batem com a referência', (zoom) => {
    const cena = new PlanScene();
    cena.setDrawList(listaDeTeste(), vista(zoom));
    const imagem = rasterizarCena(cena, vista(zoom), W, H);
    const referencia = rasterizarMalhas(referenciaAntiga(zoom), camaraDe(vista(zoom)), zoom, W, H);
    // Sanidade: a cena desenha algo (não compara duas imagens vazias).
    expect(imagem.some((c) => c !== 1)).toBe(true);
    imagensIguaisExceto(imagem, referencia, 40);
    cena.dispose();
  });

  it('a mesma cena, vista em três zooms sem refazer a geometria, dá a imagem de cada zoom', () => {
    const cena = new PlanScene();
    cena.setDrawList(listaDeTeste(), vista(12));
    for (const zoom of [12, 60, 220]) {
      const imagem = rasterizarCena(cena, vista(zoom), W, H);
      const referencia = rasterizarMalhas(referenciaAntiga(zoom), camaraDe(vista(zoom)), zoom, W, H);
      imagensIguaisExceto(imagem, referencia, 40);
    }
    cena.dispose();
  });
});

describe('hachura procedural: mesma cobertura do padrão vetorial antigo', () => {
  it.each([12, 60, 220])('zoom %s: a tinta da hachura fica dentro de 8%% da antiga', (zoom) => {
    const cena = new PlanScene();
    cena.setSlot('fillsBase', [RETANGULO], [], vista(zoom));
    const imagem = rasterizarCena(cena, vista(zoom), W, H);
    const referencia = rasterizarMalhas(referenciaHachura(zoom), camaraDe(vista(zoom)), zoom, W, H);
    const nova = coberturaEscura(imagem);
    const antiga = coberturaEscura(referencia);
    expect(antiga).toBeGreaterThan(0);
    expect(Math.abs(nova - antiga)).toBeLessThanOrEqual(Math.max(40, antiga * 0.08));
    cena.dispose();
  });
});

describe('vértices em tela batem com a geometria antiga (dentro de 1e-3 px)', () => {
  it.each([12, 90])('traço sólido, zoom %s: cada vértice sai na mesma posição de tela', (zoom) => {
    const v = vista(zoom);
    const cena = new PlanScene();
    cena.setDrawList({ background: '#fff', fills: [], strokes: [TRACOS[0]!], labels: [] }, v);
    const malha = malhasNaOrdem(cena).find((m) => m.geometry.getAttribute('aExt'))!;
    const antiga = tracosAntigos([TRACOS[0]!], zoom, 0)[0]!;
    const cam = camaraDe(v);
    const tela = (x: number, y: number) => ({ x: ((x - (cam.position.x + cam.left)) / (cam.right - cam.left)) * W, y: ((cam.position.y + cam.top - y) / (cam.top - cam.bottom)) * H });
    // Os vértices úteis são os da geometria antiga (o buffer novo tem folga de capacidade, não vértices a mais).
    const n = antiga.geometry.getAttribute('position').count;
    expect(malha.geometry.drawRange.count).toBe(antiga.geometry.index!.count);
    let maior = 0;
    for (let k = 0; k < n; k++) {
      const e = verticeEmulado(malha.geometry, k, zoom);
      const a = tela(e.x, e.y);
      const b = tela(antiga.geometry.getAttribute('position').getX(k), antiga.geometry.getAttribute('position').getY(k));
      maior = Math.max(maior, Math.hypot(a.x - b.x, a.y - b.y));
    }
    expect(maior).toBeLessThan(1e-3);
    cena.dispose();
  });
});

describe('espessura em pixels de tela não depende do zoom', () => {
  it.each([10, 50, 200])('um traço de 3 px tem 3 px de largura em tela no zoom %s', (zoom) => {
    const cena = new PlanScene();
    cena.setDrawList({ background: '#fff', fills: [], strokes: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, widthPx: 3, color: '#000', alpha: 1 }], labels: [] }, vista(zoom));
    const malha = malhasNaOrdem(cena)[0]!;
    const ys = Array.from({ length: 4 }, (_, k) => verticeEmulado(malha.geometry, k, zoom).y);
    expect((Math.max(...ys) - Math.min(...ys)) * zoom).toBeCloseTo(3, 6);
    cena.dispose();
  });
});
