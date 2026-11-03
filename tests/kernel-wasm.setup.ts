/**
 * Setup das suítes wasm (vitest.wasm.config.ts e vitest.wasm.pesado.config.ts): cede o event loop ao fim de cada teste.
 * Os testes do kernel são síncronos e longos. Entre um teste e o seguinte o runner só espera microtarefas, então o worker não lê as
 * respostas do processo principal (RPC de `onTaskUpdate`) e o timeout de 60 s do RPC dispara com a SOMA dos testes do arquivo, mesmo
 * quando nenhum teste passa de 30 s. `setImmediate` deixa o loop processar essas mensagens. Não altera nenhum teste.
 */
import { afterEach } from 'vitest';

afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
