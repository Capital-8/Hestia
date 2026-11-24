/**
 * Shard de dicionário: seção "Instalações e estrutura" do orçamento do projeto (ficha I2). Prefixo `mov_mep_` e
 * `mov_orc_instalacoes`. Espalhado por `moveis.ts` (uma linha por idioma). Paridade PT/EN/ES/DE/FR/IT/PL pelo tipo
 * `Record<keyof typeof PT_MOVEIS_MEP, string>`.
 */

export const PT_MOVEIS_MEP = {
  mov_orc_instalacoes: 'Instalações e estrutura',
  mov_mep_grp_tubulacao: 'Tubulação',
  mov_mep_grp_conexoes: 'Conexões de tubo',
  mov_mep_grp_reservatorios: 'Reservatórios',
  mov_mep_grp_perfis: 'Perfis estruturais',
  mov_mep_grp_eletrodutos: 'Eletrodutos',
  mov_mep_col_grupo: 'Grupo',
  mov_mep_col_item: 'Item',
  mov_mep_col_quantidade: 'Quantidade',
  mov_mep_col_medida: 'Medida',
  mov_mep_col_unidade: 'Unidade',
  mov_mep_sem_identificacao: 'Sem DN ou bitola',
  mov_mep_sem_itens: 'Nenhuma instalação ou estrutura no projeto.',
  mov_mep_nota: 'Tubulação e eletrodutos em metros; perfis pela massa (kg, aço 7850 kg/m³); reservatórios pelo volume útil (L).',
  mov_mep_baixar_csv: 'Baixar CSV de instalações',
} as const;

type D = Record<keyof typeof PT_MOVEIS_MEP, string>;

export const EN_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Installations and structure',
  mov_mep_grp_tubulacao: 'Piping',
  mov_mep_grp_conexoes: 'Pipe fittings',
  mov_mep_grp_reservatorios: 'Tanks',
  mov_mep_grp_perfis: 'Structural profiles',
  mov_mep_grp_eletrodutos: 'Conduits',
  mov_mep_col_grupo: 'Group',
  mov_mep_col_item: 'Item',
  mov_mep_col_quantidade: 'Quantity',
  mov_mep_col_medida: 'Measure',
  mov_mep_col_unidade: 'Unit',
  mov_mep_sem_identificacao: 'No DN or gauge',
  mov_mep_sem_itens: 'No installations or structure in the project.',
  mov_mep_nota: 'Piping and conduits in metres; profiles by mass (kg, steel 7850 kg/m³); tanks by useful volume (L).',
  mov_mep_baixar_csv: 'Download installations CSV',
};

export const ES_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Instalaciones y estructura',
  mov_mep_grp_tubulacao: 'Tubería',
  mov_mep_grp_conexoes: 'Conexiones de tubo',
  mov_mep_grp_reservatorios: 'Depósitos',
  mov_mep_grp_perfis: 'Perfiles estructurales',
  mov_mep_grp_eletrodutos: 'Conductos eléctricos',
  mov_mep_col_grupo: 'Grupo',
  mov_mep_col_item: 'Ítem',
  mov_mep_col_quantidade: 'Cantidad',
  mov_mep_col_medida: 'Medida',
  mov_mep_col_unidade: 'Unidad',
  mov_mep_sem_identificacao: 'Sin DN ni calibre',
  mov_mep_sem_itens: 'No hay instalaciones ni estructura en el proyecto.',
  mov_mep_nota: 'Tubería y conductos en metros; perfiles por masa (kg, acero 7850 kg/m³); depósitos por volumen útil (L).',
  mov_mep_baixar_csv: 'Descargar CSV de instalaciones',
};

