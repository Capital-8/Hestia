/* Textos de importar e exportar de suplementos (ADR 0057, fase F). Chaves supio_*. */
export const PT_SUPLEMENTOS_IO = {
  'supio_menu_import': "Importar de suplementos…",
  'supio_import_title': "Importar de suplementos",
  'supio_import_none': "Nenhum suplemento com importador está ativo.",
  'supio_import_hint': "Suplemento \"{name}\" · {ext}",
  'supio_export_hint': "Suplemento \"{name}\" · .{ext}",
  'supio_preview_title': "Prévia da importação",
  'supio_preview_body': "O suplemento \"{name}\" vai criar {n} elemento(s) a partir de \"{file}\" ({commands} comando(s)). A importação é um único passo de Desfazer.",
  'supio_confirm': "Importar {n} elemento(s)",
  'supio_cancel': "Cancelar",
  'supio_status_prepared': "Suplemento \"{name}\": {n} elemento(s) prontos para importar. Confirme no menu Arquivo.",
  'supio_status_imported': "Suplemento \"{name}\": {n} elemento(s) importados (um passo de Desfazer).",
  'supio_status_cancelled': "Importação do suplemento \"{name}\" cancelada.",
  'supio_status_error': "Suplemento \"{name}\": não foi possível importar ou exportar ({detail}).",
} as const;

export const EN_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Import from add-ins…",
  'supio_import_title': "Import from add-ins",
  'supio_import_none': "No active add-in provides an importer.",
  'supio_import_hint': "Add-in \"{name}\" · {ext}",
  'supio_export_hint': "Add-in \"{name}\" · .{ext}",
  'supio_preview_title': "Import preview",
  'supio_preview_body': "Add-in \"{name}\" will create {n} element(s) from \"{file}\" ({commands} command(s)). The import is a single Undo step.",
  'supio_confirm': "Import {n} element(s)",
  'supio_cancel': "Cancel",
  'supio_status_prepared': "Add-in \"{name}\": {n} element(s) ready to import. Confirm in the File menu.",
  'supio_status_imported': "Add-in \"{name}\": {n} element(s) imported (one Undo step).",
  'supio_status_cancelled': "Import by add-in \"{name}\" cancelled.",
  'supio_status_error': "Add-in \"{name}\": could not import or export ({detail}).",
};

export const ES_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Importar desde complementos…",
  'supio_import_title': "Importar desde complementos",
  'supio_import_none': "Ningún complemento activo ofrece un importador.",
  'supio_import_hint': "Complemento \"{name}\" · {ext}",
  'supio_export_hint': "Complemento \"{name}\" · .{ext}",
  'supio_preview_title': "Vista previa de la importación",
  'supio_preview_body': "El complemento \"{name}\" creará {n} elemento(s) a partir de \"{file}\" ({commands} comando(s)). La importación es un único paso de Deshacer.",
  'supio_confirm': "Importar {n} elemento(s)",
  'supio_cancel': "Cancelar",
  'supio_status_prepared': "Complemento \"{name}\": {n} elemento(s) listos para importar. Confirme en el menú Archivo.",
  'supio_status_imported': "Complemento \"{name}\": {n} elemento(s) importados (un paso de Deshacer).",
  'supio_status_cancelled': "Importación del complemento \"{name}\" cancelada.",
  'supio_status_error': "Complemento \"{name}\": no se pudo importar o exportar ({detail}).",
};

export const DE_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Aus Add-ins importieren…",
  'supio_import_title': "Aus Add-ins importieren",
  'supio_import_none': "Kein aktives Add-in stellt einen Import bereit.",
  'supio_import_hint': "Add-in \"{name}\" · {ext}",
  'supio_export_hint': "Add-in \"{name}\" · .{ext}",
  'supio_preview_title': "Importvorschau",
  'supio_preview_body': "Das Add-in \"{name}\" erstellt {n} Element(e) aus \"{file}\" ({commands} Befehl(e)). Der Import ist ein einziger Rückgängig-Schritt.",
  'supio_confirm': "{n} Element(e) importieren",
  'supio_cancel': "Abbrechen",
  'supio_status_prepared': "Add-in \"{name}\": {n} Element(e) bereit zum Import. Im Menü Datei bestätigen.",
  'supio_status_imported': "Add-in \"{name}\": {n} Element(e) importiert (ein Rückgängig-Schritt).",
  'supio_status_cancelled': "Import durch Add-in \"{name}\" abgebrochen.",
  'supio_status_error': "Add-in \"{name}\": Import oder Export nicht möglich ({detail}).",
};

