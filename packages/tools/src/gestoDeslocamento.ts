import { angleOf, len, mul, norm, sub, v2, type Vec2 } from '@hestia/geom';
import { dimensionSettingsOf, formatQuantity, unitsOf, type ResolvedUnits } from '@hestia/model';
import { displacementDimProvider } from './dims/providers/displacement.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { parseQuantityText } from './numeric.ts';
import type { ToolEnv } from './types.ts';

/**
 * Núcleo comum do gesto de Mover e Copiar (planta, corte e elevação): ponto base, cursor, deslocamento digitado, cota dinâmica do
 * deslocamento e a sessão de cópias. A planta (`MoveTool`) e o corte (`SectionMoveTool`) usam as MESMAS peças, de modo que o
 * fluxo "ponto base, destino com snaps ou distância digitada + Enter, Esc cancela, várias cópias" é um só (contrato, regra 3).
 * O que muda de uma vista para a outra é só o plano do deslocamento: (x, y) da planta ou (t, z) do corte.
 */

export const fmtM = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Rótulo do gesto de mover/copiar: distância e ângulo (direção do deslocamento em relação ao eixo X). */
export const fmtDisplacement = (u: ResolvedUnits, d: Vec2): string =>
  `${fmtM(u, len(d))} · ${formatQuantity(u, 'angle', angleOf(d))}`;

/**
 * Deslocamento digitado: `text` é a distância (unidades do projeto) e a direção é a do ponto base ao ponto que o cursor aponta
 * (`apontando`). Cursor sobre a base: segue o eixo X (horizontal na planta, ao longo do corte na vista). Texto inválido: null.
 */
export function deslocamentoDigitado(env: ToolEnv, text: string, base: Vec2, apontando: Vec2): Vec2 | null {
  const v = parseQuantityText(text, unitsOf(env.project()), 'length');
  if (v === null) return null;
  const dir = norm(sub(apontando, base));
  return mul(len(dir) < 1e-9 ? v2(1, 0) : dir, v);
}

/** Cota dinâmica do deslocamento (ponto base até o cursor), pelo provedor do sistema único de cotas. */
export function cotaDoDeslocamento(env: ToolEnv, base: Vec2 | null, cursor: Vec2 | null, overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
  if (!base || !cursor) return [];
  const project = env.project();
  return displacementDimProvider.compute(
    { project, levelId: env.levelId(), settings: dimensionSettingsOf(project), overrides },
    { from: base, to: cursor },
  );
}

/**
 * Sessão de cópias do Copiar: todas as cópias de um mesmo Copiar entram num só passo de desfazer (chave `chave` na transação), e
 * Esc, com cópias já feitas, encerra a sessão de uma vez.
 */
export class SessaoDeCopias {
  /** Chave da sessão: transações com a mesma chave viram um só passo de desfazer. */
  chave: object = {};
  /** Quantas cópias a sessão já fez. */
  feitas = 0;

  reinicia(): void {
    this.chave = {};
    this.feitas = 0;
  }

  registra(): void {
    this.feitas += 1;
  }

  /** Copiar com cópias feitas: Esc encerra a sessão em vez de só cancelar o ponto base. */
  encerraComEsc(copiar: boolean): boolean {
    return copiar && this.feitas > 0;
  }
}
