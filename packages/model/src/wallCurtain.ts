// Parede cortina (decisão 0056, §4.1, §4.5, §4.6): padrões de montante e painel, leitores com padrão, camada-sombra e
// validação do tipo. TS puro. Os comandos ficam em curtainCommands.ts; a geometria, no Rust (fases 1 a 7).

import { t, type Lang } from './i18n.ts';
import type { ValidationIssue } from './validate.ts';
import { isCurtainType } from './wallType.ts';
import { isOpening, isWall, type Id, type Layer, type Project, type WallType } from './types.ts';
import {
  CURTAIN_LIMITS,
  type CurtainMullions,
  type CurtainPanelType,
  type CurtainSpec,
  type GridAxisSpec,
  type MullionProfile,
  type MullionType,
} from './wallCurtainTypes.ts';

// Materiais de defaults.ts (mat_aluminio, mat_vidro). Os nomes dos padrões são técnicos (dimensão e tipo), iguais em
// todos os idiomas; a tradução entra com os presets de fábrica da fase 1.

export const DEFAULT_MULLION_TYPES: Readonly<Record<Id, MullionType>> = {
  mul_ret_50x100: { id: 'mul_ret_50x100', name: 'Retangular 50 × 100', code: 'M-50x100', profile: { shape: 'rect', width: 0.05, depth: 0.1 }, materialId: 'mat_aluminio' },
  mul_ret_50x150: { id: 'mul_ret_50x150', name: 'Retangular 50 × 150', code: 'M-50x150', profile: { shape: 'rect', width: 0.05, depth: 0.15 }, materialId: 'mat_aluminio' },
  mul_ret_60x120: { id: 'mul_ret_60x120', name: 'Retangular 60 × 120', code: 'M-60x120', profile: { shape: 'rect', width: 0.06, depth: 0.12 }, materialId: 'mat_aluminio' },
  mul_red_50: { id: 'mul_red_50', name: 'Redondo Ø 50', code: 'M-R50', profile: { shape: 'round', width: 0.05, depth: 0.05 }, materialId: 'mat_aluminio' },
  mul_junta_12: { id: 'mul_junta_12', name: 'Junta de vidro colado 12 × 20', code: 'J-12', profile: { shape: 'rect', width: 0.012, depth: 0.02 }, materialId: 'mat_aluminio' },
};

export const DEFAULT_CURTAIN_PANEL_TYPES: Readonly<Record<Id, CurtainPanelType>> = {
  pnl_vidro_10: { id: 'pnl_vidro_10', name: 'Vidro 10 mm', code: 'V-10', kind: 'glass', thickness: 0.01, materialId: 'mat_vidro', glassKind: 'clear' },
  pnl_vidro_duplo_24: { id: 'pnl_vidro_duplo_24', name: 'Vidro duplo 24 mm', code: 'VD-24', kind: 'glass', thickness: 0.024, materialId: 'mat_vidro', glassKind: 'clear' },
  pnl_solido_alu_4: { id: 'pnl_solido_alu_4', name: 'Chapa de alumínio 4 mm', code: 'C-4', kind: 'solid', thickness: 0.004, materialId: 'mat_aluminio' },
  pnl_vazio: { id: 'pnl_vazio', name: 'Vazio', code: 'VZ', kind: 'empty', thickness: 0, materialId: 'mat_aluminio' },
};

/**
 * Tipos de montante do projeto. Sem mapa gravado (`mullionTypes` ausente), vale o padrão; com mapa gravado, vale só o
 * gravado (a primeira escrita grava o conjunto completo, senão apagar um padrão faria ele voltar).
 */
export function mullionTypesOf(p: Project): Record<Id, MullionType> {
  return p.mullionTypes ?? structuredClone({ ...DEFAULT_MULLION_TYPES });
}

/** Tipos de painel do projeto. Mesmo regime de `mullionTypesOf`. */
export function curtainPanelTypesOf(p: Project): Record<Id, CurtainPanelType> {
  return p.curtainPanelTypes ?? structuredClone({ ...DEFAULT_CURTAIN_PANEL_TYPES });
}

/** Os sete papéis de montante, na ordem em que a camada-sombra procura um material. */
export function papeisDeMontante(m: CurtainMullions): Array<Id | null> {
  return [m.interiorVertical, m.interiorHorizontal, m.borderStart, m.borderEnd, m.borderBottom, m.borderTop, m.corner];
}