export const FR_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Importer depuis les modules…",
  'supio_import_title': "Importer depuis les modules",
  'supio_import_none': "Aucun module actif ne fournit d'importateur.",
  'supio_import_hint': "Module \"{name}\" · {ext}",
  'supio_export_hint': "Module \"{name}\" · .{ext}",
  'supio_preview_title': "Aperçu de l'importation",
  'supio_preview_body': "Le module \"{name}\" va créer {n} élément(s) à partir de \"{file}\" ({commands} commande(s)). L'importation est une seule étape d'Annulation.",
  'supio_confirm': "Importer {n} élément(s)",
  'supio_cancel': "Annuler",
  'supio_status_prepared': "Module \"{name}\" : {n} élément(s) prêts à importer. Confirmez dans le menu Fichier.",
  'supio_status_imported': "Module \"{name}\" : {n} élément(s) importés (une étape d'Annulation).",
  'supio_status_cancelled': "Importation du module \"{name}\" annulée.",
  'supio_status_error': "Module \"{name}\" : importation ou exportation impossible ({detail}).",
};

export const IT_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Importa dai componenti aggiuntivi…",
  'supio_import_title': "Importa dai componenti aggiuntivi",
  'supio_import_none': "Nessun componente aggiuntivo attivo fornisce un importatore.",
  'supio_import_hint': "Componente \"{name}\" · {ext}",
  'supio_export_hint': "Componente \"{name}\" · .{ext}",
  'supio_preview_title': "Anteprima dell'importazione",
  'supio_preview_body': "Il componente \"{name}\" creerà {n} elemento/i da \"{file}\" ({commands} comando/i). L'importazione è un unico passo di Annulla.",
  'supio_confirm': "Importa {n} elemento/i",
  'supio_cancel': "Annulla",
  'supio_status_prepared': "Componente \"{name}\": {n} elemento/i pronti da importare. Conferma nel menu File.",
  'supio_status_imported': "Componente \"{name}\": {n} elemento/i importati (un passo di Annulla).",
  'supio_status_cancelled': "Importazione del componente \"{name}\" annullata.",
  'supio_status_error': "Componente \"{name}\": impossibile importare o esportare ({detail}).",
};

export const PL_SUPLEMENTOS_IO: Record<keyof typeof PT_SUPLEMENTOS_IO, string> = {
  'supio_menu_import': "Importuj z dodatków…",
  'supio_import_title': "Importuj z dodatków",
  'supio_import_none': "Żaden aktywny dodatek nie udostępnia importu.",
  'supio_import_hint': "Dodatek \"{name}\" · {ext}",
  'supio_export_hint': "Dodatek \"{name}\" · .{ext}",
  'supio_preview_title': "Podgląd importu",
  'supio_preview_body': "Dodatek \"{name}\" utworzy {n} element(ów) z \"{file}\" ({commands} poleceń). Import to jeden krok cofania.",
  'supio_confirm': "Importuj {n} element(ów)",
  'supio_cancel': "Anuluj",
  'supio_status_prepared': "Dodatek \"{name}\": {n} element(ów) gotowych do importu. Potwierdź w menu Plik.",
  'supio_status_imported': "Dodatek \"{name}\": zaimportowano {n} element(ów) (jeden krok cofania).",
  'supio_status_cancelled': "Import przez dodatek \"{name}\" anulowany.",
  'supio_status_error': "Dodatek \"{name}\": nie udało się zaimportować ani wyeksportować ({detail}).",
};

