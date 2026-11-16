/* Textos de verificações e quantitativos de suplementos (ADR 0057, fase E). Chaves sup_e_*; entram em `suplementos.ts`. */
export const PT_SUP_E = {
  'sup_e_csv': 'Exportar CSV',
  'sup_e_total': 'Total',
  'sup_e_empty': 'Nenhum elemento para este quantitativo.',
  'sup_e_errors': '{n} célula(s) não puderam ser calculadas (expressão inválida ou fora do permitido).',
  'sup_e_truncated': 'Tabela cortada em {n} linhas.',
  'sup_e_status_check': 'Verificação do suplemento "{name}": {n} aviso(s).',
  'sup_e_missing': 'O quantitativo não está mais disponível (suplemento desativado).',
};

export const EN_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'Export CSV',
  'sup_e_total': 'Total',
  'sup_e_empty': 'No elements for this schedule.',
  'sup_e_errors': '{n} cell(s) could not be computed (invalid or disallowed expression).',
  'sup_e_truncated': 'Table cut at {n} rows.',
  'sup_e_status_check': 'Check from add-in "{name}": {n} warning(s).',
  'sup_e_missing': 'The schedule is no longer available (add-in disabled).',
};

export const ES_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'Exportar CSV',
  'sup_e_total': 'Total',
  'sup_e_empty': 'Ningún elemento para este cómputo.',
  'sup_e_errors': 'No se pudieron calcular {n} celda(s) (expresión inválida o no permitida).',
  'sup_e_truncated': 'Tabla cortada en {n} filas.',
  'sup_e_status_check': 'Verificación del complemento "{name}": {n} aviso(s).',
  'sup_e_missing': 'El cómputo ya no está disponible (complemento desactivado).',
};

export const DE_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'CSV exportieren',
  'sup_e_total': 'Summe',
  'sup_e_empty': 'Keine Elemente für diese Mengenliste.',
  'sup_e_errors': '{n} Zelle(n) konnten nicht berechnet werden (ungültiger oder unzulässiger Ausdruck).',
  'sup_e_truncated': 'Tabelle auf {n} Zeilen gekürzt.',
  'sup_e_status_check': 'Prüfung des Add-ins "{name}": {n} Warnung(en).',
  'sup_e_missing': 'Die Mengenliste ist nicht mehr verfügbar (Add-in deaktiviert).',
};

export const FR_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'Exporter en CSV',
  'sup_e_total': 'Total',
  'sup_e_empty': 'Aucun élément pour ce métré.',
  'sup_e_errors': '{n} cellule(s) n\'ont pas pu être calculées (expression invalide ou non autorisée).',
  'sup_e_truncated': 'Tableau limité à {n} lignes.',
  'sup_e_status_check': 'Vérification du module "{name}" : {n} avertissement(s).',
  'sup_e_missing': 'Le métré n\'est plus disponible (module désactivé).',
};

export const IT_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'Esporta CSV',
  'sup_e_total': 'Totale',
  'sup_e_empty': 'Nessun elemento per questo computo.',
  'sup_e_errors': 'Impossibile calcolare {n} cella/e (espressione non valida o non consentita).',
  'sup_e_truncated': 'Tabella limitata a {n} righe.',
  'sup_e_status_check': 'Verifica del componente "{name}": {n} avviso/i.',
  'sup_e_missing': 'Il computo non è più disponibile (componente disattivato).',
};

export const PL_SUP_E: Record<keyof typeof PT_SUP_E, string> = {
  'sup_e_csv': 'Eksportuj CSV',
  'sup_e_total': 'Razem',
  'sup_e_empty': 'Brak elementów dla tego zestawienia.',
  'sup_e_errors': 'Nie można obliczyć {n} komórek (nieprawidłowe lub niedozwolone wyrażenie).',
  'sup_e_truncated': 'Tabela przycięta do {n} wierszy.',
  'sup_e_status_check': 'Kontrola dodatku "{name}": ostrzeżeń: {n}.',
  'sup_e_missing': 'Zestawienie nie jest już dostępne (dodatek wyłączony).',
};
