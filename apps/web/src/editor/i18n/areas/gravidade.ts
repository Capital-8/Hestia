/* Textos do botão Gravidade da barra de status (ficha G1). Chaves ui_gv_*. Sete idiomas; a paridade é garantida pelo tipo. */
export const PT_GRAVIDADE = {
  ui_gv_nome: 'Gravidade',
  ui_gv_on: 'Gravidade ligada: parede, piso, laje e região de terreno nascem na cota do terreno proposto sob o primeiro clique.',
  ui_gv_off: 'Gravidade desligada: os elementos nascem na cota padrão.',
  ui_gv_status_on: 'Gravidade ligada.',
  ui_gv_status_off: 'Gravidade desligada.',
};

export const EN_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Gravity',
  ui_gv_on: 'Gravity on: walls, floors, slabs and terrain regions start at the proposed terrain elevation under the first click.',
  ui_gv_off: 'Gravity off: elements start at the default elevation.',
  ui_gv_status_on: 'Gravity on.',
  ui_gv_status_off: 'Gravity off.',
};

export const ES_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Gravedad',
  ui_gv_on: 'Gravedad activada: muros, pisos, losas y regiones de terreno nacen a la cota del terreno propuesto bajo el primer clic.',
  ui_gv_off: 'Gravedad desactivada: los elementos nacen a la cota predeterminada.',
  ui_gv_status_on: 'Gravedad activada.',
  ui_gv_status_off: 'Gravedad desactivada.',
};

export const DE_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Schwerkraft',
  ui_gv_on: 'Schwerkraft ein: Wände, Böden, Decken und Geländebereiche starten auf der Höhe des geplanten Geländes unter dem ersten Klick.',
  ui_gv_off: 'Schwerkraft aus: Elemente starten auf der Standardhöhe.',
  ui_gv_status_on: 'Schwerkraft ein.',
  ui_gv_status_off: 'Schwerkraft aus.',
};

export const FR_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Gravité',
  ui_gv_on: 'Gravité activée : murs, sols, dalles et zones de terrain naissent à la cote du terrain projeté sous le premier clic.',
  ui_gv_off: 'Gravité désactivée : les éléments naissent à la cote par défaut.',
  ui_gv_status_on: 'Gravité activée.',
  ui_gv_status_off: 'Gravité désactivée.',
};

export const IT_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Gravità',
  ui_gv_on: 'Gravità attiva: muri, pavimenti, solai e regioni di terreno nascono alla quota del terreno di progetto sotto il primo clic.',
  ui_gv_off: 'Gravità disattivata: gli elementi nascono alla quota predefinita.',
  ui_gv_status_on: 'Gravità attivata.',
  ui_gv_status_off: 'Gravità disattivata.',
};

export const PL_GRAVIDADE: Record<keyof typeof PT_GRAVIDADE, string> = {
  ui_gv_nome: 'Grawitacja',
  ui_gv_on: 'Grawitacja włączona: ściany, podłogi, stropy i obszary terenu powstają na rzędnej projektowanego terenu pod pierwszym kliknięciem.',
  ui_gv_off: 'Grawitacja wyłączona: elementy powstają na rzędnej domyślnej.',
  ui_gv_status_on: 'Grawitacja włączona.',
  ui_gv_status_off: 'Grawitacja wyłączona.',
};
