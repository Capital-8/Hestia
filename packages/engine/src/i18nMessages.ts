/* eslint-disable max-lines */
/**
 * Mensagens de validação/aviso do pacote `engine` (painel de Avisos, Propriedades, quadro de áreas e ajustes de
 * escada/rampa).
 *
 * O pacote não importa o i18n do app (boundary): o idioma chega por um parâmetro `lang` (padrão `'pt'`) no fim das
 * funções públicas e desce para os helpers. As chaves usam o prefixo `egb_` do shard
 * `apps/web/src/editor/i18n/areas/packages-engine.ts`.
 *
 * Tokens técnicos e nomes internos de invariante (códigos de aviso, `término "passa"`, NBR, RT/IT) não são traduzidos;
 * valores de dados do usuário (nome/ marca do elemento, nível) entram como argumento.
 */

export type Lang = 'pt' | 'en';

const PT = {
  // ---- quadro de áreas / legenda ---------------------------------------------------------------------------
  egb_area_no_category: 'Sem categoria',
  egb_area_subtotal: 'Subtotal {level}',
  egb_area_total: 'Total geral',

  // ---- tipos de elemento -----------------------------------------------------------------------------------
  egb_kind_floor: 'Piso',
  egb_kind_slab: 'Laje',

  // ---- ambiente: circuito de paredes -----------------------------------------------------------------------
  egb_issue_room_outside: 'Ambiente {name} não está dentro de nenhum circuito fechado de paredes.',
  egb_issue_room_open: 'Ambiente {name} está num circuito aberto (há um vão entre as paredes).',
  egb_issue_room_duplicate: 'Ambiente {name} está no mesmo circuito do ambiente "{other}".',

  // ---- contorno associativo (pisos/lajes) ------------------------------------------------------------------
  egb_outline_problem_open: 'o circuito de paredes tem um vão',
  egb_outline_problem_outside: 'não há circuito de paredes em volta da semente',
  egb_issue_outline_broken:
    '{kind} {label} está vinculado às paredes, mas o circuito não fecha: {problem}. Mantém o último contorno válido; desvincule para editá-lo à mão.',
  egb_issue_outline_duplicate:
    'Pisos {a} e {b} estão no mesmo circuito de paredes do nível "{level}": a área se repete (permitido).',

  // ---- forros ----------------------------------------------------------------------------------------------
  egb_ceiling_room_open: 'o circuito de paredes do ambiente tem um vão',
  egb_ceiling_room_outside: 'o ambiente não está num circuito fechado de paredes',
  egb_ceiling_room_deleted: 'o ambiente foi apagado',
  egb_issue_ceiling_no_boundary: 'Forro {name} não tem contorno (menos de 3 pontos).',
  egb_issue_ceiling_type_missing: 'Forro {name} usa um tipo que não existe no projeto.',
  egb_issue_ceiling_follows_room:
    'Forro {name} acompanha o ambiente, mas {problem}: mantém o último contorno gravado. Solte o forro para editá-lo à mão.',
  egb_issue_ceiling_above_wall:
    'Forro {name} fica acima da parede mais baixa do nível (face inferior em {a}; parede em {b}).',

  // ---- parede anexada a piso/laje --------------------------------------------------------------------------
  egb_wf_side_base: 'à base',
  egb_wf_side_top: 'ao topo',
  egb_wf_cover_level: 'do nível',
  egb_wf_cover_top: 'do nível de topo',
  egb_wf_end_base: 'a base fica na cota do nível',
  egb_wf_end_top: 'o topo fica na altura normal',
  egb_issue_wall_floor_none:
    'Parede "{id}" está anexada {side} no piso, mas nenhum piso ou laje {cover} cobre o eixo; {end}.',
  egb_issue_wall_floor_partial:
    'Parede "{id}" está anexada {side} no piso, mas só {a} dos {b} do eixo estão sobre piso ou laje; só o trecho coberto foi ajustado.',

  // ---- avisos de projeto (geometria resolvida) --------------------------------------------------------------
  egb_issue_opening_outside_wall:
    'Abertura {opening} está fora da parede {wall}: offset {offset} + largura {width} = {end}, mas o eixo tem {length}.',
  egb_issue_wall_top_uneven:
    'Paredes {a} e {b} estão alinhadas no nível "{level}", mas os topos estão desnivelados: {topA} e {topB}.',
  egb_issue_wall_inside_slab:
    'Parede {wall} está dentro da laje {slab} (camada {layer}, término "passa"): o trecho comum de {length} pode ser contado duas vezes.',

  // ---- parede anexada a telhado ----------------------------------------------------------------------------
  egb_issue_wall_roof_none:
    'Parede "{id}" está anexada ao telhado, mas o eixo não está sob telhado nenhum; o topo fica na altura normal.',
  egb_issue_wall_roof_partial:
    'Parede "{id}" está anexada ao telhado, mas {length} do eixo estão fora dele; esse trecho fica na altura normal.',
  egb_issue_wall_roof_over:
    'Parede "{id}" passa {length} da face inferior do telhado; ative o topo ajustado ao telhado ou baixe a parede.',

  // ---- beirais e superfície do telhado ---------------------------------------------------------------------
  egb_issue_roof_eave_wall:
    'Telhado {roof}: beiral invade a parede {wall}; recue o contorno do telhado ou reduza o balanço.',
  egb_issue_roof_eave_opening:
    'Telhado {roof}: beiral a {dist} da abertura {opening} (limite de {limit}); ajuste o balanço ou a posição da abertura.',
  egb_issue_roof_step_one: 'um degrau de {v} no canto reentrante',
  egb_issue_roof_step_many: 'degraus de até {v} em {n} cantos reentrantes',
  egb_issue_roof_surface_step:
    'Telhado {roof}: a superfície tem {where} (empena encostando em beiral); ajuste a inclinação das arestas vizinhas ou use outra forma.',

  // ---- aberturas: verificações do tipo ---------------------------------------------------------------------
  egb_issue_opening_width_ok: 'Largura livre {w} atende à NBR 9050 (mínimo {min}).',
  egb_issue_opening_width_low: 'Largura livre {w} abaixo de {min} (NBR 9050, acessibilidade).',
  egb_issue_opening_height_ok: 'Altura livre {h} atende ao mínimo de {min}.',
  egb_issue_opening_height_low: 'Altura livre {h} abaixo de {min}.',
  egb_opening_window_void: 'Vão livre de janela',
  egb_opening_fixed_window: 'Janela fixa',
  egb_issue_no_ventilation: '{name} não conta como ventilação (área útil {area}).',
  egb_issue_ventilation_area: 'Área útil de ventilação {area} ({pct} de {w} × {h}).',
  egb_issue_jamb_depth_ok: 'Profundidade do batente {depth} cabe no núcleo de {core}.',
  egb_issue_jamb_depth_over: 'Profundidade do batente {depth} maior que o núcleo de {core}.',
  egb_issue_lintel_ok: 'Verga presente.',
  egb_issue_lintel_missing: 'Verga ausente: o vão fica sem peça de concreto sobre a abertura.',

  // ---- escadas: geometria resolvida e croqui ---------------------------------------------------------------
  egb_issue_stair_empty: 'A escada não tem espelhos.',
  egb_issue_stair_riser_count_diff:
    'O nº de espelhos ({count}) difere do nº desejado ({desired}): adicione/remova espelhos ou ajuste a altura.',
  egb_issue_stair_riser_over: 'A altura real do espelho ({h} m) excede a máxima do tipo ({max} m).',
  egb_issue_stair_norm_riser: 'A altura do espelho ({h} m) está fora da faixa de norma ({min} a {max} m).',
  egb_issue_stair_uneven_treads:
    'Degraus desiguais: o piso entre espelhos consecutivos varia {v} mm (máximo {max} mm).',
  egb_issue_stair_winder_tread:
    'O piso do degrau do leque a {at} m da borda interna ({tread} m) é menor que o mínimo de {min} m.',
  egb_issue_stair_width: 'A largura do lance ({w} m) é menor que a mínima do tipo ({min} m).',
  egb_issue_stair_tread_avg: 'O piso médio do lance ({tread} m) está fora da faixa de norma ({min} a {max} m).',
  egb_issue_stair_relation: 'A relação {relation} ({v} m) está fora da faixa de norma ({min} a {max} m).',
  egb_issue_stair_rise_between:
    'O lance sobe {rise} m sem patamar; o máximo entre patamares é {max} m.',
  egb_issue_stair_landing_small:
    'O patamar tem menor dimensão de {w} m, abaixo do mínimo de {min} m.',
  egb_issue_stair_spiral_egress:
    'Escada caracol não serve de saída de emergência (RS: RT 11 5.7.1.2; SP: só mezanino e área privativa).',
  egb_issue_stair_spiral_tread:
    'O piso a {at} m da borda interna ({tread} m) é menor que o mínimo de {min} m.',
  egb_issue_stair_narrow_tread:
    'O piso na borda estreita ({tread} m) é menor que o mínimo de {min} m (informativo).',
  egb_issue_stair_spiral_headroom:
    'A folga entre voltas ({v} m) é menor que o mínimo ({min} m): aumente o nº de espelhos por volta, o pé-direito ou a profundidade livre.',

  // ---- escadas: folga de cabeça e regras do tipo -----------------------------------------------------------
  egb_issue_stair_headroom: 'Folga de cabeça de {h} m menor que a mínima do tipo ({min} m) sob a laje.',
  egb_issue_stair_uneven_risers:
    'Espelhos desiguais entre lances: a altura varia {v} mm (máximo {max} mm).',
  egb_issue_stair_riser_low: 'Espelho de {h} m abaixo do mínimo de {min} m do tipo (NBR 9050).',
  egb_issue_stair_no_riser_count:
    'Nenhum nº de espelhos dá altura entre {min} e {max} m para o desnível de {h} m: ajuste a altura ou a faixa de espelho do tipo.',
  egb_issue_stair_riser_fixed:
    'Espelho de {h} m fora da faixa do tipo ({min} a {max} m) com o modo de espelho fixo: o reajuste automático não corrige; mude para o modo automático.',
  egb_issue_stair_tread_range:
    'Piso de {tread} m na linha de caminhada fora da faixa do tipo ({min} a {max} m) (NBR 9050).',
  egb_issue_stair_flight_rise:
    'Trecho contínuo sobe {rise} m sem patamar; a NBR 9050 limita a {max} m entre patamares.',
  egb_issue_stair_wall_overlap:
    'A escada "{id}" invade a parede {wall} em {area} na planta; afaste a escada ou a parede.',

  // ---- croqui de escada: textos padrão ---------------------------------------------------------------------
  egb_stair_sketch_boundaries_touch: 'Os limites esquerdo e direito do lance não podem se tocar.',
  egb_stair_sketch_boundary_gap: 'Cada limite deve ser uma cadeia contínua de retas e arcos.',
  egb_stair_sketch_riser_on_boundary: 'Parte do espelho está sobre o limite: não é permitido.',
  egb_stair_sketch_riser_crossing: 'Espelhos que se cruzam não são permitidos.',
  egb_stair_sketch_riser_boundary_multi: 'O espelho cruza o mesmo limite mais de uma vez.',
  egb_stair_sketch_riser_not_spanning: 'Cada espelho deve ligar o limite esquerdo ao direito.',
  egb_stair_sketch_riser_same: 'Dois espelhos ocupam a mesma posição.',
  egb_stair_sketch_path_ends: 'A caminhada deve ir do primeiro ao último espelho.',
  egb_stair_sketch_path_misses: 'A caminhada não cruza todos os espelhos.',
  egb_stair_sketch_landing_open: 'O contorno do patamar deve ser um laço fechado.',

  // ---- croqui de escada: mensagens com detalhe -------------------------------------------------------------
  egb_stair_sketch_riser_gap:
    'Espelho nº {n}: deve ligar o limite esquerdo ao direito, mas não chega ao limite {side} (falta {gap} cm).',
  egb_stair_sketch_side_left: 'esquerdo',
  egb_stair_sketch_side_right: 'direito',
  egb_stair_sketch_pair: 'Espelhos nº {a} e nº {b}',
  egb_stair_sketch_same_pos: '{pair} ocupam a mesma posição (distância {d} cm).',
  egb_stair_sketch_cross: '{pair} se cruzam ou se tocam: não são permitidos (distância {d} cm).',

  // ---- escada: parâmetros ao vivo --------------------------------------------------------------------------
  egb_err_stair_type_invalid: 'Tipo de escada inválido.',
  egb_err_stair_height: 'A altura deve ser positiva: nada a gerar.',
  egb_err_stair_fixed: 'Número de espelhos ou piso fixado inválido.',
  egb_err_stair_too_low: 'A altura é menor que um espelho: nada a gerar.',

  // ---- escada livre: planejamento --------------------------------------------------------------------------
  egb_err_stair_width: 'A largura do lance deve ser positiva.',
  egb_err_path_points: 'O trajeto precisa de ao menos dois pontos distintos.',
  egb_err_sharp_turn: 'Retorno agudo demais no vértice {n}: use dois giros menores.',
  egb_err_first_segment_short: 'O 1º trecho é curto demais para um lance (mínimo 2 espelhos).',
  egb_err_segment_short: 'O trecho {n} é curto demais para o patamar de giro.',
  egb_err_few_risers:
    'Poucos espelhos ({risers}) para o patamar de giro no vértice {vertex}: alongue o trecho {segment} ou use uma escada reta.',
  egb_err_distribute_risers: 'Não foi possível distribuir os espelhos no trajeto.',
  egb_err_path_overlap: 'O trajeto se sobrepõe ao trecho {n}: afaste o ponto.',
  egb_note_path_extended_stair: 'Trajeto estendido em {d} m para completar {risers} espelhos.',
  egb_note_path_shortened_stair: 'Trajeto encurtado: a escada fecha no espelho {risers}, antes do último ponto.',
  egb_note_stair_ends_early: 'A escada termina {d} m antes do último ponto.',

  // ---- escada livre: ajuste --------------------------------------------------------------------------------
  egb_live_stair_riser_over: 'espelho de {h} cm acima do máximo do tipo ({max} cm).',
  egb_live_stair_riser_below: 'espelho de {h} cm abaixo do mínimo da norma ({min} cm).',
  egb_live_stair_riser_above: 'espelho de {h} cm acima do máximo da norma ({max} cm).',
  egb_live_stair_blondel: 'a regra de Blondel ({v} cm) fica fora de {min} a {max} cm.',
  egb_live_stair_tread: 'piso de {tread} cm fora de {min} a {max} cm.',
  egb_err_adjust_path: 'Não foi possível ajustar o trajeto.',
  egb_live_path_kept: 'trajeto mantido',
  egb_live_path_extended: 'trajeto estendido em {d} m',
  egb_live_path_shortened: 'trajeto encurtado em {d} m',
  egb_live_stair_adjusted: 'Ajustado: {risers} espelhos de {h} cm, piso {tread} cm, {segment}.',
  egb_live_no_option: ' Sem opção dentro da norma: {message}',

  // ---- escada livre: regeneração ---------------------------------------------------------------------------
  egb_err_stair_no_path: 'A escada não tem trajeto livre para regenerar.',
  egb_err_stair_type: 'Tipo de escada inexistente',
  egb_err_stair_top_level: 'O nível de topo não fica acima da base: nada a gerar.',
  egb_err_stair_no_flight: 'A escada não tem um lance válido para regenerar.',

  // ---- escada: reajuste à altura ---------------------------------------------------------------------------
  egb_err_stair_sketch: 'Croqui da escada inválido: não foi possível contar os espelhos.',
  egb_err_stair_refit_none:
    'Nenhum nº de espelhos cumpre o tipo para a altura de {h} m: o espelho teria de ficar entre {min} e {max} m. Ajuste a altura ou os espelhos mínimo/máximo do tipo.',
  egb_err_stair_long_flight:
    'Há um lance contínuo de {h} m (acima de 3,20 m, NBR 9050) sem patamar: marque um patamar intermediário de pelo menos 1,20 m no trajeto livre.',
  egb_err_stair_no_continue: 'A escada não tem lance para continuar.',
  egb_err_stair_remove_risers:
    'A altura diminuiu e o espelho ficaria abaixo de {h} m, mas não há como remover {n} espelho(s) (caracol/leque ou lances com menos de 3 espelhos). Ajuste o croqui manualmente.',
  egb_err_stair_refit_manual: 'Não foi possível continuar o croqui desta escada; ajuste manualmente.',
  egb_err_stair_landing_manual:
    'Há um lance contínuo de {h} m (acima de 3,20 m, NBR 9050) sem patamar e o reajuste não consegue inserir um aqui (caracol, leque ou lance sem espaço para dividir). Acrescente um patamar intermediário de pelo menos 1,20 m.',
  egb_err_stair_landing_insert: 'Não foi possível inserir o patamar intermediário; ajuste manualmente.',

  // ---- rampas: geometria resolvida -------------------------------------------------------------------------
  egb_issue_ramp_flight_edges: 'O lance da rampa deve ter exatamente 2 linhas de borda.',
  egb_issue_ramp_empty: 'A rampa não tem lances.',
  egb_issue_ramp_slope_diff:
    'A inclinação resultante ({slope}) difere da alvo ({target}); regenere a rampa.',
  egb_issue_ramp_no_landing: 'Há lances consecutivos sem patamar entre eles.',

  // ---- rampas: avisos de norma -----------------------------------------------------------------------------
  egb_ramp_norm_check: ' (norma a conferir)',
  egb_issue_ramp_slope_over:
    'A inclinação de {slope} ({ratio}) passa do máximo do tipo ({max} / {maxRatio}).',
  egb_issue_ramp_flight_rise:
    'O lance {n} vence {rise} m; para {slope} o máximo por lance é {max} m.',
  egb_issue_ramp_flights: 'A rampa tem {n} lances; para {slope} o máximo é {max}.',
  egb_issue_ramp_landing: 'O patamar {n} mede {length} m; o mínimo do tipo é {min} m.',
  egb_issue_ramp_width: 'O lance {n} tem {w} m de largura; o mínimo do tipo é {min} m.',
  egb_issue_ramp_headroom: 'Folga de cabeça de {h} m menor que a mínima do tipo ({min} m) sob a laje.',

  // ---- rampas: planejamento --------------------------------------------------------------------------------
  egb_err_ramp_width: 'A largura da rampa deve ser positiva.',
  egb_err_ramp_rise: 'O desnível deve ser positivo: nada a gerar.',
  egb_err_ramp_dir: 'A direção de subida deve ser diferente de zero.',
  egb_err_length_short: 'O comprimento é curto demais para o patamar de giro.',
  egb_err_l_landing: 'O patamar da rampa em L deve ter profundidade ≥ largura do lance.',
  egb_err_slope_positive: 'A inclinação deve ser maior que zero.',
  egb_err_length_positive: 'O comprimento deve ser positivo.',
  egb_err_path_short_flight: 'O trajeto é curto demais para gerar um lance.',
  egb_note_path_extended: 'Trajeto estendido em {d} m para vencer o desnível.',
  egb_note_path_shortened: 'Trajeto encurtado: o desnível fecha antes do último ponto.',

  // ---- rampas: ajuste e regeneração ------------------------------------------------------------------------
  egb_live_ramp_slope: 'Inclinação {slope} % acima do máximo de {max} %.',
  egb_live_ramp_rise: 'Cada lance vence {h} m: acima do máximo de {max} m.',
  egb_live_ramp_flights: '{n} lances: acima do máximo de {max}.',
  egb_live_flight_one: 'lance',
  egb_live_flight_many: 'lances',
  egb_live_ramp_adjusted: 'Ajustado: {slope} %, {n} {flight}',
  egb_live_ramp_last_segment: ', {sign}{d} m no último trecho.',
  egb_live_ramp_kept: '.',
  egb_err_ramp_no_flight: 'A rampa não tem um lance válido para regenerar.',
  egb_err_ramp_type: 'Tipo de rampa inexistente',
  egb_err_ramp_no_path: 'A rampa livre não tem trajeto para regenerar.',
  egb_err_ramp_length_low: 'Comprimento menor que o do trajeto antes do último trecho.',

  // ---- avisos de intervalo de vista ------------------------------------------------------------------------
  egb_vw_noun_wall_one: 'parede',
  egb_vw_noun_wall_many: 'paredes',
  egb_vw_noun_opening_one: 'abertura',
  egb_vw_noun_opening_many: 'aberturas',
  egb_vw_noun_floor_one: 'piso',
  egb_vw_noun_floor_many: 'pisos',
  egb_vw_noun_slab_one: 'laje',
  egb_vw_noun_slab_many: 'lajes',
  egb_vw_noun_ceiling_one: 'forro',
  egb_vw_noun_ceiling_many: 'forros',
  egb_vw_noun_roof_one: 'telhado',
  egb_vw_noun_roof_many: 'telhados',
  egb_vw_noun_stair_one: 'escada ou rampa',
  egb_vw_noun_stair_many: 'escadas e rampas',
  egb_vw_hidden_tail: 'fora do intervalo de vista.',
  egb_vw_beyond_tail: 'abaixo da base do intervalo de vista.',
} as const;

