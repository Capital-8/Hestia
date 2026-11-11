/* eslint-disable max-lines */
import { useMemo } from 'react';
import { create } from 'zustand';
import { safeGet, safeSet } from './storage.ts';
import type { ToolId } from '@hestia/tools';
import { PT_TABELAS, EN_TABELAS, ES_TABELAS, DE_TABELAS, FR_TABELAS, IT_TABELAS, PL_TABELAS } from './i18nTabelas.ts';
import { ES_BASE_CORE_1, DE_BASE_CORE_1, FR_BASE_CORE_1, IT_BASE_CORE_1, PL_BASE_CORE_1 } from './i18n/areas/base-core-1.ts';
import { ES_BASE_CORE_2, DE_BASE_CORE_2, FR_BASE_CORE_2, IT_BASE_CORE_2, PL_BASE_CORE_2 } from './i18n/areas/base-core-2.ts';
import { ES_BASE_CORE_3, DE_BASE_CORE_3, FR_BASE_CORE_3, IT_BASE_CORE_3, PL_BASE_CORE_3 } from './i18n/areas/base-core-3.ts';
import type { Lang } from './i18n/tipos.ts';
import { PT_ALL, EN_ALL } from './i18n/areas/index.ts';
import { ES_ALL } from './i18n/langs/es/index.ts';
import { DE_ALL } from './i18n/langs/de/index.ts';
import { FR_ALL } from './i18n/langs/fr/index.ts';
import { IT_ALL } from './i18n/langs/it/index.ts';
import { PL_ALL } from './i18n/langs/pl/index.ts';

export type { Lang } from './i18n/tipos.ts';

const LANG_KEY = 'hestia.lang';

/** Idiomas válidos, na ordem exibida no seletor. */
const VALID_LANGS: readonly Lang[] = ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'];

/** Tag BCP-47 de cada idioma, usada em `Intl.*` e em `<html lang>`. */
const BCP47: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', pl: 'pl-PL' };

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

/** Idioma salvo no navegador; qualquer valor fora da lista válida cai em `pt`. */
function readLang(): Lang {
  const saved = safeGet(LANG_KEY);
  return (VALID_LANGS as readonly string[]).includes(saved ?? '') ? (saved as Lang) : 'pt';
}

/** Mantém `<html lang>` igual ao idioma ativo (fora do navegador não faz nada). */
export function syncDocumentLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
}

const INITIAL_LANG = readLang();
syncDocumentLang(INITIAL_LANG);

export const useI18n = create<I18nState>((set) => ({
  lang: INITIAL_LANG,
  setLang: (lang: Lang) => {
    safeSet(LANG_KEY, lang);
    syncDocumentLang(lang);
    set({ lang });
  },
}));

