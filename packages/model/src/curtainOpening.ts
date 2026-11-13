// Esquadria na célula da parede cortina (decisão 0056, §7.5 e §7.6): geometria de célula que os comandos e a validação
// usam. Só leitura: a região da célula, a folga da folha entre os montantes e a folha mínima do tipo. O Rust monta o vão
// no 3D e na planta; aqui só se decide o que cabe e o que avisar.

import { t, type Lang } from './i18n.ts';
import { unitsOf } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';
import { isWall, type Id, type Project, type Wall } from './types.ts';
import { openingTypeById } from './openingNominal.ts';
import { resolverParede, type ParedeResolvida } from './curtainRemap.ts';
import { mullionTypesOf } from './wallCurtain.ts';
import { TOL_SOLDA } from './curtainGrade.ts';
import { CURTAIN_LEAF_GAP, CURTAIN_MIN_LEAF, type OpeningCellOverride } from './wallCurtainTypes.ts';
import type { OpeningType } from './types.ts';
import type { ValidationIssue } from './validate.ts';

/** Região de células (índices inclusivos): a célula, ou o retângulo fundido que a contém (§5.2). */
export interface Retangulo {
  i0: number;
  i1: number;
  j0: number;
  j1: number;
}

/** Medidas de uma região em metros: bruta (entre as bordas e as linhas) e livre (entre as faces dos montantes). */
export interface FolgasRegiao {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  larguraBruta: number;
  alturaBruta: number;
  larguraLivre: number;
  alturaLivre: number;
}

/** Retângulo da região que contém a célula (i, j) na grade resolvida. */
export function retanguloDaRegiao(res: ParedeResolvida, i: number, j: number): Retangulo {
  const rc = res.canon[i * res.nv + j] as number;
  const r: Retangulo = { i0: Infinity, i1: -Infinity, j0: Infinity, j1: -Infinity };
  for (let c = 0; c < res.nu * res.nv; c++) {
    if (res.canon[c] !== rc) continue;
    const ci = Math.floor(c / res.nv);
    const cj = c - ci * res.nv;
    r.i0 = Math.min(r.i0, ci);
    r.i1 = Math.max(r.i1, ci);
    r.j0 = Math.min(r.j0, cj);
    r.j1 = Math.max(r.j1, cj);
  }
  return r;
}

/** Meia largura do montante de um papel (0 se não há montante). */
function meiaLargura(p: Project, id: Id | null | undefined): number {
  if (!id) return 0;
  const tipo = mullionTypesOf(p)[id];
  return tipo ? tipo.profile.width / 2 : 0;
}

/**
 * Folgas da região: as faces dos montantes que a margeiam (o papel de borda quando é a borda da cortina; o montante da
 * linha, ou o papel de interior, quando é linha interna). Os lados são lidos da grade já resolvida.
 */
export function folgasDaRegiao(p: Project, w: Wall, res: ParedeResolvida, r: Retangulo): FolgasRegiao {
  const tipoParede = p.wallTypes[w.typeId];
  const papeis = tipoParede?.curtain?.mullions;
  const s0 = res.bu[r.i0] as number;
  const s1 = res.bu[r.i1 + 1] as number;
  const z0 = res.bv[r.j0] as number;
  const z1 = res.bv[r.j1 + 1] as number;
  const esquerda = r.i0 === 0 ? papeis?.borderStart : (res.u[r.i0 - 1]?.montante ?? papeis?.interiorVertical);
  const direita = r.i1 + 1 === res.nu ? papeis?.borderEnd : (res.u[r.i1]?.montante ?? papeis?.interiorVertical);
  const topo = r.j1 + 1 === res.nv ? papeis?.borderTop : (res.v[r.j1]?.montante ?? papeis?.interiorHorizontal);
  const hE = meiaLargura(p, esquerda);
  const hD = meiaLargura(p, direita);
  const hT = meiaLargura(p, topo);
  const larguraBruta = s1 - s0;
  const alturaBruta = z1 - z0;
  return {
    s0,
    s1,
    z0,
    z1,
    larguraBruta,
    alturaBruta,
    larguraLivre: larguraBruta - hE - hD - 2 * CURTAIN_LEAF_GAP,
    alturaLivre: alturaBruta - hT,
  };
}

