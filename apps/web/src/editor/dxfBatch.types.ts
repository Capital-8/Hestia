import type { Id, Project } from '@hestia/model';
import type { DxfUnit } from '@hestia/io';
import type { Lang } from './i18n.ts';

/**
 * Contrato do lote de exportação DXF (fase 4). O diálogo monta a lista a partir de `dxfBatchTargetsOf`, o usuário marca os
 * alvos e `buildDxfBatch` devolve os arquivos, o manifest e o ZIP. Os renderizadores são injetados para a prancha entrar
 * depois sem acoplar o lote ao compositor da folha.
 */

/** Grupo do alvo no diálogo (a ordem é a da lista). */
export type DxfBatchGroup = 'plantas' | 'areas' | 'cortes' | 'pranchas';

/** Um documento exportável: planta de nível, planta de área, corte/elevação ou prancha. */
export type DxfBatchTarget =
  | { kind: 'plan'; key: string; levelId: Id; label: string; group: 'plantas' }
  | { kind: 'area'; key: string; planId: Id; label: string; group: 'areas' }
  | { kind: 'section'; key: string; viewId: Id; label: string; group: 'cortes'; elevation: boolean }
  | { kind: 'sheet'; key: string; sheetId: Id; label: string; group: 'pranchas' };

/** Opções do lote (valem para todos os arquivos). */
export interface DxfBatchOptions {
  /** Unidade de saída (padrão do diálogo = a do projeto). */
  units: DxfUnit;
  /** Projeção da cobertura nas plantas (a mesma preferência da vista). */
  showRoofProjection: boolean;
  /** Prefixo dos nomes (padrão = nome do projeto). */
  prefix: string;
  /** Modelo do nome, com `{projeto}`, `{tipo}`, `{nome}`, `{nivel}` e `{prancha}`. */
  pattern: string;
  /** Idioma dos nomes e do LEIA-ME; ausente = o idioma ativo do app. */
  lang?: Lang;
}

/** Renderizadores por tipo de documento; cada um devolve o texto do DXF já na unidade pedida. */
export interface DxfBatchRenderers {
  plan(p: Project, levelId: Id, options: DxfBatchOptions): string;
  area(p: Project, planId: Id, options: DxfBatchOptions): string;
  section(p: Project, viewId: Id, options: DxfBatchOptions): string;
  /** Prancha como plotada (modo do Revit). Ausente = prancha marcada entra em `skipped`. */
  sheet?(p: Project, sheetId: Id, options: DxfBatchOptions): string;
}

/** Arquivo do lote: caminho relativo com `/` e conteúdo em texto. */
export interface DxfBatchFile {
  path: string;
  data: string;
}

/** Alvo marcado que não gerou arquivo (com o motivo, para o resumo do diálogo). */
export interface DxfBatchSkip {
  key: string;
  label: string;
  reason: string;
}

/** Resultado do lote, pronto para zipar. */
export interface DxfBatchResult {
  files: DxfBatchFile[];
  /** Conteúdo do `manifest.csv` (separador `;`). */
  manifest: string;
  skipped: DxfBatchSkip[];
  zipName: string;
}
