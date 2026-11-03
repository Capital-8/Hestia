import type { Familia, Parametro, Peca, Valor } from './tipos.ts';

/*
 * Operações de EDIÇÃO da família (ADR 0049 §4.2). FICHA E4-edicao: implementar todas as funções abaixo. Testes em
 * `edicao.test.ts`. Funções puras sobre um RASCUNHO de `Familia` (objeto mutável, como o que o `HistoricoFamilia.exec` entrega):
 * alteram o objeto recebido e devolvem `null` (deu certo) ou o MOTIVO em português (nada foi alterado). Nunca lançam.
 * Quando o motivo é devolvido a família fica exatamente como estava. Mexa nas fórmulas só pelo texto, usando `compilar`,
 * `referencias` e `renomearNoTexto` de `./expressao.ts`; ids novos têm de passar em /^[A-Za-z_][A-Za-z0-9_]*$/ e não podem ser
 * reservados (`i`, `n`, nomes de função) nem repetir (parâmetros e planos dividem o espaço de nomes).
 */

export type CampoPeca = 'origem0' | 'origem1' | 'origem2' | 'tamanho0' | 'tamanho1' | 'espessura' | 'repetir' | 'quando';
export const CAMPOS_PECA: readonly CampoPeca[] = ['origem0', 'origem1', 'origem2', 'tamanho0', 'tamanho1', 'espessura', 'repetir', 'quando'];

