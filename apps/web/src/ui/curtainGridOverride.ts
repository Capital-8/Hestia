// Sobrescrita da grade de uma parede cortina (decisão 0056, §4.3): o eixo U ou V da instância substitui o do tipo campo a
// campo, e "Voltar ao tipo" tira um campo da sobrescrita. Função pura: devolve a nova `grid` (ou a instância inteira); quem
// grava é o painel, com `updateElements` e `normalizarSobrescritas` num só passo de desfazer.
import type { CurtainInstance, GridAxisSpec, GridJustify, GridLayoutMode } from '@hestia/model';

/** Campos de um eixo que o painel mostra: modo, valor (conforme o modo), justificação (distância fixa) e deslocamento. */
export type CampoEixo = 'mode' | 'value' | 'justify' | 'offset';

/** Eixo da grade (U ao longo da parede, V na altura). */
export type Eixo = 'u' | 'v';

/** Sobrescrita de um eixo: só os campos que a instância muda. */
export type SobreEixo = Partial<GridAxisSpec>;

type ChaveValor = 'count' | 'distance' | 'positions';
const CHAVES_VALOR: ChaveValor[] = ['count', 'distance', 'positions'];

/** Campo do eixo que guarda o "valor" de cada modo: contagem, distância ou posições. */
export function chaveValor(modo: GridLayoutMode): ChaveValor {
  if (modo === 'fixedNumber') return 'count';
  if (modo === 'manual') return 'positions';
  return 'distance';
}

/** Eixo efetivo: o do tipo com a sobrescrita por cima, campo a campo (campo `undefined` não sobrepõe). */
export function eixoEfetivoDe(tipo: GridAxisSpec, sobre?: SobreEixo): GridAxisSpec {
  const out: GridAxisSpec = { ...tipo };
  for (const [chave, valor] of Object.entries(sobre ?? {})) {
    if (valor !== undefined) (out as unknown as Record<string, unknown>)[chave] = valor;
  }
  return out;
}

/** O campo está sobrescrito nesta instância? (O valor conta pela chave do modo efetivo.) */
export function campoSobrescrito(tipo: GridAxisSpec, sobre: SobreEixo | undefined, campo: CampoEixo): boolean {
  const s = sobre ?? {};
  if (campo === 'mode') return s.mode !== undefined;
  if (campo === 'value') return s[chaveValor(eixoEfetivoDe(tipo, s).mode)] !== undefined;
  return s[campo] !== undefined;
}

/**
 * "Voltar ao tipo" de um campo. Modo: volta o modo do tipo e tira também os valores de outros modos (não valem mais).
 * Valor: tira o valor do modo efetivo. Justificação e deslocamento: tiram o próprio campo.
 */
export function voltarAoTipo(tipo: GridAxisSpec, sobre: SobreEixo, campo: CampoEixo): SobreEixo {
  const out: SobreEixo = { ...sobre };
  if (campo === 'mode') {
    delete out.mode;
    for (const c of CHAVES_VALOR) if (c !== chaveValor(tipo.mode)) delete out[c];
  } else if (campo === 'value') {
    delete out[chaveValor(eixoEfetivoDe(tipo, sobre).mode)];
  } else {
    delete out[campo];
  }
  return out;
}

/**
 * Troca o modo do eixo. Os valores de modos anteriores saem. Voltar ao modo do tipo tira a sobrescrita do modo (e o valor
 * volta a ser o do tipo). Outro modo grava o valor que o eixo já tinha (ou o padrão do modo, como na aba Cortina).
 */
export function mudarModo(tipo: GridAxisSpec, sobre: SobreEixo, modo: GridLayoutMode): SobreEixo {
  const efetivo = eixoEfetivoDe(tipo, sobre);
  const out: SobreEixo = { ...sobre };
  delete out.mode;
  for (const c of CHAVES_VALOR) delete out[c];
  if (modo === tipo.mode) return out;
  out.mode = modo;
  const c = chaveValor(modo);
  if (c === 'count') out.count = efetivo.count ?? 3;
  else if (c === 'distance') out.distance = efetivo.distance ?? 1.2;
  else out.positions = efetivo.positions ?? [];
  return out;
}

/** Grava o valor do modo (contagem, distância ou posições) na sobrescrita. */
export function definirValor(sobre: SobreEixo, modo: GridLayoutMode, valor: number | number[]): SobreEixo {
  const c = chaveValor(modo);
  if (c === 'count') return { ...sobre, count: valor as number };
  if (c === 'distance') return { ...sobre, distance: valor as number };
  return { ...sobre, positions: valor as number[] };
}

/** Grava a justificação (distância fixa) ou o deslocamento (m) na sobrescrita. */
export function definirCampo(sobre: SobreEixo, campo: 'justify' | 'offset', valor: GridJustify | number): SobreEixo {
  return campo === 'justify' ? { ...sobre, justify: valor as GridJustify } : { ...sobre, offset: valor as number };
}

/** Sobrescrita sem campos `undefined`; vazia vira `undefined` (o eixo não tem sobrescrita). */
function limpo(sobre: SobreEixo): SobreEixo | undefined {
  const out: SobreEixo = {};
  for (const [chave, valor] of Object.entries(sobre)) if (valor !== undefined) (out as unknown as Record<string, unknown>)[chave] = valor;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** `grid` da instância com o eixo trocado. Sem sobrescrita em nenhum eixo, devolve `undefined` (a instância volta ao tipo). */
export function gradeComEixo(grid: CurtainInstance['grid'], eixo: Eixo, sobre: SobreEixo): CurtainInstance['grid'] {
  const out: NonNullable<CurtainInstance['grid']> = { ...(grid ?? {}) };
  const novo = limpo(sobre);
  if (novo) out[eixo] = novo;
  else delete out[eixo];
  return out.u || out.v ? out : undefined;
}

/** Instância com a `grid` trocada; sem `grid`, a chave some (não fica `grid: undefined` gravado). */
export function comGrade(inst: CurtainInstance, grid: CurtainInstance['grid']): CurtainInstance {
  const out: CurtainInstance = { ...inst };
  delete out.grid;
  if (grid) out.grid = grid;
  return out;
}
