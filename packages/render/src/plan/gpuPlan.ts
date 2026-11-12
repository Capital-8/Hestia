import * as THREE from 'three';
import type { Viewport } from '../viewport.ts';
import type { FillOp, PlanDrawList, StrokeOp } from './types.ts';
import { CamadaGpu } from './camadaGpu.ts';
import { CODIGO_HACHURA, HACHURA_GPU, montarLotesCamada, SEM_TETO, type LoteGpu } from './lotesGpu.ts';

export { PlanFrame, planFrameUpdateOf, sameView } from './planFrame.ts';

/**
 * Camadas da cena da planta, na ordem de desenho: preenchimentos da geometria, da seleção, do hover, da camada viva e da
 * sobreposição provisória; a grade; e os traços das mesmas camadas. Cada uma tem o seu grupo e as suas malhas: refazer a
 * seleção, o hover ou o cursor não toca as outras.
 */
export type PlanSlot = 'fillsBase' | 'fillsSel' | 'fillsHover' | 'fillsLive' | 'fillsOver' | 'grid' | 'strokesGuarda' | 'strokesBase' | 'strokesSel' | 'strokesHover' | 'strokesLive' | 'strokesOver';
export const PLAN_SLOTS: readonly PlanSlot[] = ['grid', 'fillsBase', 'fillsSel', 'fillsHover', 'fillsLive', 'fillsOver', 'strokesGuarda', 'strokesBase', 'strokesSel', 'strokesHover', 'strokesLive', 'strokesOver'];
/** Faixa de `renderOrder` por camada: a ordem dentro de uma camada não alcança a seguinte. */
const SLOT_STRIDE = 1_000_000;

/**
 * Traço no vertex shader: cada vértice é deslocado em tela (metros = pixels / zoom). `aExt` é (ao longo, lado, largura, fator),
 * `aDir` é (ux, uy, distância ao início do traço em metros) e `aPadrao` é (traço, período em px, zoom mínimo). Com `uPapel` ligado,
 * a largura é `kPapel` (mm × escala ÷ 1000) e vira pixels pelo zoom, com piso de 1 px (como `paperMmToPx`), depois o
 * fator (`aExt.w`) e o teto (`uTeto`) do peso de papel; senão, é a largura em pixels de `aExt.z`.
 */
