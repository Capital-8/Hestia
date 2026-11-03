/**
 * Shard de dicionário: tabelas de quantitativos — nomes de arquivo do CSV, subtítulo com plural, rótulos de
 * coluna sem unidade fixa e vazio de ambientes. Prefixo `scx_`; `sched_*`/`col_*` existentes ficam no dicionário
 * central. Paridade PT/EN garantida pelo tipo.
 */
export const PT_SCHEDULES_EXTRA = {
  // Nome do arquivo exportado (o nome do projeto, dado do usuário, vem antes do hífen)
  scx_csv_default_project: 'projeto',
  scx_csv_file_wall: 'paredes',
  scx_csv_file_floor: 'pisos',
  scx_csv_file_slab: 'lajes',
  scx_csv_file_ceiling: 'forros',
  scx_csv_file_roof: 'telhados',
  scx_csv_file_stair: 'escadas',
  scx_csv_file_ramp: 'rampas',
  scx_csv_file_room: 'ambientes',
  scx_csv_file_opening: 'portas-e-janelas',

  // Subtítulo "N de M ..." (plural escolhido pelo total, não pelo valor filtrado)
  scx_sub_wall_one: '{shown} de {total} parede',
  scx_sub_wall_many: '{shown} de {total} paredes',
  scx_sub_floor_one: '{shown} de {total} piso',
  scx_sub_floor_many: '{shown} de {total} pisos',
  scx_sub_slab_one: '{shown} de {total} laje',
  scx_sub_slab_many: '{shown} de {total} lajes',
  scx_sub_ceiling_one: '{shown} de {total} forro',
  scx_sub_ceiling_many: '{shown} de {total} forros',
  scx_sub_roof_one: '{shown} de {total} telhado',
  scx_sub_roof_many: '{shown} de {total} telhados',
  scx_sub_stair_one: '{shown} de {total} escada',
  scx_sub_stair_many: '{shown} de {total} escadas',
  scx_sub_ramp_one: '{shown} de {total} rampa',
  scx_sub_ramp_many: '{shown} de {total} rampas',
  scx_sub_room_one: '{shown} de {total} ambiente',
  scx_sub_room_many: '{shown} de {total} ambientes',
  scx_sub_opening_one: '{shown} de {total} tipo',
  scx_sub_opening_many: '{shown} de {total} tipos',

  // Rodapé do quadro de portas e janelas: as linhas são tipos, o total soma instâncias
  scx_total_opening_one: 'abertura',
  scx_total_opening_many: 'aberturas',

  // Colunas sem unidade fixa no texto: o símbolo vem das unidades do projeto (scheduleHeader)
  scx_col_layers: 'Camadas',
  scx_col_rise: 'Desnível',
  scx_col_path_length: 'Comprimento',
  scx_col_riser_height: 'Altura do espelho',
  scx_col_tread: 'Piso médio',

  // Vazio de ambientes: o atalho atual entra por placeholder (muda com a configuração do usuário)
  scx_empty_room: 'Não há ambientes neste projeto. Use a ferramenta Ambiente{key} para criá-los.',
} as const;

export const EN_SCHEDULES_EXTRA: Record<keyof typeof PT_SCHEDULES_EXTRA, string> = {
  scx_csv_default_project: 'project',
  scx_csv_file_wall: 'walls',
  scx_csv_file_floor: 'floors',
  scx_csv_file_slab: 'slabs',
  scx_csv_file_ceiling: 'ceilings',
  scx_csv_file_roof: 'roofs',
  scx_csv_file_stair: 'stairs',
  scx_csv_file_ramp: 'ramps',
  scx_csv_file_room: 'rooms',
  scx_csv_file_opening: 'doors-and-windows',

  scx_sub_wall_one: '{shown} of {total} wall',
  scx_sub_wall_many: '{shown} of {total} walls',
  scx_sub_floor_one: '{shown} of {total} floor',
  scx_sub_floor_many: '{shown} of {total} floors',
  scx_sub_slab_one: '{shown} of {total} slab',
  scx_sub_slab_many: '{shown} of {total} slabs',
  scx_sub_ceiling_one: '{shown} of {total} ceiling',
  scx_sub_ceiling_many: '{shown} of {total} ceilings',
  scx_sub_roof_one: '{shown} of {total} roof',
  scx_sub_roof_many: '{shown} of {total} roofs',
  scx_sub_stair_one: '{shown} of {total} stair',
  scx_sub_stair_many: '{shown} of {total} stairs',
  scx_sub_ramp_one: '{shown} of {total} ramp',
  scx_sub_ramp_many: '{shown} of {total} ramps',
  scx_sub_room_one: '{shown} of {total} room',
  scx_sub_room_many: '{shown} of {total} rooms',
  scx_sub_opening_one: '{shown} of {total} type',
  scx_sub_opening_many: '{shown} of {total} types',

  scx_total_opening_one: 'opening',
  scx_total_opening_many: 'openings',

  scx_col_layers: 'Layers',
  scx_col_rise: 'Rise',
  scx_col_path_length: 'Length',
  scx_col_riser_height: 'Riser height',
  scx_col_tread: 'Average tread',

  scx_empty_room: 'There are no rooms in this project. Use the Room tool{key} to create them.',
};
