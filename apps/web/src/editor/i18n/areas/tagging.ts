/* Etiquetas e marcas (famílias de etiqueta, numeração de marcas). Os demais idiomas usam o inglês até a tradução. */

export const PT_TAGGING = {
  tg_families_title: 'Famílias de etiquetas',
  tg_families_sub: 'Como o rótulo é montado, a forma do contorno e o tamanho do texto. A família padrão vale para as etiquetas novas.',
  tg_fld_name: 'Nome',
  tg_fld_format: 'Modelo do rótulo',
  tg_fld_shape: 'Contorno',
  tg_shape_none: 'Só texto',
  tg_shape_circle: 'Círculo',
  tg_shape_hexagon: 'Hexágono',
  tg_shape_rect: 'Retângulo',
  tg_fld_text_size: 'Altura do texto',
  tg_fld_fill: 'Fundo opaco',
  tg_fld_fill_hint: 'Pinta o fundo com a cor do papel (não se perde sobre hachuras).',
  tg_fld_default: 'Padrão do projeto',
  tg_use_for_new: 'Usar nas etiquetas novas',
  tg_btn_new: 'Nova',
  tg_btn_duplicate: 'Duplicar',
  tg_btn_delete: 'Excluir',
  tg_default_tag: 'padrão',
  tg_unnamed: '(sem nome)',
  tg_tokens_hint: 'Parâmetros: {mark} marca, {type} tipo, {name} nome, {width} largura, {height} altura, {level} nível. Enter quebra a linha.',
  tg_error: '{family}: {error}',
  tg_undo_title: 'Famílias de etiquetas',
  tg_fld_family: 'Família da etiqueta',
  tg_pgrp_tag: 'Etiqueta',
  tg_msg_marks_done: '{n} marcas numeradas.',
  tg_msg_marks_none: 'Todas as portas e janelas já têm marca.',
  tg_msg_marks_renumbered: '{n} marcas renumeradas na ordem de leitura.',
  tg_msg_marks_duplicates: 'Marcas repetidas: {marks}.',
  tg_undo_marks: 'Numerar marcas',
  tg_fld_text_size_unit: 'mm de papel',
  tg_sel_tag_one: 'etiqueta',
  tg_sel_tag_many: 'etiquetas',
} as const;

export const EN_TAGGING: Record<keyof typeof PT_TAGGING, string> = {
  tg_families_title: 'Tag Families',
  tg_families_sub: 'How the label is built, the outline shape and the text size. The default family is used for new tags.',
  tg_fld_name: 'Name',
  tg_fld_format: 'Label format',
  tg_fld_shape: 'Outline',
  tg_shape_none: 'Text only',
  tg_shape_circle: 'Circle',
  tg_shape_hexagon: 'Hexagon',
  tg_shape_rect: 'Rectangle',
  tg_fld_text_size: 'Text height',
  tg_fld_fill: 'Opaque background',
  tg_fld_fill_hint: 'Paints the background with the paper color (does not get lost over hatches).',
  tg_fld_default: 'Project default',
  tg_use_for_new: 'Use for new tags',
  tg_btn_new: 'New',
  tg_btn_duplicate: 'Duplicate',
  tg_btn_delete: 'Delete',
  tg_default_tag: 'default',
  tg_unnamed: '(unnamed)',
  tg_tokens_hint: 'Parameters: {mark} mark, {type} type, {name} name, {width} width, {height} height, {level} level. Enter breaks the line.',
  tg_error: '{family}: {error}',
  tg_undo_title: 'Tag families',
  tg_fld_family: 'Tag family',
  tg_pgrp_tag: 'Tag',
  tg_msg_marks_done: '{n} marks numbered.',
  tg_msg_marks_none: 'All doors and windows already have a mark.',
  tg_msg_marks_renumbered: '{n} marks renumbered in reading order.',
  tg_msg_marks_duplicates: 'Duplicate marks: {marks}.',
  tg_undo_marks: 'Number marks',
  tg_fld_text_size_unit: 'paper mm',
  tg_sel_tag_one: 'tag',
  tg_sel_tag_many: 'tags',
};

export const ES_TAGGING: Record<keyof typeof PT_TAGGING, string> = { ...EN_TAGGING };

export const DE_TAGGING: Record<keyof typeof PT_TAGGING, string> = { ...EN_TAGGING };

export const FR_TAGGING: Record<keyof typeof PT_TAGGING, string> = { ...EN_TAGGING };

export const IT_TAGGING: Record<keyof typeof PT_TAGGING, string> = { ...EN_TAGGING };

export const PL_TAGGING: Record<keyof typeof PT_TAGGING, string> = { ...EN_TAGGING };
