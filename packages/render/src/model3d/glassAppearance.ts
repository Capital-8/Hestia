import type { Id, Material, OpeningGlassKind } from '@hestia/model';

/*
 * Aparência 3D do vidro conforme o tipo (`glassKind`), nas portas e janelas simples e nas células de vidro da composição.
 * O incolor (`clear`, ou sem tipo) usa o material do projeto sem mudança. Os demais tipos desenham uma CÓPIA do material
 * base com a cor e a opacidade do tipo; o projeto nunca é alterado.
 */

export interface AparenciaVidro {
  color: string;
  /** Opacidade 0..1 (substitui a do material base). */
  opacity: number;
  /** Brilho 0 (fosco) … 1 (espelhado). Ausente = o do material base. */
  gloss?: number;
}

/** Aparência dos tipos de vidro que não são incolores. */
export const APARENCIA_VIDRO: Readonly<Record<Exclude<OpeningGlassKind, 'clear'>, AparenciaVidro>> = {
  ribbed: { color: '#b4d6dc', opacity: 0.5 },
  smoke: { color: '#5f6368', opacity: 0.55 },
  green: { color: '#7fbf9a', opacity: 0.4 },
  bronze: { color: '#a0724a', opacity: 0.5 },
  frosted: { color: '#eef2f4', opacity: 0.75, gloss: 0.2 },
  wired: { color: '#c9d3d6', opacity: 0.6, gloss: 0.5 },
  laminated: { color: '#9ec8e6', opacity: 0.38 },
  tempered: { color: '#a6d8c4', opacity: 0.35 },
};

const SEPARADOR = '#';
const cache = new Map<string, Material>();

/**
 * Id do material da peça de vidro: o do projeto para incolor ou sem tipo (comportamento de antes); para os demais,
 * `<id do material>#<tipo>`, resolvido por `materialNoProjeto`.
 */
export function materialDoVidro(materialId: Id, kind?: OpeningGlassKind): Id {
  return kind && kind !== 'clear' ? `${materialId}${SEPARADOR}${kind}` : materialId;
}

/**
 * Material a desenhar para o id de uma peça: o do projeto (inalterado) ou, para `<base>#<tipo>`, uma cópia do material base
 * com a aparência do tipo. A cópia é guardada em cache pela base e pelo tipo (tipos diferentes nunca se misturam) e não
 * entra em `materiais`.
 */
export function materialNoProjeto(materiais: Readonly<Record<Id, Material>>, id: Id): Material | undefined {
  const direto = materiais[id];
  if (direto) return direto;
  const i = id.lastIndexOf(SEPARADOR);
  if (i < 0) return undefined;
  const base = materiais[id.slice(0, i)];
  const ap = APARENCIA_VIDRO[id.slice(i + 1) as Exclude<OpeningGlassKind, 'clear'>];
  if (!base || !ap) return undefined;
  const chave = `${id}|${base.color}|${base.opacity}|${base.gloss}`;
  let m = cache.get(chave);
  if (!m) {
    m = { ...base, id, color: ap.color, opacity: ap.opacity, gloss: ap.gloss ?? base.gloss };
    cache.set(chave, m);
  }
  return m;
}
