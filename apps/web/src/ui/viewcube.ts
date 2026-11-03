import { POLE_ELEVATION, cameraBasis } from '@hestia/render';
import { t, type Dict, type Lang } from '../editor/i18n.ts';

/**
 * Lógica do ViewCube (cubo de navegação da vista 3D), sem DOM. Convenção dos eixos do app: x leste, y norte, z para
 * cima. FRONTAL é a face sul (a câmera olha de sul para norte); DIREITA é a face leste; POSTERIOR, a norte; ESQUERDA, a oeste.
 */

/** Sinais de uma zona nos eixos (x, y, z), cada um em {−1, 0, 1}. Zero = a zona não está nesse eixo. */
export type Sign3 = readonly [number, number, number];
export type Face = 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left';
export type ZoneKind = 'face' | 'edge' | 'corner';

export interface CubeZone {
  /** Identificador estável, usado em `data-face`: "top", "front-right", "top-front-left"… */
  id: string;
  kind: ZoneKind;
  sign: Sign3;
  /** Rótulo visível (só nas faces). */
  label: string;
  /** Nome da vista no idioma ativo (aria-label e title). */
  name: string;
}

/** Ordem das faces no cubo. */
export const CUBE_FACES: readonly Face[] = ['top', 'bottom', 'front', 'back', 'right', 'left'];

/** Adjetivo de cada face no nome da vista ("Vista superior", "Vista frontal"…). Os rótulos visíveis ficam em `FACE_LABEL_KEY`. */
const FACE_NAME_KEY: Record<Face, keyof Dict> = {
  top: 'cvn_vc_name_top',
  bottom: 'cvn_vc_name_bottom',
  front: 'cvn_vc_name_front',
  back: 'cvn_vc_name_back',
  right: 'cvn_vc_name_right',
  left: 'cvn_vc_name_left',
};
/** Rótulos visíveis das faces, iguais aos do Revit. Para trocar o texto, mude o dicionário. */
const FACE_LABEL_KEY: Record<Face, keyof Dict> = {
  top: 'cvn_vc_face_top',
  bottom: 'cvn_vc_face_bottom',
  front: 'cvn_vc_face_front',
  back: 'cvn_vc_face_back',
  right: 'cvn_vc_face_right',
  left: 'cvn_vc_face_left',
};

/** Vetor de três componentes a partir de uma função do índice do eixo. */
function vec3(f: (axis: number) => number): [number, number, number] {
  return [f(0), f(1), f(2)];
}

/** Face de um sinal num eixo (0 = x, 1 = y, 2 = z). */
function faceOf(axis: number, s: number): Face {
  if (axis === 0) return s > 0 ? 'right' : 'left';
  if (axis === 1) return s > 0 ? 'back' : 'front';
  return s > 0 ? 'top' : 'bottom';
}

/** Id de uma zona: faces de cima para baixo, depois frente/trás, depois direita/esquerda (ex.: "top-front-right"). */
export function zoneId(sign: Sign3): string {
  return [2, 1, 0]
    .filter((a) => sign[a] !== 0)
    .map((a) => faceOf(a, sign[a]!))
    .join('-');
}

function zoneOf(sign: Sign3, lang: Lang): CubeZone {
  const parts = [2, 1, 0].filter((a) => sign[a] !== 0).map((a) => faceOf(a, sign[a]!));
  const kind: ZoneKind = parts.length === 1 ? 'face' : parts.length === 2 ? 'edge' : 'corner';
  const names = parts.map((f) => t(lang, FACE_NAME_KEY[f]));
  const joined = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')}${t(lang, 'cvn_vc_join_and')}${names[names.length - 1]}`;
  const face = kind === 'face' ? (parts[0] as Face) : null;
  return {
    id: zoneId(sign),
    kind,
    sign,
    label: face ? t(lang, FACE_LABEL_KEY[face]) : '',
    name: t(lang, 'cvn_vc_view_name', { joined }),
  };
}