/** Dicionário de traduções oficiais do Autodesk Revit (PT-BR / EN) */
export const I18N = {
  pt: {
    ...PT_ALL,
    ...PT_TABELAS,
    // Abas do Ribbon
    ribbon_arch: 'Arquitetura',
    ribbon_modify: 'Modificar',
    ribbon_annotate: 'Anotar',
    ribbon_view: 'Vista',
    contextual_modify: 'Modificar',

    // Grupos
    grp_build: 'Construir',
    grp_annotate: 'Anotar',
    grp_dimensions: 'Cotas',
    grp_text: 'Texto',
    grp_tags: 'Etiquetas',
    grp_rooms: 'Ambientes',
    grp_selection: 'Seleção',
    grp_modify: 'Modificar',
    grp_attach: 'Anexar',
    grp_measure: 'Medir',
    grp_stair: 'Escada',
    grp_view_3d: 'Vista 3D',
    grp_thin_lines: 'Linhas Finas',

    // Ferramentas principais
    tool_select: 'Modificar',
    tool_wall: 'Parede',
    tool_door: 'Porta',
    tool_window: 'Janela',
    tool_floor: 'Piso',
    tool_slab: 'Laje',
    tool_ceiling: 'Forro',
    tool_roof: 'Telhado',
    tool_slope: 'Inclinação',
    tool_roofarrow: 'Seta de inclinação',
    tool_roofextrusion: 'Telhado por extrusão',
    tool_stair: 'Escada por croqui',
    tool_stairrun: 'Lance de escada',
    tool_room: 'Ambiente',
    tool_dimension: 'Cota alinhada',
    tool_angularDimension: 'Cota angular',
    tool_grid: 'Grade',
    tool_roomsep: 'Separador de ambiente',
    tool_text: 'Texto',
    tool_detailLine: 'Linha de detalhe',
    tool_filledRegion: 'Região preenchida',
    tool_tag: 'Etiqueta',
    tool_perimeter: 'Perímetro',
    tool_cotasAuto: 'Cotas automáticas',

    // Modificadores
    tool_move: 'Mover',
    tool_copy: 'Copiar',
    tool_paste: 'Colar',
    tool_rotate: 'Rotacionar',
    tool_mirror: 'Espelhar',
    tool_array: 'Matriz',
    tool_offset: 'Deslocar',
    tool_parallel: 'Parede paralela',
    tool_trim: 'Aparar/Estender',
    tool_align: 'Alinhar',
    tool_joins: 'Unir geometria',
    tool_split: 'Dividir elemento',
    tool_rehost: 'Trocar hospedeiro',
    tool_attachroof: 'Anexar topo',
    tool_detachroof: 'Desanexar topo',
    tool_measure: 'Medir',
    tool_level: 'Nível',
    tool_section: 'Corte',

    // Painéis
    properties_title: 'Propriedades',
    project_browser_title: 'Navegador de projeto',
    type_selector_label: 'Seletor de tipo',
    edit_type_btn: 'Editar Tipo',
    search_project: 'Pesquisar...',

    // Vistas e Árvore
    views_all: 'Vistas (todas)',
    floor_plans: 'Plantas de piso',
    ceiling_plans: 'Plantas de forro',
    views_3d: 'Vistas 3D',
    elevations: 'Elevações',
    sections: 'Cortes',
    schedules: 'Tabelas / Quantitativos',
    sheets: 'Folhas (todas)',
    families: 'Famílias',
    materials: 'Materiais',

    // Barra de Título / QAT
    btn_new: 'Novo',
    btn_open: 'Abrir',
    btn_save: 'Salvar',
    btn_export_dxf: 'Exportar DXF',
    btn_export_pdf: 'Exportar PDF',
    btn_export_ifc: 'Exportar IFC',
    btn_undo: 'Desfazer',
    btn_redo: 'Refazer',

    // Barra de Controle de Vista
    scale: 'Escala',
    detail_fine: 'Alto',
    detail_medium: 'Médio',
    detail_coarse: 'Baixo',
    style_hidden: 'Linha oculta',
    style_shaded: 'Sombreado',
    thin_lines: 'Linhas finas',
    hide_isolate: 'Ocultar/Isolar',
    reset_hide: 'Restaurar',

    ...PT_TABELAS,

    // Dicas da barra de título (tema, ajuda, GPU, alterações)
    tip_dirty: 'Alterações ainda não exportadas',
    tip_engine: 'Motor de desenho em uso',
    tip_starting: 'iniciando…',
    tip_theme: 'Tema',
    tip_theme_system: 'sistema',
    tip_theme_light: 'claro',
    tip_theme_dark: 'escuro',
    tip_help: 'Atalhos de teclado',
    // Barra da Matriz
    arr_kind: 'Tipo',
    arr_kind_linear: 'Linear',
    arr_kind_radial: 'Radial',
    arr_anchor: 'Mover para',
    arr_anchor_second: 'Segundo',
    arr_anchor_last: 'Último',
    arr_count: 'Número de itens',
    arr_angle: 'Ângulo total',
    arr_hint_linear: 'Matriz linear: clique no ponto base e no segundo ponto (espaçamento) — ou digite o espaçamento.',
    arr_hint_radial: 'Matriz radial: clique no centro da matriz. Depois clique para criar os itens, ou digite o ângulo em graus.',
    arr_count_min: 'Número de itens deve ser 2 ou mais; usando 2.',
    arr_angle_zero: 'O ângulo total deve ser diferente de 0°',
    // Diálogo Editar tipo de abertura: lista de componentes
    oc_overview: 'Visão geral',
    oc_frame: 'Batente',
    oc_leaf: 'Folha',
    oc_sashes: 'Folhas e divisões',
    oc_glazing: 'Caixilho e vidro',
    oc_profile: 'Perfis do quadro',
    oc_casing: 'Alizar',
    oc_glass: 'Vidro',
    oc_outer: 'Lado externo',
    oc_inner: 'Lado interno',
    oc_wall: 'Parede e vão',
    oc_plan: 'Planta e corte',
    oc_data: 'Quadro e dados',
    oc_list: 'Componentes',
    oc_composition: 'Módulos',

    stt_title: 'Propriedades do tipo de escada',
    stt_sub_one: 'Escada · usada em {n} escada',
    stt_sub_many: 'Escada · usada em {n} escadas',
    stt_f_name: 'Nome do tipo',
    stt_sec_dims: 'Dimensões',
    stt_sec_calc: 'Cálculo do piso',
    stt_sec_build: 'Construção',
    stt_sec_opening: 'Abertura da laje',
    stt_sec_id: 'Identificação',
    stt_f_maxRiser: 'Espelho máximo',
    stt_f_minRiser: 'Espelho mínimo',
    stt_f_minTread: 'Piso mínimo',
    stt_f_minRunWidth: 'Largura mínima do lance',
    stt_f_minHeadroom: 'Pé-direito livre mínimo',
    stt_f_nosing: 'Nariz (só 3D e quantitativos)',
    stt_f_preset: 'Predefinição',
    stt_f_calcRiserFactor: 'Fator do espelho (a)',
    stt_f_calcTreadFactor: 'Fator do piso (b)',
    stt_f_calcTarget: 'Alvo de a·R + b·T',
    stt_f_calcMin: 'Resultado mínimo',
    stt_f_calcMax: 'Resultado máximo',
    stt_f_maxTread: 'Piso máximo',
    stt_f_runStyle: 'Estilo',
    stt_f_materialId: 'Material',
    stt_f_structuralDepth: 'Espessura estrutural (perpendicular à rampa)',
    stt_f_undersideStyle: 'Face inferior',
    stt_f_treadThickness: 'Espessura do piso',
    stt_f_riserThickness: 'Espessura do espelho',
    stt_f_treadOverlap: 'Sobreposição dos degraus',
    stt_f_postMaterialId: 'Material do poste',
    stt_f_landingThickness: 'Espessura do patamar',
    stt_f_code: 'Código',
    stt_f_description: 'Descrição',
    stt_f_cost: 'Custo (informativo)',
    stt_finish_tread: 'Acabamento do piso',
    stt_finish_riser: 'Acabamento do espelho',
    stt_finish_bocel: 'Bocel',
    stt_finish_enabled: 'Ligado',
    stt_finish_material: 'Material',
    stt_finish_thickness: 'Espessura',
    stt_bocel_projection: 'Projeção do bocel',
    stt_bocel_hint: 'Requer o acabamento do piso ligado.',
    stt_sec_finish: 'Acabamentos',
    stt_preset_hestia: 'Padrão Hestia',
    stt_preset_nbr9050: 'NBR 9050',
    stt_preset_nbr9077: 'NBR 9077',
    stt_preset_ibc: 'IBC',
    stt_preset_custom: 'Personalizado',
    stt_preset_applied: 'Predefinição aplicada',
    stt_restore_preset: 'Restaurar valores do preset',
    stt_reference: 'Valores de referência; confira a norma vigente.',
    stt_calc_help: 'Piso = (alvo − a·espelho) ÷ b, limitado entre o piso mínimo e o máximo.',
    stt_style_monolithic: 'Monolítico (concreto)',
    stt_style_assembled: 'Piso e espelho (montado)',
    stt_style_post: 'Poste central',
    stt_style_desc_monolithic: 'Laje de concreto contínua; define espessura estrutural e face inferior.',
    stt_style_desc_assembled: 'Pisos e espelhos montados sobre estrutura.',
    stt_style_desc_post: 'Degraus em balanço presos a um poste central; sem espelho.',
    stt_under_smooth: 'Lisa',
    stt_under_stepped: 'Escalonada',
    stt_calc_title: 'Calculadora',
    stt_calc_height: 'Altura piso a piso',
    stt_calc_risers: 'Nº de espelhos',
    stt_calc_riser: 'Espelho',
    stt_calc_tread: 'Piso',
    stt_calc_sum: '{a}·R + {b}·T',
    stt_calc_run: 'Extensão horizontal',
    stt_calc_angle: 'Inclinação',
    stt_calc_ok: 'Dentro da faixa',
    stt_calc_warn: 'Fora da faixa por {d} cm',
    stt_calc_bad: 'Fora da faixa',
    stt_calc_no_rule: 'A regra de cálculo não se aplica ao estilo poste/caracol',
    stt_calc_invalid: 'Entradas inválidas para o cálculo.',
    stt_calc_hint: 'Simulação, não é gravada no tipo.',
    stt_calc_range: 'Faixa {min} a {max} cm',
    stt_opening_text: 'O furo no modo Pé-direito usa o pé-direito livre mínimo (Dimensões). Modo, folga lateral e furo retangular se ajustam nas propriedades de cada escada.',
    stt_opening_btn: 'Ir para propriedades',
    stt_err_name: 'Dê um nome ao tipo.',
    stt_err_riser: 'O espelho máximo precisa ser maior que zero.',
    stt_err_riser_min: 'O espelho mínimo precisa ser maior que zero.',
    stt_err_riser_min_range: 'O espelho mínimo precisa ser menor que o espelho máximo.',
    stt_err_tread: 'O piso mínimo precisa ser maior que zero.',
    stt_err_width: 'A largura mínima do lance precisa ser maior que zero.',
    stt_err_headroom: 'A folga de cabeça precisa ser maior que zero.',
    stt_err_landing: 'A espessura do patamar precisa ser maior que zero.',
    stt_err_nosing_negative: 'O nariz não pode ser negativo.',
    stt_err_cost: 'O custo não pode ser negativo.',
    stt_err_mono_depth: 'Escada monolítica: a profundidade estrutural precisa ser maior que zero.',
    stt_err_assembled: 'Escada montada: a espessura do piso e do espelho precisa ser maior que zero.',
    stt_err_post_tread: 'Escada com poste central: a espessura do degrau precisa ser maior que zero.',
    stt_err_tread_range: 'O piso máximo precisa ser maior ou igual ao piso mínimo.',
    stt_err_calc_range: 'O alvo precisa ficar entre o resultado mínimo e o máximo.',
    stt_err_factor_riser: 'O fator do espelho na regra precisa ser maior que zero.',
    stt_err_factor_tread: 'O fator do piso na regra precisa ser maior que zero.',
    stt_err_nosing: 'O nariz precisa ser menor que o piso mínimo.',
    stt_err_overlap: 'A sobreposição precisa ser menor que a espessura do degrau.',
    stt_err_overlap_negative: 'A sobreposição dos degraus não pode ser negativa.',
    stt_err_material: 'Escolha um material existente.',
    stt_err_material_post: 'Escolha um material existente para o poste.',
    stt_err_range: 'Informe um valor entre {min} e {max} {unit}.',
    stt_err_range_nounit: 'Informe um valor entre {min} e {max}.',
    stt_err_no_materials: 'Cadastre um material.',
    stt_delete: 'Excluir',
    stt_cancel: 'Cancelar',
    stt_apply: 'Aplicar',
    stt_ok: 'OK',
    stt_delete_type_tip: 'Excluir tipo',
    stt_warn_sum: 'A soma a·R + b·T com o espelho máximo e o piso mínimo fica fora da faixa de referência.',
    stt_warn_riser: 'O espelho máximo acima de 19 cm fica fora da faixa usual de 15 a 19 cm.',
    stt_warn_tread: 'O piso mínimo abaixo de 25 cm fica fora da faixa usual.',
    stt_err_word_one: 'erro',
    stt_err_word_many: 'erros',
    stt_warn_word_one: 'aviso',
    stt_warn_word_many: 'avisos',
    stt_kbd_hint: 'Ctrl+Enter = OK · Ctrl+S = Aplicar · Alt+1…5 = seções',
    stt_impact: 'Alterar estes valores regenera as {n} escadas que usam este tipo.',
    stt_discard: 'Descartar alterações?',
    stt_missing: 'Este tipo não existe mais.',
    stt_close: 'Fechar',
    stt_none_material: 'Nenhum material',
    stt_preview_title: 'Prévia do corte',
    stt_preview_empty: 'Preencha espelho e piso para ver o corte.',
    stt_preview_level: 'Nível',
    stt_preview_aria: 'Corte do lance: espelho {riser} cm, piso {tread} cm, estilo {style}',
    stt_dim_riser: 'R',
    stt_dim_tread: 'T',
    stt_dim_nosing: 'Nariz',
    stt_dim_thickness: 'e',
    stt_dim_headroom: 'Pé-direito',
    stt_delete_blocked: 'Exclusão bloqueada: {reason}',
    stt_current_preset: 'Predefinição atual',
    tool_ramp: 'Rampa',
    tool_railing: 'Guarda-corpo',
    ramp_type_title: 'Tipo de rampa',
    ramp_mode_length: 'Comprimento → inclinação',
    ramp_mode_slope: 'Inclinação → comprimento',
    ramp_prop_rise: 'Desnível',
    ramp_prop_slope: 'Inclinação',
    ramp_prop_slope_target: 'Inclinação alvo',
    ramp_prop_flights: 'Lances',
    ramp_prop_landings: 'Patamares',
    ramp_prop_path_length: 'Comprimento do percurso',
    ramp_prop_area: 'Área',
    ramp_prop_volume: 'Volume',
    ramp_norm_unverified: 'Norma a conferir',
    ramp_norm_verified: 'Norma conferida',
    ramp_levels_base: 'Nível base',
    ramp_levels_top: 'Nível de topo',
    ramp_levels_auto: 'Automático (nível acima)',
    ramp_levels_until: 'Até',
    ramp_levels_base_offset: 'Desloc. da base',
    ramp_levels_top_offset: 'Desloc. do topo',
    ramp_levels_height: 'Altura',
    ramp_shape_free: 'Livre',
    ramp_adjust: 'Ajustar',
    ramp_adjust_title: 'Ajusta a inclinação e o comprimento da rampa à norma do tipo',
    stair_shape_free: 'Livre',
    stair_adjust: 'Ajustar',
    stair_adjust_title: 'Ajusta o nº de espelhos, a altura e o piso da escada à regra de Blondel do tipo',
    stair_free_group: 'Escada livre',
    stair_free_path_info: 'Trajeto: {n} pontos · {r} lances · {l} patamares',
    stair_free_width: 'Largura do lance',
    stt_bl_title: 'Fórmula de Blondel',
    stt_bl_intro: 'Regra do passo humano (François Blondel, séc. XVII): o espelho e o piso precisam combinar para a escada ser confortável. Quanto maior o espelho, menor deve ser o piso.',
    stt_bl_range: 'Faixa aceita: de {min} a {max} cm. Fora dela o Hestia só mostra um aviso; nada é bloqueado.',
    stt_bl_legend: 'R = espelho (altura de cada degrau) · T = piso (profundidade) · a e b = fatores do tipo',
    stt_bl_live_title: 'Com a altura de {h} cm (calculadora):',
    stt_bl_invalid: 'Informe uma altura e valores válidos para ver a conta.',
    stt_bl_step_n: 'Nº de espelhos: N = {h} ÷ {maxRiser} (espelho máximo) = {q}; arredonda para cima: N = {N}.',
    stt_bl_step_r: 'Espelho: R = {h} ÷ {N} = {R} cm.',
    stt_bl_step_t: 'Piso: T = ({target} − {a} × {R}) ÷ {b} = {raw} cm.',
    stt_bl_step_t_min: ' Fica abaixo do piso mínimo ({min} cm); o Hestia usa {T} cm.',
    stt_bl_step_t_max: ' Fica acima do piso máximo ({max} cm); o Hestia usa {T} cm.',
    stt_bl_ok: 'dentro de {min} a {max} cm',
    stt_bl_warn_below: '{d} cm abaixo da faixa de {min} a {max} cm; só gera aviso',
    stt_bl_warn_above: '{d} cm acima da faixa de {min} a {max} cm; só gera aviso',
    stt_bl_bad: '{d} cm fora da faixa de {min} a {max} cm; só gera aviso',
    stt_bl_words_title: 'Como o Hestia usa',
    stt_bl_words: '(1) Conta o menor número de espelhos que não passa do espelho máximo. (2) Divide a altura igualmente entre eles. (3) Calcula o piso pela fórmula, sem sair do piso mínimo e do máximo. (4) Compara a soma com a faixa e só avisa se sair dela. Nada impede você de desenhar do seu jeito: no croqui livre a regra não bloqueia.',
    stt_bl_note_straight: 'Vale no lance reto.',
    stt_bl_note_curved_short: 'Em escadas caracol e em leque, o piso é conferido na linha de caminhada.',
    stt_bl_note_curved: 'Em caracol e leque o piso muda com o raio. O Hestia confere o piso médio do lance (medido na linha de caminhada) e usa a regra do caracol nos avisos; aqui a conta mostra o lance reto de referência.',
    stt_bl_presets_title: 'O que significam as predefinições',
    stt_bl_p_hestia: 'Padrão Hestia: 2R + T com alvo de 63 cm e faixa de 63 a 65 cm; espelho máx. 18, piso mín. 28 e máx. 32, largura 80 cm. Padrão do produto; a faixa é herdada da NBR 9050.',
    stt_bl_p_nbr9050: 'NBR 9050 (acessibilidade): faixa de 63 a 65 cm; espelho 16 a 18 e piso 28 a 32 cm, largura 120 cm. Fonte secundária: a conferir na norma vigente.',
    stt_bl_p_nbr9077: 'NBR 9077 (saídas de emergência): faixa de 63 a 64 cm; espelho 16 a 18 e piso 28 a 32 cm, largura 110 cm. Fonte secundária: a conferir na norma vigente.',
    stt_bl_p_ibc: 'IBC (EUA): espelho máx. 7 pol (17,8 cm), piso mín. 11 pol (27,9 cm), largura 44 pol (111,8 cm). O IBC não tem fórmula de soma; a faixa de 60 a 65 cm é só uma aproximação do "Stair Calculator" do Revit usada pelo Hestia. A conferir.',
    stt_bl_p_foot: 'Valores de referência. Confira a norma vigente antes de usar.',
    stt_f_material_lance: 'Material do lance',
    stt_f_material_pisos: 'Material dos pisos e espelhos',
    stt_f_material_degraus: 'Material dos degraus',
    stt_f_minTread_walk: 'Piso mínimo (na linha de caminhada)',
    stt_f_treadThickness_post: 'Espessura do degrau',
    stt_note_post_calc: 'No poste, a fórmula vale na linha de caminhada e só gera avisos.',
    stt_calc_help_blondel: 'A fórmula de Blondel e a conta com a altura da calculadora estão no cartão à direita.',
    stt_calc_post_note: 'No poste o piso vem do croqui (linha de caminhada); a fórmula só gera avisos.',
  },
  en: {
    ...EN_ALL,
    ...EN_TABELAS,
    // Ribbon Tabs
    ribbon_arch: 'Architecture',
    ribbon_modify: 'Modify',
    ribbon_annotate: 'Annotate',
    ribbon_view: 'View',
    contextual_modify: 'Modify',

    // Groups
    grp_build: 'Build',
    grp_annotate: 'Annotate',
    grp_dimensions: 'Dimensions',
    grp_text: 'Text',
    grp_tags: 'Tags',
    grp_rooms: 'Room & Area',
    grp_selection: 'Select',
    grp_modify: 'Modify',
    grp_attach: 'Attach',
    grp_measure: 'Measure',
    grp_stair: 'Stair',
    grp_view_3d: '3D View',
    grp_thin_lines: 'Thin Lines',

    // Main Tools
    tool_select: 'Modify',
    tool_wall: 'Wall',
    tool_door: 'Door',
    tool_window: 'Window',
    tool_floor: 'Floor',
    tool_slab: 'Slab',
    tool_ceiling: 'Ceiling',
    tool_roof: 'Roof',
    tool_slope: 'Slope',
    tool_roofarrow: 'Slope Arrow',
    tool_roofextrusion: 'Roof by Extrusion',
    tool_stair: 'Stair by Sketch',
    tool_stairrun: 'Stair by Run',
    tool_room: 'Room',
    tool_dimension: 'Aligned Dimension',
    tool_angularDimension: 'Angular Dimension',
    tool_grid: 'Grid',
    tool_roomsep: 'Room Separator',
    tool_text: 'Text',
    tool_detailLine: 'Detail Line',
    tool_filledRegion: 'Filled Region',
    tool_tag: 'Tag by Category',
    tool_perimeter: 'Perimeter',
    tool_cotasAuto: 'Auto Dimensions',

    // Modifiers
    tool_move: 'Move',
    tool_copy: 'Copy',
    tool_paste: 'Paste',
    tool_rotate: 'Rotate',
    tool_mirror: 'Mirror',
    tool_array: 'Array',
    tool_offset: 'Offset',
    tool_parallel: 'Parallel Wall',
    tool_trim: 'Trim / Extend',
    tool_align: 'Align',
    tool_joins: 'Join Geometry',
    tool_split: 'Split Element',
    tool_rehost: 'Pick New Host',
    tool_attachroof: 'Attach Top/Base',
    tool_detachroof: 'Detach Top/Base',
    tool_measure: 'Measure',
    tool_level: 'Level',
    tool_section: 'Section',

    // Palettes
    properties_title: 'Properties',
    project_browser_title: 'Project Browser',
    type_selector_label: 'Type Selector',
    edit_type_btn: 'Edit Type',
    search_project: 'Search project...',

    // Views & Tree
    views_all: 'Views (all)',
    floor_plans: 'Floor Plans',
    ceiling_plans: 'Ceiling Plans',
    views_3d: '3D Views',
    elevations: 'Elevations (Building Elevation)',
    sections: 'Sections',
    schedules: 'Schedules / Quantities',
    sheets: 'Sheets (all)',
    families: 'Families',
    materials: 'Materials',

    // Titlebar / QAT
    btn_new: 'New',
    btn_open: 'Open',
    btn_save: 'Save',
    btn_export_dxf: 'Export DXF',
    btn_export_pdf: 'Export PDF',
    btn_export_ifc: 'Export IFC',
    btn_undo: 'Undo',
    btn_redo: 'Redo',

    // View Control Bar
    scale: 'Scale',
    detail_fine: 'Fine',
    detail_medium: 'Medium',
    detail_coarse: 'Coarse',
    style_hidden: 'Hidden Line',
    style_shaded: 'Shaded',
    thin_lines: 'Thin Lines',
    hide_isolate: 'Temporary Hide/Isolate',
    reset_hide: 'Reset',

    // Quantity schedules (*ScheduleDialog)
    ...EN_TABELAS,

    // Title bar tips (theme, help, GPU, unsaved changes)
    tip_dirty: 'Changes not exported yet',
    tip_engine: 'Rendering engine in use',
    tip_starting: 'starting…',
    tip_theme: 'Theme',
    tip_theme_system: 'system',
    tip_theme_light: 'light',
    tip_theme_dark: 'dark',
    tip_help: 'Keyboard shortcuts',
    // Array bar
    arr_kind: 'Type',
    arr_kind_linear: 'Linear',
    arr_kind_radial: 'Radial',
    arr_anchor: 'Move to',
    arr_anchor_second: 'Second',
    arr_anchor_last: 'Last',
    arr_count: 'Number of items',
    arr_angle: 'Total angle',
    arr_hint_linear: 'Linear array: click the base point and the second point (spacing) — or type the spacing.',
    arr_hint_radial: 'Radial array: click the array center. Then click to create the items, or type the angle in degrees.',
    arr_count_min: 'Number of items must be 2 or more; using 2.',
    arr_angle_zero: 'The total angle must be different from 0°',
    // Diálogo Editar tipo de abertura: lista de componentes
    oc_overview: 'Overview',
    oc_frame: 'Frame',
    oc_leaf: 'Leaf',
    oc_sashes: 'Sashes and divisions',
    oc_glazing: 'Sash frame and glass',
    oc_profile: 'Frame profiles',
    oc_casing: 'Casing',
    oc_glass: 'Glass',
    oc_outer: 'Exterior side',
    oc_inner: 'Interior side',
    oc_wall: 'Wall and opening',
    oc_plan: 'Floor plan and section',
    oc_data: 'Schedule and data',
    oc_list: 'Components',
    oc_composition: 'Modules',

    stt_title: 'Stair type properties',
    stt_sub_one: 'Stair · used by {n} stair',
    stt_sub_many: 'Stair · used by {n} stairs',
    stt_f_name: 'Type name',
    stt_sec_dims: 'Dimensions',
    stt_sec_calc: 'Tread calculation',
    stt_sec_build: 'Construction',
    stt_sec_opening: 'Slab opening',
    stt_sec_id: 'Identification',
    stt_f_maxRiser: 'Maximum riser',
    stt_f_minRiser: 'Minimum riser',
    stt_f_minTread: 'Minimum tread',
    stt_f_minRunWidth: 'Minimum run width',
    stt_f_minHeadroom: 'Minimum headroom',
    stt_f_nosing: 'Nosing (3D and quantities only)',
    stt_f_preset: 'Preset',
    stt_f_calcRiserFactor: 'Riser factor (a)',
    stt_f_calcTreadFactor: 'Tread factor (b)',
    stt_f_calcTarget: 'Target of a·R + b·T',
    stt_f_calcMin: 'Minimum result',
    stt_f_calcMax: 'Maximum result',
    stt_f_maxTread: 'Maximum tread',
    stt_f_runStyle: 'Style',
    stt_f_materialId: 'Material',
    stt_f_structuralDepth: 'Structural thickness (perpendicular to slope)',
    stt_f_undersideStyle: 'Underside',
    stt_f_treadThickness: 'Tread thickness',
    stt_f_riserThickness: 'Riser thickness',
    stt_f_treadOverlap: 'Tread overlap',
    stt_f_postMaterialId: 'Post material',
    stt_finish_tread: 'Tread finish',
    stt_finish_riser: 'Riser finish',
    stt_finish_bocel: 'Nosing bead (bocel)',
    stt_finish_enabled: 'On',
    stt_finish_material: 'Material',
    stt_finish_thickness: 'Thickness',
    stt_bocel_projection: 'Bocel projection',
    stt_bocel_hint: 'Requires the tread finish to be on.',
    stt_sec_finish: 'Finishes',
    stt_f_landingThickness: 'Landing thickness',
    stt_f_code: 'Code',
    stt_f_description: 'Description',
    stt_f_cost: 'Cost (informational)',
    stt_preset_hestia: 'Hestia default',
    stt_preset_nbr9050: 'NBR 9050',
    stt_preset_nbr9077: 'NBR 9077',
    stt_preset_ibc: 'IBC',
    stt_preset_custom: 'Custom',
    stt_preset_applied: 'Preset applied',
    stt_restore_preset: 'Restore preset values',
    stt_reference: 'Reference values; check the current standard.',
    stt_calc_help: 'Tread = (target − a·riser) ÷ b, clamped between minimum and maximum tread.',
    stt_style_monolithic: 'Monolithic (concrete)',
    stt_style_assembled: 'Tread and riser (assembled)',
    stt_style_post: 'Center post',
    stt_style_desc_monolithic: 'Continuous concrete slab; defines structural thickness and underside.',
    stt_style_desc_assembled: 'Treads and risers assembled over a structure.',
    stt_style_desc_post: 'Cantilevered treads fixed to a center post; no riser.',
    stt_under_smooth: 'Smooth',
    stt_under_stepped: 'Stepped',
    stt_calc_title: 'Calculator',
    stt_calc_height: 'Floor-to-floor height',
    stt_calc_risers: 'Number of risers',
    stt_calc_riser: 'Riser',
    stt_calc_tread: 'Tread',
    stt_calc_sum: '{a}·R + {b}·T',
    stt_calc_run: 'Horizontal run',
    stt_calc_angle: 'Slope',
    stt_calc_ok: 'Within range',
    stt_calc_warn: 'Out of range by {d} cm',
    stt_calc_bad: 'Out of range',
    stt_calc_no_rule: 'The calculation rule does not apply to the post/spiral style',
    stt_calc_invalid: 'Invalid calculation inputs.',
    stt_calc_hint: 'Simulation only; not saved in the type.',
    stt_calc_range: 'Range {min} to {max} cm',
    stt_opening_text: 'The opening in Headroom mode uses the minimum headroom (Dimensions). Mode, side clearance and rectangular opening are set in each stair properties.',
    stt_opening_btn: 'Go to properties',
    stt_err_name: 'Give the type a name.',
    stt_err_riser: 'Maximum riser must be greater than zero.',
    stt_err_riser_min: 'Minimum riser must be greater than zero.',
    stt_err_riser_min_range: 'Minimum riser must be smaller than the maximum riser.',
    stt_err_tread: 'Minimum tread must be greater than zero.',
    stt_err_width: 'Minimum run width must be greater than zero.',
    stt_err_headroom: 'Headroom must be greater than zero.',
    stt_err_landing: 'Landing thickness must be greater than zero.',
    stt_err_nosing_negative: 'Nosing cannot be negative.',
    stt_err_cost: 'Cost cannot be negative.',
    stt_err_mono_depth: 'Monolithic stair: structural depth must be greater than zero.',
    stt_err_assembled: 'Assembled stair: tread and riser thickness must be greater than zero.',
    stt_err_post_tread: 'Center-post stair: tread thickness must be greater than zero.',
    stt_err_tread_range: 'Maximum tread must be greater than or equal to minimum tread.',
    stt_err_calc_range: 'The target must lie between the minimum and maximum result.',
    stt_err_factor_riser: 'The riser factor in the rule must be greater than zero.',
    stt_err_factor_tread: 'The tread factor in the rule must be greater than zero.',
    stt_err_nosing: 'Nosing must be less than the minimum tread.',
    stt_err_overlap: 'Overlap must be less than the tread thickness.',
    stt_err_overlap_negative: 'Tread overlap cannot be negative.',
    stt_err_material: 'Choose an existing material.',
    stt_err_material_post: 'Choose an existing material for the post.',
    stt_err_range: 'Enter a value between {min} and {max} {unit}.',
    stt_err_range_nounit: 'Enter a value between {min} and {max}.',
    stt_err_no_materials: 'Create a material.',
    stt_delete: 'Delete',
    stt_cancel: 'Cancel',
    stt_apply: 'Apply',
    stt_ok: 'OK',
    stt_delete_type_tip: 'Delete type',
    stt_warn_sum: 'a·R + b·T with the maximum riser and minimum tread is outside the reference range.',
    stt_warn_riser: 'A maximum riser above 19 cm is outside the usual 15 to 19 cm range.',
    stt_warn_tread: 'A minimum tread below 25 cm is outside the usual range.',
    stt_err_word_one: 'error',
    stt_err_word_many: 'errors',
    stt_warn_word_one: 'warning',
    stt_warn_word_many: 'warnings',
    stt_kbd_hint: 'Ctrl+Enter = OK · Ctrl+S = Apply · Alt+1…5 = sections',
    stt_impact: 'Changing these values regenerates the {n} stairs that use this type.',
    stt_discard: 'Discard changes?',
    stt_missing: 'This type no longer exists.',
    stt_close: 'Close',
    stt_none_material: 'No material',
    stt_preview_title: 'Section preview',
    stt_preview_empty: 'Fill in riser and tread to see the section.',
    stt_preview_level: 'Level',
    stt_preview_aria: 'Run section: riser {riser} cm, tread {tread} cm, style {style}',
    stt_dim_riser: 'R',
    stt_dim_tread: 'T',
    stt_dim_nosing: 'Nosing',
    stt_dim_thickness: 't',
    stt_dim_headroom: 'Headroom',
    stt_delete_blocked: 'Deletion blocked: {reason}',
    stt_current_preset: 'Current preset',
    tool_ramp: 'Ramp',
    tool_railing: 'Railing',
    ramp_type_title: 'Ramp Type',
    ramp_mode_length: 'Length → slope',
    ramp_mode_slope: 'Slope → length',
    ramp_prop_rise: 'Rise',
    ramp_prop_slope: 'Slope',
    ramp_prop_slope_target: 'Target slope',
    ramp_prop_flights: 'Flights',
    ramp_prop_landings: 'Landings',
    ramp_prop_path_length: 'Path length',
    ramp_prop_area: 'Area',
    ramp_prop_volume: 'Volume',
    ramp_norm_unverified: 'Norm to be verified',
    ramp_norm_verified: 'Norm verified',
    ramp_levels_base: 'Base level',
    ramp_levels_top: 'Top level',
    ramp_levels_auto: 'Automatic (level above)',
    ramp_levels_until: 'Up to',
    ramp_levels_base_offset: 'Base offset',
    ramp_levels_top_offset: 'Top offset',
    ramp_levels_height: 'Height',
    ramp_shape_free: 'Free',
    ramp_adjust: 'Adjust',
    ramp_adjust_title: 'Adjusts the ramp slope and length to the type norm',
    stair_shape_free: 'Free',
    stair_adjust: 'Adjust',
    stair_adjust_title: 'Adjusts the riser count, riser height and tread to the type Blondel rule',
    stair_free_group: 'Free stair',
    stair_free_path_info: 'Path: {n} points · {r} runs · {l} landings',
    stair_free_width: 'Run width',
    stt_bl_title: 'Blondel formula',
    stt_bl_intro: 'Rule of the human stride (François Blondel, 17th century): riser and tread must match for a comfortable stair. The taller the riser, the shorter the tread must be.',
    stt_bl_range: 'Accepted range: {min} to {max} cm. Outside it Hestia only shows a warning; nothing is blocked.',
    stt_bl_legend: 'R = riser (step height) · T = tread (depth) · a and b = type factors',
    stt_bl_live_title: 'With a floor-to-floor height of {h} cm (calculator):',
    stt_bl_invalid: 'Enter a height and valid values to see the calculation.',
    stt_bl_step_n: 'Number of risers: N = {h} ÷ {maxRiser} (maximum riser) = {q}; rounded up: N = {N}.',
    stt_bl_step_r: 'Riser: R = {h} ÷ {N} = {R} cm.',
    stt_bl_step_t: 'Tread: T = ({target} − {a} × {R}) ÷ {b} = {raw} cm.',
    stt_bl_step_t_min: ' That is below the minimum tread ({min} cm); Hestia uses {T} cm.',
    stt_bl_step_t_max: ' That is above the maximum tread ({max} cm); Hestia uses {T} cm.',
    stt_bl_ok: 'within {min} to {max} cm',
    stt_bl_warn_below: '{d} cm below the range {min} to {max} cm; warning only',
    stt_bl_warn_above: '{d} cm above the range {min} to {max} cm; warning only',
    stt_bl_bad: '{d} cm outside the range {min} to {max} cm; warning only',
    stt_bl_words_title: 'How Hestia uses it',
    stt_bl_words: '(1) Takes the smallest number of risers that does not exceed the maximum riser. (2) Splits the height equally among them. (3) Computes the tread from the formula, within the minimum and maximum tread. (4) Compares the sum with the range and only warns when outside. Nothing stops you from drawing your own way: in a free sketch the rule does not block.',
    stt_bl_note_straight: 'Applies to the straight flight.',
    stt_bl_note_curved_short: 'In spiral and winder stairs the tread is checked on the walking line.',
    stt_bl_note_curved: 'In spiral and winder stairs the tread changes with the radius. Hestia checks the mean tread of the flight (measured on the walking line) and uses the spiral rule in warnings; the calculation here shows the straight reference flight.',
    stt_bl_presets_title: 'What the presets mean',
    stt_bl_p_hestia: 'Hestia default: 2R + T with a 63 cm target and a 63 to 65 cm range; max riser 18, min tread 28 and max 32, width 80 cm. Product default; the range is inherited from NBR 9050.',
    stt_bl_p_nbr9050: 'NBR 9050 (accessibility): range 63 to 65 cm; riser 16 to 18 and tread 28 to 32 cm, width 120 cm. Secondary source: check the current standard.',
    stt_bl_p_nbr9077: 'NBR 9077 (emergency exits): range 63 to 64 cm; riser 16 to 18 and tread 28 to 32 cm, width 110 cm. Secondary source: check the current standard.',
    stt_bl_p_ibc: 'IBC (USA): max riser 7 in (17.8 cm), min tread 11 in (27.9 cm), width 44 in (111.8 cm). The IBC has no sum formula; the 60 to 65 cm range is only an approximation of Revit\'s "Stair Calculator" used by Hestia. To be checked.',
    stt_bl_p_foot: 'Reference values. Check the current standard before use.',
    stt_f_material_lance: 'Run material',
    stt_f_material_pisos: 'Treads and risers material',
    stt_f_material_degraus: 'Treads material',
    stt_f_minTread_walk: 'Minimum tread (on the walking line)',
    stt_f_treadThickness_post: 'Tread thickness',
    stt_note_post_calc: 'For the post style, the formula applies on the walking line and only generates warnings.',
    stt_calc_help_blondel: 'The Blondel formula and the calculation with the calculator height are in the card on the right.',
    stt_calc_post_note: 'For the post style the tread comes from the sketch (walking line); the formula only generates warnings.',
  },
  // Idiomas em preenchimento: cada chave do PT/EN precisa ganhar tradução aqui.
  // A ausência faz `_I18nParityEs/De/Fr/It/Pl` abaixo falhar no typecheck de propósito — é o checklist de tradução.
  es: { ...ES_ALL, ...ES_TABELAS, ...ES_BASE_CORE_1, ...ES_BASE_CORE_2, ...ES_BASE_CORE_3 },
  de: { ...DE_ALL, ...DE_TABELAS, ...DE_BASE_CORE_1, ...DE_BASE_CORE_2, ...DE_BASE_CORE_3 },
  fr: { ...FR_ALL, ...FR_TABELAS, ...FR_BASE_CORE_1, ...FR_BASE_CORE_2, ...FR_BASE_CORE_3 },
  it: { ...IT_ALL, ...IT_TABELAS, ...IT_BASE_CORE_1, ...IT_BASE_CORE_2, ...IT_BASE_CORE_3 },
  pl: { ...PL_ALL, ...PL_TABELAS, ...PL_BASE_CORE_1, ...PL_BASE_CORE_2, ...PL_BASE_CORE_3 },
} as const;

