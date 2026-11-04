import type { Vec2 } from '@hestia/geom';
import { retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal, Corpo, EncaixeNoVizinho, Guia, LadoDeUniao, Pose } from './encaixeTipos.ts';

/** Passo de rotação das poses paralelas: as caixas só se comparam com eixos alinhados a 90°. */
const PASSO = Math.PI / 2;
/** Tolerância das comparações de rotação e de retas (rad e m). */
const EPS = 1e-9;

/** Matriz que leva o sistema local do móvel ao sistema local do vizinho quando a rotação já foi alinhada. */
interface MatrizLocal {
  a: number;
  b: number;
  c: number;
  d: number;
}

function matrizLocal(k: number, espelhaVizinho: boolean, espelhaMovel: boolean): MatrizLocal {
  const sv = espelhaVizinho ? -1 : 1;
  const sm = espelhaMovel ? -1 : 1;
  const cos = Math.cos(k * PASSO);
  const sen = Math.sin(k * PASSO);
  return { a: sv * sm * cos, b: -sv * sen, c: sm * sen, d: cos };
}

/** Caixa local transformada para o sistema do vizinho, sem translação. */
interface CaixaNoVizinho {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function caixaTransformada(caixa: CaixaLocal, m: MatrizLocal): CaixaNoVizinho {
  const [x0, y0] = caixa.min;
  const [x1, y1] = caixa.max;
  const cantos: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of cantos) {
    const tx = m.a * x + m.b * y;
    const ty = m.c * x + m.d * y;
    if (tx < minX) minX = tx;
    if (tx > maxX) maxX = tx;
    if (ty < minY) minY = ty;
    if (ty > maxY) maxY = ty;
  }
  return { minX, maxX, minY, maxY };
}

/** Ponto do mundo no sistema local do vizinho (rotação inversa e espelho do vizinho). */
function noLocalDoVizinho(vizinho: Pose, x: number, y: number): Vec2 {
  const dx = x - vizinho.x;
  const dy = y - vizinho.y;
  const cos = Math.cos(vizinho.rotation);
  const sen = Math.sin(vizinho.rotation);
  const lx = cos * dx + sen * dy;
  const ly = -sen * dx + cos * dy;
  return { x: vizinho.mirrored ? -lx : lx, y: ly };
}

/** Ponto do sistema local do vizinho de volta ao mundo. */
function doLocalDoVizinho(vizinho: Pose, x: number, y: number): Vec2 {
  const lx = vizinho.mirrored ? -x : x;
  const cos = Math.cos(vizinho.rotation);
  const sen = Math.sin(vizinho.rotation);
  return { x: vizinho.x + lx * cos - y * sen, y: vizinho.y + lx * sen + y * cos };
}

/**
 * Cola o móvel no vizinho mais próximo: se a rotação difere da do vizinho por até `anguloMax` (rad, padrão 15°) de um múltiplo de 90°,
 * alinha a rotação; depois encosta a lateral (esquerda ou direita, a que estiver mais perto) na lateral do vizinho com a folga pedida
 * (padrão 0) e alinha a FRENTE (y mínimo) com a do vizinho. Só vale se a distância entre as laterais for ≤ `distanciaMax` (m, padrão 0,10).
 * Considera apenas vizinhos à mesma altura de base (|Δz| ≤ 1 mm) ou que se sobreponham em altura. Sem vizinho ao alcance: null.
 */
