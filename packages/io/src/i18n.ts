/**
 * Dicionário do pacote `io` (prefixo `io_`). O pacote não importa `apps/web`: quem exporta/importa passa o `lang`
 * (padrão `'pt'`, o comportamento anterior). Tokens técnicos (entidades IFC, handles, nomes de dados do usuário) não
 * entram aqui.
 */
export type Lang = 'pt' | 'en';

const PT = {
  // Camadas do DXF da planta (o valor PT é o nome que já ia para o arquivo).
  io_dxf_layer_wall_outline: 'PAREDE_CONTORNO',
  io_dxf_layer_ceiling: 'FORRO',
  io_dxf_layer_openings: 'ABERTURAS',
  io_dxf_layer_opening_symbol: 'ABERTURA_SIMBOLO',
  io_dxf_layer_opening_above: 'ABERTURA_ACIMA',
  io_dxf_layer_opening_below: 'ABERTURA_ABAIXO',
  io_dxf_layer_opening_beyond: 'ABERTURA_ALEM',
  io_dxf_layer_wall_projection_above: 'PAREDE_PROJECAO_ACIMA',
  io_dxf_layer_wall_projection_below: 'PAREDE_PROJECAO_ABAIXO',
  io_dxf_layer_wall_beyond: 'PAREDE_ALEM',
  io_dxf_layer_roof_projection: 'TELHADO_PROJECAO',
  io_dxf_layer_roof_ridge: 'TELHADO_CUMEEIRA',
  io_dxf_layer_roof_gable: 'TELHADO_EMPENA',
  io_dxf_layer_roof_break: 'TELHADO_DESNIVEL',
  io_dxf_layer_stair: 'ESCADA',
  io_dxf_layer_stair_above: 'ESCADA_ACIMA',
  io_dxf_layer_stair_riser: 'ESCADA_ESPELHO',
  io_dxf_layer_stair_arrow: 'ESCADA_SETA',
  io_dxf_layer_stair_cut: 'ESCADA_CORTE',
  io_dxf_layer_rooms: 'AMBIENTES',
  io_dxf_layer_rooms_text: 'AMBIENTES_TEXTO',
  io_dxf_layer_stair_post: 'ESCADA_POSTE',
  io_dxf_layer_ramp: 'RAMPA',
  io_dxf_layer_ramp_above: 'RAMPA_ACIMA',
  io_dxf_layer_ramp_arrow: 'RAMPA_SETA',
  io_dxf_layer_ramp_cut: 'RAMPA_CORTE',
  io_dxf_layer_ramp_text: 'RAMPA_TEXTO',
  io_dxf_layer_sections: 'CORTES',
  io_dxf_layer_elevations: 'ELEVACOES',
  io_dxf_layer_dimensions: 'COTAS',
  io_dxf_layer_texts: 'TEXTOS',
  io_dxf_layer_detail: 'DETALHE',
  io_dxf_layer_tags: 'ETIQUETAS',
  io_dxf_layer_generic: 'IMPORTADO',
  io_dxf_layer_unnamed: 'SEM_NOME',
  io_dxf_layer_no_code: 'SEM_CODIGO',
  io_dxf_layer_wall_prefix: 'PAREDE_',
  io_dxf_layer_floor_prefix: 'PISO_',
  io_dxf_layer_slab_prefix: 'LAJE_',
  io_dxf_layer_roof_prefix: 'TELHADO_',
  // Camadas do corte/elevação.
  io_dxf_layer_section_prefix: 'CORTE_',
  io_dxf_layer_section_projection_suffix: '_PROJECAO',
  io_dxf_layer_section_outline: 'CORTE_CONTORNO',
  io_dxf_layer_section_levels: 'CORTE_NIVEIS',
  io_dxf_layer_section_wall: 'CORTE_PAREDE',
  io_dxf_layer_section_door: 'CORTE_PORTA',
  io_dxf_layer_section_window: 'CORTE_JANELA',
  io_dxf_layer_section_floor: 'CORTE_PISO',
  io_dxf_layer_section_slab: 'CORTE_LAJE',
  io_dxf_layer_section_roof: 'CORTE_TELHADO',
  io_dxf_layer_section_stair: 'CORTE_ESCADA',
  io_dxf_layer_section_room: 'CORTE_AMBIENTE',
  io_dxf_layer_section_annotation: 'CORTE_ANOTACAO',
  io_dxf_layer_section_generic: 'CORTE_IMPORTADO',
  // Camadas da prancha (DXF "como plotada").
  io_dxf_layer_sheet: 'PRANCHA',
  io_dxf_layer_sheet_text: 'PRANCHA_TEXTO',

  // Mensagens de importação/exportação DXF.
  io_dxf_skip_hatch: 'HATCH ignorado (preenchimento não suportado)',
  io_dxf_skip_dimension: 'DIMENSION ignorada (cotas não são importadas)',
  io_dxf_skip_spline: 'SPLINE ignorada (curva não suportada)',
  io_dxf_skip_ellipse: 'ELLIPSE ignorada (curva não suportada)',
  io_dxf_skip_solid: 'SOLID ignorado (preenchimento não suportado)',
  io_dxf_ocs_projected: 'entidade com OCS fora do plano XY projetada em planta',
  io_dxf_units_unknown: '$INSUNITS {raw} não reconhecido; assumindo metros',
  io_dxf_bulge_approx: 'arco de polilinha (bulge) aproximado por segmento reto',
  io_dxf_skip_mesh: 'POLYLINE de malha ignorada (não suportada)',
  io_dxf_3d_flattened: 'POLYLINE 3D achatada em planta (z ignorado)',
  io_dxf_skip_radius: '{type} sem raio válido ignorado',
  io_dxf_block_missing: 'bloco "{name}" não encontrado; INSERT ignorado',
  io_dxf_block_depth: 'bloco "{name}" aninhado além de {n} níveis; INSERT ignorado',
  io_dxf_skip_entity: 'entidade {type} ignorada (não suportada)',
  io_err_dxf_level_missing: 'Nível ausente: {id}',
  io_err_dxf_view_missing: 'Vista ausente: {id}',
  io_err_area_plan_missing: 'Planta de área inexistente',
  io_err_zip_too_many: 'ZIP com entradas demais (máximo 65.535)',
  io_dxf_sheet_missing: 'Prancha inexistente: {id}',

  // Nomes e propriedades do IFC exportado.
  io_ifc_material_undefined: 'Material não definido',
  io_ifc_name_hole: '{name} - furo {n}',
  io_ifc_name_roof_face: '{name} - água {n}',
  io_ifc_name_flight: '{name} - lance {n}',
  io_ifc_name_landing: '{name} - patamar {n}',
  io_ifc_default_wall: 'Parede',
  io_ifc_default_floor: 'Piso',
  io_ifc_default_slab: 'Laje',
  io_ifc_default_ceiling: 'Forro',
  io_ifc_default_roof: 'Telhado',
  io_ifc_default_stair: 'Escada',
  io_ifc_default_ramp: 'Rampa',
  io_err_ifc_solid_area: 'Sólido IFC sem área',
  io_err_ifc_not_finite: 'Valor não finito no IFC: {v}',

  // Nomes padrão criados na importação de IFC.
  io_ifc_slug_wall: 'parede',
  io_ifc_default_wall_type: 'Parede {mm} mm',
  io_ifc_slug_type: 'tipo',
  io_ifc_default_floor_type: 'Piso {mm} mm',
  io_ifc_default_slab_type: 'Laje {mm} mm',
  io_ifc_default_ceiling_type: 'Forro {mm} mm',
  io_ifc_default_door: 'Porta',
  io_ifc_default_window: 'Janela',
  io_ifc_default_room: 'Ambiente',
  io_ifc_level_ground: 'Térreo',
  io_ifc_level_n: 'Nível {n}',

  // Mensagens da importação de IFC.
  io_ifc_warn_record_incomplete: 'Registro Hestia de "{id}" ({kind}) está incompleto: a geometria do IFC foi usada.',
  io_ifc_warn_opening_no_fill: 'Porta/janela sem IfcRelFillsElement e sem corpo: ficou de fora.',
  io_ifc_warn_opening_no_host: 'Abertura sem parede hospedeira importada e sem corpo: ficou de fora.',
  io_ifc_warn_opening_no_void: 'Abertura sem geometria de vão e sem corpo: ficou de fora.',
  io_ifc_warn_opening_few_points: 'Abertura sem pontos suficientes e sem corpo: ficou de fora.',
  io_ifc_warn_broken: '{n} entidade(s) STEP ilegíveis foram ignoradas.',
  io_ifc_skip_free_wall: 'parede-forma-livre',
  io_err_step_expected: 'esperava "{ch}" em {i}',
  io_err_step_number: 'esperava número em {i}',
  io_err_step_bad_number: 'número inválido em {start}',
  io_err_step_unterminated: 'texto STEP sem fim',
  io_err_step_param: 'parâmetro desconhecido em {i}',

  // Mensagens de entrega de arquivo (app).
  io_saved_as: 'Salvo como {name}.',
  io_file_generated: 'Arquivo {name} gerado.',
  io_export_cancelled: 'Exportação cancelada. Nenhum arquivo foi salvo.',
  io_export_failed: 'Não foi possível exportar o arquivo.',
  io_pdf_failed: 'Não foi possível salvar o PDF neste navegador.',

  // Lote de DXF (app).
  io_batch_readme_title: 'Hestia - exportação DXF em lote',
  io_batch_readme_format: 'Versão do formato: R2000 (AC1015)',
  io_batch_readme_unit: 'Unidade: {unit}',
  io_batch_readme_date: 'Data: {date}',
  io_batch_readme_count: 'Arquivos DXF: {n}',
  io_batch_readme_note: 'As pranchas saem como plotadas (o mesmo desenho do PDF), com as vistas na escala da folha.',
  io_batch_folder_plans: 'PLANTAS',
  io_batch_folder_areas: 'AREAS',
  io_batch_folder_sections: 'CORTES',
  io_batch_folder_elevations: 'ELEVACOES',
  io_batch_folder_sheets: 'PRANCHAS',
  io_batch_type_plan: 'PLANTA',
  io_batch_type_area: 'AREA',
  io_batch_type_section: 'CORTE',
  io_batch_type_elevation: 'ELEVACAO',
  io_batch_type_sheet: 'PRANCHA',
  io_batch_manifest_header: 'arquivo;tipo;nome;nivel;escala;prancha',
  io_batch_no_name: 'sem-nome',
  io_batch_default_project: 'projeto',
  io_batch_skip_missing_target: 'alvo inexistente',
  io_batch_skip_no_sheet_renderer: 'prancha sem renderizador',
  io_dxf_unit_mm: 'Milímetros (mm)',
  io_dxf_unit_cm: 'Centímetros (cm)',
  io_dxf_unit_m: 'Metros (m)',
  io_dxf_unit_ft: 'Pés (ft)',
  io_dxf_unit_in: 'Polegadas (in)',
  io_dxf_group_plans: 'Plantas de piso',
  io_dxf_group_areas: 'Plantas de área',
  io_dxf_group_sections: 'Cortes e elevações',
  io_dxf_group_sheets: 'Pranchas',
} as const;

