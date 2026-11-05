/**
 * Textos traduzíveis do pacote `render` (carimbo de prancha, quadros de área, overlay do canvas, escada e GPU).
 *
 * O pacote não importa o i18n do app (boundary): o idioma chega por parâmetro `lang` (padrão `'pt'`) a partir das
 * entradas públicas (`buildPlanDrawList`, `buildSheetDrawList`, `furnitureParts`, `areaTablePartsOf`, controlador da
 * GPU…). As chaves usam o prefixo `rn_` do shard `areas/packages-render.ts`.
 */

export type Lang = 'pt' | 'en';

const PT = {
  // ---- overlay do canvas: tooltip de captura -------------------------------------------------------------
  rn_snap_endpoint: 'Extremidade',
  rn_snap_face: 'Canto da face',
  rn_snap_core: 'Face do núcleo',
  rn_snap_midpoint: 'Ponto médio',
  rn_snap_intersection: 'Interseção',
  rn_snap_perpendicular: 'Perpendicular',
  rn_snap_nearest: 'Na parede',
  rn_snap_alignment: 'Alinhamento',
  rn_snap_ortho: 'Ortogonal',
  rn_snap_polar: 'Polar',
  rn_snap_center: 'Centro do arco',
  rn_snap_tangent: 'Tangente ao arco',
  rn_snap_host_wall: 'parede',
  rn_snap_host_wall_mark: 'parede {mark}',

  // ---- escadas -------------------------------------------------------------------------------------------
  rn_stair_up: 'SOBE',

  // ---- carimbo de prancha --------------------------------------------------------------------------------
  rn_sheet_no_scale: 'Sem escala',
  rn_sheet_view_missing: 'Vista inexistente',
  rn_sheet_view_removed: 'Vista removida',
  rn_sheet_area_table: 'Quadro geral de áreas',
  rn_sheet_tb_project: 'Projeto: {value}',
  rn_sheet_tb_client: 'Cliente: {value}',
  rn_sheet_tb_author: 'Autor: {value}',
  rn_sheet_tb_date: 'Data: {value}',
  rn_sheet_tb_revision: 'Revisão: {value}',
  rn_sheet_tb_scale: 'Escala: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  // ---- quadros de área (cabeçalhos) ----------------------------------------------------------------------
  rn_col_no: 'Nº',
  rn_col_room: 'AMBIENTE',
  rn_col_level: 'NÍVEL',
  rn_col_area: 'ÁREA',
  rn_col_category: 'CATEGORIA',
  rn_col_perimeter: 'PERÍM.',
  rn_col_volume: 'VOLUME',
  rn_col_percent: '%',

  // ---- ambiente sem nome ---------------------------------------------------------------------------------
  rn_room_default_name: 'Ambiente',
  rn_room_default_name_numbered: 'Ambiente {number}',

  // ---- GPU / canvas --------------------------------------------------------------------------------------
  rn_canvas_aria: 'Área de desenho',
  rn_gpu_recreating_webgpu: 'Recriando WebGPU (tentativa {n}).',
  rn_gpu_switch_webgl2: 'Trocando para WebGL2.',
  rn_gpu_restart_webgl2: 'Reiniciando WebGL2.',
  rn_gpu_switch_cpu: 'Trocando para CPU.',
  rn_gpu_restarted: 'GPU reiniciada ({reason}). {note}',
  rn_gpu_context_restored: 'Contexto WebGL2 restaurado.',
  rn_gpu_draw_failed: 'Falha ao desenhar em WebGPU. Trocando para WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer indisponível: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query indisponível',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 indisponível neste navegador/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer não exposto; uploads não contados',
  rn_gpu_queue_intercept_failed: 'WebGPU: não foi possível interceptar queue.writeBuffer',
} as const;

export type DictKey = keyof typeof PT;

const EN: Record<DictKey, string> = {
  rn_snap_endpoint: 'Endpoint',
  rn_snap_face: 'Face Corner',
  rn_snap_core: 'Core Face',
  rn_snap_midpoint: 'Midpoint',
  rn_snap_intersection: 'Intersection',
  rn_snap_perpendicular: 'Perpendicular',
  rn_snap_nearest: 'Nearest',
  rn_snap_alignment: 'Alignment',
  rn_snap_ortho: 'Orthogonal',
  rn_snap_polar: 'Polar',
  rn_snap_center: 'Arc Center',
  rn_snap_tangent: 'Tangent',
  rn_snap_host_wall: 'wall',
  rn_snap_host_wall_mark: 'wall {mark}',

  rn_stair_up: 'UP',

  rn_sheet_no_scale: 'Not to Scale',
  rn_sheet_view_missing: 'View not found',
  rn_sheet_view_removed: 'View removed',
  rn_sheet_area_table: 'Area Summary',
  rn_sheet_tb_project: 'Project: {value}',
  rn_sheet_tb_client: 'Client: {value}',
  rn_sheet_tb_author: 'Author: {value}',
  rn_sheet_tb_date: 'Date: {value}',
  rn_sheet_tb_revision: 'Revision: {value}',
  rn_sheet_tb_scale: 'Scale: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  rn_col_no: 'No.',
  rn_col_room: 'ROOM',
  rn_col_level: 'LEVEL',
  rn_col_area: 'AREA',
  rn_col_category: 'CATEGORY',
  rn_col_perimeter: 'PERIM.',
  rn_col_volume: 'VOLUME',
  rn_col_percent: '%',

  rn_room_default_name: 'Room',
  rn_room_default_name_numbered: 'Room {number}',

  rn_canvas_aria: 'Drawing area',
  rn_gpu_recreating_webgpu: 'Recreating WebGPU (attempt {n}).',
  rn_gpu_switch_webgl2: 'Switching to WebGL2.',
  rn_gpu_restart_webgl2: 'Restarting WebGL2.',
  rn_gpu_switch_cpu: 'Switching to CPU.',
  rn_gpu_restarted: 'GPU restarted ({reason}). {note}',
  rn_gpu_context_restored: 'WebGL2 context restored.',
  rn_gpu_draw_failed: 'Failed to draw with WebGPU. Switching to WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer unavailable: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query unavailable',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 unavailable on this browser/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer not exposed; uploads not counted',
  rn_gpu_queue_intercept_failed: 'WebGPU: could not intercept queue.writeBuffer',
};

/** Texto da chave no idioma pedido, com interpolação `{nome}`. EN ausente cai em PT; nunca devolve `undefined`. */
export function t(lang: Lang, key: DictKey, args?: Record<string, string | number>): string {
  const text = (lang === 'en' ? EN[key] : PT[key]) ?? PT[key];
  if (!args) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in args ? String(args[name]) : whole));
}

/** Número com casas fixas e o separador pedido (`,` ou `.`), sem depender de locale do runtime. */
export function fmtNumLang(value: number, decimals: number, decimalSymbol: ',' | '.' = ','): string {
  // units-ok: formatador de propósito geral do pacote (o separador vem do projeto/idioma)
  const text = value.toFixed(decimals);
  // units-ok: o separador decimal é o parâmetro, não o locale do runtime
  return decimalSymbol === ',' ? text.replace('.', ',') : text;
}