const VERTEX_TRACO = /* glsl */ `
attribute vec4 aExt;
attribute vec3 aDir;
attribute vec3 aPadrao;
uniform float uZoom;
uniform float uPapel;
uniform float uTeto;
varying float vDist;
varying float vMeia;
varying vec2 vPadrao;
void main() {
  float larg = uPapel > 0.5 ? min(uTeto, aExt.w * max(1.0, aExt.z * uZoom)) : aExt.z;
  float meia = 0.5 * larg / uZoom;
  vec2 u = aDir.xy;
  vec2 n = vec2(-u.y, u.x);
  vec2 p = position.xy + u * (aExt.x * meia) + n * (aExt.y * meia);
  vDist = aDir.z * uZoom + aExt.x * 0.5 * larg;
  vMeia = 0.5 * larg;
  vPadrao = aPadrao.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
  // Zoom mínimo do traço (hachura e linhas de interface): abaixo dele o vértice sai da tela e o traço some.
  if (uZoom < aPadrao.z) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

/** Traço-marcador: o deslocamento em pixels (`aDesl`) entra antes da espessura; o tamanho na tela não depende do zoom. */
const VERTEX_TRACO_MARCADOR = /* glsl */ `
attribute vec4 aExt;
attribute vec3 aDir;
attribute vec3 aPadrao;
attribute vec2 aDesl;
uniform float uZoom;
uniform float uPapel;
uniform float uTeto;
varying float vDist;
varying float vMeia;
varying vec2 vPadrao;
void main() {
  float larg = uPapel > 0.5 ? min(uTeto, aExt.w * max(1.0, aExt.z * uZoom)) : aExt.z;
  float meia = 0.5 * larg / uZoom;
  vec2 u = aDir.xy;
  vec2 n = vec2(-u.y, u.x);
  vec2 p = position.xy + aDesl / uZoom + u * (aExt.x * meia) + n * (aExt.y * meia);
  vDist = aDir.z * uZoom + aExt.x * 0.5 * larg;
  vMeia = 0.5 * larg;
  vPadrao = aPadrao.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
  if (uZoom < aPadrao.z) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

/** Faixa de contorno: só o lado da região (`aBanda * lado`) é desenhado; o resto do traço é descartado no fragmento. */
const VERTEX_BANDA = /* glsl */ `
attribute vec4 aExt;
attribute vec3 aDir;
attribute vec3 aPadrao;
attribute float aBanda;
uniform float uZoom;
uniform float uPapel;
uniform float uTeto;
varying float vDist;
varying float vMeia;
varying vec2 vPadrao;
varying float vLado;
void main() {
  float larg = uPapel > 0.5 ? min(uTeto, aExt.w * max(1.0, aExt.z * uZoom)) : aExt.z;
  float meia = 0.5 * larg / uZoom;
  vec2 u = aDir.xy;
  vec2 n = vec2(-u.y, u.x);
  vec2 p = position.xy + u * (aExt.x * meia) + n * (aExt.y * meia);
  vDist = aDir.z * uZoom + aExt.x * 0.5 * larg;
  vMeia = 0.5 * larg;
  vPadrao = aPadrao.xy;
  vLado = aBanda * aExt.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
}
`;

/** Traço no fragment shader: o tracejado recorta o fragmento pela distância em pixels; cada trecho ganha a ponta de meia espessura. */
const FRAGMENT_TRACO = /* glsl */ `
uniform vec3 uCor;
uniform float uAlfa;
varying float vDist;
varying float vMeia;
varying vec2 vPadrao;
void main() {
  if (vPadrao.y > 0.0) {
    float r = mod(vDist, vPadrao.y);
    if (r > vPadrao.x + vMeia && r < vPadrao.y - vMeia) discard;
  }
  gl_FragColor = vec4(uCor, uAlfa);
  #include <colorspace_fragment>
}
`;

/** Faixa: descarta a metade externa (o lado oposto ao da região) e pinta o resto como o traço. */
const FRAGMENT_BANDA = /* glsl */ `
uniform vec3 uCor;
uniform float uAlfa;
varying float vLado;
void main() {
  if (vLado < 0.0) discard;
  gl_FragColor = vec4(uCor, uAlfa);
  #include <colorspace_fragment>
}
`;

/** Preenchimento-marcador: a posição anda em pixels (`aDesl`) com o zoom corrente; a forma na tela fica fixa. */
const VERTEX_MARCADOR = /* glsl */ `
attribute vec2 aDesl;
uniform float uZoom;
void main() {
  vec3 p = position;
  p.xy += aDesl / uZoom;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT_COR = /* glsl */ `
uniform vec3 uCor;
uniform float uAlfa;
void main() {
  gl_FragColor = vec4(uCor, uAlfa);
  #include <colorspace_fragment>
}
`;

/**
 * Hachura procedural: o polígono triangulado é só o recorte; as linhas/pontos saem do fragmento em coordenadas do mundo
 * (espaçamento de 0,05 m, linha de 1 px e ponto de 2 px — os mesmos números do padrão vetorial antigo). O zoom mínimo vem
 * por vértice em `position.z`; abaixo dele o fragmento some, sem refazer a geometria.
 */
const VERTEX_HACHURA = /* glsl */ `
varying vec2 vMundo;
varying float vZoomMin;
void main() {
  vMundo = position.xy;
  vZoomMin = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_HACHURA = /* glsl */ `
uniform vec3 uCor;
uniform float uAlfa;
uniform float uZoom;
uniform int uKind;
uniform float uEspaco;
uniform float uLinhaPx;
uniform float uPontoPx;
uniform float uPontoM;
varying vec2 vMundo;
varying float vZoomMin;
const float COS45 = 0.7071067811865476;
/** 1 quando a coordenada s está a menos de meia px de uma linha da grade de espaçamento uEspaco. */
float perto(float s, float meia) {
  float k = floor(s / uEspaco + 0.5);
  return step(abs(s - k * uEspaco) * uZoom, meia);
}
void main() {
  if (uZoom < vZoomMin) discard;
  float meiaLinha = 0.5 * uLinhaPx;
  float c = 0.0;
  if (uKind == 0) {
    // Sólido: a cor de preenchimento inteira (o zoom mínimo continua valendo).
    c = 1.0;
  } else if (uKind == 1 || uKind == 2) {
    c = max(c, perto((-vMundo.x + vMundo.y) * COS45, meiaLinha));
    if (uKind == 2) c = max(c, perto((vMundo.x + vMundo.y) * COS45, meiaLinha));
  } else if (uKind == 3) {
    // Gesso: linha horizontal contínua, pintada em 10/16 do passo ao longo de x.
    float f = fract(vMundo.x / uEspaco);
    c = perto(vMundo.y, meiaLinha) * step(f, 10.0 / 16.0);
  } else if (uKind == 4) {
    // Pontos: um traço de uPontoM m a partir do meio do passo, na linha horizontal, com uPontoPx de espessura.
    float dx = (fract(vMundo.x / uEspaco) - 0.5) * uEspaco;
    c = perto(vMundo.y, 0.5 * uPontoPx) * step(0.0, dx) * step(dx, uPontoM);
  }
  if (c < 0.5) discard;
  gl_FragColor = vec4(uCor, uAlfa);
  #include <colorspace_fragment>
}
`;

/** Cena ortográfica 2D: consome as camadas de desenho neutras e as transforma em malhas na GPU. */
export class PlanScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  /** Zoom da vista, compartilhado por todos os materiais: trocá-lo não refaz a geometria. */
  private readonly uZoom = { value: 1 };
  private camadas = new Map<PlanSlot, CamadaGpu>();
  private mats = new Map<string, THREE.Material>();

  constructor() {
    PLAN_SLOTS.forEach((s, i) => {
      const grupo = new THREE.Group();
      this.scene.add(grupo);
      this.camadas.set(s, new CamadaGpu(grupo, (lote) => this.materialDo(lote), i * SLOT_STRIDE));
    });
    this.camera.position.set(0, 0, 10);
  }

  /**
   * Todo material é transparente (mesmo opaco): o three.js desenha os opacos antes dos transparentes, e isso poria a hachura
   * por cima das paredes, que vêm depois na lista. Com tudo transparente, a ordem é a da lista (`renderOrder`),
   * como no CPU (decisão 0015 §2.4).
   */
  private materialDo(lote: LoteGpu): THREE.Material {
    const key = lote.material ?? lote.key;
    let m = this.mats.get(key);
    if (!m) {
      if (lote.hatch) m = this.materialHachura(lote);
      else if (lote.banda) m = this.materialBanda(lote);
      else if (lote.traco && lote.traco.desl) m = this.materialTracoMarcador(lote);
      else if (lote.traco) m = this.materialTraco(lote);
      else if (lote.desl) m = this.materialPreenchimentoMarcador(lote);
      else m = this.materialPreenchimento(lote);
      this.mats.set(key, m);
    }
    return m;
  }

  private materialPreenchimento(lote: LoteGpu): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(lote.color),
      transparent: true,
      opacity: lote.alpha,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Material de traço: a espessura e o tracejado saem do shader, com o zoom compartilhado (`uZoom`). */
  private materialTraco(lote: LoteGpu): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uZoom: this.uZoom, uPapel: { value: lote.papel ? 1 : 0 }, uTeto: { value: lote.papel?.teto ?? SEM_TETO }, uCor: { value: new THREE.Color(lote.color) }, uAlfa: { value: lote.alpha }, uTipo: { value: 1 } },
      vertexShader: VERTEX_TRACO,
      fragmentShader: FRAGMENT_TRACO,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private materialTracoMarcador(lote: LoteGpu): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uZoom: this.uZoom, uPapel: { value: lote.papel ? 1 : 0 }, uTeto: { value: lote.papel?.teto ?? SEM_TETO }, uCor: { value: new THREE.Color(lote.color) }, uAlfa: { value: lote.alpha }, uTipo: { value: 4 } },
      vertexShader: VERTEX_TRACO_MARCADOR,
      fragmentShader: FRAGMENT_TRACO,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private materialBanda(lote: LoteGpu): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uZoom: this.uZoom, uPapel: { value: lote.papel ? 1 : 0 }, uTeto: { value: lote.papel?.teto ?? SEM_TETO }, uCor: { value: new THREE.Color(lote.color) }, uAlfa: { value: lote.alpha }, uTipo: { value: 5 } },
      vertexShader: VERTEX_BANDA,
      fragmentShader: FRAGMENT_BANDA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private materialPreenchimentoMarcador(lote: LoteGpu): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uZoom: this.uZoom, uCor: { value: new THREE.Color(lote.color) }, uAlfa: { value: lote.alpha }, uTipo: { value: 3 } },
      vertexShader: VERTEX_MARCADOR,
      fragmentShader: FRAGMENT_COR,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private materialHachura(lote: LoteGpu): THREE.ShaderMaterial {
    const h = lote.hatch!;
    return new THREE.ShaderMaterial({
      uniforms: {
        uZoom: this.uZoom,
        uCor: { value: new THREE.Color(lote.color) },
        uAlfa: { value: lote.alpha },
        uKind: { value: CODIGO_HACHURA[h.kind] },
        uEspaco: { value: HACHURA_GPU.espaco },
        uLinhaPx: { value: HACHURA_GPU.linhaPx },
        uPontoPx: { value: HACHURA_GPU.pontoPx },
        uPontoM: { value: HACHURA_GPU.pontoM },
        uTipo: { value: 2 },
      },
      vertexShader: VERTEX_HACHURA,
      fragmentShader: FRAGMENT_HACHURA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  setViewport(v: Viewport): void {
    const hw = v.width / 2 / v.zoom;
    const hh = v.height / 2 / v.zoom;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.position.set(v.cx, v.cy, 10);
    this.camera.updateProjectionMatrix();
    // Zoom só muda o uniform: nenhum buffer é reescrito, os lotes já são independentes do zoom.
    this.uZoom.value = v.zoom;
  }

  setBackground(color: string): void {
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Refaz uma camada: preenchimentos (com a hachura procedural), traços, faixas e marcadores. A espessura dos traços, a
   * hachura e os marcadores usam o zoom corrente no shader, então `v` só atualiza o uniform. Listas vazias limpam a camada.
   * Só a camada indicada é tocada; as malhas e os buffers que já existem são reaproveitados.
   */
  setSlot(slot: PlanSlot, fills: FillOp[], strokes: StrokeOp[], v: Viewport): void {
    this.uZoom.value = v.zoom;
    this.camadas.get(slot)!.aplicar(montarLotesCamada(fills, strokes));
  }

  /** Lista de desenho inteira (fundo, preenchimentos e traços) numa só troca: as camadas de sobreposição e grade ficam vazias. */
  setDrawList(dl: PlanDrawList, v: Viewport): void {
    this.setBackground(dl.background);
    for (const s of PLAN_SLOTS) this.setSlot(s, [], [], v);
    this.setSlot('fillsBase', dl.fills, [], v);
    this.setSlot('strokesBase', [], dl.strokes, v);
  }

  dispose(): void {
    for (const c of this.camadas.values()) c.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}
