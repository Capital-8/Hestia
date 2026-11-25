import type * as THREE from 'three';
import { primsOfCode } from './hatchDefs.ts';
import type { Viewport } from '../viewport.ts';
import type { PlanScene } from './gpuPlan.ts';

/**
 * Rasterizador de software da planta, só para testes: emula os vertex e fragment shaders da cena (traço, faixa, marcador
 * e hachura procedural) e a mistura alfa de cada material, sem renderer. Serve para conferir que a imagem não muda quando
 * só o zoom muda.
 */

/** Tipo de material, pelo uniform `uTipo` (0 preenchimento, 1 traço, 2 hachura, 3 preenchimento-marcador, 4 traço-marcador, 5 faixa). */
export function tipoDoMaterial(m: THREE.Mesh): number {
  const u = (m.material as THREE.ShaderMaterial & { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (!u) return 0;
  return (u.uTipo?.value as number | undefined) ?? 1;
}

/** Vértice como o vertex shader o põe em metros, com os varyings que o fragment shader lê. */
export interface VerticeEmulado {
  x: number;
  y: number;
  /** Coordenada do mundo antes do deslocamento de tela (para a hachura procedural). */
  wx: number;
  wy: number;
  dist: number;
  meia: number;
  padrao: [number, number];
  /** Lado da região na faixa de contorno (`aBanda * aExt.y`); 1 nos demais materiais. */
  lado: number;
  /** Zoom mínimo da hachura (vem de `position.z`; 0 nos demais materiais). */
  zoomMin: number;
  /** O traço aparece neste zoom? (`aPadrao.z`, o zoom mínimo, como o vertex shader o aplica). Preenchimento: sim. */
  visivel: boolean;
}

/**
 * Vértice `k` da geometria com o deslocamento do shader para o zoom dado. Sem `aExt` (preenchimento, hachura e marcador
 * de preenchimento) devolve a posição (com `aDesl / zoom`, no marcador), sem tracejado.
 */
export function verticeEmulado(geo: THREE.BufferGeometry, k: number, zoom: number, papel: boolean | { teto: number } = false): VerticeEmulado {
  const pos = geo.getAttribute('position');
  const wx = pos.getX(k);
  const wy = pos.getY(k);
  const desl = geo.getAttribute('aDesl');
  const x0 = desl ? wx + desl.getX(k) / zoom : wx;
  const y0 = desl ? wy + desl.getY(k) / zoom : wy;
  const ext = geo.getAttribute('aExt');
  if (!ext) return { x: x0, y: y0, wx, wy, dist: 0, meia: 0, padrao: [0, 0], lado: 1, zoomMin: 0, visivel: true };
  const dir = geo.getAttribute('aDir');
  const pad = geo.getAttribute('aPadrao');
  // Com `papel`, `aExt.z` é kPapel e a largura em pixels sai do zoom, com piso de 1 px, o fator e o teto (como o vertex shader).
  const pp = papel === true ? { teto: 1e9 } : papel;
  const larg = pp ? Math.min(pp.teto, ext.getW(k) * Math.max(1, ext.getZ(k) * zoom)) : ext.getZ(k);
  const meia = (0.5 * larg) / zoom;
  const along = ext.getX(k);
  const side = ext.getY(k);
  const ux = dir.getX(k);
  const uy = dir.getY(k);
  const banda = geo.getAttribute('aBanda');
  return {
    x: x0 + ux * along * meia - uy * side * meia,
    y: y0 + uy * along * meia + ux * side * meia,
    wx,
    wy,
    dist: dir.getZ(k) * zoom + along * 0.5 * larg,
    meia: 0.5 * larg,
    padrao: [pad.getX(k), pad.getY(k)],
    lado: banda ? banda.getX(k) * side : 1,
    zoomMin: 0,
    visivel: zoom >= pad.getZ(k),
  };
}

/** Vértice de preenchimento: a posição, sem deslocamento nem tracejado. */
export function verticePlano(geo: THREE.BufferGeometry, k: number): VerticeEmulado {
  const pos = geo.getAttribute('position');
  const x = pos.getX(k);
  const y = pos.getY(k);
  return { x, y, wx: x, wy: y, dist: 0, meia: 0, padrao: [0, 0], lado: 1, zoomMin: 0, visivel: true };
}

/** Vértice `k` da malha, com o shader do material dela. Preenchimento/hachura ignoram atributos de traço que a malha
 * reaproveitada possa guardar (o teste não pode ler o que o material não declara). */
export function verticeDaMalha(m: THREE.Mesh, k: number, zoom: number): VerticeEmulado {
  const tipo = tipoDoMaterial(m);
  if (tipo === 1 || tipo === 4 || tipo === 5) {
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    const papel = u.uPapel?.value === 1 ? { teto: (u.uTeto?.value as number | undefined) ?? 1e9 } : false;
    return verticeEmulado(m.geometry, k, zoom, papel);
  }
  const pos = m.geometry.getAttribute('position');
  const wx = pos.getX(k);
  const wy = pos.getY(k);
  const desl = tipo === 3 ? m.geometry.getAttribute('aDesl') : undefined;
  return { x: desl ? wx + desl.getX(k) / zoom : wx, y: desl ? wy + desl.getY(k) / zoom : wy, wx, wy, dist: 0, meia: 0, padrao: [0, 0], lado: 1, zoomMin: tipo === 2 ? pos.getZ(k) : 0, visivel: true };
}

/** Malhas da cena na ordem de desenho (`renderOrder`), todas as camadas juntas. */
export function malhasNaOrdem(scene: PlanScene): THREE.Mesh[] {
  const grupos = scene.scene.children as THREE.Group[];
  return grupos.flatMap((g) => g.children as THREE.Mesh[]).sort((a, b) => a.renderOrder - b.renderOrder);
}

/**
 * Cobertura (0 a 1) da hachura no pixel centrado neste ponto do mundo: a mesma conta analítica do fragment shader
 * (`FRAGMENT_HACHURA`), que suaviza as linhas, os pontos e as bordas dos tracejados em vez de pintar pixels inteiros.
 */
export function hachuraCobertura(kind: number, x: number, y: number, zoom: number, zoomMin: number, espaco: number, linhaPx: number, pontoPx: number, pontoM: number): number {
  if (zoom < zoomMin) return 0;
  if (kind === 0) return 1;
  const COS45 = 0.7071067811865476;
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  const mod = (a: number, b: number): number => a - b * Math.floor(a / b);
  const cobLinha = (s: number, p: number, w: number): number => {
    // Passo menor que um pixel: as linhas não se resolvem (moiré); vale a densidade média, um tom uniforme.
    const passoPx = p * zoom;
    if (passoPx < 1) return Math.min(1, w / passoPx);
    const k = Math.floor(s / p + 0.5);
    const d = Math.abs(s - k * p) * zoom;
    return Math.min(w, clamp01(0.5 * w + 0.5 - d));
  };
  const cobTraco = (u: number, per: number, on: number, fase: number): number => {
    const f = mod(u - fase, per);
    const sd = f <= on ? Math.min(f, on - f) : -Math.min(f - on, per - f);
    return clamp01(0.5 + sd * zoom);
  };
  const diag1 = (-x + y) * COS45;
  const diag2 = (x + y) * COS45;
  let c = 0;
  if (kind === 1 || kind === 2) {
    c = cobLinha(diag1, espaco, linhaPx);
    if (kind === 2) c = Math.max(c, cobLinha(diag2, espaco, linhaPx));
  } else if (kind === 3) {
    c = cobLinha(y, espaco, linhaPx) * cobTraco(x, espaco, (espaco * 10) / 16, 0);
  } else if (kind === 4) {
    c = cobLinha(y, espaco, pontoPx) * cobTraco(x, espaco, pontoM, 0.5 * espaco);
  } else if (kind === 5) {
    c = Math.max(cobLinha(diag1, espaco, linhaPx), cobLinha(diag2, 3 * espaco, linhaPx));
  } else if (kind === 6) {
    const passo = 1.3 * espaco;
    const linha = Math.floor(y / passo + 0.5);
    const desl = Math.abs(linha) % 2 > 0.5 ? 0.5 * passo : 0;
    c = Math.max(cobLinha(diag1, 3 * espaco, linhaPx), cobLinha(y, passo, pontoPx) * cobTraco(x, passo, pontoM, desl));
  } else if (kind === 7) {
    c = cobLinha(y, 0.8 * espaco, linhaPx);
  } else if (kind === 8) {
    c = cobLinha(diag1, espaco, linhaPx) * cobTraco(diag2, 2.25 * espaco, 1.5 * espaco, 0);
  } else if (kind === 9) {
    c = cobLinha(diag2, 2 * espaco, linhaPx) * cobTraco((x - y) * COS45, 2 * espaco, espaco, 0);
  }
  if (kind >= 10) {
    for (const pr of primsOfCode(kind)) {
      let cp = 0;
      if (pr.t === 'line') {
        const a = (pr.ang * Math.PI) / 180;
        const sn = -Math.sin(a) * x + Math.cos(a) * y;
        const un = Math.cos(a) * x + Math.sin(a) * y;
        cp = cobLinha(sn, pr.pitch * espaco, linhaPx);
        if (pr.on !== undefined && pr.off !== undefined) cp *= cobTraco(un, (pr.on + pr.off) * espaco, pr.on * espaco, (pr.phase ?? 0) * espaco);
      } else {
        const passo = pr.pitch * espaco;
        const linha = Math.floor(y / passo + 0.5);
        const desl = Math.abs(linha) % 2 > 0.5 ? 0.5 * passo : 0;
        cp = cobLinha(y, passo, pontoPx) * cobTraco(x, passo, pontoM, desl);
      }
      c = Math.max(c, cp);
    }
  }
  return c < 0.02 ? 0 : c;
}

/** A hachura cobre este ponto do mundo? Verdadeiro quando a cobertura passa de 50 % (o centro da linha, na espessura cheia). */
export function hachuraCobre(kind: number, x: number, y: number, zoom: number, zoomMin: number, espaco: number, linhaPx: number, pontoPx: number, pontoM: number): boolean {
  return hachuraCobertura(kind, x, y, zoom, zoomMin, espaco, linhaPx, pontoPx, pontoM) >= 0.5;
}

/**
 * Rasteriza as malhas em `W × H` pixels com a câmera dada, na ordem de `renderOrder`. Cada fragmento é interpolado a partir
 * dos vértices emulados; um fragmento de traço fora do tracejado, de faixa fora do lado da região ou de hachura fora do
 * padrão é descartado (como o `discard` do shader). Devolve RGB por pixel em `Float64Array`.
 */
export function rasterizarMalhas(malhas: readonly THREE.Mesh[], cam: THREE.OrthographicCamera, zoom: number, W: number, H: number): Float64Array {
  const esq = cam.position.x + cam.left;
  const dir = cam.position.x + cam.right;
  const topo = cam.position.y + cam.top;
  const base = cam.position.y + cam.bottom;
  const buf = new Float64Array(W * H * 3).fill(1);
  for (const m of malhas) {
    const geo = m.geometry;
    const idx = geo.getIndex();
    if (!idx) continue;
    const tipo = tipoDoMaterial(m);
    const mat = m.material as THREE.MeshBasicMaterial & { uniforms?: Record<string, { value: unknown }> };
    const traco = tipo === 1 || tipo === 4 || tipo === 5;
    const cor = tipo > 0 ? (mat.uniforms!.uCor!.value as THREE.Color) : mat.color;
    const a = tipo > 0 ? (mat.uniforms!.uAlfa!.value as number) : mat.opacity;
    const { r, g, b } = cor;
    const vs = [0, 1, 2].map(() => ({ x: 0, y: 0, wx: 0, wy: 0, dist: 0, meia: 0, padrao: [0, 0] as [number, number], lado: 1, zoomMin: 0 }));
    // Só a faixa de desenho conta: o buffer pode ter capacidade sobrando (e restos de uma versão anterior do lote).
    const n = Math.min(idx.count, geo.drawRange.count);
    for (let t = 0; t < n; t += 3) {
      let escondido = false;
      for (let c = 0; c < 3; c++) {
        const k = idx.getX(t + c);
        const e = verticeDaMalha(m, k, zoom);
        if (!e.visivel) escondido = true;
        vs[c] = {
          x: ((e.x - esq) / (dir - esq)) * W,
          y: ((topo - e.y) / (topo - base)) * H,
          wx: e.wx,
          wy: e.wy,
          dist: e.dist,
          meia: e.meia,
          padrao: e.padrao,
          lado: e.lado,
          zoomMin: e.zoomMin,
        };
      }
      // Abaixo do zoom mínimo o shader tira os vértices da tela: o triângulo não é desenhado.
      if (escondido) continue;
      const [v0, v1, v2] = vs as [(typeof vs)[0], (typeof vs)[0], (typeof vs)[0]];
      const area = funcaoAresta(v0.x, v0.y, v1.x, v1.y, v2.x, v2.y);
      if (area === 0) continue;
      const x0m = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
      const x1m = Math.min(W - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)));
      const y0m = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
      const y1m = Math.min(H - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)));
      for (let y = y0m; y <= y1m; y++) {
        for (let x = x0m; x <= x1m; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const w0 = funcaoAresta(v1.x, v1.y, v2.x, v2.y, cx, cy) / area;
          const w1 = funcaoAresta(v2.x, v2.y, v0.x, v0.y, cx, cy) / area;
          const w2 = funcaoAresta(v0.x, v0.y, v1.x, v1.y, cx, cy) / area;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          if (tipo === 5 && w0 * v0.lado + w1 * v1.lado + w2 * v2.lado < 0) continue;
          if (traco && tipo !== 5 && descartado(w0 * v0.dist + w1 * v1.dist + w2 * v2.dist, v0.padrao, w0 * v0.meia + w1 * v1.meia + w2 * v2.meia)) continue;
          let cob = 1;
          if (tipo === 2) {
            const u = mat.uniforms!;
            const wx = w0 * v0.wx + w1 * v1.wx + w2 * v2.wx;
            const wy = w0 * v0.wy + w1 * v1.wy + w2 * v2.wy;
            cob = hachuraCobertura(
              u.uKind!.value as number, wx, wy, zoom, w0 * v0.zoomMin + w1 * v1.zoomMin + w2 * v2.zoomMin,
              u.uEspaco!.value as number,
              Math.min((u.uLinhaTeto?.value as number | undefined) ?? 1e9, Math.max(u.uLinhaPx!.value as number, ((u.uLinhaM?.value as number | undefined) ?? 0) * zoom)),
              Math.min((u.uPontoTeto?.value as number | undefined) ?? 1e9, Math.max(u.uPontoPx!.value as number, ((u.uPontoE?.value as number | undefined) ?? 0) * zoom)),
              u.uPontoM!.value as number,
            );
            if (cob <= 0) continue;
          }
          const k = (y * W + x) * 3;
          const af = a * cob;
          buf[k] = r * af + buf[k]! * (1 - af);
          buf[k + 1] = g * af + buf[k + 1]! * (1 - af);
          buf[k + 2] = b * af + buf[k + 2]! * (1 - af);
        }
      }
    }
  }
  return buf;
}

/** Rasteriza a cena da planta na vista dada (atualiza a câmera e o zoom antes, como o quadro faz). */
export function rasterizarCena(scene: PlanScene, v: Viewport, W: number, H: number): Float64Array {
  scene.setViewport(v);
  return rasterizarMalhas(malhasNaOrdem(scene), scene.camera, v.zoom, W, H);
}

/**
 * O tracejado do fragmento: `dist` em pixels, `padrao` (traço, período) e a meia espessura. Descarta quando o fragmento cai
 * no vão (fora da faixa de traço mais as pontas). Período 0 é linha inteira, nunca descarta.
 */
export function descartado(dist: number, padrao: [number, number], meia: number): boolean {
  const [traco, periodo] = padrao;
  if (periodo <= 0) return false;
  const r = dist - periodo * Math.floor(dist / periodo);
  return r > traco + meia && r < periodo - meia;
}

/** Função de aresta: positiva de um lado da reta de (ax, ay) a (bx, by), negativa do outro. */
export function funcaoAresta(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