/**
 * Camada-sombra da cortina (§4.1): um único elemento de estrutura, com a profundidade do sistema. Código que ainda lê
 * `layers` vê a espessura certa; a fonte de verdade é `wallThicknessOf`. Material: o do primeiro montante do sistema
 * (interior vertical antes), senão o do painel padrão.
 */
export function curtainShadowLayer(p: Project, spec: CurtainSpec): Layer {
  const mullions = mullionTypesOf(p);
  const montante = papeisDeMontante(spec.mullions)
    .map((id) => (id ? mullions[id] : undefined))
    .find((mt): mt is MullionType => mt !== undefined);
  const painel = curtainPanelTypesOf(p)[spec.defaultPanelTypeId];
  return { function: 'structure', materialId: montante?.materialId ?? painel?.materialId ?? 'mat_aluminio', thickness: spec.depth, wraps: false };
}

const PASSO_MODO = ['fixedNumber', 'fixedDistance', 'maxDistance', 'manual'] as const;
const EPS_SHADOW = 1e-9;

function eixoInvalido(eixo: GridAxisSpec, lang: Lang): string | null {
  const erro = t(lang, 'md_ct_axis_invalid');
  if (!(PASSO_MODO as readonly string[]).includes(eixo.mode)) return erro;
  if (eixo.offset !== undefined && !Number.isFinite(eixo.offset)) return erro;
  if (eixo.mode === 'fixedNumber' && !(Number.isInteger(eixo.count) && (eixo.count ?? 0) >= 1 && (eixo.count ?? 0) <= CURTAIN_LIMITS.linesPerAxis)) return erro;
  if ((eixo.mode === 'fixedDistance' || eixo.mode === 'maxDistance') && !(Number.isFinite(eixo.distance) && (eixo.distance ?? 0) > 0)) return erro;
  if (eixo.mode === 'manual') {
    const pos = eixo.positions ?? [];
    if (pos.length > CURTAIN_LIMITS.positions) return erro;
    let anterior = 0;
    for (const v of pos) {
      if (!(Number.isFinite(v) && v > anterior)) return erro;
      anterior = v;
    }
  }
  if (eixo.angle !== undefined && eixo.angle !== 0) return t(lang, 'md_ct_angle');
  return null;
}

/**
 * Seção do montante: largura e profundidade positivas, e a forma pede o seu parâmetro (trapézio, L, canto). Quem
 * contém o problema de geometria (espessura que não cabe na seção) devolve `'espessura'`, para ter mensagem própria.
 */
function perfilInvalido(perfil: MullionProfile): 'forma' | 'espessura' | null {
  if (!(perfil.width > 0) || !(perfil.depth > 0)) return 'forma';
  if (perfil.shape === 'trapezoid' && !((perfil.widthBack ?? 0) > 0)) return 'forma';
  if ((perfil.shape === 'L' || perfil.shape === 'corner') && !((perfil.thickness ?? 0) > 0)) return 'forma';
  const menor = Math.min(perfil.width, perfil.depth);
  if (perfil.shape === 'L' && !(perfil.thickness! < menor)) return 'espessura';
  if (perfil.shape === 'corner' && !(2 * perfil.thickness! < menor)) return 'espessura';
  return null;
}

/** Problema de um tipo de montante (usado pelo comando e pela validação do tipo de parede). */
export function montanteIssue(mt: MullionType, lang: Lang = 'pt'): string | null {
  const erro = perfilInvalido(mt.profile);
  if (erro === 'espessura') return t(lang, 'md_ct_mullion_thickness');
  return erro ? t(lang, 'md_ct_mullion_profile') : null;
}

/** Problema de um tipo de painel (espessura não negativa; vidro e chapa com espessura positiva). */
export function painelIssue(pn: CurtainPanelType, lang: Lang = 'pt'): string | null {
  if (!Number.isFinite(pn.thickness) || pn.thickness < 0) return t(lang, 'md_ct_panel_invalid');
  if (pn.kind !== 'empty' && !(pn.thickness > 0)) return t(lang, 'md_ct_panel_invalid');
  if (pn.bite !== undefined && (!Number.isFinite(pn.bite) || pn.bite < 0)) return t(lang, 'md_ct_panel_invalid');
  return null;
}

/**
 * Primeiro problema de salvar um tipo de parede cortina (decisão 0056, §4.6), ou null. Tipo básico não é avaliado aqui.
 * Não cobre a família (fixada pelo comando) nem a divergência de camada-sombra além da espessura.
 */
