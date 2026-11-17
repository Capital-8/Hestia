// Suplemento de exemplo "Assistente (exemplo de IA)" (runtime script; permissões model.read, model.write e ui.*).
//
// NÃO chama nenhuma IA: transforma uma frase simples ("sala 4x5", em metros) em comandos por REGRA FIXA, só para provar
// o fluxo ponta a ponta de um suplemento de IA no Hestia:
//   1. o handler `interpretar` devolve { proposal: { label, commands, note } };
//   2. o Hestia ENSAIA o lote numa cópia do projeto e mostra a prévia (criados, alterados, apagados, erros);
//   3. só depois do clique em "Aplicar" o lote entra no projeto, como UM passo de Desfazer.
// O suplemento nunca aplica nada sozinho: `ctx.model.apply` não é usado aqui. Toda porta do host é ASSÍNCRONA: use `await`.
//
// COMO UM PLUGIN REAL CONECTARIA UM MODELO DE LINGUAGEM (resumo; detalhes em docs/plugins/08-suplementos-v2.md):
//   - Rede: só pela permissão `net.fetch`, que a tabela de permissões da V2 prevê mas HOJE o Hestia RECUSA (não está
//     habilitada). Enquanto ela não existir, um suplemento real de IA seria um plugin de PROCESSO EXTERNO (com token de
//     pareamento) que fala com o modelo por conta própria e devolve a proposta ao Hestia.
//   - Substitua a função `interpretarFrase` por: montar o pedido (a frase + um resumo do modelo lido com `model.read`),
//     chamar o modelo, e converter a resposta em comandos da lista branca (`addWall`, `updateElements`, ...), pedindo os
//     ids novos com `ctx.model.newId`. A resposta do modelo é dado NÃO confiável: o host revalida tudo no ensaio.
//   - Nada muda no resto: a prévia obrigatória, o "Aplicar" e o Desfazer são do Hestia e não podem ser desligados.

const LADO_MAX = 100; // metros

/** Reconhece "sala 4x5" ou "sala 3,5 x 4" (metros). Devolve { largura, profundidade } ou null. */
export function interpretarFrase(frase) {
  const m = /^\s*sala\s+(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(String(frase ?? ''));
  if (!m) return null;
  const [largura, profundidade] = [m[1], m[2]].map((n) => Number(n.replace(',', '.')));
  if (!(largura >= 0.5 && largura <= LADO_MAX && profundidade >= 0.5 && profundidade <= LADO_MAX)) return null;
  return { largura, profundidade };
}

export async function interpretar(ctx, valores) {
  const sala = interpretarFrase(valores?.frase);
  if (!sala) {
    return {
      title: { pt: 'Assistente', en: 'Assistant' },
      message: {
        pt: 'Não entendi. Tente "sala 4x5" (largura x profundidade, em metros, de 0,5 a 100).',
        en: 'I did not understand. Try "sala 4x5" (width x depth in meters, 0.5 to 100).',
      },
    };
  }
  const projeto = await ctx.model.read();
  const nivel = projeto.levels?.[0]?.id;
  const tipo = Object.keys(projeto.wallTypes ?? {})[0];
  if (!nivel || !tipo) throw new Error('o projeto precisa de um nível e de um tipo de parede');
  const { largura: w, profundidade: d } = sala;
  const cantos = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }];
  const comandos = [];
  for (let i = 0; i < 4; i++) {
    const id = await ctx.model.newId('w');
    comandos.push({
      type: 'addWall',
      wall: {
        id, kind: 'wall', typeId: tipo, levelId: nivel, a: cantos[i], b: cantos[(i + 1) % 4],
        baseOffset: 0, topLevelId: null, height: 2.8, topOffset: 0,
        attachBottomToFloor: false, attachTopToFloor: false, attachTopToRoof: false,
        locationLine: 'wallCenter', flipped: false, noJoinStart: false, noJoinEnd: false,
        joinStart: { kind: 'butt', flip: false }, joinEnd: { kind: 'butt', flip: false },
        sag: 0, topProfile: null, mark: '', comments: '',
      },
    });
  }
  return { proposal: { label: `Sala ${w} x ${d} m`, commands: comandos, note: `Regra fixa (sem IA): "sala LxP" vira 4 paredes de ${w} x ${d} m a partir da origem.` } };
}
