/* Textos novos do terreno na vista (ficha U1b): barra de status. Chaves ui_tn_sb_*. Sete idiomas; a paridade é garantida pelo tipo. */
export const PT_TERRENO_VISTA = {
  ui_tn_sb_z: 'z terreno {v}',
  ui_tn_sb_z_tip: 'Cota do terreno proposto sob o cursor',
};

export const EN_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'terrain z {v}',
  ui_tn_sb_z_tip: 'Proposed terrain elevation under the cursor',
};

export const ES_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'z terreno {v}',
  ui_tn_sb_z_tip: 'Cota del terreno propuesto bajo el cursor',
};

export const DE_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'z Gelände {v}',
  ui_tn_sb_z_tip: 'Höhe des geplanten Geländes unter dem Cursor',
};

export const FR_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'z terrain {v}',
  ui_tn_sb_z_tip: 'Cote du terrain projeté sous le curseur',
};

export const IT_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'z terreno {v}',
  ui_tn_sb_z_tip: 'Quota del terreno di progetto sotto il cursore',
};

export const PL_TERRENO_VISTA: Record<keyof typeof PT_TERRENO_VISTA, string> = {
  ui_tn_sb_z: 'z teren {v}',
  ui_tn_sb_z_tip: 'Rzędna projektowanego terenu pod kursorem',
};