/** Dicionário derivado do PT: toda chave do dicionário é uma string. */
export type Dict = { readonly [K in keyof typeof I18N.pt]: string };

/** Paridade PT/EN garantida em tempo de compilação (o teste de runtime é o cinto de segurança). */
type SameKeys<A, B> = keyof A extends keyof B ? (keyof B extends keyof A ? true : false) : false;
type Assert<T extends true> = T;
export type _I18nParity = Assert<SameKeys<typeof I18N.pt, typeof I18N.en>>;
// Checklist de tradução: fica vermelho até cada idioma ganhar as mesmas chaves do PT.
export type _I18nParityEs = Assert<SameKeys<typeof I18N.pt, typeof I18N.es>>;
export type _I18nParityDe = Assert<SameKeys<typeof I18N.pt, typeof I18N.de>>;
export type _I18nParityFr = Assert<SameKeys<typeof I18N.pt, typeof I18N.fr>>;
export type _I18nParityIt = Assert<SameKeys<typeof I18N.pt, typeof I18N.it>>;
export type _I18nParityPl = Assert<SameKeys<typeof I18N.pt, typeof I18N.pl>>;

/** Mensagem traduzível: a chave é resolvida no idioma ativo com os argumentos. */
export interface Msg {
  key: keyof Dict;
  args?: Record<string, string | number>;
}

