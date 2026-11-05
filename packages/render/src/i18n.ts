/**
 * Textos traduzíveis do pacote `render` (carimbo de prancha, quadros de área, overlay do canvas, escada e GPU).
 *
 * O pacote não importa o i18n do app (boundary): o idioma chega por parâmetro `lang` (padrão `'pt'`) a partir das
 * entradas públicas (`buildPlanDrawList`, `buildSheetDrawList`, `furnitureParts`, `areaTablePartsOf`, controlador da
 * GPU…). As chaves usam o prefixo `rn_` do shard `areas/packages-render.ts`.
 */

export type Lang = 'pt' | 'en' | 'es' | 'de' | 'fr' | 'it' | 'pl';

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
  const text = dictFor(lang)[key] ?? EN[key] ?? PT[key];
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

const ES: Record<DictKey, string> = {
  rn_snap_endpoint: 'Extremo',
  rn_snap_face: 'Esquina de la cara',
  rn_snap_core: 'Cara del núcleo',
  rn_snap_midpoint: 'Punto medio',
  rn_snap_intersection: 'Intersección',
  rn_snap_perpendicular: 'Perpendicular',
  rn_snap_nearest: 'Más cercano',
  rn_snap_alignment: 'Alineación',
  rn_snap_ortho: 'Ortogonal',
  rn_snap_polar: 'Polar',
  rn_snap_center: 'Centro del arco',
  rn_snap_tangent: 'Tangente al arco',
  rn_snap_host_wall: 'pared',
  rn_snap_host_wall_mark: 'pared {mark}',

  rn_stair_up: 'SUBE',

  rn_sheet_no_scale: 'Sin escala',
  rn_sheet_view_missing: 'Vista inexistente',
  rn_sheet_view_removed: 'Vista eliminada',
  rn_sheet_area_table: 'Cuadro general de áreas',
  rn_sheet_tb_project: 'Proyecto: {value}',
  rn_sheet_tb_client: 'Cliente: {value}',
  rn_sheet_tb_author: 'Autor: {value}',
  rn_sheet_tb_date: 'Fecha: {value}',
  rn_sheet_tb_revision: 'Revisión: {value}',
  rn_sheet_tb_scale: 'Escala: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  rn_col_no: 'N.º',
  rn_col_room: 'AMBIENTE',
  rn_col_level: 'NIVEL',
  rn_col_area: 'ÁREA',
  rn_col_category: 'CATEGORÍA',
  rn_col_perimeter: 'PERÍM.',
  rn_col_volume: 'VOLUMEN',
  rn_col_percent: '%',

  rn_room_default_name: 'Ambiente',
  rn_room_default_name_numbered: 'Ambiente {number}',

  rn_canvas_aria: 'Área de dibujo',
  rn_gpu_recreating_webgpu: 'Recreando WebGPU (intento {n}).',
  rn_gpu_switch_webgl2: 'Cambiando a WebGL2.',
  rn_gpu_restart_webgl2: 'Reiniciando WebGL2.',
  rn_gpu_switch_cpu: 'Cambiando a CPU.',
  rn_gpu_restarted: 'GPU reiniciada ({reason}). {note}',
  rn_gpu_context_restored: 'Contexto de WebGL2 restaurado.',
  rn_gpu_draw_failed: 'Error al dibujar con WebGPU. Cambiando a WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer no disponible: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query no disponible',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 no disponible en este navegador/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer no expuesto; cargas no contabilizadas',
  rn_gpu_queue_intercept_failed: 'WebGPU: no se pudo interceptar queue.writeBuffer',
};

