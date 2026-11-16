/**
 * Lógica pura do diálogo "Paredes da massa" (ficha D2): os tipos de parede do projeto, a regra de quando o botão Gerar fica desligado e a
 * nota do aviso 4 do kernel (face lateral inclinada). A massa única e os níveis dentro dela vêm de `massPisosForm.ts`. Não importa React.
 */
import type { AvisoMassaProjeto } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';

/** Limite superior da tolerância de simplificação (m): acima disso o contorno some (A.7 deixa o padrão em 5 cm). */
export const TOLERANCIA_MAXIMA_PAREDE = 0.5;
/** Limite superior do segmento mínimo (m): acima disso quase nenhuma parede sobra. */
export const SEGMENTO_MINIMO_MAXIMO = 5;
/** Código do aviso 4 do kernel (A.4 regra 12): face lateral com inclinação maior que 5° da vertical. */
export const CODIGO_AVISO_FACE_INCLINADA = 4;

/** Tipos de parede do projeto, na ordem dele. */
export function tiposDeParede(p: Project): Array<{ id: Id; name: string }> {
  return Object.values(p.wallTypes).map((x) => ({ id: x.id, name: x.name }));
}

export interface FormularioParedesMassa {
  /** Níveis marcados (ids de nível do projeto). */
  niveis: readonly Id[];
  /** Tipo de parede escolhido. */
  typeId: Id;
  /** Tolerância de simplificação em metros. */
  tolerancia: number;
  /** Segmento mínimo em metros. */
  segmentoMinimo: number;
}

/** Chave de texto do motivo pelo qual Gerar não pode rodar, ou `null` se pode. */
export type MotivoNaoGerarParedes = 'ui_mw_no_mass' | 'ui_mw_no_levels' | 'ui_mw_no_type' | 'ui_mw_bad_tol' | 'ui_mw_bad_min';

export function motivoNaoGerarParedes(f: FormularioParedesMassa, temMassa: boolean): MotivoNaoGerarParedes | null {
  if (!temMassa) return 'ui_mw_no_mass';
  if (f.niveis.length === 0) return 'ui_mw_no_levels';
  if (!f.typeId) return 'ui_mw_no_type';
  if (!Number.isFinite(f.tolerancia) || f.tolerancia < 0 || f.tolerancia > TOLERANCIA_MAXIMA_PAREDE) return 'ui_mw_bad_tol';
  if (!Number.isFinite(f.segmentoMinimo) || f.segmentoMinimo <= 0 || f.segmentoMinimo > SEGMENTO_MINIMO_MAXIMO) return 'ui_mw_bad_min';
  return null;
}

/**
 * Nota do aviso 4 para a massa: a chave do texto quando o kernel acusa face inclinada nela (em qualquer pavimento), ou `null`. Sem kernel
 * (`avisos` é `null`) não há nota.
 */
export function notaDaFaceInclinada(avisos: readonly AvisoMassaProjeto[] | null, massaId: Id): 'ui_mw_face_note' | null {
  return (avisos ?? []).some((a) => a.massaId === massaId && a.codigo === CODIGO_AVISO_FACE_INCLINADA) ? 'ui_mw_face_note' : null;
}