export type IoKey = keyof typeof PT;

const EN: Record<IoKey, string> = {
  io_dxf_layer_wall_outline: 'WALL_OUTLINE',
  io_dxf_layer_ceiling: 'CEILING',
  io_dxf_layer_openings: 'OPENINGS',
  io_dxf_layer_opening_symbol: 'OPENING_SYMBOL',
  io_dxf_layer_opening_above: 'OPENING_ABOVE',
  io_dxf_layer_opening_below: 'OPENING_BELOW',
  io_dxf_layer_opening_beyond: 'OPENING_BEYOND',
  io_dxf_layer_wall_projection_above: 'WALL_PROJECTION_ABOVE',
  io_dxf_layer_wall_projection_below: 'WALL_PROJECTION_BELOW',
  io_dxf_layer_wall_beyond: 'WALL_BEYOND',
  io_dxf_layer_roof_projection: 'ROOF_PROJECTION',
  io_dxf_layer_roof_ridge: 'ROOF_RIDGE',
  io_dxf_layer_roof_gable: 'ROOF_GABLE',
  io_dxf_layer_roof_break: 'ROOF_BREAK',
  io_dxf_layer_stair: 'STAIR',
  io_dxf_layer_stair_above: 'STAIR_ABOVE',
  io_dxf_layer_stair_riser: 'STAIR_RISER',
  io_dxf_layer_stair_arrow: 'STAIR_ARROW',
  io_dxf_layer_stair_cut: 'STAIR_CUT',
  io_dxf_layer_rooms: 'ROOMS',
  io_dxf_layer_rooms_text: 'ROOMS_TEXT',
  io_dxf_layer_stair_post: 'STAIR_POST',
  io_dxf_layer_ramp: 'RAMP',
  io_dxf_layer_ramp_above: 'RAMP_ABOVE',
  io_dxf_layer_ramp_arrow: 'RAMP_ARROW',
  io_dxf_layer_ramp_cut: 'RAMP_CUT',
  io_dxf_layer_ramp_text: 'RAMP_TEXT',
  io_dxf_layer_sections: 'SECTIONS',
  io_dxf_layer_elevations: 'ELEVATIONS',
  io_dxf_layer_dimensions: 'DIMENSIONS',
  io_dxf_layer_texts: 'TEXT',
  io_dxf_layer_detail: 'DETAIL',
  io_dxf_layer_tags: 'TAGS',
  io_dxf_layer_generic: 'IMPORTED',
  io_dxf_layer_unnamed: 'UNNAMED',
  io_dxf_layer_no_code: 'NO_CODE',
  io_dxf_layer_wall_prefix: 'WALL_',
  io_dxf_layer_floor_prefix: 'FLOOR_',
  io_dxf_layer_slab_prefix: 'SLAB_',
  io_dxf_layer_roof_prefix: 'ROOF_',
  io_dxf_layer_section_prefix: 'SECTION_',
  io_dxf_layer_section_projection_suffix: '_PROJECTION',
  io_dxf_layer_section_outline: 'SECTION_OUTLINE',
  io_dxf_layer_section_levels: 'SECTION_LEVELS',
  io_dxf_layer_section_wall: 'SECTION_WALL',
  io_dxf_layer_section_door: 'SECTION_DOOR',
  io_dxf_layer_section_window: 'SECTION_WINDOW',
  io_dxf_layer_section_floor: 'SECTION_FLOOR',
  io_dxf_layer_section_slab: 'SECTION_SLAB',
  io_dxf_layer_section_roof: 'SECTION_ROOF',
  io_dxf_layer_section_stair: 'SECTION_STAIR',
  io_dxf_layer_section_room: 'SECTION_ROOM',
  io_dxf_layer_section_annotation: 'SECTION_ANNOTATION',
  io_dxf_layer_section_generic: 'SECTION_GENERIC',
  io_dxf_layer_sheet: 'SHEET',
  io_dxf_layer_sheet_text: 'SHEET_TEXT',

  io_dxf_skip_hatch: 'HATCH skipped (fill not supported)',
  io_dxf_skip_dimension: 'DIMENSION skipped (dimensions are not imported)',
  io_dxf_skip_spline: 'SPLINE skipped (curve not supported)',
  io_dxf_skip_ellipse: 'ELLIPSE skipped (curve not supported)',
  io_dxf_skip_solid: 'SOLID skipped (fill not supported)',
  io_dxf_ocs_projected: 'entity with non-XY OCS projected to plan',
  io_dxf_units_unknown: '$INSUNITS {raw} not recognized; assuming meters',
  io_dxf_bulge_approx: 'polyline arc (bulge) approximated by straight segments',
  io_dxf_skip_mesh: 'mesh POLYLINE skipped (not supported)',
  io_dxf_3d_flattened: '3D POLYLINE flattened to plan (z ignored)',
  io_dxf_skip_radius: '{type} without a valid radius skipped',
  io_dxf_block_missing: 'block "{name}" not found; INSERT skipped',
  io_dxf_block_depth: 'block "{name}" nested beyond {n} levels; INSERT skipped',
  io_dxf_skip_entity: 'entity {type} skipped (not supported)',
  io_err_dxf_level_missing: 'Missing level: {id}',
  io_err_dxf_view_missing: 'Missing view: {id}',
  io_err_area_plan_missing: 'Area plan not found',
  io_err_zip_too_many: 'ZIP has too many entries (max 65,535)',
  io_dxf_sheet_missing: 'Sheet not found: {id}',

  io_ifc_material_undefined: 'Undefined material',
  io_ifc_name_hole: '{name} - hole {n}',
  io_ifc_name_roof_face: '{name} - face {n}',
  io_ifc_name_flight: '{name} - flight {n}',
  io_ifc_name_landing: '{name} - landing {n}',
  io_ifc_default_wall: 'Wall',
  io_ifc_default_floor: 'Floor',
  io_ifc_default_slab: 'Slab',
  io_ifc_default_ceiling: 'Ceiling',
  io_ifc_default_roof: 'Roof',
  io_ifc_default_stair: 'Stair',
  io_ifc_default_ramp: 'Ramp',
  io_err_ifc_solid_area: 'IFC solid without area',
  io_err_ifc_not_finite: 'Non-finite value in IFC: {v}',

  io_ifc_slug_wall: 'wall',
  io_ifc_default_wall_type: 'Wall {mm} mm',
  io_ifc_slug_type: 'type',
  io_ifc_default_floor_type: 'Floor {mm} mm',
  io_ifc_default_slab_type: 'Slab {mm} mm',
  io_ifc_default_ceiling_type: 'Ceiling {mm} mm',
  io_ifc_default_door: 'Door',
  io_ifc_default_window: 'Window',
  io_ifc_default_room: 'Room',
  io_ifc_level_ground: 'Ground Floor',
  io_ifc_level_n: 'Level {n}',

  io_ifc_warn_record_incomplete: 'Hestia record "{id}" ({kind}) is incomplete: IFC geometry was used.',
  io_ifc_warn_opening_no_fill: 'Door/window without IfcRelFillsElement and without body: skipped.',
  io_ifc_warn_opening_no_host: 'Opening without imported host wall and without body: skipped.',
  io_ifc_warn_opening_no_void: 'Opening without void geometry and without body: skipped.',
  io_ifc_warn_opening_few_points: 'Opening without enough points and without body: skipped.',
  io_ifc_warn_broken: '{n} unreadable STEP entities were skipped.',
  io_ifc_skip_free_wall: 'free-form wall',
  io_err_step_expected: 'expected "{ch}" at {i}',
  io_err_step_number: 'expected number at {i}',
  io_err_step_bad_number: 'invalid number at {start}',
  io_err_step_unterminated: 'unterminated STEP string',
  io_err_step_param: 'unknown parameter at {i}',

  io_saved_as: 'Saved as {name}.',
  io_file_generated: 'File {name} generated.',
  io_export_cancelled: 'Export cancelled. No file was saved.',
  io_export_failed: 'The file could not be exported.',
  io_pdf_failed: 'The PDF could not be saved in this browser.',

  io_batch_readme_title: 'Hestia - DXF batch export',
  io_batch_readme_format: 'Format version: R2000 (AC1015)',
  io_batch_readme_unit: 'Unit: {unit}',
  io_batch_readme_date: 'Date: {date}',
  io_batch_readme_count: 'DXF files: {n}',
  io_batch_readme_note: 'Sheets are exported as plotted (the same drawing as the PDF), with views at the sheet scale.',
  io_batch_folder_plans: 'PLANS',
  io_batch_folder_areas: 'AREAS',
  io_batch_folder_sections: 'SECTIONS',
  io_batch_folder_elevations: 'ELEVATIONS',
  io_batch_folder_sheets: 'SHEETS',
  io_batch_type_plan: 'PLAN',
  io_batch_type_area: 'AREA',
  io_batch_type_section: 'SECTION',
  io_batch_type_elevation: 'ELEVATION',
  io_batch_type_sheet: 'SHEET',
  io_batch_manifest_header: 'file;type;name;level;scale;sheet',
  io_batch_no_name: 'unnamed',
  io_batch_default_project: 'project',
  io_batch_skip_missing_target: 'target does not exist',
  io_batch_skip_no_sheet_renderer: 'sheet without renderer',
  io_dxf_unit_mm: 'Millimeters (mm)',
  io_dxf_unit_cm: 'Centimeters (cm)',
  io_dxf_unit_m: 'Meters (m)',
  io_dxf_unit_ft: 'Feet (ft)',
  io_dxf_unit_in: 'Inches (in)',
  io_dxf_group_plans: 'Floor Plans',
  io_dxf_group_areas: 'Area Plans',
  io_dxf_group_sections: 'Sections and Elevations',
  io_dxf_group_sheets: 'Sheets',
};