export const DE_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Installationen und Tragwerk',
  mov_mep_grp_tubulacao: 'Rohrleitung',
  mov_mep_grp_conexoes: 'Rohrformstücke',
  mov_mep_grp_reservatorios: 'Behälter',
  mov_mep_grp_perfis: 'Tragprofile',
  mov_mep_grp_eletrodutos: 'Leerrohre',
  mov_mep_col_grupo: 'Gruppe',
  mov_mep_col_item: 'Position',
  mov_mep_col_quantidade: 'Menge',
  mov_mep_col_medida: 'Maß',
  mov_mep_col_unidade: 'Einheit',
  mov_mep_sem_identificacao: 'Ohne DN oder Dimension',
  mov_mep_sem_itens: 'Keine Installationen oder Tragwerk im Projekt.',
  mov_mep_nota: 'Rohre und Leerrohre in Metern; Profile nach Masse (kg, Stahl 7850 kg/m³); Behälter nach Nutzvolumen (L).',
  mov_mep_baixar_csv: 'Installations-CSV herunterladen',
};

export const FR_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Installations et structure',
  mov_mep_grp_tubulacao: 'Tuyauterie',
  mov_mep_grp_conexoes: 'Raccords de tuyau',
  mov_mep_grp_reservatorios: 'Réservoirs',
  mov_mep_grp_perfis: 'Profilés structurels',
  mov_mep_grp_eletrodutos: 'Gaines électriques',
  mov_mep_col_grupo: 'Groupe',
  mov_mep_col_item: 'Élément',
  mov_mep_col_quantidade: 'Quantité',
  mov_mep_col_medida: 'Mesure',
  mov_mep_col_unidade: 'Unité',
  mov_mep_sem_identificacao: 'Sans DN ni calibre',
  mov_mep_sem_itens: "Aucune installation ni structure dans le projet.",
  mov_mep_nota: 'Tuyauterie et gaines en mètres ; profilés en masse (kg, acier 7850 kg/m³) ; réservoirs en volume utile (L).',
  mov_mep_baixar_csv: 'Télécharger le CSV des installations',
};

export const IT_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Impianti e struttura',
  mov_mep_grp_tubulacao: 'Tubazioni',
  mov_mep_grp_conexoes: 'Raccordi per tubo',
  mov_mep_grp_reservatorios: 'Serbatoi',
  mov_mep_grp_perfis: 'Profili strutturali',
  mov_mep_grp_eletrodutos: 'Tubi guaina',
  mov_mep_col_grupo: 'Gruppo',
  mov_mep_col_item: 'Voce',
  mov_mep_col_quantidade: 'Quantità',
  mov_mep_col_medida: 'Misura',
  mov_mep_col_unidade: 'Unità',
  mov_mep_sem_identificacao: 'Senza DN o diametro',
  mov_mep_sem_itens: 'Nessun impianto o struttura nel progetto.',
  mov_mep_nota: 'Tubazioni e guaine in metri; profili in massa (kg, acciaio 7850 kg/m³); serbatoi in volume utile (L).',
  mov_mep_baixar_csv: 'Scarica CSV degli impianti',
};

export const PL_MOVEIS_MEP: D = {
  mov_orc_instalacoes: 'Instalacje i konstrukcja',
  mov_mep_grp_tubulacao: 'Rurociągi',
  mov_mep_grp_conexoes: 'Kształtki rurowe',
  mov_mep_grp_reservatorios: 'Zbiorniki',
  mov_mep_grp_perfis: 'Profile konstrukcyjne',
  mov_mep_grp_eletrodutos: 'Rury osłonowe',
  mov_mep_col_grupo: 'Grupa',
  mov_mep_col_item: 'Pozycja',
  mov_mep_col_quantidade: 'Ilość',
  mov_mep_col_medida: 'Miara',
  mov_mep_col_unidade: 'Jednostka',
  mov_mep_sem_identificacao: 'Bez DN lub średnicy',
  mov_mep_sem_itens: 'Brak instalacji i konstrukcji w projekcie.',
  mov_mep_nota: 'Rurociągi i rury w metrach; profile wg masy (kg, stal 7850 kg/m³); zbiorniki wg objętości użytkowej (L).',
  mov_mep_baixar_csv: 'Pobierz CSV instalacji',
};