export function curtainTypeIssue(type: WallType, p: Project, lang: Lang = 'pt'): string | null {
  if (type.family !== 'curtain') return null;
  const c = type.curtain;
  if (!c || !Number.isFinite(c.depth) || !(c.depth > 0)) return t(lang, 'md_ct_curtain_invalid');
  for (const eixo of [c.u, c.v]) {
    const erro = eixoInvalido(eixo, lang);
    if (erro) return erro;
  }
  if ((c.minRemainder !== undefined && !(c.minRemainder >= 0)) || (c.minCell !== undefined && !(c.minCell >= 0))) {
    return t(lang, 'md_ct_limits_negative');
  }
  const painel = curtainPanelTypesOf(p)[c.defaultPanelTypeId];
  if (!painel) return t(lang, 'md_ct_panel_missing');
  const painelErro = painelIssue(painel, lang);
  if (painelErro) return painelErro;
  if (c.mullions.joinPriority !== 'vertical' && c.mullions.joinPriority !== 'horizontal') return t(lang, 'md_ct_curtain_invalid');
  const mullions = mullionTypesOf(p);
  for (const id of papeisDeMontante(c.mullions)) {
    if (id === null) continue;
    const mt = mullions[id];
    if (!mt) return t(lang, 'md_ct_mullion_missing');
    const erro = montanteIssue(mt, lang);
    if (erro) return erro;
  }
  // Camada-sombra (§4.1): a espessura do único elemento tem de ser a profundidade do sistema.
  if (type.layers.length !== 1 || Math.abs(type.layers[0]!.thickness - c.depth) > EPS_SHADOW) return t(lang, 'md_ct_shadow');
  return null;
}

/** Os tipos de montante que o sistema usa (sem repetição). */
function montantesDoSistema(c: CurtainSpec, p: Project): MullionType[] {
  const mullions = mullionTypesOf(p);
  const ids = new Set(papeisDeMontante(c.mullions).filter((id): id is Id => id !== null));
  return [...ids].map((id) => mullions[id]).filter((mt): mt is MullionType => mt !== undefined);
}

/** Avisos de um tipo de parede cortina (não bloqueiam): profundidade do montante e campos de parede comum ignorados. */
export function curtainTypeAvisos(type: WallType, p: Project): Array<{ code: string; message: string }> {
  if (!isCurtainType(type)) return [];
  const out: Array<{ code: string; message: string }> = [];
  const profundidadeMaior = montantesDoSistema(type.curtain, p).some((mt) => mt.profile.depth > type.curtain.depth);
  if (profundidadeMaior) {
    out.push({ code: 'cortina-profundidade-menor-que-perfil', message: `Tipo "${type.name}": montante mais fundo que o sistema; o perfil fica limitado à profundidade do sistema.` });
  }
  if (type.strips.length > 0 || type.wrapInserts !== 'none' || type.wrapEnds !== 'none') {
    out.push({ code: 'cortina-campo-ignorado', message: `Tipo "${type.name}": faixas e retornos não se aplicam à parede cortina e são ignorados.` });
  }
  return out;
}

/**
 * Validação da parede cortina no projeto (§4.6): erro de tipo inválido, avisos do tipo, e a esquadria hospedada numa
 * parede cortina (`opening-host-curtain`, erro). Mensagens em português, como o resto de `validate.ts`.
 */
export function curtainWallIssues(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const type of Object.values(p.wallTypes)) {
    if (type.family !== 'curtain') continue;
    const erro = curtainTypeIssue(type, p, 'pt');
    if (erro) out.push({ severity: 'error', code: 'curtain-type-invalid', message: `Tipo de parede cortina "${type.name}": ${erro}` });
    for (const aviso of curtainTypeAvisos(type, p)) out.push({ severity: 'warning', code: aviso.code, message: aviso.message });
  }
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    const host = p.elements[e.hostId];
    if (!isWall(host) || p.wallTypes[host.typeId]?.family !== 'curtain') continue;
    out.push({
      severity: 'error',
      code: 'opening-host-curtain',
      message: 'Esquadria hospedada em parede cortina: a porta ou janela da cortina nasce da célula (decisão 0056, §7), não de uma parede.',
      elementId: e.id,
      ids: [e.id, host.id],
    });
  }
  return out;
}