export function encaixarNoVizinho(
  pose: Pose,
  caixa: CaixaLocal,
  vizinhos: readonly Corpo[],
  opcoes: { distanciaMax?: number; anguloMax?: number; folga?: number } = {},
): EncaixeNoVizinho | null {
  const distanciaMax = opcoes.distanciaMax ?? 0.1;
  const anguloMax = opcoes.anguloMax ?? Math.PI / 12;
  const folga = opcoes.folga ?? 0;

  let melhor: { distancia: number; encaixe: EncaixeNoVizinho } | null = null;
  for (const vizinho of vizinhos) {
    const diferenca = pose.rotation - vizinho.pose.rotation;
    const k = Math.round(diferenca / PASSO);
    const rotacao = vizinho.pose.rotation + k * PASSO;
    if (Math.abs(pose.rotation - rotacao) > anguloMax) continue;

    const zMin = pose.z + caixa.min[2];
    const zMax = pose.z + caixa.max[2];
    const vzMin = vizinho.pose.z + vizinho.caixa.min[2];
    const vzMax = vizinho.pose.z + vizinho.caixa.max[2];
    const mesmaBase = Math.abs(pose.z - vizinho.pose.z) <= 0.001;
    const sobrepoeEmAltura = Math.min(zMax, vzMax) - Math.max(zMin, vzMin) > EPS;
    if (!mesmaBase && !sobrepoeEmAltura) continue;

    const m = matrizLocal(k, vizinho.pose.mirrored, pose.mirrored);
    const transformada = caixaTransformada(caixa, m);
    const atual = noLocalDoVizinho(vizinho.pose, pose.x, pose.y);

    const vxMin = vizinho.caixa.min[0];
    const vxMax = vizinho.caixa.max[0];
    const gapDireita = transformada.minX + atual.x - vxMax;
    const gapEsquerda = vxMin - (transformada.maxX + atual.x);
    const distanciaDireita = Math.abs(gapDireita);
    const distanciaEsquerda = Math.abs(gapEsquerda);
    let aDireita: boolean;
    if (distanciaDireita < distanciaEsquerda) aDireita = true;
    else if (distanciaEsquerda < distanciaDireita) aDireita = false;
    else {
      const centroMovel = (transformada.minX + transformada.maxX) / 2 + atual.x;
      const centroVizinho = (vxMin + vxMax) / 2;
      aDireita = centroMovel >= centroVizinho;
    }

    const distancia = Math.max(0, aDireita ? gapDireita : gapEsquerda);
    if (distancia > distanciaMax + EPS) continue;

    const alvoX = aDireita
      ? vxMax + folga - transformada.minX
      : vxMin - folga - transformada.maxX;
    const alvoY = vizinho.caixa.min[1] - transformada.minY;
    const mundo = doLocalDoVizinho(vizinho.pose, alvoX, alvoY);

    const sinalX = m.a > EPS ? 1 : m.a < -EPS ? -1 : 0;
    let faceMinima: boolean;
    if (sinalX > 0) faceMinima = aDireita;
    else if (sinalX < 0) faceMinima = !aDireita;
    else faceMinima = aDireita;
    const lado: LadoDeUniao = faceMinima
      ? (pose.mirrored ? 'direita' : 'esquerda')
      : (pose.mirrored ? 'esquerda' : 'direita');

    const encaixe: EncaixeNoVizinho = {
      pose: { x: mundo.x, y: mundo.y, rotation: rotacao, mirrored: pose.mirrored, z: pose.z },
      vizinho: vizinho.id,
      lado,
      folga,
    };
    if (
      !melhor
      || distancia < melhor.distancia - EPS
      || (Math.abs(distancia - melhor.distancia) <= EPS && vizinho.id < melhor.encaixe.vizinho)
    ) {
      melhor = { distancia, encaixe };
    }
  }
  return melhor ? melhor.encaixe : null;
}

/** Ordem estável dos tipos de guia, como declarada em `Guia.tipo`. */
const ORDEM_DAS_GUIAS: readonly Guia['tipo'][] = ['frente', 'fundo', 'esquerda', 'direita', 'centro-x', 'centro-y'];

/** Uma reta de alinhamento: um ponto de passagem e a direção unitária. */
interface Reta {
  ponto: Vec2;
  direcao: Vec2;
}