const DE: Record<DictKey, string> = {
  rn_snap_endpoint: 'Endpunkt',
  rn_snap_face: 'Flächenecke',
  rn_snap_core: 'Kernfläche',
  rn_snap_midpoint: 'Mittelpunkt',
  rn_snap_intersection: 'Schnittpunkt',
  rn_snap_perpendicular: 'Senkrecht',
  rn_snap_nearest: 'Nächstgelegen',
  rn_snap_alignment: 'Ausrichtung',
  rn_snap_ortho: 'Orthogonal',
  rn_snap_polar: 'Polar',
  rn_snap_center: 'Bogenmittelpunkt',
  rn_snap_tangent: 'Bogentangente',
  rn_snap_host_wall: 'Wand',
  rn_snap_host_wall_mark: 'Wand {mark}',

  rn_stair_up: 'AUF',

  rn_sheet_no_scale: 'Ohne Maßstab',
  rn_sheet_view_missing: 'Ansicht nicht vorhanden',
  rn_sheet_view_removed: 'Ansicht entfernt',
  rn_sheet_area_table: 'Flächenübersicht',
  rn_sheet_tb_project: 'Projekt: {value}',
  rn_sheet_tb_client: 'Auftraggeber: {value}',
  rn_sheet_tb_author: 'Autor: {value}',
  rn_sheet_tb_date: 'Datum: {value}',
  rn_sheet_tb_revision: 'Revision: {value}',
  rn_sheet_tb_scale: 'Maßstab: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  rn_col_no: 'Nr.',
  rn_col_room: 'RAUM',
  rn_col_level: 'EBENE',
  rn_col_area: 'FLÄCHE',
  rn_col_category: 'KATEGORIE',
  rn_col_perimeter: 'UMF.',
  rn_col_volume: 'VOLUMEN',
  rn_col_percent: '%',

  rn_room_default_name: 'Raum',
  rn_room_default_name_numbered: 'Raum {number}',

  rn_canvas_aria: 'Zeichenbereich',
  rn_gpu_recreating_webgpu: 'WebGPU wird neu erstellt (Versuch {n}).',
  rn_gpu_switch_webgl2: 'Wechsel zu WebGL2.',
  rn_gpu_restart_webgl2: 'WebGL2 wird neu gestartet.',
  rn_gpu_switch_cpu: 'Wechsel zu CPU.',
  rn_gpu_restarted: 'GPU neu gestartet ({reason}). {note}',
  rn_gpu_context_restored: 'WebGL2-Kontext wiederhergestellt.',
  rn_gpu_draw_failed: 'Zeichnen mit WebGPU fehlgeschlagen. Wechsel zu WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer nicht verfügbar: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query nicht verfügbar',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 in diesem Browser/GPU nicht verfügbar',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer nicht verfügbar; Uploads werden nicht gezählt',
  rn_gpu_queue_intercept_failed: 'WebGPU: queue.writeBuffer konnte nicht abgefangen werden',
};

const FR: Record<DictKey, string> = {
  rn_snap_endpoint: 'Extrémité',
  rn_snap_face: 'Coin de face',
  rn_snap_core: 'Face du noyau',
  rn_snap_midpoint: 'Milieu',
  rn_snap_intersection: 'Intersection',
  rn_snap_perpendicular: 'Perpendiculaire',
  rn_snap_nearest: 'Le plus proche',
  rn_snap_alignment: 'Alignement',
  rn_snap_ortho: 'Orthogonal',
  rn_snap_polar: 'Polaire',
  rn_snap_center: 'Centre de l\'arc',
  rn_snap_tangent: 'Tangent à l\'arc',
  rn_snap_host_wall: 'mur',
  rn_snap_host_wall_mark: 'mur {mark}',

  rn_stair_up: 'MONTER',

  rn_sheet_no_scale: 'Sans échelle',
  rn_sheet_view_missing: 'Vue introuvable',
  rn_sheet_view_removed: 'Vue supprimée',
  rn_sheet_area_table: 'Tableau général des surfaces',
  rn_sheet_tb_project: 'Projet : {value}',
  rn_sheet_tb_client: 'Client : {value}',
  rn_sheet_tb_author: 'Auteur : {value}',
  rn_sheet_tb_date: 'Date : {value}',
  rn_sheet_tb_revision: 'Révision : {value}',
  rn_sheet_tb_scale: 'Échelle : {value}',
  rn_sheet_tb_rev: 'Rév. {tag}',

  rn_col_no: 'N°',
  rn_col_room: 'PIÈCE',
  rn_col_level: 'NIVEAU',
  rn_col_area: 'SURFACE',
  rn_col_category: 'CATÉGORIE',
  rn_col_perimeter: 'PÉRIM.',
  rn_col_volume: 'VOLUME',
  rn_col_percent: '%',

  rn_room_default_name: 'Pièce',
  rn_room_default_name_numbered: 'Pièce {number}',

  rn_canvas_aria: 'Zone de dessin',
  rn_gpu_recreating_webgpu: 'Recréation de WebGPU (tentative {n}).',
  rn_gpu_switch_webgl2: 'Bascule vers WebGL2.',
  rn_gpu_restart_webgl2: 'Redémarrage de WebGL2.',
  rn_gpu_switch_cpu: 'Bascule vers CPU.',
  rn_gpu_restarted: 'GPU redémarré ({reason}). {note}',
  rn_gpu_context_restored: 'Contexte WebGL2 restauré.',
  rn_gpu_draw_failed: 'Échec du dessin avec WebGPU. Bascule vers WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer indisponible : {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU : timestamp-query indisponible',
  rn_gpu_ext_unavailable: 'WebGL2 : EXT_disjoint_timer_query_webgl2 indisponible dans ce navigateur/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU : queue.writeBuffer non exposé ; transferts non comptés',
  rn_gpu_queue_intercept_failed: 'WebGPU : impossible d\'intercepter queue.writeBuffer',
};

