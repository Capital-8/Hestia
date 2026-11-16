/**
 * Lógica pura do diálogo "Pisos da massa" (ficha D1): a massa única da seleção, os níveis em que a massa tem fatia, os tipos de piso ou de
 * laje e a regra de quando o botão Gerar fica desligado. Não importa React: o diálogo e o botão da faixa usam estas funções.
 */
import { isMass, type Id, type Mass, type Project } from '@hestia/model';

export type TipoPisoMassa = 'piso' | 'laje';

/** Limite superior da tolerância de simplificação (m): acima disso o contorno some (A.7 deixa o padrão em 5 mm). */
export const TOLERANCIA_MAXIMA_PISO = 0.5;

/** A única massa da seleção, ou `null` (nenhuma, mais de uma, ou um elemento que não é massa). */
export function massaUnicaSelecionada(p: Project, selecao: readonly Id[]): Mass | null {
  if (selecao.length !== 1) return null;
  const e = p.elements[selecao[0]!];
  return isMass(e) ? e : null;
}

/**
 * Níveis do projeto em que a massa tem fatia: a cota do nível cai entre a base (cota do nível da massa mais `baseOffset`) e o topo
 * (base mais a cota da última seção). Pontas inclusivas, com folga de 1e-9 m, como no kernel (E4 item 1). Ordem por elevação.
 */
export function niveisDaMassa(p: Project, m: Mass): Id[] {
  const nivelDaMassa = p.levels.find((l) => l.id === m.levelId);
  if (!nivelDaMassa || m.secoes.length === 0) return [];
  const base = nivelDaMassa.elevation + m.baseOffset;
  const topo = base + m.secoes[m.secoes.length - 1]!.z;
  return [...p.levels]
    .sort((a, b) => a.elevation - b.elevation)
    .filter((l) => l.elevation >= base - 1e-9 && l.elevation <= topo + 1e-9)
    .map((l) => l.id);
}

/** Tipos oferecidos para piso ou para laje, na ordem do projeto. */
export function tiposDoTipo(p: Project, tipo: TipoPisoMassa): Array<{ id: Id; name: string }> {
  const lista = tipo === 'piso' ? Object.values(p.floorTypes) : Object.values(p.slabTypes);
  return lista.map((x) => ({ id: x.id, name: x.name }));
}

export interface FormularioPisosMassa {
  /** Níveis marcados (ids de nível do projeto). */
  niveis: readonly Id[];
  tipo: TipoPisoMassa;
  /** Tipo escolhido (de piso ou de laje, conforme `tipo`). */
  typeId: Id;
  /** Tolerância de simplificação em metros. */
  tolerancia: number;
}

/** Chave de texto do motivo pelo qual Gerar não pode rodar, ou `null` se pode. */
export type MotivoNaoGerar = 'ui_mp_no_mass' | 'ui_mp_no_levels' | 'ui_mp_no_type' | 'ui_mp_bad_tol';

export function motivoNaoGerar(f: FormularioPisosMassa, temMassa: boolean): MotivoNaoGerar | null {
  if (!temMassa) return 'ui_mp_no_mass';
  if (f.niveis.length === 0) return 'ui_mp_no_levels';
  if (!f.typeId) return 'ui_mp_no_type';
  if (!Number.isFinite(f.tolerancia) || f.tolerancia < 0 || f.tolerancia > TOLERANCIA_MAXIMA_PISO) return 'ui_mp_bad_tol';
  return null;
}
