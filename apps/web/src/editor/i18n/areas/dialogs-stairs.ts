/** Shard de dicionário: diálogos de escada/rampa e prévias de seção (prefixo `dls_`). */
export const PT_DIALOGS_STAIRS = {
  // Prévia da seção da parede
  dls_a11y_wall_section: 'Seção da parede',
  dls_svg_exterior: 'EXTERIOR',
  dls_svg_interior: 'INTERIOR',
  dls_svg_core: 'núcleo',
  dls_svg_bottom_face: 'FACE INFERIOR',

  // Prévia da seção do piso
  dls_a11y_floor_section: 'Seção do piso',
  dls_svg_floor_top: 'TOPO DO PISO',

  // Prévia da seção da laje
  dls_a11y_slab_section: 'Seção da laje',
  dls_svg_slab_top: 'TOPO DA LAJE',

  // Prévia da seção do telhado
  dls_a11y_roof_section: 'Seção do telhado',
  dls_svg_roof_top: 'TOPO DO TELHADO',

  // Prévia da rampa
  dls_ramp_preview_tabs: 'Prévia da rampa',
  dls_ramp_preview_section: 'Corte',
  dls_ramp_preview_plan: 'Planta',
  dls_ramp_preview_empty: 'Preencha a inclinação para ver o desenho.',
  dls_ramp_preview_section_aria: 'Corte da rampa: inclinação {slope}, desnível por lance até {rise} m, espessura {e} cm',
  dls_ramp_preview_plan_aria: 'Planta esquemática da rampa em U, largura {w} m',

  // Desenho do corte da escada
  dls_stair_dwg_riser: 'Espelho\n{v} cm',
  dls_stair_dwg_tread: 'Piso {v} cm',
  dls_stair_dwg_nosing: 'Nariz {v} cm',
  dls_stair_dwg_theta: 'θ = {v}°',
  dls_stair_dwg_floor: 'Piso\ninferior',
  dls_stair_dwg_headroom: 'Pé-direito\nlivre mín.\n{v} m',
  dls_stair_dwg_thick: 'Espessura\nestrutural\n{v} cm ⟂\nà rampa',
  dls_stair_dwg_tread_thick: 'Piso\n(espessura)\n{v} cm',
  dls_stair_dwg_riser_thick: 'Espelho\n(espessura)\n{v} cm',
  dls_stair_dwg_overlap: 'Sobreposição\n{v} cm',
  dls_stair_dwg_cap_mono: 'Corte esquemático de {n} degraus. Cotas em cm.',
  dls_stair_dwg_cap_assembled: 'Pisos e espelhos montados sobre estrutura (estrutura não detalhada).',
  dls_stair_dwg_cap_post: 'Degraus em balanço presos ao poste central, desenvolvidos ao longo da linha de caminhada.',
  dls_stair_err_riser_tread: 'riser e tread devem ser positivos',

  // Desenho do corte e da planta da rampa
  dls_ramp_dwg_run: 'c = {v} m',
  dls_ramp_dwg_total: 'L = {v} m',
  dls_ramp_dwg_landing: 'Patamar ≥ {v} m',
  dls_ramp_dwg_rise: 'h = {v} m',
  dls_ramp_dwg_rise_max: 'h = {v} m\nmáx. {m} m ✓',
  dls_ramp_dwg_rise_max_unchecked: 'h = {v} m\nmáx. {m} m ✓\na conferir',
  dls_ramp_dwg_thick: 'e = {v} cm\n⟂ (vertical\n{m} cm)',
  dls_ramp_dwg_headroom: 'Pé-direito\nlivre mín.\n{v} m',
  dls_ramp_dwg_flight1: 'Lance 1',
  dls_ramp_dwg_flight2: 'Lance 2',
  dls_ramp_dwg_over_limit: 'Inclinação acima da norma\n(máx. {v})',
  dls_ramp_dwg_slope: 'i = h ÷ c = {v}',
  dls_ramp_dwg_width: 'Largura {v} m',
  dls_ramp_dwg_up: 'Sobe',
  dls_ramp_dwg_land: 'Patamar',
  dls_ramp_dwg_cap_section:
    'Escala vertical ×{k} (esquemático). Lance 1: h {h1} m, c {c1} m. Lance 2: h {h2} m, c {c2} m. Níveis: {levels}.',
  dls_ramp_dwg_cap_section_one: 'Escala vertical ×{k} (esquemático). Lance 1: h {h1} m, c {c1} m. Níveis: {levels}.',
  dls_ramp_dwg_cap_plan: 'Planta esquemática em U; o giro e o número de lances dependem da rampa criada.',
  dls_ramp_err_slope: 'a inclinação deve ser positiva',
} as const;

