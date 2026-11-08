/**
 * Caminho do binário wasm para os testes de Node: `KERNEL_WASM_PATH` (o CI aponta para o binário recém-compilado)
 * ou o artefato commitado em `packages/geom/assets/`. Só para teste e scripts; nunca importado pelo app.
 */
import { fileURLToPath } from 'node:url';

export function caminhoDoWasm(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.KERNEL_WASM_PATH;
  return env && env.length > 0 ? env : fileURLToPath(new URL('../../assets/geom_wasm.wasm', import.meta.url));
}
