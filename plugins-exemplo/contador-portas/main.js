// Suplemento de exemplo "Contador de portas" (runtime script, permissão model.read).
// O script roda num Worker sem DOM e sem rede. Toda porta do host é ASSÍNCRONA: use `await`.
// O handler devolve { title, message } (textos { pt, en }); o Hestia mostra o resultado numa caixa de diálogo.

/** Chamado pelo botão "Contar portas" da aba Suplementos (e pela busca de comandos). */
export async function contar(ctx) {
  const projeto = await ctx.model.read(); // cópia imutável do projeto (model.read)
  const elementos = Object.values(projeto.elements ?? {});
  const portas = elementos.filter((e) => e.kind === 'door').length;
  const janelas = elementos.filter((e) => e.kind === 'window').length;
  ctx.log.info(`portas=${portas} janelas=${janelas}`);
  return {
    title: { pt: 'Contador de portas', en: 'Door counter' },
    message: {
      pt: `O projeto tem ${portas} porta(s) e ${janelas} janela(s).`,
      en: `The project has ${portas} door(s) and ${janelas} window(s).`,
    },
  };
}
