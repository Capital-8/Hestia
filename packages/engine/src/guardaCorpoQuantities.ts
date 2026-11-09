/**
 * Quantidades do guarda-corpo (decisão 0055, Fase 4, parte de quantidades; consulta `quant_guarda` do Rust, esquema v13). O Rust devolve, por
 * guarda-corpo, papel, perfil e material: número de peças, comprimento, área, volume e área projetada. Este módulo só decodifica e agrega
 * (ADR §7.1): não recalcula geometria. Falta de guarda-corpo ou de material no mapa lança, como nas quantidades de parede e de laje.
 */
import type { CenaV2 } from '@hestia/geom';
import { isGuardaCorpo, type Id, type Project } from '@hestia/model';
import type { CenaGC } from './kernelGuardaCorpo.ts';

/** Papéis de `quant_guarda` (ADR §6.2). */
export const PAPEL_GC = { poste: 0, balaustre: 1, trilho: 2, corrimao: 3, painel: 5, travessa: 7 } as const;

/** Perfil de painel (sem perfil): `ID_AUSENTE` do contrato. */
export const SEM_PERFIL_GC = 0xffffffff;

/** Uma linha de `quant_guarda`: o total de um guarda-corpo para um papel, perfil e material. Números internos (`id_num` do Rust). */
export interface LinhaQuantGC {
  /** `id_num` do guarda-corpo. */
  guarda: number;
  papel: number;
  /** `id_num` do perfil, ou `SEM_PERFIL_GC`. */
  perfil: number;
  /** `material_num` (o mapa de materiais da cena). */
  material: number;
  nPecas: number;
  /** Metros. */
  comprimento: number;
  /** Metros quadrados (painéis). */
  area: number;
  /** Metros cúbicos. */
  volume: number;
  /** Metros quadrados vistos de frente (linear: comprimento × largura; painel: área). */
  areaProjetada: number;
}

/** Saída da consulta -> linhas. `linhas` (U32, 5 por linha) e `valores` (F64, 4 por linha). */
export function decodificarQuantidadesGC(s: Record<string, ArrayLike<number>>): LinhaQuantGC[] {
  const u = s['linhas'];
  const f = s['valores'];
  if (!u || !f || u.length % 5 !== 0 || f.length % 4 !== 0 || u.length / 5 !== f.length / 4) throw new Error('saída de quant_guarda do Rust com formato inesperado');
  const out: LinhaQuantGC[] = [];
  for (let i = 0; i < u.length / 5; i++) {
    out.push({
      guarda: u[5 * i]!,
      papel: u[5 * i + 1]!,
      perfil: u[5 * i + 2]!,
      material: u[5 * i + 3]!,
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
export function quantidadesGuardaNivelRust(cena: CenaV2, nivel: number): LinhaQuantGC[] {
  return decodificarQuantidadesGC(cena.consultar('quant_guarda', [nivel]));
}

/** Totais de um guarda-corpo (ou de um tipo): metros por peça, contagens e áreas. */
export interface TotaisGuardaCorpo {
  /** Metros de corrimão (laterais contam: `posicao` ambas dobra). */
  metrosCorrimao: number;
  /** Metros de travessa superior (corrimão com função topo). */
  metrosTravessa: number;
  metrosTrilho: number;
  /** Número de balaústres. */
  balaustres: number;
  /** Número de postes (início, fim, canto e intermediários). */
  postes: number;
  /** Área de painel (m², bruta). */
  areaPaineis: number;
  /** Volume total das peças (m³). */
  volume: number;
}

export interface QuantidadesGuardaCorpo {
  /** Por guarda-corpo (id do elemento). Guarda-corpo que não entrou na cena (hospedeiro ausente) não aparece. */
  porGuarda: Record<Id, TotaisGuardaCorpo>;
  /** Por tipo de guarda-corpo (id do tipo): soma dos guarda-corpos de cada tipo. */
  porTipo: Record<Id, TotaisGuardaCorpo>;
}

const vazio = (): TotaisGuardaCorpo => ({ metrosCorrimao: 0, metrosTravessa: 0, metrosTrilho: 0, balaustres: 0, postes: 0, areaPaineis: 0, volume: 0 });

function somarEm(t: TotaisGuardaCorpo, l: LinhaQuantGC): void {
  t.volume += l.volume;
  switch (l.papel) {
    case PAPEL_GC.poste:
      t.postes += l.nPecas;
      break;
    case PAPEL_GC.balaustre:
      t.balaustres += l.nPecas;
      break;
    case PAPEL_GC.trilho:
      t.metrosTrilho += l.comprimento;
      break;
    case PAPEL_GC.corrimao:
      t.metrosCorrimao += l.comprimento;
      break;
    case PAPEL_GC.travessa:
      t.metrosTravessa += l.comprimento;
      break;
    case PAPEL_GC.painel:
      t.areaPaineis += l.area;
      break;
    default:
      throw new Error(`quant_guarda: papel ${l.papel} desconhecido`);
  }
}

/**
 * Agrega as linhas do Rust por guarda-corpo e por tipo. `cena` é a montagem do adaptador (`montarCenaGC`), que diz qual número interno é de qual
 * guarda-corpo. Linha de número que a cena não conhece lança (a saída do Rust não casa com o projeto).
 */
export function quantidadesGuardaCorpo(p: Project, cena: CenaGC, linhas: readonly LinhaQuantGC[]): QuantidadesGuardaCorpo {
  const guardaDeNum = new Map<number, Id>();
  for (const [id, num] of cena.guardaDe) guardaDeNum.set(num, id);
  const porGuarda: Record<Id, TotaisGuardaCorpo> = {};
  const porTipo: Record<Id, TotaisGuardaCorpo> = {};
  for (const l of linhas) {
    const id = guardaDeNum.get(l.guarda);
    if (id === undefined) throw new Error(`quant_guarda: guarda-corpo número ${l.guarda} sem id no projeto`);
    const el = p.elements[id];
    if (!el || !isGuardaCorpo(el)) throw new Error(`quant_guarda: ${id} não é guarda-corpo`);
    const g = (porGuarda[id] ??= vazio());
    somarEm(g, l);
    const t = (porTipo[el.typeId] ??= vazio());
    somarEm(t, l);
  }
  return { porGuarda, porTipo };
}