/** Dicionário PT do pacote (exportado para o shard de i18n do app). */
export const PT_IO_PACKAGE = PT;
/** Dicionário EN do pacote, com paridade garantida pelo tipo. */
export const EN_IO_PACKAGE: Record<IoKey, string> = EN;

/** Troca `{nome}` pelos argumentos; argumento ausente mantém o marcador. */
function fill(text: string, args: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (marcador, nome: string) => {
    const valor = args[nome];
    return valor === undefined ? marcador : String(valor);
  });
}

/** Traduz uma chave no idioma pedido; EN ausente cai em PT e, por último, na própria chave. */
export function t(lang: Lang, key: IoKey, args?: Record<string, string | number>): string {
  const texto = (lang === 'en' ? EN[key] : PT[key]) ?? PT[key] ?? String(key);
  return args ? fill(texto, args) : texto;
}

/** Nome PT de cada camada fixa do DXF (as de material/tipo saem por prefixo). */
const LAYER_KEYS: Record<string, IoKey> = {
  PAREDE_CONTORNO: 'io_dxf_layer_wall_outline',
  FORRO: 'io_dxf_layer_ceiling',
  ABERTURAS: 'io_dxf_layer_openings',
  ABERTURA_SIMBOLO: 'io_dxf_layer_opening_symbol',
  ABERTURA_ACIMA: 'io_dxf_layer_opening_above',
  ABERTURA_ABAIXO: 'io_dxf_layer_opening_below',
  ABERTURA_ALEM: 'io_dxf_layer_opening_beyond',
  PAREDE_PROJECAO_ACIMA: 'io_dxf_layer_wall_projection_above',
  PAREDE_PROJECAO_ABAIXO: 'io_dxf_layer_wall_projection_below',
  PAREDE_ALEM: 'io_dxf_layer_wall_beyond',
  TELHADO_PROJECAO: 'io_dxf_layer_roof_projection',
  TELHADO_CUMEEIRA: 'io_dxf_layer_roof_ridge',
  TELHADO_EMPENA: 'io_dxf_layer_roof_gable',
  TELHADO_DESNIVEL: 'io_dxf_layer_roof_break',
  ESCADA: 'io_dxf_layer_stair',
  ESCADA_ACIMA: 'io_dxf_layer_stair_above',
  ESCADA_ESPELHO: 'io_dxf_layer_stair_riser',
  ESCADA_SETA: 'io_dxf_layer_stair_arrow',
  ESCADA_CORTE: 'io_dxf_layer_stair_cut',
  AMBIENTES: 'io_dxf_layer_rooms',
  AMBIENTES_TEXTO: 'io_dxf_layer_rooms_text',
  ESCADA_POSTE: 'io_dxf_layer_stair_post',
  RAMPA: 'io_dxf_layer_ramp',
  RAMPA_ACIMA: 'io_dxf_layer_ramp_above',
  RAMPA_SETA: 'io_dxf_layer_ramp_arrow',
  RAMPA_CORTE: 'io_dxf_layer_ramp_cut',
  RAMPA_TEXTO: 'io_dxf_layer_ramp_text',
  CORTES: 'io_dxf_layer_sections',
  ELEVACOES: 'io_dxf_layer_elevations',
  COTAS: 'io_dxf_layer_dimensions',
  TEXTOS: 'io_dxf_layer_texts',
  DETALHE: 'io_dxf_layer_detail',
  ETIQUETAS: 'io_dxf_layer_tags',
  IMPORTADO: 'io_dxf_layer_generic',
  CORTE_CONTORNO: 'io_dxf_layer_section_outline',
  CORTE_NIVEIS: 'io_dxf_layer_section_levels',
  CORTE_PAREDE: 'io_dxf_layer_section_wall',
  CORTE_PORTA: 'io_dxf_layer_section_door',
  CORTE_JANELA: 'io_dxf_layer_section_window',
  CORTE_PISO: 'io_dxf_layer_section_floor',
  CORTE_LAJE: 'io_dxf_layer_section_slab',
  CORTE_TELHADO: 'io_dxf_layer_section_roof',
  CORTE_ESCADA: 'io_dxf_layer_section_stair',
  CORTE_AMBIENTE: 'io_dxf_layer_section_room',
  CORTE_ANOTACAO: 'io_dxf_layer_section_annotation',
  CORTE_IMPORTADO: 'io_dxf_layer_section_generic',
  PRANCHA: 'io_dxf_layer_sheet',
  PRANCHA_TEXTO: 'io_dxf_layer_sheet_text',
};

