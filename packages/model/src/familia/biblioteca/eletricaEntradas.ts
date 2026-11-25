import { bitolaNumerica } from '../catalogoMep.ts';
import { KRONA_ELETRICA } from '../catalogosMep/kronaEletrica.ts';
import type { Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { ligacaoEletrica } from './eletricaApoio.ts';
import { buscaDn } from './tuboEsgotoApoio.ts';

/*
 * Entradas de eletroduto dos dispositivos elétricos (tomada, interruptor, luminárias; ficha C8a). Antes elas tinham uma única ligação
 * (nos fundos, diâmetro da tabela genérica da F5): o eletroduto da Krona (catálogo, DN 20 a 32) nunca encaixava, nem pelo diâmetro
 * nem pela direção (o traçado em planta chega de lado ou de baixo, não pelo fundo). Aqui o diâmetro vem do catálogo da Krona pelo DN
 * do tipo e entram entradas laterais, no mesmo padrão das caixas de luz da Krona (esquerda, direita, topo e base). CONFERIR: o
 * catálogo não diz onde ficam as entradas dos dispositivos; as posições são suposição de modelagem, editáveis na família.
 */

/** Item do catálogo da Krona (elétrica) do eletroduto rígido soldável: a coluna D é o diâmetro externo (CONFERIR no PDF). */
const ITEM_ELETRODUTO = 'tubo_eletroduto_de_pvc_rigido_soldavel_3m';

/** Diâmetro (mm) da entrada: o D do eletroduto Krona da bitola `DN` do tipo (fórmula `busca` sobre o catálogo; bitola fora dele dá 0). */
export function diametroEntradaKrona(): string {
  const linhas = KRONA_ELETRICA.itens.find((i) => i.id === ITEM_ELETRODUTO)?.linhas ?? [];
  const tabela = linhas.flatMap((l) => {
    const dn = bitolaNumerica(l.bitola);
    const d = l.valores['D'];
    return dn !== null && d !== undefined ? [[dn, d] as const] : [];
  });
  return buscaDn('DN', tabela);
}

/** Lado de uma entrada: esquerda (−X), direita (+X), frente (−Y), topo (+Z) e base (−Z). O fundo (+Y) é a ligação `eletroduto` de cada família. */
export type LadoEntrada = 'esq' | 'dir' | 'frente' | 'topo' | 'base';

const ROTULO: Record<LadoEntrada, string> = { esq: 'esquerda', dir: 'direita', frente: 'frente', topo: 'topo', base: 'base' };

/**
 * Entradas de eletroduto nos `lados` pedidos. `z` é a altura do eixo das entradas laterais (expressão da família); topo e base usam
 * `zBase` e `zTopo`. Ids `eletroduto_<lado>`; todas com o diâmetro do catálogo da Krona e fluxo nos dois sentidos.
 */
export function entradasDeEletroduto(lados: readonly LadoEntrada[], z: string, zBase: string, zTopo: string): Ligacao[] {
  const pos: Record<LadoEntrada, [Ponto3, Ponto3]> = {
    esq: [['0', 'P / 2', z], ['-1', '0', '0']],
    dir: [['L', 'P / 2', z], ['1', '0', '0']],
    frente: [['L / 2', '0', z], ['0', '-1', '0']],
    topo: [['L / 2', 'P / 2', zTopo], ['0', '0', '1']],
    base: [['L / 2', 'P / 2', zBase], ['0', '0', '-1']],
  };
  return lados.map((lado) => ligacaoEletrica(`eletroduto_${lado}`, `Entrada de eletroduto: ${ROTULO[lado]} (CONFERIR)`, 'eletroduto', pos[lado][0], pos[lado][1], { diametro: diametroEntradaKrona() }));
}