/** Texto de UI: literal (dados e nomes do documento) ou mensagem do dicionário. */
export type TextLike = string | Msg;

/** Troca `{nome}` pelos argumentos; argumento ausente mantém o marcador. */
function fill(text: string, args: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (marcador, nome: string) => {
    const valor = args[nome];
    return valor === undefined ? marcador : String(valor);
  });
}

/**
 * Traduz uma chave no idioma pedido: idioma ausente cai em EN, depois PT e, por último, na própria chave.
 * O fallback EN é o que mantém a interface utilizável enquanto es/de/fr/it/pl ainda não estão completos.
 */
export function t(lang: Lang, key: keyof Dict, args?: Record<string, string | number>): string {
  const dict = I18N[lang] as Partial<Record<keyof Dict, string>>;
  const texto = dict[key] ?? I18N.en[key] ?? I18N.pt[key] ?? String(key);
  return args ? fill(texto, args) : texto;
}

/** Cache dos dicionários completos já montados (um por idioma). */
const DICT_CACHE = new Map<Lang, Dict>();

/** Dicionário completo do idioma com fallback EN→PT; use quando o consumidor precisa do objeto, não de `t`. */
export function dictOf(lang: Lang): Dict {
  let dict = DICT_CACHE.get(lang);
  if (!dict) {
    dict = { ...I18N.pt, ...I18N.en, ...(I18N[lang] as Partial<Dict>) } as Dict;
    DICT_CACHE.set(lang, dict);
  }
  return dict;
}