/** As 26 zonas clicáveis no idioma pedido: 6 faces, 12 arestas e 8 cantos. */
function buildZones(lang: Lang): readonly CubeZone[] {
  const out: CubeZone[] = [];
  for (const z of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const x of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;
        out.push(zoneOf([x, y, z], lang));
      }
  const rank: Record<ZoneKind, number> = { face: 0, edge: 1, corner: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

const ZONES_BY_LANG = new Map<Lang, readonly CubeZone[]>();

/** As 26 zonas clicáveis no idioma pedido (pt é o padrão e o fallback dos testes). */
export function cubeZones(lang: Lang = 'pt'): readonly CubeZone[] {
  let zonas = ZONES_BY_LANG.get(lang);
  if (!zonas) {
    zonas = buildZones(lang);
    ZONES_BY_LANG.set(lang, zonas);
  }
  return zonas;
}

/** Zonas em pt-BR (compatibilidade e testes). Componentes devem usar `cubeZones(lang)`. */
export const CUBE_ZONES: readonly CubeZone[] = cubeZones('pt');

const MAPS_BY_LANG = new Map<Lang, Map<string, CubeZone>>();

function zoneMap(lang: Lang): Map<string, CubeZone> {
  let mapa = MAPS_BY_LANG.get(lang);
  if (!mapa) {
    mapa = new Map(cubeZones(lang).map((z) => [z.id, z]));
    MAPS_BY_LANG.set(lang, mapa);
  }
  return mapa;
}

/** Zona de id dado no idioma pedido (lança se não existir: o id vem sempre de `zoneId`). */
export function zoneById(id: string, lang: Lang = 'pt'): CubeZone {
  const z = zoneMap(lang).get(id);
  if (!z) throw new Error(`zona desconhecida: ${id}`);
  return z;
}

/**
 * Vista (azimute, elevação) da zona. Faces laterais olham de frente para a face; arestas e cantos olham na diagonal
 * (direção = soma dos sinais). Topo e base mantêm o azimute atual, para não girar a tela ao subir ou descer.
 */
export function viewForZone(sign: Sign3, currentAzimuth: number): { azimuth: number; elevation: number } {
  const [x, y, z] = sign;
  if (x === 0 && y === 0) return { azimuth: currentAzimuth, elevation: z > 0 ? POLE_ELEVATION : -POLE_ELEVATION };
  return { azimuth: Math.atan2(y, x), elevation: Math.asin(z / Math.hypot(x, y, z)) };
}

/** Giro de 90° em volta do eixo vertical: +1 gira a vista para a esquerda (o modelo vai para a esquerda), −1 para a direita. */
export function turnAzimuth(azimuth: number, dir: 1 | -1): number {
  return azimuth + (dir * Math.PI) / 2;
}

/** Base de uma face no cubo: o vetor normal (para fora) e os vetores de linha (direita) e coluna (cima), vistos de fora. */
interface FrameOfFace {
  n: Sign3;
  r: Sign3;
  u: Sign3;
}
const FACE_FRAME: Record<Face, FrameOfFace> = {
  front: { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  back: { n: [0, 1, 0], r: [-1, 0, 0], u: [0, 0, 1] },
  right: { n: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1] },
  left: { n: [-1, 0, 0], r: [0, -1, 0], u: [0, 0, 1] },
  top: { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  bottom: { n: [0, 0, -1], r: [1, 0, 0], u: [0, -1, 0] },
};

/**
 * Zona da célula (linha, coluna) 0..2 de uma face, vista de fora: linha 0 é a borda de cima, coluna 0 a da esquerda.
 * O centro (1, 1) é a face; as bordas do meio são arestas; os cantos da grade são cantos.
 */
export function cellSign(face: Face, row: number, col: number): Sign3 {
  const f = FACE_FRAME[face];
  const su = col - 1;
  const sv = 1 - row;
  return vec3((i) => f.n[i]! + su * f.r[i]! + sv * f.u[i]!) as Sign3;
}

/** Meio lado do cubo em px (o cubo tem 64 px de lado; é a mesma constante de `--vc-half` no CSS). */
export const CUBE_HALF_PX = 32;

/** Centro de uma célula no espaço do cubo (cubo de lado 2, centrado na origem), para os testes e a projeção. */
export function cellCenter(face: Face, row: number, col: number): [number, number, number] {
  const f = FACE_FRAME[face];
  const su = col - 1;
  const sv = 1 - row;
  return vec3((i) => f.n[i]! + (2 / 3) * (su * f.r[i]! + sv * f.u[i]!));
}

/**
 * Zona sob um ponto da tela, sem depender do teste de acerto do navegador (que falha em costuras de faces giradas).
 * `x`, `y` em px a partir do centro do cubo (y para baixo). Projeção ortogonal: pega a superfície do cubo mais próxima
 * da câmera nesse ponto e classifica por terços de cada face (a mesma grade de `cellSign`). Null fora do cubo.
 */
export function zoneAtPoint(azimuth: number, elevation: number, x: number, y: number, half = CUBE_HALF_PX): CubeZone | null {
  const { toCamera: d, right: r, up: u } = cameraBasis(azimuth, elevation);
  const a = x / half; // componente na direção da tela (p·direita)
  const b = -y / half; // componente para cima (p·cima)
  const dv = [d.x, d.y, d.z];
  const base = [0, 1, 2].map((i) => a * [r.x, r.y, r.z][i]! + b * [u.x, u.y, u.z][i]!);
  // p = base + c·d deve ficar no cubo [−1, 1]³; o ponto da frente é o maior c admissível.
  let lo = -Infinity;
  let hi = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dv[i]!) < 1e-9) {
      if (Math.abs(base[i]!) > 1 + 1e-9) return null;
      continue;
    }
    const t1 = (-1 - base[i]!) / dv[i]!;
    const t2 = (1 - base[i]!) / dv[i]!;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  if (lo > hi + 1e-9) return null;
  const c = hi;
  const sign = vec3((i) => {
    const v = base[i]! + c * dv[i]!;
    return Math.abs(v) > 1 / 3 + 1e-9 ? (v > 0 ? 1 : -1) : 0;
  }) as Sign3;
  return zoneById(zoneId(sign));
}

/** Células 3×3 de cada face, cada uma com a zona que ela representa. A mesma aresta aparece em duas faces. */
export function faceCells(face: Face, lang: Lang = 'pt'): { row: number; col: number; zone: CubeZone }[] {
  const out: { row: number; col: number; zone: CubeZone }[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) out.push({ row, col, zone: zoneById(zoneId(cellSign(face, row, col)), lang) });
  return out;
}

/**
 * Transformação CSS de cada face (sobre o cubo, com `--vc-half` = metade do lado). Os normais de saída, no espaço
 * local CSS (x direita, y para baixo, z para o observador), estão em `FACE_NORMAL_CSS`.
 */
export const FACE_TRANSFORM: Record<Face, string> = {
  front: 'translateZ(var(--vc-half))',
  back: 'rotateY(180deg) translateZ(var(--vc-half))',
  right: 'rotateY(90deg) translateZ(var(--vc-half))',
  left: 'rotateY(-90deg) translateZ(var(--vc-half))',
  top: 'rotateX(90deg) translateZ(var(--vc-half))',
  bottom: 'rotateX(-90deg) translateZ(var(--vc-half))',
};

/** Normal de saída de cada face no espaço local CSS (o cubo é montado com `worldToCss`). */
export const FACE_NORMAL_CSS: Record<Face, readonly [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

/**
 * Coordenadas do cubo (espaço local CSS) de um ponto do mundo. Espelha o eixo z e o y, porque a tela CSS tem y para
 * baixo e z para o observador: é a reflexão que faz a matriz de `cubeMatrixValues` ser uma rotação própria.
 */
export function worldToCss(p: readonly [number, number, number]): [number, number, number] {
  return [p[0], -p[2], -p[1]];
}

/**
 * Matriz 4×4 em coluna (16 valores, como `matrix3d`) que põe o cubo na orientação da câmera. Linhas: a tela CSS
 * (x = p·direita, y = −p·cima, z = p·até-a-câmera) em função das coordenadas locais do cubo. Det = +1: rotação pura.
 */
export function cubeMatrixValues(azimuth: number, elevation: number): number[] {
  const { toCamera: d, right: r, up: u } = cameraBasis(azimuth, elevation);
  // T = S·W⁻¹, com S = [r; −u; d] e W⁻¹(a, b, c) = (a, −c, −b).
  const t = [
    [r.x, -r.z, -r.y],
    [-u.x, u.z, u.y],
    [d.x, -d.z, -d.y],
  ];
  const v: number[] = [];
  for (let c = 0; c < 3; c++) {
    for (let row = 0; row < 3; row++) v.push(t[row]![c]!);
    v.push(0);
  }
  v.push(0, 0, 0, 1);
  return v;
}

/** Valor CSS `matrix3d(...)` da orientação do cubo. */
export function cubeMatrix(azimuth: number, elevation: number): string {
// units-ok: formato de máquina (matriz CSS)
  return `matrix3d(${cubeMatrixValues(azimuth, elevation).map((x) => (Math.abs(x) < 1e-12 ? 0 : x).toFixed(6)).join(',')})`;
}

/** Aplica uma matriz de 16 valores em coluna a um vetor (testes e depuração). */
export function applyMatrixValues(m: readonly number[], p: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z,
    m[1]! * x + m[5]! * y + m[9]! * z,
    m[2]! * x + m[6]! * y + m[10]! * z,
  ];
}
