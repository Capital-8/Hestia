import { isGuardaCorpo, type Id, type Project } from '@hestia/model';

/** Papel das peças (igual ao do Rust, `guarda_malha` e `quant_guarda`). */
export const PAPEL_GC = { poste: 0, balaustre: 1, trilho: 2, corrimao: 3, suporte: 4, painel: 5, cabo: 6, travessa: 7 } as const;
export type PapelGC = keyof typeof PAPEL_GC;
const NOME_PAPEL: Record<number, PapelGC> = Object.fromEntries(Object.entries(PAPEL_GC).map(([k, v]) => [v, k as PapelGC]));

/** Uma linha de `quant_guarda` (já decodificada): `linhas` `[guarda_num, papel, perfil_num, material_num, n_pecas]` e `valores` de 4 colunas. */
export interface LinhaQuantGC {
  guardaId: Id;
  papel: number;
  perfilNum: number;
  materialNum: number;
  nPecas: number;
  comprimento: number;
  area: number;
  volume: number;
  areaProjetada: number;
}

/** Eixo de um guarda-corpo (`guarda_caminhos`): polilinhas 3D dos trechos. */
export interface EixoGC {
  guardaId: Id;
  trechos: Array<Array<{ x: number; y: number; z: number }>>;
}

export interface QuantidadePapelGC {
  papel: PapelGC;
  pecas: number;
  comprimento: number;
  area: number;
  volume: number;
}

/** Quantitativos de um guarda-corpo (molde de `StairQuantities`): o TS só agrega o que o Rust devolveu. */
export interface GuardaCorpoQuantities {
  guardaId: Id;
  typeId: Id;
  levelId: Id;
  hospedeiro: 'escada' | 'rampa' | 'manual';
  /** Comprimento do eixo em planta (m). */
  comprimentoEixo: number;
  /** Comprimento desenvolvido no espaço, contando a inclinação (m). */
  comprimentoDesenvolvido: number;
  porPapel: QuantidadePapelGC[];
  postes: number;
  balaustres: number;
  paineis: number;
  /** Área dos painéis (m², uma face; o Rust soma as duas). */
  areaPaineis: number;
  volumeTotal: number;
  /** Volume por `material_num` (m³). */
  volumePorMaterial: Record<number, number>;
  /** `tipo.cost` × comprimento desenvolvido (informativo). */
  custo: number;
}

type Cadeia = EixoGC['trechos'][number];
const planta = (t: Cadeia): number => t.slice(1).reduce((s, n, i) => s + Math.hypot(n.x - t[i]!.x, n.y - t[i]!.y), 0);
const desenvolvido = (t: Cadeia): number => t.slice(1).reduce((s, n, i) => s + Math.hypot(n.x - t[i]!.x, n.y - t[i]!.y, n.z - t[i]!.z), 0);

/** Agrega as linhas do Rust por guarda-corpo. Guarda-corpo sem linhas nem eixo não aparece; ids que não são guarda-corpo do projeto são ignorados. */
export function guardaCorpoQuantities(p: Pick<Project, 'elements' | 'tiposGuardaCorpo'>, linhas: readonly LinhaQuantGC[], eixos: readonly EixoGC[] = []): GuardaCorpoQuantities[] {
  const out: GuardaCorpoQuantities[] = [];
  const ids = new Set<Id>([...linhas.map((l) => l.guardaId), ...eixos.map((e) => e.guardaId)]);
  for (const el of Object.values(p.elements)) {
    if (!isGuardaCorpo(el) || !ids.has(el.id)) continue;
    const eixo = eixos.find((e) => e.guardaId === el.id);
    const porPapel = new Map<number, QuantidadePapelGC>();
    const volumePorMaterial: Record<number, number> = {};
    for (const l of linhas.filter((x) => x.guardaId === el.id)) {
      const q = porPapel.get(l.papel) ?? { papel: NOME_PAPEL[l.papel] ?? 'poste', pecas: 0, comprimento: 0, area: 0, volume: 0 };
      q.pecas += l.nPecas;
      q.comprimento += l.comprimento;
      q.area += l.area;
      q.volume += l.volume;
      porPapel.set(l.papel, q);
      volumePorMaterial[l.materialNum] = (volumePorMaterial[l.materialNum] ?? 0) + l.volume;
    }
    const pap = [...porPapel.entries()].sort((a, b) => a[0] - b[0]).map(([, q]) => q);
    const de = (n: PapelGC) => pap.find((q) => q.papel === n);
    const dev = eixo ? eixo.trechos.reduce((s, t) => s + desenvolvido(t), 0) : 0;
    out.push({
      guardaId: el.id,
      typeId: el.typeId,
      levelId: el.levelId,
      hospedeiro: el.hospedeiro.tipo,
      comprimentoEixo: eixo ? eixo.trechos.reduce((s, t) => s + planta(t), 0) : 0,
      comprimentoDesenvolvido: dev,
      porPapel: pap,
      postes: de('poste')?.pecas ?? 0,
      balaustres: de('balaustre')?.pecas ?? 0,
      paineis: de('painel')?.pecas ?? 0,
      areaPaineis: (de('painel')?.area ?? 0) / 2,
      volumeTotal: pap.reduce((s, q) => s + q.volume, 0),
      volumePorMaterial,
      custo: (p.tiposGuardaCorpo[el.typeId]?.cost ?? 0) * dev,
    });
  }
  return out;
}
