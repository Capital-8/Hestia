import { caixaLocalDoComponente, corposDoNivel, resolverComponente, type Corpo } from '@hestia/engine';
import { isComponent, levelElevation, normalizarAngulo, type Familia, type Id, type Project, type Valor } from '@hestia/model';
import type { AlvoComponente3D } from '@hestia/render';

const PASSO_15_GRAUS = Math.PI / 12;
const MIN_MEDIDA_PADRAO_MM = 100;
const PASSO_MEDIDA_PADRAO_MM = 10;

function parametroEditavel(familia: Familia, id: 'L' | 'A' | 'P'): boolean {
  const param = familia.parametros.find((pm) => pm.id === id);
  return param !== undefined && param.escopo === 'instancia' && param.formula === undefined;
}

function numeroFinito(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Monta o alvo 3D do gizmo para o componente `id` do projeto, com caixa local,
 * editabilidade (`escopo === 'instancia'` e sem `formula`) e medidas atuais em mm.
 */
export function alvoComponente3D(p: Project, id: Id): AlvoComponente3D | null {
  const c = p.elements[id];
  if (!isComponent(c)) return null;

  const familia = p.componentFamilies?.[c.familyId];
  if (!familia) return null;

  const caixa = caixaLocalDoComponente(p, c);
  if (!caixa) return null;

  const res = resolverComponente(p, c);

  return {
    id: c.id,
    x: c.x,
    y: c.y,
    z: levelElevation(p, c.levelId) + c.z,
    rotation: c.rotation,
    mirrored: c.mirrored,
    caixa,
    editavelL: parametroEditavel(familia, 'L'),
    editavelA: parametroEditavel(familia, 'A'),
    editavelP: parametroEditavel(familia, 'P'),
    Lmm: numeroFinito(res.env['L']),
    Amm: numeroFinito(res.env['A']),
    Pmm: numeroFinito(res.env['P']),
  };
}

/**
 * Calcula a nova rotação (rad, normalizada em `(-π, π]`) a partir do deslocamento
 * angular no plano XY em torno de `centroMundo`. Com `snap15Graus = true`, arredonda
 * ao múltiplo mais próximo de 15° (o que inclui 0°, ±90° e 180°).
 */
export function calcularRotacaoGizmo(
  centroMundo: { x: number; y: number },
  pontoInicio: { x: number; y: number },
  pontoAtual: { x: number; y: number },
  rotacaoInicial: number,
  snap15Graus: boolean,
): number {
  const dx0 = pontoInicio.x - centroMundo.x;
  const dy0 = pontoInicio.y - centroMundo.y;
  const dx1 = pontoAtual.x - centroMundo.x;
  const dy1 = pontoAtual.y - centroMundo.y;

  if (Math.hypot(dx0, dy0) < 1e-9 || Math.hypot(dx1, dy1) < 1e-9) {
    return normalizarAngulo(rotacaoInicial);
  }

  const delta = normalizarAngulo(Math.atan2(dy1, dx1) - Math.atan2(dy0, dx0));
  let angulo = normalizarAngulo(rotacaoInicial + delta);
  if (snap15Graus) {
    angulo = normalizarAngulo(Math.round(angulo / PASSO_15_GRAUS) * PASSO_15_GRAUS);
  }
  return angulo === 0 ? 0 : angulo;
}

/**
 * Projeta o deslocamento 3D no eixo da alça (`X` para `L`, `-Y` para `P`, `Z` para `A`,
 * respeitando `rotation` e `mirrored`), converte para mm, arredonda ao múltiplo de
 * `passoMm` (`10` mm padrão; `1` mm com Shift) e respeita `[minMm, maxMm]`.
 */
export function calcularNovaMedidaGizmoMm(
  alvo: AlvoComponente3D,
  alca: 'dim_L' | 'dim_A' | 'dim_P',
  pontoMundoInicio: { x: number; y: number; z: number },
  pontoMundoAtual: { x: number; y: number; z: number },
  medidaInicialMm: number,
  minMm = MIN_MEDIDA_PADRAO_MM,
  maxMm = Infinity,
  passoMm = PASSO_MEDIDA_PADRAO_MM,
): number {
  const dx = pontoMundoAtual.x - pontoMundoInicio.x;
  const dy = pontoMundoAtual.y - pontoMundoInicio.y;
  const dz = pontoMundoAtual.z - pontoMundoInicio.z;

  const cos = Math.cos(alvo.rotation);
  const sen = Math.sin(alvo.rotation);
  let ax = 0;
  let ay = 0;
  let az = 0;

  if (alca === 'dim_L') {
    const s = alvo.mirrored ? -1 : 1;
    ax = s * cos;
    ay = s * sen;
  } else if (alca === 'dim_P') {
    ax = sen;
    ay = -cos;
  } else {
    az = 1;
  }

  const deslocamentoM = dx * ax + dy * ay + dz * az;
  const brutoMm = medidaInicialMm + deslocamentoM * 1000;
  const passo = passoMm > 0 ? passoMm : 1;
  const arredondadoMm = Math.round(brutoMm / passo) * passo;

  const limiteMax = Math.max(minMm, maxMm);
  return Math.min(limiteMax, Math.max(minMm, arredondadoMm));
}

/** Centro da caixa do componente em coordenadas de mundo (m). */
export function centroComponenteMundo(alvo: AlvoComponente3D): { x: number; y: number; z: number } {
  const { min, max } = alvo.caixa;
  const cxLocal = (min[0] + max[0]) / 2;
  const gx = alvo.mirrored ? -cxLocal : cxLocal;
  const gy = (min[1] + max[1]) / 2;
  const gz = (min[2] + max[2]) / 2;
  const cos = Math.cos(alvo.rotation);
  const sen = Math.sin(alvo.rotation);
  return {
    x: alvo.x + gx * cos - gy * sen,
    y: alvo.y + gx * sen + gy * cos,
    z: alvo.z + gz,
  };
}

/** Faixa (`min`/`max` em mm) declarada no parâmetro `L`, `A` ou `P` da família do componente. */
export function limitesParametroComponente(
  p: Project,
  id: Id,
  paramId: 'L' | 'A' | 'P',
): { min?: number; max?: number } {
  const c = p.elements[id];
  if (!isComponent(c)) return {};
  const param = p.componentFamilies?.[c.familyId]?.parametros.find((pm) => pm.id === paramId);
  if (!param) return {};
  return { min: param.min, max: param.max };
}

/** Vetor unitário no mundo do eixo de uma alça dimensional ou de deslize linear do gizmo. */
export function eixoDoGizmo(
  alvo: AlvoComponente3D,
  alca: 'dim_L' | 'dim_A' | 'dim_P' | 'mover_x' | 'mover_y',
): { x: number; y: number; z: number } {
  const cos = Math.cos(alvo.rotation);
  const sen = Math.sin(alvo.rotation);
  if (alca === 'dim_L') {
    const s = alvo.mirrored ? -1 : 1;
    return { x: s * cos, y: s * sen, z: 0 };
  }
  if (alca === 'mover_x') {
    const s = alvo.mirrored ? 1 : -1;
    return { x: s * cos, y: s * sen, z: 0 };
  }
  if (alca === 'dim_P' || alca === 'mover_y') {
    return { x: sen, y: -cos, z: 0 };
  }
  return { x: 0, y: 0, z: 1 };
}

/** Projeção quantizada (em m, passo padrão 10 mm ou 1 mm com Shift) ao longo do eixo de deslize. */
export function deslocamentoGizmoNoEixoM(
  eixo: { x: number; y: number; z: number },
  pontoInicio: { x: number; y: number; z: number },
  pontoAtual: { x: number; y: number; z: number },
  passoMm = PASSO_MEDIDA_PADRAO_MM,
): number {
  const brutoM =
    (pontoAtual.x - pontoInicio.x) * eixo.x +
    (pontoAtual.y - pontoInicio.y) * eixo.y +
    (pontoAtual.z - pontoInicio.z) * eixo.z;
  const passo = passoMm > 0 ? passoMm : 1;
  return (Math.round((brutoM * 1000) / passo) * passo) / 1000;
}

const TOL_PARALELA = 1e-4;

function direcaoFrenteMundo(rotation: number): { fx: number; fy: number } {
  return { fx: Math.sin(rotation), fy: -Math.cos(rotation) };
}

function frentesParalelas(rotA: number, rotB: number): boolean {
  const a = direcaoFrenteMundo(rotA);
  const b = direcaoFrenteMundo(rotB);
  return a.fx * b.fx + a.fy * b.fy >= 1 - TOL_PARALELA;
}

function projecaoFrenteNoEixo(
  x: number,
  y: number,
  rotation: number,
  minYLocal: number,
  fx: number,
  fy: number,
): number {
  const sen = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const px = x - minYLocal * sen;
  const py = y + minYLocal * cos;
  return px * fx + py * fy;
}

function centroCorpoMundoXY(v: Corpo): { x: number; y: number } {
  const cxLocal = (v.caixa.min[0] + v.caixa.max[0]) / 2;
  const gx = v.pose.mirrored ? -cxLocal : cxLocal;
  const gy = (v.caixa.min[1] + v.caixa.max[1]) / 2;
  const cos = Math.cos(v.pose.rotation);
  const sen = Math.sin(v.pose.rotation);
  return {
    x: v.pose.x + gx * cos - gy * sen,
    y: v.pose.y + gx * sen + gy * cos,
  };
}

/**
 * Compensa a posição `(x, y)` no plano quando uma dimensão do gizmo muda a partir do estado inicial:
 * para `dim_P`, desloca a origem ao longo da direção da frente `(sin(rot), -cos(rot))` por
 * `deltaM = (novaMm - medidaInicialMm) / 1000`, mantendo o fundo colado na parede e avançando a frente.
 */
export function compensarPosicaoAoAlterarMedida(
  alvo: Pick<AlvoComponente3D, 'x' | 'y' | 'rotation'>,
  alca: 'dim_L' | 'dim_A' | 'dim_P',
  medidaInicialMm: number,
  novaMm: number,
): { x: number; y: number } {
  if (alca !== 'dim_P') return { x: alvo.x, y: alvo.y };
  const deltaM = (novaMm - medidaInicialMm) / 1000;
  const { fx, fy } = direcaoFrenteMundo(alvo.rotation);
  return {
    x: alvo.x + deltaM * fx,
    y: alvo.y + deltaM * fy,
  };
}

/**
 * Detecta frentes paralelas de outros componentes do nível e ajusta `novaMm` exatamente para alinhar
 * a face frontal quando a distância até a linha da frente do vizinho for `<= toleranciaM` (padrão 8 cm).
 */
export function snapProfundidadeNoVizinho(
  alvo: AlvoComponente3D,
  medidaInicialMm: number,
  novaMm: number,
  vizinhos: readonly Corpo[],
  toleranciaM = 0.08,
): number {
  const { fx, fy } = direcaoFrenteMundo(alvo.rotation);
  const projInicio = projecaoFrenteNoEixo(alvo.x, alvo.y, alvo.rotation, alvo.caixa.min[1], fx, fy);
  const projCandidata = projInicio + (novaMm - medidaInicialMm) / 1000;

  let melhorDist = toleranciaM + 1e-9;
  let melhorMm: number | null = null;
  for (const v of vizinhos) {
    if (v.id === alvo.id) continue;
    if (!frentesParalelas(alvo.rotation, v.pose.rotation)) continue;
    const projViz = projecaoFrenteNoEixo(v.pose.x, v.pose.y, v.pose.rotation, v.caixa.min[1], fx, fy);
    const distM = Math.abs(projViz - projCandidata);
    if (distM > toleranciaM || distM >= melhorDist) continue;
    const mmAlinhada = Math.round((medidaInicialMm + (projViz - projInicio) * 1000) * 1000) / 1000;
    if (mmAlinhada <= 0) continue;
    melhorDist = distM;
    melhorMm = mmAlinhada;
  }
  return melhorMm ?? novaMm;
}

export interface PatchAlinhamentoComponente {
  id: Id;
  patch: {
    x: number;
    y: number;
    values: Record<string, Valor>;
  };
}

function patchAlinharParaProjecao(
  p: Project,
  alvo: AlvoComponente3D,
  projReferencia: number,
): PatchAlinhamentoComponente | null {
  if (!alvo.editavelP || alvo.Pmm === undefined) return null;
  const c = p.elements[alvo.id];
  if (!isComponent(c)) return null;

  const { fx, fy } = direcaoFrenteMundo(alvo.rotation);
  const projAlvo = projecaoFrenteNoEixo(alvo.x, alvo.y, alvo.rotation, alvo.caixa.min[1], fx, fy);
  const brutaMm = Math.round((alvo.Pmm + (projReferencia - projAlvo) * 1000) * 1000) / 1000;
  const limites = limitesParametroComponente(p, alvo.id, 'P');
  const minLim = limites.min ?? MIN_MEDIDA_PADRAO_MM;
  const maxLim = limites.max !== undefined ? Math.max(minLim, limites.max) : Infinity;
  const novaMm = Math.min(maxLim, Math.max(minLim, brutaMm));
  if (Math.abs(novaMm - alvo.Pmm) < 1e-3) return null;

  const pos = compensarPosicaoAoAlterarMedida(alvo, 'dim_P', alvo.Pmm, novaMm);
  return {
    id: c.id,
    patch: {
      x: pos.x,
      y: pos.y,
      values: { ...(c.values ?? {}), P: novaMm },
    },
  };
}

/**
 * Calcula os patches `{ id, patch }` para alinhar a frente e a profundidade dos componentes selecionados:
 * com 2+ selecionados, alinha os demais ao primeiro selecionado; com 1 selecionado, alinha ao móvel vizinho
 * paralelo mais próximo no mesmo nível (mantendo o fundo fixo na parede).
 */
export function alinharFrenteEProfundidade(p: Project, ids: readonly Id[]): PatchAlinhamentoComponente[] {
  const vistos = new Set<Id>();
  const alvos: AlvoComponente3D[] = [];
  for (const id of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const a = alvoComponente3D(p, id);
    if (a) alvos.push(a);
  }
  if (alvos.length === 0) return [];

  if (alvos.length >= 2) {
    const ref = alvos[0]!;
    const patches: PatchAlinhamentoComponente[] = [];
    for (let i = 1; i < alvos.length; i++) {
      const alvo = alvos[i]!;
      if (!frentesParalelas(alvo.rotation, ref.rotation)) continue;
      const { fx, fy } = direcaoFrenteMundo(alvo.rotation);
      const projRef = projecaoFrenteNoEixo(ref.x, ref.y, ref.rotation, ref.caixa.min[1], fx, fy);
      const patch = patchAlinharParaProjecao(p, alvo, projRef);
      if (patch) patches.push(patch);
    }
    return patches;
  }

  const alvo = alvos[0]!;
  if (!alvo.editavelP || alvo.Pmm === undefined) return [];
  const c = p.elements[alvo.id];
  if (!isComponent(c)) return [];

  const { fx, fy } = direcaoFrenteMundo(alvo.rotation);
  const projAlvo = projecaoFrenteNoEixo(alvo.x, alvo.y, alvo.rotation, alvo.caixa.min[1], fx, fy);
  const centroAlvo = centroComponenteMundo(alvo);
  const limites = limitesParametroComponente(p, alvo.id, 'P');
  const minLim = limites.min ?? MIN_MEDIDA_PADRAO_MM;
  const maxLim = limites.max !== undefined ? Math.max(minLim, limites.max) : Infinity;

  let melhorDist = Infinity;
  let melhorProj: number | null = null;
  for (const v of corposDoNivel(p, c.levelId, new Set([c.id]))) {
    if (!frentesParalelas(alvo.rotation, v.pose.rotation)) continue;
    const projViz = projecaoFrenteNoEixo(v.pose.x, v.pose.y, v.pose.rotation, v.caixa.min[1], fx, fy);
    const brutaMm = Math.round((alvo.Pmm + (projViz - projAlvo) * 1000) * 1000) / 1000;
    if (brutaMm < minLim || brutaMm > maxLim) continue;
    const cv = centroCorpoMundoXY(v);
    const dist = Math.hypot(cv.x - centroAlvo.x, cv.y - centroAlvo.y);
    if (dist < melhorDist) {
      melhorDist = dist;
      melhorProj = projViz;
    }
  }
  if (melhorProj === null) return [];
  const patch = patchAlinharParaProjecao(p, alvo, melhorProj);
  return patch ? [patch] : [];
}
