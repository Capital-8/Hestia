import { materialEfetivo, type DetailLevel, type HatchKind, type Material } from '@hestia/model';
import { mix } from './color.ts';
import { hachuraDePrancha } from './hatch.ts';
import type { PlanPaint } from './style.ts';
import type { HachuraPapel } from './types.ts';

/**
 * Decisão ÚNICA da cor de preenchimento (plano de fundo) e do padrão+cor (primeiro plano) de um material em planta e
 * corte (decisão 0056). Precedência: o que o TIPO do elemento define (`hachuraTipo`) ganha do material; depois
 * `material.graficos.{corte|superficie}`; depois `color`/`hatch` do material. Paredes e lajes cortadas usam
 * `graficos.corte`; superfícies (piso, forro, cobertura) usam `graficos.superficie`.
 * Sem blocos novos o resultado é idêntico ao que cada chamador calculava antes (mistura padrão só vale quando
 * `primeiroPlano.cor` é indefinida).
 */
export interface CtxPlanoMaterial {
  dark: boolean;
  detail: DetailLevel;
  /** Substituição de cor da vista (`PlanPaint.color`): vale para o fundo e para a mistura padrão do padrão. */
  paint?: Pick<PlanPaint, 'color'>;
  /** Hachura definida pelo tipo do elemento (ex.: tipo de forro): ganha do material. */
  hachuraTipo?: HatchKind;
  /** Cor de fundo quando não há material (ou ele não tem cor). Padrão: cinza `#999999`. */
  fundoReserva?: string;
  /** Fração de preto/branco na mistura padrão do padrão. Padrão 0.45. */
  misturaPadrao?: number;
  /** Cor base da mistura padrão, quando difere da cor do material (ex.: telhado, que usa a cor já misturada das águas). */
  baseMisturaPadrao?: string;
}

export interface CorPadraoPlano {
  /** Cor do material para o fundo (antes da mistura com o papel e da substituição da vista). */
  fundo: string;
  /** Padrão e cor do primeiro plano; indefinido = sem padrão (`none`, material ausente ou nível grosseiro). */
  padrao: { kind: HatchKind; color: string } | undefined;
}

function decidir(m: Material | undefined, ctx: CtxPlanoMaterial, camada: 'corte' | 'superficie'): CorPadraoPlano {
  const reserva = ctx.fundoReserva ?? '#999999';
  if (!m) return { fundo: reserva, padrao: undefined };
  const ef = materialEfetivo(m)[camada];
  const fundo = ef.planoDeFundo.cor;
  const kind = ctx.hachuraTipo ?? ef.primeiroPlano.padrao;
  if (kind === 'none' || ctx.detail === 'coarse') return { fundo, padrao: undefined };
  const base = ctx.baseMisturaPadrao ?? ctx.paint?.color ?? m.color;
  const color = ef.primeiroPlano.cor ?? mix(base, ctx.dark ? '#ffffff' : '#000000', ctx.misturaPadrao ?? 0.45);
  return { fundo, padrao: { kind, color } };
}

/** Elemento cortado (parede, laje em planta, qualquer corte em seção). Usa `graficos.corte`. */
export function corPadraoCorte(m: Material | undefined, ctx: CtxPlanoMaterial): CorPadraoPlano {
  return decidir(m, ctx, 'corte');
}

/** Superfície visível (piso, forro, cobertura). Usa `graficos.superficie`. */
export function corPadraoSuperficie(m: Material | undefined, ctx: CtxPlanoMaterial): CorPadraoPlano {
  return decidir(m, ctx, 'superficie');
}

/**
 * Hachura em mm de papel (passo de 1,5 mm e linha de 0,13/0,09 mm na escala da vista) em linha oculta com o estilo de
 * prancha; nos demais casos, `undefined` (o passo de tela de sempre).
 */
export function papelDaHachura(pt: Pick<PlanPaint, 'visual' | 'prancha' | 'escala'> | undefined): HachuraPapel | undefined {
  return pt?.visual === 'hiddenLine' && pt.prancha === true && pt.escala !== undefined && pt.escala > 0 ? hachuraDePrancha(pt.escala) : undefined;
}

/**
 * Cor da hachura em prancha: cinza escuro neutro derivado da tinta do tema (`mix(ink, paper, 0.2)`), em linha oculta com
 * o estilo de prancha ligado. Fora desse caso, mantém a cor do material.
 */
export function corDaHachuraPrancha(color: string, pt: Pick<PlanPaint, 'visual' | 'prancha'> | undefined, ink: string, paper: string): string {
  return pt?.visual === 'hiddenLine' && pt.prancha === true ? mix(ink, paper, 0.2) : color;
}
