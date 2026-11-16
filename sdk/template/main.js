// @ts-check
// Suplemento de script do Hestia. Este arquivo roda num Worker isolado: sem DOM, sem rede, sem armazenamento do
// navegador. O Hestia chama cada função EXPORTADA quando o manifesto a cita (campo "ref" ou "handler").
//
// Regras de ouro:
//  1. Toda porta de `ctx` é ASSÍNCRONA: use `await`.
//  2. `ctx.model` e `ctx.data` só existem se o usuário CONCEDEU a permissão correspondente (model.read, model.write,
//     plugindata.rw). Teste a existência antes de usar (`if (!ctx.model?.read) ...`).
//  3. Unidades do modelo: comprimento em metro (m), área em metro quadrado (m2), ângulo em radiano (rad).
//  4. Para alterar o projeto, devolva comandos a `ctx.model.apply(rotulo, comandos)`; nunca há acesso direto ao projeto.
//  5. Não registre dados do modelo no log (`ctx.log`): o log só aparece no gerenciador, mas pode ser copiado.

/** @typedef {import('./hestia-plugin').HestiaContext} Ctx */

/**
 * Função opcional chamada quando o suplemento é ativado. Se lançar erro, o suplemento fica no estado "falhou".
 * @param {Ctx} ctx
 */
export async function activate(ctx) {
  ctx.log.info('ativado');
}

/**
 * Handler do comando "Contar elementos" (botão na aba Suplementos e busca de comandos).
 * O que a função devolve é mostrado numa caixa de resultado: texto, ou { title, message } com textos { pt, en }.
 * @param {Ctx} ctx
 */
export async function ola(ctx) {
  if (!ctx.model?.read) return { message: { pt: 'Falta a permissão "Ler o modelo".', en: 'The "Read the model" permission is missing.' } };
  const projeto = await ctx.model.read(); // cópia imutável do projeto
  const total = Object.keys(projeto.elements).length;
  ctx.log.info(`elementos=${total}`);
  return {
    title: { pt: 'Contagem', en: 'Count' },
    message: { pt: `O projeto tem ${total} elemento(s).`, en: `The project has ${total} element(s).` },
  };
}