function media(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function unitario(x: number, y: number): Vec2 {
  const comprimento = Math.hypot(x, y);
  return comprimento > EPS ? { x: x / comprimento, y: y / comprimento } : { x: 1, y: 0 };
}

function retasDoCorpo(pose: Pose, caixa: CaixaLocal): Record<Guia['tipo'], Reta> {
  const [c0, c1, c2, c3] = retanguloNoMundo(pose, caixa);
  const direcaoX = unitario(c1.x - c0.x, c1.y - c0.y);
  const direcaoY = unitario(c3.x - c0.x, c3.y - c0.y);
  const centro = media(media(c0, c2), media(c1, c3));
  return {
    frente: { ponto: media(c0, c1), direcao: direcaoX },
    fundo: { ponto: media(c3, c2), direcao: direcaoX },
    esquerda: { ponto: media(c0, c3), direcao: direcaoY },
    direita: { ponto: media(c1, c2), direcao: direcaoY },
    'centro-x': { ponto: centro, direcao: direcaoY },
    'centro-y': { ponto: centro, direcao: direcaoX },
  };
}

/**
 * Guias de alinhamento do móvel com os outros: linhas (frente, fundo, esquerda, direita, centro) que coincidem dentro de `tolerancia`
 * (m, padrão 0,01) com a mesma linha de outro móvel de rotação paralela (mesmo múltiplo de 90°). Cada guia vai de uma ponta à outra
 * dos dois móveis (envolve ambos). Ordem determinística: por id do outro e depois pelo tipo na ordem declarada em `Guia.tipo`.
 */
export function guiasDeAlinhamento(pose: Pose, caixa: CaixaLocal, outros: readonly Corpo[], tolerancia = 0.01): Guia[] {
  const retasMovel = retasDoCorpo(pose, caixa);
  const cantosMovel = retanguloNoMundo(pose, caixa);
  const guias: Guia[] = [];
  const ordenados = [...outros].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const outro of ordenados) {
    const diferenca = pose.rotation - outro.pose.rotation;
    const k = Math.round(diferenca / PASSO);
    if (Math.abs(diferenca - k * PASSO) > 1e-6) continue;

    const retasOutro = retasDoCorpo(outro.pose, outro.caixa);
    const cantosOutro = retanguloNoMundo(outro.pose, outro.caixa);
    for (const tipo of ORDEM_DAS_GUIAS) {
      const reta = retasMovel[tipo];
      const normal = { x: -reta.direcao.y, y: reta.direcao.x };
      const deslocamentoMovel = reta.ponto.x * normal.x + reta.ponto.y * normal.y;
      let menorDiferenca = Infinity;
      for (const tipoOutro of ORDEM_DAS_GUIAS) {
        const outraReta = retasOutro[tipoOutro];
        const cruzado = reta.direcao.x * outraReta.direcao.y - reta.direcao.y * outraReta.direcao.x;
        if (Math.abs(cruzado) > 1e-6) continue;
        const deslocamentoOutro = outraReta.ponto.x * normal.x + outraReta.ponto.y * normal.y;
        const diferencaDeLinha = Math.abs(deslocamentoMovel - deslocamentoOutro);
        if (diferencaDeLinha < menorDiferenca) menorDiferenca = diferencaDeLinha;
      }
      if (menorDiferenca > tolerancia + EPS) continue;

      let minimo = Infinity;
      let maximo = -Infinity;
      for (const canto of [...cantosMovel, ...cantosOutro]) {
        const projecao = canto.x * reta.direcao.x + canto.y * reta.direcao.y;
        if (projecao < minimo) minimo = projecao;
        if (projecao > maximo) maximo = projecao;
      }
      const base = { x: normal.x * deslocamentoMovel, y: normal.y * deslocamentoMovel };
      guias.push({
        tipo,
        a: { x: base.x + reta.direcao.x * minimo, y: base.y + reta.direcao.y * minimo },
        b: { x: base.x + reta.direcao.x * maximo, y: base.y + reta.direcao.y * maximo },
        com: outro.id,
      });
    }
  }
  return guias;
}