/** Texto do campo de fórmula da peça; `undefined` para `repetir`/`quando` ausentes. */
export function lerCampo(p: Peca, c: CampoPeca): string | undefined {
  void p;
  void c;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Grava o texto no campo. Texto vazio (ou só espaços): em `repetir` e `quando` REMOVE o campo; nos demais é recusado
 * ("campo obrigatório"). A fórmula NÃO precisa compilar (o editor mostra o erro em vermelho), só não pode passar de LIMITES.formula.
 */
export function escreverCampo(f: Familia, pecaId: string, c: CampoPeca, texto: string): string | null {
  void f;
  void pecaId;
  void c;
  void texto;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Lugares (no formato de `Problema.onde`, ex. `peca:base.origem[0]`, `parametro:esp.formula`, `plano:pDir.posicao`,
 * `ferragem:x.quantidade`, `aninhado:n1.origem[2]`, `tipo:A60.valores.L`, `peca:x.material`) onde o NOME de parâmetro ou de plano
 * `nome` é usado: dentro de qualquer fórmula (inclusive como `nome.esp`), como chave de `tipo.valores`, ou como `peca.material`.
 * Sem repetição, na ordem em que aparecem (parâmetros, planos, peças, aninhados, ferragens, tipos). Não conta o próprio parâmetro.
 */
export function usosDoNome(f: Familia, nome: string): string[] {
  void f;
  void nome;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Renomeia um parâmetro ou plano: troca o id e reescreve TODAS as fórmulas que o usam (inclusive `velho.esp` → `novo.esp`), as
 * chaves de `tipo.valores`, `peca.material` e `tipoPadrao` não (é id de tipo). `L`, `A` e `P` não podem ser renomeados.
 * Erros: id novo inválido/reservado/repetido, `velho` inexistente, `velho` é L, A ou P.
 */
export function renomearParametro(f: Familia, velho: string, novo: string): string | null {
  void f;
  void velho;
  void novo;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Acrescenta o parâmetro ao fim. Erros: id inválido/reservado/repetido, limite de LIMITES.parametros, `padrao` de tipo errado para o `tipo`. */
export function adicionarParametro(f: Familia, p: Parametro): string | null {
  void f;
  void p;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Remove o parâmetro. Recusa se houver uso FORA de `tipo.valores` (filtre de `usosDoNome` os lugares que começam com `tipo:`): o motivo
 * lista até 3 lugares ("em uso: peca:base.origem[0], …"). Recusa também L, A e P. Remove a chave dele em todos os `tipo.valores`.
 */
export function excluirParametro(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Acrescenta a peça ao fim. Erros: id inválido/repetido, limite de LIMITES.pecas. */
export function adicionarPeca(f: Familia, p: Peca): string | null {
  void f;
  void p;
  throw new Error('não implementado: ficha E4-edicao');
}

export function excluirPeca(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Duplica a peça logo depois da original, com id novo (`<id>_2`, `<id>_3`… o primeiro livre) e nome `<nome> (cópia)`, copiando
 * tudo (cópia profunda). Devolve o erro; o id novo fica em `f.pecas[índice+1].id`.
 */
export function duplicarPeca(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Move a peça `delta` posições na lista (limitado às pontas; delta 0 não muda nada). Erro: peça inexistente. */
export function moverPecaNaLista(f: Familia, id: string, delta: number): string | null {
  void f;
  void id;
  void delta;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Cria uma cópia ESPELHADA em X (em torno do plano central da família, x = L / 2) logo depois da original: id `<id>_esp` (primeiro
 * livre com sufixo numérico se já existir), nome `<nome> (espelhada)`. Nova origem X = `L - (<origem0>) - (<extensão X>)` onde a
 * extensão X é: eixo x → `espessura`; eixo y ou z → `tamanho0`. Demais campos copiados. Se a peça tem `contorno` poligonal em eixo
 * y ou z, devolve o erro "espelhar peça com contorno poligonal ainda não é suportado" e não altera nada.
 */
export function espelharPecaEmX(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Arranjo linear: faz a peça se repetir `n` vezes com `passo` entre cópias ao longo de `eixo` ('x' | 'y' | 'z'): `repetir = n`
 * e a origem naquele eixo vira `(<origem atual>) + (i - 1) * (<passo>)`. Se a peça já tinha `repetir`, recusa ("a peça já se
 * repete"). `n` e `passo` são fórmulas e precisam compilar; `n` não pode usar `i`/`n`.
 */
export function arranjoLinear(f: Familia, id: string, eixo: 'x' | 'y' | 'z', n: string, passo: string): string | null {
  void f;
  void id;
  void eixo;
  void n;
  void passo;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Promove uma cota a parâmetro (estilo "etiquetar cota" do Revit). Pega o texto atual do campo e cria o parâmetro `novoId`:
 *  - texto que é só um número (ex. "80", "0.5"): parâmetro 'comprimento' de escopo 'tipo' com `padrao` = o número, `min` 0,
 *    `max` 10000 e `passo` 1 (nome = `nome`);
 *  - qualquer outra fórmula: parâmetro 'numero' de escopo 'tipo', `padrao` 0, `formula` = o texto, grupo 'Derivados';
 * e troca o campo da peça pelo `novoId`. Erros: peça/campo inexistente, `repetir`/`quando` (não promovíveis: "só medidas podem virar
 * parâmetro"), id inválido/reservado/repetido, limite de parâmetros. Em erro nada muda.
 */
export function promoverParaParametro(f: Familia, pecaId: string, campo: CampoPeca, novoId: string, nome: string): string | null {
  void f;
  void pecaId;
  void campo;
  void novoId;
  void nome;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Cria o tipo `nome` (id = nome normalizado: minúsculas sem acento, `[^a-z0-9]+` → `_`, sem `_` nas pontas, único com sufixo `_2`…) com `valores` vazios. Erros: nome vazio, limite de LIMITES.tipos. */
export function adicionarTipo(f: Familia, nome: string): string | null {
  void f;
  void nome;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Duplica o tipo (valores copiados) logo depois, com nome `<nome> (cópia)` e id único. */
export function duplicarTipo(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/** Remove o tipo (pode ser o único); se era o `tipoPadrao`, `tipoPadrao` passa a ser o primeiro tipo restante (ou a chave some se não restar nenhum). */
export function excluirTipo(f: Familia, id: string): string | null {
  void f;
  void id;
  throw new Error('não implementado: ficha E4-edicao');
}

/**
 * Define o valor de um parâmetro num tipo; `valor` indefinido REMOVE a chave (volta ao padrão). Erros: tipo/parâmetro inexistente,
 * parâmetro com fórmula, valor de tipo errado para o parâmetro (mesmas regras do `padrao`), valor fora das opções (enum/chapa),
 * fora de [min, max] para números.
 */
export function definirValorDeTipo(f: Familia, tipoId: string, paramId: string, valor: Valor | undefined): string | null {
  void f;
  void tipoId;
  void paramId;
  void valor;
  throw new Error('não implementado: ficha E4-edicao');
}
