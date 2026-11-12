/**
 * Núcleo comum de desenho de elementos lineares e polilinhas (parede, guarda-corpo, linha de detalhe, linha de
 * separação...). CONTRATO (docs/contratos/familias-e-ferramentas.md): toda ferramenta que cria elemento linear traça
 * por aqui, para ter, sem duplicar, os mesmos snaps, Orto/Polar (F8/F10), rastreios (perpendicular, alinhamento),
 * comprimento digitado + Enter, encadeamento e Enter/Esc/C.
 *
 * O teste `contratoFerramentas.test.ts` falha se uma ferramenta linear do registro deixar de importar este módulo.
 */
import { add, dist, len, mul, norm, sub, v2, type Vec2 } from '@hestia/geom';
import { unitsOf } from '@hestia/model';
import type { InferContext } from './infer.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { Inference, PointerInfo, ToolEnv } from './types.ts';

/** Contexto de inferência de um traço em andamento: `from` liga Orto, Polar, perpendicular e os rastreios ao último ponto. */
export function contextoDeTraco(from: Vec2 | null | undefined, extra: Partial<InferContext> = {}): Partial<InferContext> {
  return from ? { ...extra, from } : { ...extra };
}

/** Ponto a `comprimento` de `origem`, na direção de `referencia` (o cursor já com snap/Orto/Polar); sem direção, o eixo X. */
export function pontoPorComprimento(origem: Vec2, referencia: Vec2, comprimento: number): Vec2 {
  const dir = norm(sub(referencia, origem));
  const d = len(dir) < 1e-9 ? v2(1, 0) : dir;
  return add(origem, mul(d, comprimento));
}

/** Lê o comprimento digitado nas unidades do projeto; null (com aviso) se não for número positivo. */
export function lerComprimentoDigitado(env: Pick<ToolEnv, 'project' | 'say'>, text: string): number | null {
  const u = unitsOf(env.project());
  const v = parseQuantityText(text, u, 'length');
  if (v === null) {
    env.say(`Valor inválido. Digite um número em ${lengthUnitName(u)}.`);
    return null;
  }
  if (v <= 0) {
    env.say(`Valor inválido. Digite o comprimento em ${lengthUnitName(u)}.`);
    return null;
  }
  return v;
}

/** Estado de uma polilinha em traçado: pontos confirmados, último ponto e fechamento. */
export class RascunhoPolilinha {
  pts: Vec2[] = [];

  get ultimo(): Vec2 | null {
    return this.pts[this.pts.length - 1] ?? null;
  }

  get ativo(): boolean {
    return this.pts.length > 0;
  }

  limpar(): void {
    this.pts = [];
  }

  /** Acrescenta o ponto; falso se coincide com o último ou se o limite acabou. */
  adicionar(q: Vec2, limite = Infinity): boolean {
    const u = this.ultimo;
    if (u && dist(u, q) < 1e-6) return false;
    if (this.pts.length >= limite) return false;
    this.pts.push(q);
    return true;
  }

  /** Ponto do comprimento digitado a partir do último, na direção do cursor inferido (`inf`) ou bruto. */
  pontoDigitado(env: Pick<ToolEnv, 'project' | 'say'>, text: string, inf: Inference | null, raw: Vec2): Vec2 | null {
    const u = this.ultimo;
    if (!u) return null;
    const v = lerComprimentoDigitado(env, text);
    return v === null ? null : pontoPorComprimento(u, inf?.point ?? raw, v);
  }
}

export type { PointerInfo };
