import { caixaLocalDoComponente, resolverComponente } from '@hestia/engine';
import { isComponent, levelElevation, normalizarAngulo, type Familia, type Id, type Project } from '@hestia/model';
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