export const EN_DIALOGS_STAIRS: Record<keyof typeof PT_DIALOGS_STAIRS, string> = {
  // Wall section preview
  dls_a11y_wall_section: 'Wall section',
  dls_svg_exterior: 'EXTERIOR',
  dls_svg_interior: 'INTERIOR',
  dls_svg_core: 'core',
  dls_svg_bottom_face: 'BOTTOM FACE',

  // Floor section preview
  dls_a11y_floor_section: 'Floor section',
  dls_svg_floor_top: 'TOP OF FLOOR',

  // Slab section preview
  dls_a11y_slab_section: 'Slab section',
  dls_svg_slab_top: 'TOP OF SLAB',

  // Roof section preview
  dls_a11y_roof_section: 'Roof section',
  dls_svg_roof_top: 'TOP OF ROOF',

  // Ramp preview
  dls_ramp_preview_tabs: 'Ramp preview',
  dls_ramp_preview_section: 'Section',
  dls_ramp_preview_plan: 'Plan',
  dls_ramp_preview_empty: 'Fill in the slope to see the drawing.',
  dls_ramp_preview_section_aria: 'Ramp section: slope {slope}, rise per flight up to {rise} m, thickness {e} cm',
  dls_ramp_preview_plan_aria: 'Schematic U-shaped ramp plan, width {w} m',

  // Stair section drawing
  dls_stair_dwg_riser: 'Riser\n{v} cm',
  dls_stair_dwg_tread: 'Tread {v} cm',
  dls_stair_dwg_nosing: 'Nosing {v} cm',
  dls_stair_dwg_theta: 'θ = {v}°',
  dls_stair_dwg_floor: 'Lower\nfloor',
  dls_stair_dwg_headroom: 'Headroom\nfree min.\n{v} m',
  dls_stair_dwg_thick: 'Structural\nthickness\n{v} cm ⟂\nto slope',
  dls_stair_dwg_tread_thick: 'Tread\n(thickness)\n{v} cm',
  dls_stair_dwg_riser_thick: 'Riser\n(thickness)\n{v} cm',
  dls_stair_dwg_overlap: 'Overlap\n{v} cm',
  dls_stair_dwg_cap_mono: 'Schematic section of {n} steps. Dimensions in cm.',
  dls_stair_dwg_cap_assembled: 'Treads and risers assembled over a structure (structure not detailed).',
  dls_stair_dwg_cap_post: 'Cantilevered treads fixed to the central post, developed along the walking line.',
  dls_stair_err_riser_tread: 'riser and tread must be positive',

  // Ramp section and plan drawing
  dls_ramp_dwg_run: 'c = {v} m',
  dls_ramp_dwg_total: 'L = {v} m',
  dls_ramp_dwg_landing: 'Landing ≥ {v} m',
  dls_ramp_dwg_rise: 'h = {v} m',
  dls_ramp_dwg_rise_max: 'h = {v} m\nmax. {m} m ✓',
  dls_ramp_dwg_rise_max_unchecked: 'h = {v} m\nmax. {m} m ✓\nto be checked',
  dls_ramp_dwg_thick: 'e = {v} cm\n⟂ (vertical\n{m} cm)',
  dls_ramp_dwg_headroom: 'Headroom\nmin. free\n{v} m',
  dls_ramp_dwg_flight1: 'Flight 1',
  dls_ramp_dwg_flight2: 'Flight 2',
  dls_ramp_dwg_over_limit: 'Slope above code\n(max. {v})',
  dls_ramp_dwg_slope: 'i = h ÷ c = {v}',
  dls_ramp_dwg_width: 'Width {v} m',
  dls_ramp_dwg_up: 'Up',
  dls_ramp_dwg_land: 'Landing',
  dls_ramp_dwg_cap_section:
    'Vertical scale ×{k} (schematic). Flight 1: h {h1} m, c {c1} m. Flight 2: h {h2} m, c {c2} m. Levels: {levels}.',
  dls_ramp_dwg_cap_section_one: 'Vertical scale ×{k} (schematic). Flight 1: h {h1} m, c {c1} m. Levels: {levels}.',
  dls_ramp_dwg_cap_plan: 'Schematic U-shaped plan; the turn and the number of flights depend on the ramp created.',
  dls_ramp_err_slope: 'slope must be positive',
};