const IT: Record<DictKey, string> = {
  rn_snap_endpoint: 'Estremità',
  rn_snap_face: 'Angolo della faccia',
  rn_snap_core: 'Faccia del nucleo',
  rn_snap_midpoint: 'Punto medio',
  rn_snap_intersection: 'Intersezione',
  rn_snap_perpendicular: 'Perpendicolare',
  rn_snap_nearest: 'Più vicino',
  rn_snap_alignment: 'Allineamento',
  rn_snap_ortho: 'Ortogonale',
  rn_snap_polar: 'Polare',
  rn_snap_center: 'Centro dell\'arco',
  rn_snap_tangent: 'Tangente all\'arco',
  rn_snap_host_wall: 'parete',
  rn_snap_host_wall_mark: 'parete {mark}',

  rn_stair_up: 'SALI',

  rn_sheet_no_scale: 'Senza scala',
  rn_sheet_view_missing: 'Vista inesistente',
  rn_sheet_view_removed: 'Vista rimossa',
  rn_sheet_area_table: 'Prospetto generale delle aree',
  rn_sheet_tb_project: 'Progetto: {value}',
  rn_sheet_tb_client: 'Committente: {value}',
  rn_sheet_tb_author: 'Autore: {value}',
  rn_sheet_tb_date: 'Data: {value}',
  rn_sheet_tb_revision: 'Revisione: {value}',
  rn_sheet_tb_scale: 'Scala: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  rn_col_no: 'N.',
  rn_col_room: 'LOCALE',
  rn_col_level: 'LIVELLO',
  rn_col_area: 'AREA',
  rn_col_category: 'CATEGORIA',
  rn_col_perimeter: 'PERIM.',
  rn_col_volume: 'VOLUME',
  rn_col_percent: '%',

  rn_room_default_name: 'Locale',
  rn_room_default_name_numbered: 'Locale {number}',

  rn_canvas_aria: 'Area di disegno',
  rn_gpu_recreating_webgpu: 'Ricreazione di WebGPU (tentativo {n}).',
  rn_gpu_switch_webgl2: 'Passaggio a WebGL2.',
  rn_gpu_restart_webgl2: 'Riavvio di WebGL2.',
  rn_gpu_switch_cpu: 'Passaggio a CPU.',
  rn_gpu_restarted: 'GPU riavviata ({reason}). {note}',
  rn_gpu_context_restored: 'Contesto WebGL2 ripristinato.',
  rn_gpu_draw_failed: 'Errore durante il disegno con WebGPU. Passaggio a WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer non disponibile: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query non disponibile',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 non disponibile in questo browser/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer non esposto; caricamenti non conteggiati',
  rn_gpu_queue_intercept_failed: 'WebGPU: impossibile intercettare queue.writeBuffer',
};

