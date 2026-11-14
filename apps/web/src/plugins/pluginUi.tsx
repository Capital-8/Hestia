import { initialFieldValue, initialFieldValues } from '@hestia/plugin-api';

/**
 * O diálogo declarativo de suplemento mora em `ui/PluginDialog.tsx` (fase H); este arquivo mantém os nomes que o App e os
 * testes da fase B já usam.
 */
export { PluginDialog } from '../ui/PluginDialog.tsx';

/** Valor inicial de um campo: o `default` do manifesto ou um vazio do tipo certo. */
export const valorInicial = initialFieldValue;

/** Valores iniciais de todos os campos, por `key`. */
export const valoresIniciais = initialFieldValues;