export type DictKey = keyof typeof PT;

const EN: Record<DictKey, string> = {
  egb_area_no_category: 'Uncategorized',
  egb_area_subtotal: 'Subtotal {level}',
  egb_area_total: 'Grand Total',

  egb_kind_floor: 'Floor',
  egb_kind_slab: 'Slab',

  egb_issue_room_outside: 'Room {name} is not inside any closed wall loop.',
  egb_issue_room_open: 'Room {name} is in an open loop (there is a gap between walls).',
  egb_issue_room_duplicate: 'Room {name} is in the same loop as room "{other}".',

  egb_outline_problem_open: 'the wall loop has a gap',
  egb_outline_problem_outside: 'there is no wall loop around the seed',
  egb_issue_outline_broken:
    '{kind} {label} is attached to the walls, but the loop no longer closes: {problem}. Keeps the last valid boundary; detach it to edit by hand.',
  egb_issue_outline_duplicate:
    'Floors {a} and {b} share the wall loop of level "{level}": the area is counted twice (allowed).',

  egb_ceiling_room_open: 'the room wall loop has a gap',
  egb_ceiling_room_outside: 'the room is not inside a closed wall loop',
  egb_ceiling_room_deleted: 'the room was deleted',
  egb_issue_ceiling_no_boundary: 'Ceiling {name} has no boundary (fewer than 3 points).',
  egb_issue_ceiling_type_missing: 'Ceiling {name} uses a type that does not exist in the project.',
  egb_issue_ceiling_follows_room:
    'Ceiling {name} follows the room, but {problem}: keeps the last saved boundary. Detach the ceiling to edit it by hand.',
  egb_issue_ceiling_above_wall:
    'Ceiling {name} is above the lowest wall of the level (bottom face at {a}; wall at {b}).',

  egb_wf_side_base: 'at the base',
  egb_wf_side_top: 'at the top',
  egb_wf_cover_level: 'of the level',
  egb_wf_cover_top: 'of the top level',
  egb_wf_end_base: 'the base stays at the level elevation',
  egb_wf_end_top: 'the top stays at the normal height',
  egb_issue_wall_floor_none:
    'Wall "{id}" is attached {side} to the floor, but no floor or slab {cover} covers the axis; {end}.',
  egb_issue_wall_floor_partial:
    'Wall "{id}" is attached {side} to the floor, but only {a} of {b} of the axis lies over a floor or slab; only the covered stretch was adjusted.',

  egb_issue_opening_outside_wall:
    'Opening {opening} is outside wall {wall}: offset {offset} + width {width} = {end}, but the axis is {length}.',
  egb_issue_wall_top_uneven:
    'Walls {a} and {b} are aligned on level "{level}", but their tops are uneven: {topA} and {topB}.',
  egb_issue_wall_inside_slab:
    'Wall {wall} is inside slab {slab} (layer {layer}, "passes" end): the shared {length} stretch may be counted twice.',

  egb_issue_wall_roof_none:
    'Wall "{id}" is attached to the roof, but the axis is under no roof; the top stays at the normal height.',
  egb_issue_wall_roof_partial:
    'Wall "{id}" is attached to the roof, but {length} of the axis lies outside it; that stretch stays at the normal height.',
  egb_issue_wall_roof_over:
    'Wall "{id}" extends {length} past the roof underside; enable the roof-adjusted top or lower the wall.',

  egb_issue_roof_eave_wall:
    'Roof {roof}: the eave overlaps wall {wall}; pull the roof boundary back or reduce the overhang.',
  egb_issue_roof_eave_opening:
    'Roof {roof}: eave {dist} from opening {opening} (limit {limit}); adjust the overhang or the opening position.',
  egb_issue_roof_step_one: 'a {v} step at the reentrant corner',
  egb_issue_roof_step_many: 'steps up to {v} at {n} reentrant corners',
  egb_issue_roof_surface_step:
    'Roof {roof}: the surface has {where} (gable touching an eave); adjust the slope of neighbouring edges or use another shape.',

  egb_issue_opening_width_ok: 'Clear width {w} meets NBR 9050 (minimum {min}).',
  egb_issue_opening_width_low: 'Clear width {w} below {min} (NBR 9050, accessibility).',
  egb_issue_opening_height_ok: 'Clear height {h} meets the minimum of {min}.',
  egb_issue_opening_height_low: 'Clear height {h} below {min}.',
  egb_opening_window_void: 'Window opening',
  egb_opening_fixed_window: 'Fixed window',
  egb_issue_no_ventilation: '{name} does not count as ventilation (useful area {area}).',
  egb_issue_ventilation_area: 'Useful ventilation area {area} ({pct} of {w} × {h}).',
  egb_issue_jamb_depth_ok: 'Frame depth {depth} fits the core of {core}.',
  egb_issue_jamb_depth_over: 'Frame depth {depth} is larger than the core of {core}.',
  egb_issue_lintel_ok: 'Lintel present.',
  egb_issue_lintel_missing: 'Lintel missing: the opening has no concrete piece above it.',

  egb_issue_stair_empty: 'The stair has no risers.',
  egb_issue_stair_riser_count_diff:
    'The riser count ({count}) differs from the requested ({desired}): add/remove risers or adjust the height.',
  egb_issue_stair_riser_over: 'The actual riser height ({h} m) exceeds the type maximum ({max} m).',
  egb_issue_stair_norm_riser: 'The riser height ({h} m) is outside the code range ({min} to {max} m).',
  egb_issue_stair_uneven_treads:
    'Uneven treads: the tread between consecutive risers varies {v} mm (maximum {max} mm).',
  egb_issue_stair_winder_tread:
    'The winder tread at {at} m from the inner edge ({tread} m) is smaller than the minimum of {min} m.',
  egb_issue_stair_width: 'The flight width ({w} m) is smaller than the type minimum ({min} m).',
  egb_issue_stair_tread_avg: 'The average flight tread ({tread} m) is outside the code range ({min} to {max} m).',
  egb_issue_stair_relation: 'The {relation} relation ({v} m) is outside the code range ({min} to {max} m).',
  egb_issue_stair_rise_between:
    'The flight rises {rise} m without a landing; the maximum between landings is {max} m.',
  egb_issue_stair_landing_small:
    'The landing has a smallest dimension of {w} m, below the minimum of {min} m.',
  egb_issue_stair_spiral_egress:
    'A spiral stair cannot serve as an emergency exit (RS: RT 11 5.7.1.2; SP: mezzanine and private area only).',
  egb_issue_stair_spiral_tread:
    'The tread at {at} m from the inner edge ({tread} m) is smaller than the minimum of {min} m.',
  egb_issue_stair_narrow_tread:
    'The tread at the narrow edge ({tread} m) is smaller than the minimum of {min} m (informational).',
  egb_issue_stair_spiral_headroom:
    'The clearance between turns ({v} m) is smaller than the minimum ({min} m): increase the risers per turn, the ceiling height or the free depth.',

  egb_issue_stair_headroom: 'Headroom {h} m is smaller than the type minimum ({min} m) under the slab.',
  egb_issue_stair_uneven_risers:
    'Uneven risers between flights: the height varies {v} mm (maximum {max} mm).',
  egb_issue_stair_riser_low: 'Riser {h} m below the type minimum of {min} m (NBR 9050).',
  egb_issue_stair_no_riser_count:
    'No riser count yields a height between {min} and {max} m for the rise of {h} m: adjust the height or the type riser range.',
  egb_issue_stair_riser_fixed:
    'Riser {h} m is outside the type range ({min} to {max} m) with fixed riser mode: auto-adjust cannot fix it; switch to automatic mode.',
  egb_issue_stair_tread_range:
    'Tread {tread} m on the walking line is outside the type range ({min} to {max} m) (NBR 9050).',
  egb_issue_stair_flight_rise:
    'Continuous run rises {rise} m without a landing; NBR 9050 limits it to {max} m between landings.',
  egb_issue_stair_wall_overlap:
    'Stair "{id}" overlaps wall {wall} by {area} in plan; move the stair or the wall apart.',

  egb_stair_sketch_boundaries_touch: 'The left and right flight boundaries cannot touch.',
  egb_stair_sketch_boundary_gap: 'Each boundary must be a continuous chain of lines and arcs.',
  egb_stair_sketch_riser_on_boundary: 'Part of the riser lies on the boundary: not allowed.',
  egb_stair_sketch_riser_crossing: 'Crossing risers are not allowed.',
  egb_stair_sketch_riser_boundary_multi: 'The riser crosses the same boundary more than once.',
  egb_stair_sketch_riser_not_spanning: 'Each riser must connect the left boundary to the right one.',
  egb_stair_sketch_riser_same: 'Two risers occupy the same position.',
  egb_stair_sketch_path_ends: 'The walk must go from the first riser to the last.',
  egb_stair_sketch_path_misses: 'The walk does not cross every riser.',
  egb_stair_sketch_landing_open: 'The landing outline must be a closed loop.',

  egb_stair_sketch_riser_gap:
    'Riser #{n}: must connect the left boundary to the right one, but does not reach the {side} boundary ({gap} cm short).',
  egb_stair_sketch_side_left: 'left',
  egb_stair_sketch_side_right: 'right',
  egb_stair_sketch_pair: 'Risers #{a} and #{b}',
  egb_stair_sketch_same_pos: '{pair} occupy the same position (distance {d} cm).',
  egb_stair_sketch_cross: '{pair} cross or touch: not allowed (distance {d} cm).',

  egb_err_stair_type_invalid: 'Invalid stair type.',
  egb_err_stair_height: 'The height must be positive: nothing to generate.',
  egb_err_stair_fixed: 'Invalid riser count or fixed tread.',
  egb_err_stair_too_low: 'The height is smaller than one riser: nothing to generate.',

  egb_err_stair_width: 'The flight width must be positive.',
  egb_err_path_points: 'The path needs at least two distinct points.',
  egb_err_sharp_turn: 'Turn too sharp at vertex {n}: use two smaller turns.',
  egb_err_first_segment_short: 'The 1st segment is too short for a flight (minimum 2 risers).',
  egb_err_segment_short: 'Segment {n} is too short for the turning landing.',
  egb_err_few_risers:
    'Too few risers ({risers}) for the turning landing at vertex {vertex}: lengthen segment {segment} or use a straight stair.',
  egb_err_distribute_risers: 'Could not distribute the risers along the path.',
  egb_err_path_overlap: 'The path overlaps segment {n}: move the point away.',
  egb_note_path_extended_stair: 'Path extended by {d} m to complete {risers} risers.',
  egb_note_path_shortened_stair: 'Path shortened: the stair closes at riser {risers}, before the last point.',
  egb_note_stair_ends_early: 'The stair ends {d} m before the last point.',

  egb_live_stair_riser_over: 'riser of {h} cm above the type maximum ({max} cm).',
  egb_live_stair_riser_below: 'riser of {h} cm below the code minimum ({min} cm).',
  egb_live_stair_riser_above: 'riser of {h} cm above the code maximum ({max} cm).',
  egb_live_stair_blondel: 'the Blondel rule ({v} cm) is outside {min} to {max} cm.',
  egb_live_stair_tread: 'tread of {tread} cm outside {min} to {max} cm.',
  egb_err_adjust_path: 'Could not adjust the path.',
  egb_live_path_kept: 'path kept',
  egb_live_path_extended: 'path extended by {d} m',
  egb_live_path_shortened: 'path shortened by {d} m',
  egb_live_stair_adjusted: 'Adjusted: {risers} risers of {h} cm, tread {tread} cm, {segment}.',
  egb_live_no_option: ' No option within the code: {message}',

  egb_err_stair_no_path: 'The stair has no free path to regenerate.',
  egb_err_stair_type: 'Stair type not found',
  egb_err_stair_top_level: 'The top level is not above the base: nothing to generate.',
  egb_err_stair_no_flight: 'The stair has no valid flight to regenerate.',

  egb_err_stair_sketch: 'Invalid stair sketch: could not count the risers.',
  egb_err_stair_refit_none:
    'No riser count meets the type for the height of {h} m: the riser would have to be between {min} and {max} m. Adjust the height or the type min/max riser.',
  egb_err_stair_long_flight:
    'There is a continuous flight of {h} m (above 3.20 m, NBR 9050) without a landing: mark an intermediate landing of at least 1.20 m on the free path.',
  egb_err_stair_no_continue: 'The stair has no flight to continue.',
  egb_err_stair_remove_risers:
    'The height decreased and the riser would fall below {h} m, but {n} riser(s) cannot be removed (spiral/winder or flights with fewer than 3 risers). Adjust the sketch manually.',
  egb_err_stair_refit_manual: 'Could not continue this stair sketch; adjust it manually.',
  egb_err_stair_landing_manual:
    'There is a continuous flight of {h} m (above 3.20 m, NBR 9050) without a landing and the refit cannot insert one here (spiral, winder or flight with no room to split). Add an intermediate landing of at least 1.20 m manually.',
  egb_err_stair_landing_insert: 'Could not insert the intermediate landing; adjust manually.',

  egb_issue_ramp_flight_edges: 'A ramp flight must have exactly 2 boundary lines.',
  egb_issue_ramp_empty: 'The ramp has no flights.',
  egb_issue_ramp_slope_diff: 'The resulting slope ({slope}) differs from the target ({target}); regenerate the ramp.',
  egb_issue_ramp_no_landing: 'There are consecutive flights without a landing between them.',

  egb_ramp_norm_check: ' (code to verify)',
  egb_issue_ramp_slope_over:
    'The slope of {slope} ({ratio}) exceeds the type maximum ({max} / {maxRatio}).',
  egb_issue_ramp_flight_rise:
    'Flight {n} rises {rise} m; for {slope} the maximum per flight is {max} m.',
  egb_issue_ramp_flights: 'The ramp has {n} flights; for {slope} the maximum is {max}.',
  egb_issue_ramp_landing: 'Landing {n} measures {length} m; the type minimum is {min} m.',
  egb_issue_ramp_width: 'Flight {n} is {w} m wide; the type minimum is {min} m.',
  egb_issue_ramp_headroom: 'Headroom {h} m is smaller than the type minimum ({min} m) under the slab.',

  egb_err_ramp_width: 'The ramp width must be positive.',
  egb_err_ramp_rise: 'The rise must be positive: nothing to generate.',
  egb_err_ramp_dir: 'The up direction must be non-zero.',
  egb_err_length_short: 'The length is too short for the turning landing.',
  egb_err_l_landing: 'The L-ramp landing depth must be ≥ the flight width.',
  egb_err_slope_positive: 'The slope must be greater than zero.',
  egb_err_length_positive: 'The length must be positive.',
  egb_err_path_short_flight: 'The path is too short to generate a flight.',
  egb_note_path_extended: 'Path extended by {d} m to overcome the rise.',
  egb_note_path_shortened: 'Path shortened: the rise closes before the last point.',

  egb_live_ramp_slope: 'Slope {slope} % above the maximum of {max} %.',
  egb_live_ramp_rise: 'Each flight rises {h} m: above the maximum of {max} m.',
  egb_live_ramp_flights: '{n} flights: above the maximum of {max}.',
  egb_live_flight_one: 'flight',
  egb_live_flight_many: 'flights',
  egb_live_ramp_adjusted: 'Adjusted: {slope} %, {n} {flight}',
  egb_live_ramp_last_segment: ', {sign}{d} m on the last segment.',
  egb_live_ramp_kept: '.',
  egb_err_ramp_no_flight: 'The ramp has no valid flight to regenerate.',
  egb_err_ramp_type: 'Ramp type not found',
  egb_err_ramp_no_path: 'The free ramp has no path to regenerate.',
  egb_err_ramp_length_low: 'Length is shorter than the path before the last segment.',

  egb_vw_noun_wall_one: 'wall',
  egb_vw_noun_wall_many: 'walls',
  egb_vw_noun_opening_one: 'opening',
  egb_vw_noun_opening_many: 'openings',
  egb_vw_noun_floor_one: 'floor',
  egb_vw_noun_floor_many: 'floors',
  egb_vw_noun_slab_one: 'slab',
  egb_vw_noun_slab_many: 'slabs',
  egb_vw_noun_ceiling_one: 'ceiling',
  egb_vw_noun_ceiling_many: 'ceilings',
  egb_vw_noun_roof_one: 'roof',
  egb_vw_noun_roof_many: 'roofs',
  egb_vw_noun_stair_one: 'stair or ramp',
  egb_vw_noun_stair_many: 'stairs and ramps',
  egb_vw_hidden_tail: 'outside the view range.',
  egb_vw_beyond_tail: 'below the view range base.',
};

/** Texto da chave no idioma pedido, com interpolação `{nome}`. EN ausente cai em PT; nunca devolve `undefined`. */
export function t(lang: Lang, key: DictKey, args?: Record<string, string | number>): string {
  const text = (lang === 'en' ? EN[key] : PT[key]) ?? PT[key];
  if (!args) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in args ? String(args[name]) : whole));
}

/** Número com casas fixas e o separador do idioma (`, ` em PT, `.` em EN), sem depender do locale do runtime. */
export function numLang(value: number, decimals: number, lang: Lang = 'pt'): string {
  // units-ok: formatador de propósito geral do pacote (o separador vem do idioma)
  const text = value.toFixed(decimals);
  return lang === 'en' ? text : text.replace('.', ',');
}
