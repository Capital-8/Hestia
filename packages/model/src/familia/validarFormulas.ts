import { compilar } from './expressao.ts';
import type { Familia, Peca } from './tipos.ts';
import { listarCamposDeExpressao } from './validarCampos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Regra 6 da ficha E1-validar: toda expressão precisa compilar. A mensagem leva o motivo do `ErroExpressao` e o `onde`
 * vem de `validarCampos.ts`, que lista exatamente os campos conferidos (inclusive os pontos do contorno poligonal e as
 * usinagens). Contorno poligonal com menos de 3 pontos é um erro próprio, em `peca:x.contorno`.
 */
export function validarFormulas(f: Familia): Problema[] {
  const out: Problema[] = [];

  for (const peca of comoArray<Peca>(f.pecas)) {
    if (!ehObjeto(peca)) continue;
    const contorno = peca.contorno;
    if (ehObjeto(contorno) && contorno.tipo === 'poligono') {
      const pontos = comoArray<unknown>(contorno.pontos);
      if (pontos.length < 3) {
        out.push(criarProblema(
          'formula',
          `contorno poligonal precisa de pelo menos 3 pontos (tem ${pontos.length})`,
          `peca:${texto(peca.id)}.contorno`,
        ));
      }
    }
  }

  for (const campo of listarCamposDeExpressao(f)) {
    if (!campo.obrigatorio && campo.valor === undefined) continue;
    if (typeof campo.valor !== 'string') {
      out.push(criarProblema('formula', 'expressão ausente ou que não é texto', campo.onde));
      continue;
    }
    const compilado = compilar(campo.valor);
    if ('erro' in compilado) {
      out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo.onde));
    }
  }

  return out;
}