const PL: Record<DictKey, string> = {
  rn_snap_endpoint: 'Punkt końcowy',
  rn_snap_face: 'Narożnik powierzchni',
  rn_snap_core: 'Powierzchnia rdzenia',
  rn_snap_midpoint: 'Punkt środkowy',
  rn_snap_intersection: 'Przecięcie',
  rn_snap_perpendicular: 'Prostopadły',
  rn_snap_nearest: 'Najbliższy',
  rn_snap_alignment: 'Wyrównanie',
  rn_snap_ortho: 'Ortogonalny',
  rn_snap_polar: 'Polarny',
  rn_snap_center: 'Środek łuku',
  rn_snap_tangent: 'Styczna do łuku',
  rn_snap_host_wall: 'ściana',
  rn_snap_host_wall_mark: 'ściana {mark}',

  rn_stair_up: 'W GÓRĘ',

  rn_sheet_no_scale: 'Bez skali',
  rn_sheet_view_missing: 'Widok nie istnieje',
  rn_sheet_view_removed: 'Widok usunięty',
  rn_sheet_area_table: 'Zestawienie powierzchni',
  rn_sheet_tb_project: 'Projekt: {value}',
  rn_sheet_tb_client: 'Klient: {value}',
  rn_sheet_tb_author: 'Autor: {value}',
  rn_sheet_tb_date: 'Data: {value}',
  rn_sheet_tb_revision: 'Rewizja: {value}',
  rn_sheet_tb_scale: 'Skala: {value}',
  rn_sheet_tb_rev: 'Rev. {tag}',

  rn_col_no: 'Nr',
  rn_col_room: 'POMIESZCZENIE',
  rn_col_level: 'POZIOM',
  rn_col_area: 'POWIERZCHNIA',
  rn_col_category: 'KATEGORIA',
  rn_col_perimeter: 'OBW.',
  rn_col_volume: 'OBJĘTOŚĆ',
  rn_col_percent: '%',

  rn_room_default_name: 'Pomieszczenie',
  rn_room_default_name_numbered: 'Pomieszczenie {number}',

  rn_canvas_aria: 'Obszar rysowania',
  rn_gpu_recreating_webgpu: 'Ponowne tworzenie WebGPU (próba {n}).',
  rn_gpu_switch_webgl2: 'Przełączanie na WebGL2.',
  rn_gpu_restart_webgl2: 'Ponowne uruchamianie WebGL2.',
  rn_gpu_switch_cpu: 'Przełączanie na CPU.',
  rn_gpu_restarted: 'GPU uruchomiona ponownie ({reason}). {note}',
  rn_gpu_context_restored: 'Kontekst WebGL2 przywrócony.',
  rn_gpu_draw_failed: 'Nie udało się rysować w WebGPU. Przełączanie na WebGL2.',
  rn_gpu_webgpu_unavailable: 'WebGPURenderer niedostępny: {message}',
  rn_gpu_timestamp_unavailable: 'WebGPU: timestamp-query niedostępne',
  rn_gpu_ext_unavailable: 'WebGL2: EXT_disjoint_timer_query_webgl2 niedostępne w tej przeglądarce/GPU',
  rn_gpu_queue_not_exposed: 'WebGPU: queue.writeBuffer nieudostępnione; przesłania nie są liczone',
  rn_gpu_queue_intercept_failed: 'WebGPU: nie udało się przechwycić queue.writeBuffer',
};

/** Dicionário do idioma, com fallback EN→PT aplicado em 	. */
function dictFor(lang: Lang): Record<DictKey, string> {
  switch (lang) {
    case 'en': return EN;
    case 'es': return ES;
    case 'de': return DE;
    case 'fr': return FR;
    case 'it': return IT;
    case 'pl': return PL;
    default: return PT;
  }
}
