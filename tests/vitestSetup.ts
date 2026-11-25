import { afterEach } from 'vitest';

/**
 * Fixa o idioma do ambiente de teste em PT-BR: sem `hestia.lang` salvo, o app detecta o idioma do
 * navegador. Sem isto, os testes rodariam em inglês em máquinas com locale diferente de português.
 */
if (typeof navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'pt-BR', languages: ['pt-BR', 'pt'] }, configurable: true });
} else {
  Object.defineProperty(navigator, 'language', { value: 'pt-BR', configurable: true });
  Object.defineProperty(navigator, 'languages', { value: ['pt-BR', 'pt'], configurable: true });
}

/**
 * Cede o event loop depois de cada teste, em todos os arquivos (I-1b).
 *
 * Os testes de geometria são síncronos e levam de 1 a dezenas de segundos. Entre eles o runner só passa
 * microtasks, então a resposta do vitest ao `onTaskUpdate` fica na fila do worker. Se o worker passa de 60 s
 * sem processá-la, o birpc dá `Timeout calling "onTaskUpdate"` e o run sai 1 sem falha de asserção. Um yield
 * macrotask por teste zera o acúmulo entre testes; um único teste síncrono de mais de 60 s ainda estoura.
 */
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