const PREFIX_KEYS: ReadonlyArray<[string, IoKey]> = [
  ['PAREDE_', 'io_dxf_layer_wall_prefix'],
  ['PISO_', 'io_dxf_layer_floor_prefix'],
  ['LAJE_', 'io_dxf_layer_slab_prefix'],
  ['TELHADO_', 'io_dxf_layer_roof_prefix'],
];

const EN_LAYER_KEYS: Record<string, IoKey> = Object.fromEntries(Object.entries(LAYER_KEYS).map(([, key]) => [EN[key], key]));

const EN_TO_PT_PREFIX: ReadonlyArray<[string, string]> = [
  ['WALL_', 'PAREDE_'],
  ['FLOOR_', 'PISO_'],
  ['SLAB_', 'LAJE_'],
  ['ROOF_', 'TELHADO_'],
  ['SECTION_', 'CORTE_'],
];

/**
 * Nome de uma camada do DXF no idioma pedido. Camadas fixas (e as do corte) têm tradução própria; as de material/tipo
 * (`PAREDE_<material>`, `PISO_<código>`…) traduzem só o prefixo — o resto é dado do projeto. PT devolve o nome como veio.
 */
export function dxfLayerName(layer: string, lang: Lang = 'pt'): string {
  if (lang === 'pt') return layer;
  const key = LAYER_KEYS[layer];
  if (key) return EN[key];
  const projection = PT.io_dxf_layer_section_projection_suffix;
  if (layer.endsWith(projection)) return dxfLayerName(layer.slice(0, -projection.length), lang) + EN.io_dxf_layer_section_projection_suffix;
  for (const [prefix, prefixKey] of PREFIX_KEYS) {
    if (!layer.startsWith(prefix)) continue;
    const rest = layer.slice(prefix.length);
    const suffix = rest === PT.io_dxf_layer_unnamed ? EN.io_dxf_layer_unnamed : rest === PT.io_dxf_layer_no_code ? EN.io_dxf_layer_no_code : rest;
    return EN[prefixKey] + suffix;
  }
  if (layer.startsWith(PT.io_dxf_layer_section_prefix)) return EN.io_dxf_layer_section_prefix + layer.slice(PT.io_dxf_layer_section_prefix.length);
  return layer;
}

/** Nome canônico (PT) de uma camada: aceita o nome EN e devolve o PT, para achar o papel de largura de linha. */
export function dxfLayerCanonical(layer: string): string {
  const key = EN_LAYER_KEYS[layer];
  if (key) return PT[key];
  const projection = EN.io_dxf_layer_section_projection_suffix;
  if (layer.endsWith(projection)) return dxfLayerCanonical(layer.slice(0, -projection.length)) + PT.io_dxf_layer_section_projection_suffix;
  for (const [prefix, ptPrefix] of EN_TO_PT_PREFIX) {
    if (layer.startsWith(prefix)) return ptPrefix + layer.slice(prefix.length);
  }
  return layer;
}

/** Prefixo de camada de material/piso/laje/telhado no idioma pedido. */
export function dxfLayerPrefix(kind: 'material' | 'floor' | 'slab' | 'roof', lang: Lang = 'pt'): string {
  const key = kind === 'material' ? 'io_dxf_layer_wall_prefix' : kind === 'floor' ? 'io_dxf_layer_floor_prefix' : kind === 'slab' ? 'io_dxf_layer_slab_prefix' : 'io_dxf_layer_roof_prefix';
  return t(lang, key);
}
