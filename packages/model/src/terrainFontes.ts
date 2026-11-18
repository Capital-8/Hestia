import { t, type Lang } from './i18n.ts';
import { copiaCurva, normalizarBorda } from './terrain.ts';
import type { OpTerreno, Terrain } from './terrainTypes.ts';

/** Índice inteiro dentro de `0 ≤ i < n`; senão lança com o número da operação (1 a partir de 1). */
function indice(i: number, n: number, op: number, lang: Lang): number {
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new Error(t(lang, 'md_tn_cmd_indice', { n: op + 1 }));
  return i;
}

/**
 * Aplica a lista de operações às fontes do terreno, em sequência (A.3 item 4). Função pura: devolve o terreno novo e
 * não valida o resultado (quem chama roda `terrainIssue`). Índice fora da lista ou operação desconhecida lança.
 */
export function aplicarOpsFontes(tn: Terrain, ops: readonly OpTerreno[], lang: Lang = 'pt'): Terrain {
  let pontos = tn.pontos.slice();
  let curvas = tn.curvas.map(copiaCurva);
  let quebras = tn.quebras.map((q) => ({ xyz: q.xyz.slice() }));
  let borda = tn.borda?.slice();
  let linhasRotulo = tn.linhasRotulo.slice();
  let pontosCotados = tn.pontosCotados.slice();
  ops.forEach((o, n) => {
    switch (o.op) {
      case 'addPonto':
        pontos.push(o.x, o.y, o.z);
        break;
      case 'movePonto': {
        const k = indice(o.i, pontos.length / 3, n, lang) * 3;
        pontos.splice(k, 3, o.x, o.y, o.z);
        break;
      }
      case 'removePonto':
        pontos.splice(indice(o.i, pontos.length / 3, n, lang) * 3, 3);
        break;
      case 'addCurva':
        curvas.push({ z: o.z, xy: o.xy.slice(), fechada: o.fechada });
        break;
      case 'setCurvaZ':
        curvas[indice(o.i, curvas.length, n, lang)]!.z = o.z;
        break;
      case 'moveVerticeCurva': {
        const c = curvas[indice(o.i, curvas.length, n, lang)]!;
        const k = indice(o.j, c.xy.length / 2, n, lang) * 2;
        c.xy.splice(k, 2, o.x, o.y);
        break;
      }
      case 'removeCurva':
        curvas.splice(indice(o.i, curvas.length, n, lang), 1);
        break;
      case 'addQuebra':
        quebras.push({ xyz: o.xyz.slice() });
        break;
      case 'moveVerticeQuebra': {
        const q = quebras[indice(o.i, quebras.length, n, lang)]!;
        const k = indice(o.j, q.xyz.length / 3, n, lang) * 3;
        q.xyz.splice(k, 3, o.x, o.y, o.z);
        break;
      }
      case 'removeQuebra':
        quebras.splice(indice(o.i, quebras.length, n, lang), 1);
        break;
      case 'setBorda':
        borda = o.xy === null ? undefined : normalizarBorda(o.xy);
        break;
      case 'setLinhasRotulo':
        linhasRotulo = o.v.slice();
        break;
      case 'setPontosCotados':
        pontosCotados = o.v.slice();
        break;
      case 'substituirFontes':
        pontos = o.pontos.slice();
        curvas = o.curvas.map(copiaCurva);
        quebras = o.quebras.map((q) => ({ xyz: q.xyz.slice() }));
        break;
      default:
        throw new Error(t(lang, 'md_tn_cmd_op', { n: n + 1 }));
    }
  });
  const { borda: _borda, ...sem } = tn;
  return { ...sem, pontos, curvas, quebras, ...(borda ? { borda } : {}), linhasRotulo, pontosCotados };
}
