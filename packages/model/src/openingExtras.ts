import { t as translate, type Lang } from './i18n.ts';
import type { OpeningSettingSystem, OpeningType } from './types.ts';

/**
 * Acabamentos e vão bruto do tipo de abertura. Todos os campos são opcionais no `OpeningType`; aqui ficam o padrão por
 * leitura e a validação, no mesmo modelo do `openingFrame` (arquivos antigos não mudam de aparência).
 */

/** Vão bruto (furo na parede): dimensões do tipo mais a folga de assentamento. Só o furo cresce; a esquadria não. */
export interface OpeningRough {
  width: number;
  height: number;
}

/** Alizar: largura vista e espessura saliente da face da parede (m). */
export interface OpeningCasing {
  width: number;
  thickness: number;
}

/** Peitoril saliente: projeção além de cada face da parede e espessura da peça (m). */
export interface OpeningSillBoard {
  projection: number;
  thickness: number;
}

/** Verga ou contraverga: transpasse para cada lado do vão e altura da peça (m). */
export interface OpeningLintel {
  over: number;
  height: number;
}

/** Transpasse padrão da verga e da contraverga, para cada lado (m). A altura padrão é a do pedido do projeto. */
export const OPENING_LINTEL_DEFAULTS = { over: 0.3, height: 0.2 } as const;

/** Sistemas de assentamento aceitos (o schema é fechado). */
export const OPENING_SETTING_SYSTEMS: readonly OpeningSettingSystem[] = ['grapa', 'espuma', 'contramarco'];

/**
 * Folga de assentamento por lado (m) de cada sistema, quando o tipo não informa `settingClearance`. Fonte: manual de
 * alumínio MGM (fabricante): grapa ~0,5 cm; espuma expansiva sem contramarco ~2 cm; contramarco 25 mm. Outras fontes
 * divergem (SINAPI 1 cm no contramarco; Hydro 3 a 5 cm): o manual do fabricante prevalece (docs/estudo-esquadrias/05 §6.1).
 */
export const SETTING_CLEARANCE_DEFAULTS: Readonly<Record<OpeningSettingSystem, number>> = { grapa: 0.005, espuma: 0.02, contramarco: 0.025 };

/**
 * Transpasse mínimo de referência da verga, por lado (m). [CONFLITO] 0,20 m é o atribuído à NBR 8545 (texto não lido);
 * 0,30 m é a prática SINAPI e o padrão do modelo. Abaixo deste valor sai só um aviso: o cálculo estrutural prevalece.
 */
export const LINTEL_OVER_MIN = 0.2;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nonNeg = (v: unknown): number => Math.max(0, num(v));
const positive = (v: unknown): number => Math.max(0, num(v));
const defaulted = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * Folga de assentamento por lado (m): a do tipo (`settingClearance`), ou a do sistema; zero sem sistema, como antes. Um
 * valor inválido no campo cai para a do sistema.
 */
export function openingSettingClearance(t: Pick<OpeningType, 'settingSystem' | 'settingClearance'>): number {
  const v = t.settingClearance;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  const doSistema = t.settingSystem === undefined ? undefined : SETTING_CLEARANCE_DEFAULTS[t.settingSystem];
  return doSistema ?? 0;
}

/**
 * Vão bruto do tipo (m): largura e altura do tipo, mais `roughOversize` e mais 2 × a folga de assentamento por lado
 * (`openingSettingClearance`). Ausente ou inválido vale 0.
 */
export function openingRough(t: Pick<OpeningType, 'width' | 'height' | 'roughOversize' | 'settingSystem' | 'settingClearance'>): OpeningRough {
  const folga = 2 * openingSettingClearance(t);
  return { width: t.width + nonNeg(t.roughOversize?.w) + folga, height: t.height + nonNeg(t.roughOversize?.h) + folga };
}

/** Aviso (não erro) quando o transpasse da verga fica abaixo do mínimo de referência: o estrutural prevalece. */
export function lintelOverWarning(t: Pick<OpeningType, 'lintel'>, lang: Lang = 'pt'): string | null {
  const lin = openingLintel(t);
  if (!lin || lin.over >= LINTEL_OVER_MIN) return null;
  return translate(lang, 'md_lintel_over_short', { over: Math.round(lin.over * 100), min: Math.round(LINTEL_OVER_MIN * 100) });
}

/** Alizar do tipo, ou null quando ausente/zerado (o padrão é não desenhar). */
export function openingCasing(t: Pick<OpeningType, 'casing'>): OpeningCasing | null {
  const c = t.casing;
  if (!c) return null;
  const width = positive(c.width);
  const thickness = positive(c.thickness);
  return width > 0 && thickness > 0 ? { width, thickness } : null;
}

