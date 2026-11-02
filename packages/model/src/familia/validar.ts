import { ordemDeAvaliacao } from './grafo.ts';
import type { Familia } from './tipos.ts';
import { validarDuplicados, validarIds, validarLimites, validarObrigatorios } from './validarEstrutura.ts';
import { validarFormulas } from './validarFormulas.ts';
import { validarParametros } from './validarParametros.ts';
import { validarReferencias } from './validarReferencias.ts';
import { criarProblema, ehObjeto } from './validarComum.ts';

/*
 * Validação de uma família (ADR 0049 §3.6). FICHA E1-validar: implementar `validarFamilia`. Testes em `validar.test.ts`.
 * Esta fase NÃO avalia geometria (isso é a resolução, fase E2): só confere estrutura, limites, fórmulas e referências.
 * Nunca lança: entrada estranha vira `Problema`. Função pura.
 */

export type NivelProblema = 'erro' | 'aviso';
export type CodigoProblema = 'obrigatorio' | 'limite' | 'id_invalido' | 'id_duplicado' | 'tipo' | 'faixa' | 'formula' | 'referencia' | 'ciclo';

export interface Problema {
  nivel: NivelProblema;
  codigo: CodigoProblema;
  mensagem: string;
  /** Lugar do problema, no formato `categoria:id` ou `categoria:id.campo` (ver tabela abaixo). */
  onde: string;
}

/**
 * REGRAS (cada uma gera `Problema` de nível `erro`; a ordem do resultado segue a ordem desta lista e, dentro dela, a ordem
 * dos itens na família). `onde` entre parênteses.
 *
 * 1. obrigatorio — `L`, `A` e `P` existem, com `tipo` 'comprimento' e `escopo` 'instancia' ('parametro:L'). Falta ou
 *    divergência = erro. `unidade` precisa ser 'mm' e `versao` precisa ser FAMILIA_VERSAO ('familia').
 * 2. limite — mais itens que `LIMITES` em parametros, pecas, planos, aninhados, ferragens ou tipos ('familia'); expressão
 *    com mais de LIMITES.formula caracteres; `nome` de qualquer item com mais de LIMITES.nome ('peca:x.nome'); `repetir`
 *    que seja um número literal maior que LIMITES.repeticao ('peca:x.repetir').
 * 3. id_invalido — id fora de /^[A-Za-z_][A-Za-z0-9_]*$/ em parâmetro, plano, peça, aninhado, ferragem, tipo e usinagem;
 *    parâmetro ou plano com id reservado: `i`, `n` e os nomes de função (min max abs floor ceil round clamp sqrt).
 * 4. id_duplicado — id repetido na mesma categoria; parâmetros e planos dividem o mesmo espaço de nomes (as fórmulas os
 *    chamam pelo id). O segundo e os seguintes são apontados ('parametro:x').
 * 5. tipo / faixa — coerência dos parâmetros: `padrao` do tipo certo (comprimento e numero e inteiro = número finito; inteiro =
 *    inteiro; booleano = boolean; texto = string; enum e chapa = valor que está em `opcoes`; material = string não vazia);
 *    `enum` e `chapa` exigem `opcoes` não vazio; opção de `chapa` exige `esp` > 0; `min` <= `max`; `passo` > 0;
 *    `padrao` numérico dentro de [min, max] quando há; parâmetro com `formula` precisa ter `escopo` 'tipo' e `tipo` em
 *    comprimento/numero/inteiro/booleano (códigos 'tipo' para tipo/escopo/opcoes e 'faixa' para min/max/passo/padrão fora).
 *    Peça com `eixo` fora de x/y/z ou `papel` fora de PapelPeca = 'tipo' ('peca:x.eixo').
 * 6. formula — toda expressão compila (`compilar`). Campos conferidos e seus `onde`:
 *    parâmetro: formula ('parametro:x.formula'); plano: posicao ('plano:x.posicao'); peça: origem[0..2], tamanho[0..1],
 *    espessura, repetir, quando, contorno.pontos[k][0..1] ('peca:x.origem[0]', 'peca:x.tamanho[1]', 'peca:x.espessura',
 *    'peca:x.contorno[2][0]'...), usinagens[].posicao/diametro/largura/comprimento/profundidade (≠ 'passante')/quantidade/quando
 *    ('peca:x.usinagem:u.posicao[0]'); aninhado: valores (cada chave), origem[0..2], rotacao, repetir, quando
 *    ('aninhado:x.origem[1]', 'aninhado:x.valores.L'); ferragem: quantidade, quando ('ferragem:x.quantidade').
 *    A mensagem inclui o motivo do `ErroExpressao`. Contorno poligonal com menos de 3 pontos = erro 'formula' em 'peca:x.contorno'.
 * 7. referencia — nome usado numa fórmula que não existe no escopo: ids de parâmetros e de planos; `x.esp` só vale
 *    quando `x` é parâmetro de tipo 'chapa'; `i` e `n` só valem nas fórmulas de uma peça/aninhado que tenha `repetir`, e
 *    nunca no próprio `repetir`. Também: chave de `tipo.valores` que não é parâmetro sem fórmula; valor de tipo que
 *    não passa nas regras de tipo do parâmetro ('tipo:T.valores.x'); `tipoPadrao` que não é id de tipo ('familia').
 *    `peca.material` que coincide com id de parâmetro exige que ele seja 'material' ou 'chapa'; se não coincide com nenhum
 *    parâmetro é id de material do projeto e NÃO é conferido.
 * 8. ciclo — `ordemDeAvaliacao` com ciclo: UM erro 'ciclo' com os ids na mensagem ('familia').
 */
export function validarFamilia(f: Familia): Problema[] {
  if (!ehObjeto(f)) {
    return [criarProblema('tipo', 'a família precisa ser um objeto', 'familia')];
  }

  // A ordem das regras (e do resultado) é a da lista acima.
  return [
    ...validarObrigatorios(f),
    ...validarLimites(f),
    ...validarIds(f),
    ...validarDuplicados(f),
    ...validarParametros(f),
    ...validarFormulas(f),
    ...validarReferencias(f),
    ...validarCiclo(f),
  ];
}

/**
 * Regra 8: um único erro `ciclo` quando `ordemDeAvaliacao` acusa dependência circular. O grafo pode ainda ser o esqueleto
 * desta fase em paralelo; nesse caso (qualquer exceção) a regra fica silenciosa para não derrubar as demais.
 */
function validarCiclo(f: Familia): Problema[] {
  try {
    const resultado = ordemDeAvaliacao(f);
    if (resultado.ok) return [];
    return [criarProblema('ciclo', `ciclo de dependência entre: ${resultado.ciclo.join(' → ')}`, 'familia')];
  } catch {
    // TODO: depende de E1-grafo (o grafo deste worktree ainda é esqueleto).
    return [];
  }
}
