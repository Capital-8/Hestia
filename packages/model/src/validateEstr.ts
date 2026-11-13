// Validação de tipos e elementos de estrutura (A.2, A.3 e A.4). As funções devolvem a mensagem do primeiro problema
// ou null; os comandos recusam (lançam) quando há problema e o projeto não muda. A geometria é do kernel.

import { t, type Lang } from './i18n.ts';
import { ALINHAMENTOS_VIGA, DISCIPLINAS_PILAR, EXTREMIDADES_VIGA, FORMAS_DE_FUNDACAO, VIGA_COMPRIMENTO_MIN, type Beam, type BeamType, type Column, type ColumnType, type Footing, type FootingType, type PerfilForma } from './estrTypes.ts';
import { validarPerfil } from './perfis.ts';
import { isWall, type Id, type Project } from './types.ts';

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const positivo = (n: unknown): n is number => finito(n) && n > 0;
const ponto = (v: unknown): boolean => finito((v as { x?: unknown } | undefined)?.x) && finito((v as { y?: unknown } | undefined)?.y);

/** Identidade e custo comuns a todo tipo de estrutura. */
function identidadeIssue(tp: { name: string; code: string; materialId: string; cost: number }, lang: Lang): string | null {
  if (typeof tp.name !== 'string' || !tp.name.trim() || typeof tp.code !== 'string' || typeof tp.materialId !== 'string' || !tp.materialId) return t(lang, 'md_estr_nome');
  return finito(tp.cost) && tp.cost >= 0 ? null : t(lang, 'md_estr_custo');
}

/** Tipo de pilar: identidade, perfil e camadas (camadas só no arquitetônico, com espessura maior que zero). */
export function columnTypeIssue(tp: ColumnType, lang: Lang = 'pt'): string | null {
  const id = identidadeIssue(tp, lang);
  if (id) return id;
  if (!DISCIPLINAS_PILAR.includes(tp.disciplina)) return t(lang, 'md_estr_disciplina');
  const perfil = validarPerfil(tp.perfil, lang);
  if (perfil) return perfil;
  if (tp.camadas === undefined) return null;
  if (tp.disciplina !== 'arquitetonico') return t(lang, 'md_estr_camadas_arq');
  return Array.isArray(tp.camadas) && tp.camadas.every((l) => typeof l?.materialId === 'string' && l.materialId !== '' && positivo(l.thickness)) ? null : t(lang, 'md_estr_camada');
}

export function beamTypeIssue(tp: BeamType, lang: Lang = 'pt'): string | null {
  return identidadeIssue(tp, lang) ?? validarPerfil(tp.perfil, lang);
}

const BASES_ISOLADA: ReadonlySet<string> = new Set(['retangular', 'circular', 'personalizado']);
const BASES_ESTACA: ReadonlySet<string> = new Set(['circular', 'tuboCircular']);

/**
 * Tipo de fundação (A.3): corrida só `sapata` com base retangular; sapata e bloco com base retangular, circular ou
 * personalizada; estaca com base circular ou tubo circular e sem pescoço; pescoço só na isolada, junto com sua altura.
 */
export function footingTypeIssue(tp: FootingType, lang: Lang = 'pt'): string | null {
  const id = identidadeIssue(tp, lang);
  if (id) return id;
  if ((tp.modo !== 'isolada' && tp.modo !== 'corrida') || !FORMAS_DE_FUNDACAO.includes(tp.forma) || (tp.modo === 'corrida' && tp.forma !== 'sapata')) return t(lang, 'md_estr_ftipo_modo');
  const permitidas = tp.forma === 'estaca' ? BASES_ESTACA : tp.modo === 'corrida' ? new Set(['retangular']) : BASES_ISOLADA;
  if (!permitidas.has(tp.base?.forma)) return t(lang, 'md_estr_ftipo_base');
  const base = validarPerfil(tp.base, lang);
  if (base) return base;
  if (!positivo(tp.alturaBase)) return t(lang, 'md_estr_ftipo_altura');
  if (tp.pescoco === undefined && tp.alturaPescoco === undefined) return null;
  if (tp.pescoco === undefined || !positivo(tp.alturaPescoco) || tp.modo !== 'isolada' || tp.forma === 'estaca' || !BASES_ISOLADA.has(tp.pescoco.forma)) return t(lang, 'md_estr_ftipo_pescoco');
  return validarPerfil(tp.pescoco as PerfilForma, lang);
}