/** Peitoril saliente do tipo, ou null quando ausente/zerado. Só vale para janela. */
export function openingSillBoard(t: Pick<OpeningType, 'kind' | 'sillBoard'>): OpeningSillBoard | null {
  if (t.kind !== 'window') return null;
  const s = t.sillBoard;
  if (!s) return null;
  const projection = positive(s.projection);
  const thickness = positive(s.thickness);
  return projection > 0 && thickness > 0 ? { projection, thickness } : null;
}

/** Verga do tipo, ou null quando o campo está ausente. Presente sem valores usa o transpasse e a altura padrão. */
export function openingLintel(t: Pick<OpeningType, 'lintel'>): OpeningLintel | null {
  if (!t.lintel) return null;
  return {
    over: defaulted(t.lintel.over, OPENING_LINTEL_DEFAULTS.over),
    height: defaulted(t.lintel.height, OPENING_LINTEL_DEFAULTS.height),
  };
}

/** Contraverga do tipo, ou null quando o campo está ausente. Presente sem valores usa o transpasse e a altura padrão. */
export function openingSillBeam(t: Pick<OpeningType, 'sillBeam'>): OpeningLintel | null {
  if (!t.sillBeam) return null;
  return {
    over: defaulted(t.sillBeam.over, OPENING_LINTEL_DEFAULTS.over),
    height: defaulted(t.sillBeam.height, OPENING_LINTEL_DEFAULTS.height),
  };
}

/** Limites razoáveis do acabamento (m): acima deles o tipo é recusado ao salvar (`acabamentoIssue`). */
export const ACABAMENTO_LIMITES = {
  folga: 0.2,
  alizarLargura: 0.3,
  alizarEspessura: 0.05,
  soleiraProjecao: 0.1,
  soleiraEspessura: 0.05,
  transpasse: 1,
  alturaVerga: 0.6,
  folgaAssentamento: 0.05,
} as const;

/** Campos de acabamento do tipo (os de `OpeningType`, todos opcionais). */
export type OpeningAcabamento = Pick<OpeningType, 'roughOversize' | 'casing' | 'sillBoard' | 'lintel' | 'sillBeam' | 'settingSystem' | 'settingClearance'>;

/**
 * Confere as medidas do acabamento: cada uma tem de ser finita, ≥ 0 e até o limite. Devolve a 1ª mensagem, ou null.
 * Campo ausente não é conferido (vale o padrão por leitura); zero é válido e equivale a não desenhar a peça.
 */
export function acabamentoIssue(t: OpeningAcabamento): string | null {
  const faixa = (campo: string, v: number | undefined, max: number): string | null =>
    v === undefined || (Number.isFinite(v) && v >= 0 && v <= max) ? null : `${campo}: use um valor de 0 a ${Math.round(max * 100)} cm.`;
  return (
    faixa('Folga do vão, largura', t.roughOversize?.w, ACABAMENTO_LIMITES.folga) ??
    faixa('Folga do vão, altura', t.roughOversize?.h, ACABAMENTO_LIMITES.folga) ??
    faixa('Alizar, largura', t.casing?.width, ACABAMENTO_LIMITES.alizarLargura) ??
    faixa('Alizar, espessura', t.casing?.thickness, ACABAMENTO_LIMITES.alizarEspessura) ??
    faixa('Soleira, projeção', t.sillBoard?.projection, ACABAMENTO_LIMITES.soleiraProjecao) ??
    faixa('Soleira, espessura', t.sillBoard?.thickness, ACABAMENTO_LIMITES.soleiraEspessura) ??
    faixa('Verga, transpasse', t.lintel?.over, ACABAMENTO_LIMITES.transpasse) ??
    faixa('Verga, altura', t.lintel?.height, ACABAMENTO_LIMITES.alturaVerga) ??
    faixa('Contraverga, transpasse', t.sillBeam?.over, ACABAMENTO_LIMITES.transpasse) ??
    faixa('Contraverga, altura', t.sillBeam?.height, ACABAMENTO_LIMITES.alturaVerga) ??
    faixa('Folga de assentamento', t.settingClearance, ACABAMENTO_LIMITES.folgaAssentamento) ??
    (t.settingSystem === undefined || OPENING_SETTING_SYSTEMS.includes(t.settingSystem) ? null : 'Sistema de assentamento: use grapa, espuma ou contramarco.')
  );
}