/** Folha mínima (m) do tipo (§7.5.3): 0 para vão livre (sem folha). Valores [A CONFIRMAR] (CURTAIN_MIN_LEAF). */
export function folhaMinima(tipo: OpeningType): number {
  if (tipo.leaves === 0) return 0;
  if (tipo.kind === 'window') return CURTAIN_MIN_LEAF.window;
  return tipo.plan === 'sliding' || tipo.plan === 'pocket' || tipo.plan === 'garage' ? CURTAIN_MIN_LEAF.sliding : CURTAIN_MIN_LEAF.hinged;
}

/** Sobrescritas de esquadria da grade resolvida, com a célula canônica de cada uma. */
function esquadriasDaParede(res: ParedeResolvida): Array<{ i: number; j: number; ov: OpeningCellOverride }> {
  const out: Array<{ i: number; j: number; ov: OpeningCellOverride }> = [];
  for (const e of res.celulas) if (e.override.kind === 'opening') out.push({ i: e.key.i, j: e.key.j, ov: e.override });
  return out;
}

/**
 * Porta de embutir (plano `pocket`) não serve à cortina: a cavidade que ela ocupa na parede não existe numa célula de
 * cortina, então as peças sairiam do vão. A oferta e os comandos recusam esse tipo; projetos antigos que já o tenham
 * abrem com um aviso de validação.
 */
export function embutirNaCortina(tipo: Pick<OpeningType, 'plan'>): boolean {
  return tipo.plan === 'pocket';
}

/**
 * Problemas de projeto das esquadrias na célula: tipo inexistente (erro), porta de embutir numa cortina (aviso: o
 * projeto abre, a esquadria precisa de outro tipo), célula com largura livre menor que a folha mínima (aviso, não
 * bloqueia) e porta sem soleira fora do piso da cortina (aviso). `opening-host-curtain` já é da `curtainWallIssues`.
 */
export function curtainOpeningIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const u = unitsOf(p, lang);
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || !e.curtain) continue;
    const res = resolverParede(p, e);
    if (!res) continue;
    for (const { i, j, ov } of esquadriasDaParede(res)) {
      const tipo = openingTypeById(p, ov.openingTypeId);
      if (!tipo) {
        out.push({
          severity: 'error',
          code: 'curtain-opening-type-missing',
          message: t(lang, 'md_ct_w_tipo_inexistente', { i, j, tipo: ov.openingTypeId }),
          elementId: e.id,
        });
        continue;
      }
      if (embutirNaCortina(tipo)) {
        out.push({
          severity: 'warning',
          code: 'cortina-embutir',
          message: t(lang, 'md_ct_w_embutir', { i, j }),
          elementId: e.id,
        });
      }
      const r = retanguloDaRegiao(res, i, j);
      const f = folgasDaRegiao(p, e, res, r);
      const minimo = folhaMinima(tipo);
      if (minimo > 0 && f.larguraLivre < minimo - TOL_SOLDA) {
        out.push({
          severity: 'warning',
          code: 'cortina-porta-folha-minima',
          message: t(lang, 'md_ct_w_folha_minima', { i, j, medida: formatQuantity(u, 'length', f.larguraLivre), minimo: formatQuantity(u, 'length', minimo) }),
          elementId: e.id,
        });
      }
      if (tipo.kind === 'door' && tipo.sill === 0 && f.z0 > TOL_SOLDA) {
        out.push({
          severity: 'warning',
          code: 'cortina-porta-fora-do-piso',
          message: t(lang, 'md_ct_w_fora_piso', { i, j, z: formatQuantity(u, 'length', f.z0) }),
          elementId: e.id,
        });
      }
    }
  }
  return out;
}
