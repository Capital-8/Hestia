import type { Id } from '@hestia/model';

/** Que quantidade o Rust calcula: paredes, pisos, lajes ou forros de um nível. */
export type TipoQuant = 'paredes' | 'pisos' | 'lajes' | 'forros';

/** Uma camada como a consulta de quantidades do Rust a devolve (esquema v12). */
export interface LinhaQuantRust {
  /** `id_num` da parede, do piso, da laje ou do forro. */
  dono: number;
  /** `layerIndex` (negativo nas faixas verticais da parede). */
  camada: number;
  nFaixas: number;
  flags: number;
  /** Volume bruto (m³), antes dos cortes. Zero na membrana. */ // units-ok: comentário, não formatação
  bruto: number;
  /** Volume que piso e laje ocupam (m³), somado por faixa. */ // units-ok: comentário, não formatação
  cortado: number;
  /** `max(0, bruto - cortado)`, o zero uma vez por camada. */
  liquido: number;
  /** Área de face (m²). */ // units-ok: comentário, não formatação
  areaDeFace: number;
  /** Altura média da parede (m); zero nos demais. */
  altura: number;
}

/** As quantidades de um nível, já traduzidas para os ids do projeto. Falta de camada ou de parede lança (a saída do Rust não casa com o projeto). */
export interface QuantidadesRust {
  camada(id: Id, layerIndex: number): LinhaQuantRust;
  altura(id: Id): number;
}
