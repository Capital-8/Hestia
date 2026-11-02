import type { Aninhado, Familia, Ferragem, Parametro, Peca, PlanoReferencia, Usinagem } from './tipos.ts';
import { comoArray, ehObjeto, texto } from './validarComum.ts';

/*
 * Lista todos os campos de expressão de uma família, com o `onde` que a regra 6 manda usar. As regras 2 (tamanho) e 7
 * (referências) reaproveitam a mesma lista para não divergirem dos campos conferidos na compilação.
 *
 * `permiteIN` diz se a fórmula pode usar `i` e `n`: só nas fórmulas de uma peça ou aninhado que tenha `repetir`, e nunca
 * no próprio `repetir`.
 */

export interface CampoExpressao {
  onde: string;
  valor: unknown;
  obrigatorio: boolean;
  permiteIN: boolean;
}

const campo = (onde: string, valor: unknown, obrigatorio: boolean, permiteIN = false): CampoExpressao =>
  ({ onde, valor, obrigatorio, permiteIN });

export function listarCamposDeExpressao(f: Familia): CampoExpressao[] {
  const out: CampoExpressao[] = [];

  for (const p of comoArray<Parametro>(f.parametros)) {
    if (ehObjeto(p) && p.formula !== undefined) {
      out.push(campo(`parametro:${texto(p.id)}.formula`, p.formula, false));
    }
  }

  for (const p of comoArray<PlanoReferencia>(f.planos)) {
    out.push(campo(`plano:${texto(p?.id)}.posicao`, p?.posicao, true));
  }

  for (const p of comoArray<Peca>(f.pecas)) {
    const base = `peca:${texto(p?.id)}`;
    const repetir = ehObjeto(p) ? p.repetir : undefined;
    const permiteIN = repetir !== undefined;

    const origem = comoArray<unknown>(ehObjeto(p) ? p.origem : undefined);
    for (let i = 0; i < 3; i++) out.push(campo(`${base}.origem[${i}]`, origem[i], true, permiteIN));

    const tamanho = comoArray<unknown>(ehObjeto(p) ? p.tamanho : undefined);
    for (let i = 0; i < 2; i++) out.push(campo(`${base}.tamanho[${i}]`, tamanho[i], true, permiteIN));

    out.push(campo(`${base}.espessura`, ehObjeto(p) ? p.espessura : undefined, true, permiteIN));

    if (repetir !== undefined) out.push(campo(`${base}.repetir`, repetir, false));
    if (ehObjeto(p) && p.quando !== undefined) out.push(campo(`${base}.quando`, p.quando, false, permiteIN));

    const contorno = ehObjeto(p) ? p.contorno : undefined;
    if (ehObjeto(contorno) && contorno.tipo === 'poligono') {
      const pontos = comoArray<unknown>(contorno.pontos);
      if (pontos.length >= 3) {
        pontos.forEach((ponto, k) => {
          const par = comoArray<unknown>(ponto);
          for (let j = 0; j < 2; j++) {
            out.push(campo(`${base}.contorno[${k}][${j}]`, par[j], true, permiteIN));
          }
        });
      }
    }

    for (const u of comoArray<Usinagem>(ehObjeto(p) ? p.usinagens : undefined)) {
      const ub = `${base}.usinagem:${texto(u?.id)}`;
      const posicao = comoArray<unknown>(ehObjeto(u) ? u.posicao : undefined);
      for (let i = 0; i < 2; i++) out.push(campo(`${ub}.posicao[${i}]`, posicao[i], true, permiteIN));
      if (ehObjeto(u) && u.diametro !== undefined) out.push(campo(`${ub}.diametro`, u.diametro, false, permiteIN));
      if (ehObjeto(u) && u.largura !== undefined) out.push(campo(`${ub}.largura`, u.largura, false, permiteIN));
      if (ehObjeto(u) && u.comprimento !== undefined) out.push(campo(`${ub}.comprimento`, u.comprimento, false, permiteIN));
      if (ehObjeto(u) && u.profundidade !== 'passante') {
        out.push(campo(`${ub}.profundidade`, u.profundidade, true, permiteIN));
      }
      if (ehObjeto(u) && u.quantidade !== undefined) out.push(campo(`${ub}.quantidade`, u.quantidade, false, permiteIN));
      if (ehObjeto(u) && u.quando !== undefined) out.push(campo(`${ub}.quando`, u.quando, false, permiteIN));
    }
  }

  for (const a of comoArray<Aninhado>(f.aninhados)) {
    const base = `aninhado:${texto(a?.id)}`;
    const repetir = ehObjeto(a) ? a.repetir : undefined;
    const permiteIN = repetir !== undefined;

    const valores = ehObjeto(a) ? a.valores : undefined;
    if (ehObjeto(valores)) {
      for (const [chave, valor] of Object.entries(valores)) {
        out.push(campo(`${base}.valores.${chave}`, valor, true, permiteIN));
      }
    } else {
      out.push(campo(`${base}.valores`, valores, true));
    }

    const origem = comoArray<unknown>(ehObjeto(a) ? a.origem : undefined);
    for (let i = 0; i < 3; i++) out.push(campo(`${base}.origem[${i}]`, origem[i], true, permiteIN));

    if (repetir !== undefined) out.push(campo(`${base}.repetir`, repetir, false));
    if (ehObjeto(a) && a.rotacao !== undefined) out.push(campo(`${base}.rotacao`, a.rotacao, false, permiteIN));
    if (ehObjeto(a) && a.quando !== undefined) out.push(campo(`${base}.quando`, a.quando, false, permiteIN));
  }

  for (const fe of comoArray<Ferragem>(f.ferragens)) {
    const base = `ferragem:${texto(fe?.id)}`;
    out.push(campo(`${base}.quantidade`, fe?.quantidade, true));
    if (ehObjeto(fe) && fe.quando !== undefined) out.push(campo(`${base}.quando`, fe.quando, false));
  }

  return out;
}
