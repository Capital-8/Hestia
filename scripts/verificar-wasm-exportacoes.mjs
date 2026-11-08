// Conferência pura das exportações do `.wasm` do kernel (decisão 0046 §3.1). Sem I/O: quem chama lê o módulo e
// passa os nomes das funções exportadas. Usado por `verificar-wasm.mjs` e pelo teste em `tests/`.
//
// Regra: se o módulo exporta `abi2_versao`, ele é ABI v2 e TODAS as exportações da v2 têm de existir (faltando
// alguma reprova, listando as ausentes). Se não exporta, o binário é o da v1: só se confere a v1, e a falta dela é
// aviso (diagnóstico), como sempre foi.

/** Exportações do ABI v1 que o lado JS usa; faltar uma significa artefato errado, não build incompleto. */
export const EXPORTS_V1 = ['preparar_entrada', 'executar', 'saida_area', 'versao_abi'];

/** Exportações do ABI v2 (decisão 0046 §3.1). `abi2_versao` é a sentinela que escolhe a conferência. */
export const EXPORTS_V2 = [
  'abi2_versao',
  'abi2_esquema_versao',
  'abi2_alocar',
  'abi2_liberar',
  'cena_criar',
  'cena_destruir',
  'cena_definir_secao',
  'cena_upsert_linhas',
  'cena_remover_linhas',
  'cena_executar',
  'saida_n',
  'saida_tipo',
  'saida_ptr',
  'saida_len',
  'saida_liberar',
  'erro_ptr',
  'erro_len',
  'memoria_usada',
];

/**
 * Confere os nomes das funções exportadas por um módulo.
 * @param {Iterable<string>} exportadas nomes das exportações do tipo função
 * @returns {{ abi2: boolean, v1Completa: boolean, erros: string[], avisos: string[] }}
 *   `v1Completa` diz se a leitura diagnóstica de `versao_abi` pode ser feita.
 */
export function conferirExportacoes(exportadas) {
  const nomes = new Set(exportadas);
  const erros = [];
  const avisos = [];
  if (nomes.has('abi2_versao')) {
    const faltando = EXPORTS_V2.filter((nome) => !nomes.has(nome));
    if (faltando.length) {
      erros.push(`o módulo exporta abi2_versao (ABI v2), mas faltam ${faltando.length} exportações da v2: ${faltando.join(', ')}.`);
    }
    return { abi2: true, v1Completa: EXPORTS_V1.every((nome) => nomes.has(nome)), erros, avisos };
  }
  const faltando = EXPORTS_V1.filter((nome) => !nomes.has(nome));
  if (faltando.length) {
    avisos.push(`o módulo não exporta ${faltando.join(', ')}; a versão do ABI não pôde ser conferida.`);
    return { abi2: false, v1Completa: false, erros, avisos };
  }
  return { abi2: false, v1Completa: true, erros, avisos };
}