/** Hook de tradução: assina o idioma e devolve `t` já preso a ele. */
export function useT(): { t: (key: keyof Dict, args?: Record<string, string | number>) => string; lang: Lang } {
  const lang = useI18n((s) => s.lang);
  return useMemo(() => ({ t: (key: keyof Dict, args?: Record<string, string | number>) => t(lang, key, args), lang }), [lang]);
}

/** Resolve um `TextLike` para o texto do idioma ativo. */
export function resolveText(v: TextLike, lang: Lang): string {
  if (typeof v !== 'string') return t(lang, v.key, v.args);
  // Strings que são chaves do dicionário (ex.: rótulos de desfazer gravados no histórico) traduzem no render.
  return Object.hasOwn(I18N.pt, v) ? t(lang, v as keyof Dict) : v;
}

/** Número com as casas decimais e o separador do idioma ativo (BCP-47 por idioma). */
export function fmtNum(v: number, dec: number, lang: Lang): string {
  return v.toLocaleString(BCP47[lang], { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Data no formato do idioma ativo (padrão: hoje). */
export function fmtDate(lang: Lang, date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString(BCP47[lang]);
}

/** Compara dois textos na collation do idioma ativo (numérica por padrão). */
export function cmpTexto(a: string, b: string, lang: Lang, opts?: Intl.CollatorOptions): number {
  return a.localeCompare(b, BCP47[lang], { numeric: true, ...opts });
}

/** Retorna a etiqueta traduzida da ferramenta para o idioma ativo (ausente cai em EN, PT e, por fim, no id cru). */
export function toolLabel(toolId: ToolId, lang: Lang): string {
  const key = `tool_${toolId}` as keyof Dict;
  const dict = I18N[lang] as Partial<Record<keyof Dict, string>>;
  return dict[key] ?? I18N.en[key] ?? I18N.pt[key] ?? toolId;
}

/** Nome de um comando de atalho no idioma ativo: o mesmo rótulo da ferramenta na faixa (toolLabel). 'atalhos' é a tela de atalhos. */
export function nomeComandoLang(cmd: string, lang: Lang): string {
  if (cmd === 'atalhos') return t(lang, 'dlm_keyboard_shortcuts');
  if (cmd === 'unidades') return t(lang, 'dlc_units_title');
  if (cmd === 'createSimilar') return t(lang, 'edc_ctx_create_similar');
  const vis: Record<string, [string, string]> = {
    temporaryHide: ['Ocultar temporariamente (elemento)', 'Temporary Hide (Element)'],
    temporaryCategory: ['Ocultar temporariamente (categoria)', 'Temporary Hide (Category)'],
    temporaryIsolate: ['Isolar temporariamente (elemento)', 'Temporary Isolate (Element)'],
    isolateCategory: ['Isolar temporariamente (categoria)', 'Temporary Isolate (Category)'],
    resetTemporary: ['Restaurar hide/isolate temporário', 'Reset Temporary Hide/Isolate'],
    hideInView: ['Ocultar na vista (elemento)', 'Hide in View (Element)'],
    hideCategoryInView: ['Ocultar na vista (categoria)', 'Hide in View (Category)'],
    revealHidden: ['Revelar elementos ocultos', 'Reveal Hidden Elements'],
    unhideInView: ['Reexibir na vista (elemento)', 'Unhide in View (Element)'],
    unhideCategoryInView: ['Reexibir na vista (categoria)', 'Unhide in View (Category)'],
  };
  if (vis[cmd]) return lang === 'pt' ? vis[cmd]![0] : vis[cmd]![1];
  return toolLabel(cmd as ToolId, lang);
}