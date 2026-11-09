import type { CenaV2 } from '@hestia/geom';
import { isGuardaCorpo, type Id, type Project } from '@hestia/model';
import type { CenaGC } from './kernelGuardaCorpo.ts';

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

/**
 * Saída da consulta `quant_guarda` -> linhas (esquema v13): `linhas` U32 de 5 por linha e `valores` F64 de 4. O número interno do guarda-corpo
 * vira o id do elemento pela cena do adaptador (`montarCenaGC`); número que a cena não conhece lança.
 */
export function decodificarQuantidadesGC(s: Record<string, ArrayLike<number>>, cena: CenaGC): LinhaQuantGC[] {
  const u = s['linhas'];
  const f = s['valores'];
  if (!u || !f || u.length % 5 !== 0 || f.length % 4 !== 0 || u.length / 5 !== f.length / 4) throw new Error('saída de quant_guarda do Rust com formato inesperado');
  const idDoNumero = new Map<number, Id>();
  for (const [id, num] of cena.guardaDe) idDoNumero.set(num, id);
  const out: LinhaQuantGC[] = [];
  for (let i = 0; i < u.length / 5; i++) {
    const guardaId = idDoNumero.get(u[5 * i]!);
    if (guardaId === undefined) throw new Error(`quant_guarda: guarda-corpo número ${u[5 * i]} sem id no projeto`);
    out.push({
      guardaId,
      papel: u[5 * i + 1]!,
      perfilNum: u[5 * i + 2]!,
      materialNum: u[5 * i + 3]!,
      nPecas: u[5 * i + 4]!,
      comprimento: f[4 * i]!,
      area: f[4 * i + 1]!,
      volume: f[4 * i + 2]!,
      areaProjetada: f[4 * i + 3]!,
    });
  }
  return out;
}

/** Quantidades de um nível pela consulta do Rust. Código de retorno diferente de zero lança; não há valor de reserva. */
export function quantidadesGuardaNivelRust(cena: CenaV2, nivel: number, cenaGC: CenaGC): LinhaQuantGC[] {
  return decodificarQuantidadesGC(cena.consultar('quant_guarda', [nivel]), cenaGC);
}

/** Totais de um tipo de guarda-corpo (soma dos guarda-corpos do tipo): metros, contagens e áreas, como o quadro de quantitativos precisa. */
export interface TotaisTipoGC {
  typeId: Id;
  guardas: number;
  metrosCorrimao: number;
  metrosTravessa: number;
  metrosTrilho: number;
  balaustres: number;
  postes: number;
  areaPaineis: number;
  volumeTotal: number;
  custo: number;
}

/** Agrega `guardaCorpoQuantities` por tipo. É a única fonte da tabela de quantitativos dos guarda-corpos (sem outra soma paralela). */
export function totaisPorTipoGC(quantidades: readonly GuardaCorpoQuantities[]): Record<Id, TotaisTipoGC> {
  const out: Record<Id, TotaisTipoGC> = {};
  for (const q of quantidades) {
    const t = (out[q.typeId] ??= { typeId: q.typeId, guardas: 0, metrosCorrimao: 0, metrosTravessa: 0, metrosTrilho: 0, balaustres: 0, postes: 0, areaPaineis: 0, volumeTotal: 0, custo: 0 });
    t.guardas += 1;
    t.balaustres += q.balaustres;
    t.postes += q.postes;
    t.areaPaineis += q.areaPaineis;
    t.volumeTotal += q.volumeTotal;
    t.custo += q.custo;
    for (const p of q.porPapel) {
      if (p.papel === 'corrimao') t.metrosCorrimao += p.comprimento;
      else if (p.papel === 'travessa') t.metrosTravessa += p.comprimento;
      else if (p.papel === 'trilho') t.metrosTrilho += p.comprimento;
    }
  }
  return out;
}