/**
 * Pilar contra o seu tipo: números finitos, disciplina igual à do tipo, altura maior que zero quando o topo não é um
 * nível e parede hospedeira só no arquitetônico. A existência de nível, tipo e parede é checada pelos comandos.
 */
export function columnIssue(c: Column, tipo: ColumnType, lang: Lang = 'pt'): string | null {
  if (!ponto(c.pos) || !finito(c.rotation) || !finito(c.baseOffset) || !finito(c.topOffset)) return t(lang, 'md_estr_pilar_numero');
  if (c.disciplina !== tipo.disciplina) return t(lang, 'md_cmd_estr_disciplina');
  if (c.topLevelId === null && !positivo(c.height)) return t(lang, 'md_estr_pilar_altura');
  if (c.hostWallId !== undefined && c.disciplina !== 'arquitetonico') return t(lang, 'md_estr_pilar_hospedeiro');
  return null;
}

/** Viga: números finitos, eixo com pelo menos 1 mm (A.4.1), alinhamento e extremidades válidos. */
export function beamIssue(b: Beam, lang: Lang = 'pt'): string | null {
  if (!ponto(b.a) || !ponto(b.b) || !finito(b.zOffsetA) || !finito(b.zOffsetB) || !finito(b.rotation)) return t(lang, 'md_estr_viga_numero');
  if (Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) < VIGA_COMPRIMENTO_MIN) return t(lang, 'md_estr_viga_curta');
  if (!ALINHAMENTOS_VIGA.includes(b.alinhamento) || !EXTREMIDADES_VIGA.includes(b.extremidadeA) || !EXTREMIDADES_VIGA.includes(b.extremidadeB)) return t(lang, 'md_estr_viga_opcao');
  return null;
}

/** Fundação contra o seu tipo: isolada tem `pos`; corrida tem `a` e `b` (≥ 1 mm) e pode ter parede hospedeira. */
export function footingIssue(f: Footing, tipo: FootingType, lang: Lang = 'pt'): string | null {
  if (!finito(f.topOffset) || !finito(f.rotation)) return t(lang, 'md_estr_fund_numero');
  if (tipo.modo === 'isolada') {
    if (!ponto(f.pos) || f.a !== undefined || f.b !== undefined) return t(lang, 'md_estr_fund_isolada');
    return f.hostWallId === undefined ? null : t(lang, 'md_estr_fund_hospedeiro');
  }
  if (!f.a || !f.b || !ponto(f.a) || !ponto(f.b) || f.pos !== undefined || Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y) < VIGA_COMPRIMENTO_MIN) return t(lang, 'md_estr_fund_corrida');
  return null;
}

/** Material de cada id existe no projeto (corpo e camadas dos tipos). */
export function materiaisIssue(p: Project, ids: readonly Id[], lang: Lang = 'pt'): string | null {
  return ids.every((id) => !!p.materials[id]) ? null : t(lang, 'md_cmd_estr_material_missing');
}

/** O nível existe no projeto. */
export function nivelIssue(p: Project, levelId: Id, lang: Lang = 'pt'): string | null {
  return p.levels.some((l) => l.id === levelId) ? null : t(lang, 'md_cmd_level_missing_id', { id: levelId });
}

/** A parede hospedeira existe e é uma parede. */
export function hospedeiroIssue(p: Project, wallId: Id | undefined, lang: Lang = 'pt'): string | null {
  return wallId === undefined || isWall(p.elements[wallId]) ? null : t(lang, 'md_cmd_estr_host_missing');
}
