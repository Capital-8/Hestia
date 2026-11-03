import { renomearNoTexto } from './expressao.ts';
import { adicionarParametro, excluirParametro } from './edicaoParametros.ts';
import {
  idReservado,
  idValido,
  idsOcupados,
  lista,
  percorrerFamilia,
  usosDoNomeEm,
} from './edicaoApoio.ts';
import {
  LIMITES,
  PARAMETROS_PADRAO,
  type Familia,
  type Parametro,
  type Peca,
  type Tipo,
} from './tipos.ts';

export { adicionarParametro, excluirParametro };
export { adicionarPeca, arranjoLinear, duplicarPeca, espelharPecaEmX, excluirPeca, moverPecaNaLista } from './edicaoPecas.ts';
export { adicionarTipo, definirValorDeTipo, duplicarTipo, excluirTipo } from './edicaoTipos.ts';

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
  if (!p || typeof p !== 'object') return undefined;
  switch (c) {
    case 'origem0': return Array.isArray(p.origem) ? p.origem[0] : undefined;
    case 'origem1': return Array.isArray(p.origem) ? p.origem[1] : undefined;
    case 'origem2': return Array.isArray(p.origem) ? p.origem[2] : undefined;
    case 'tamanho0': return Array.isArray(p.tamanho) ? p.tamanho[0] : undefined;
    case 'tamanho1': return Array.isArray(p.tamanho) ? p.tamanho[1] : undefined;
    case 'espessura': return p.espessura;
    case 'repetir': return p.repetir;
    case 'quando': return p.quando;
  }
}

function aplicarCampo(p: Peca, c: CampoPeca, texto: string): string | null {
  switch (c) {
    case 'origem0':
    case 'origem1':
    case 'origem2': {
      if (!Array.isArray(p.origem)) return 'a peça não tem origem';
      p.origem[Number(c.slice(-1))] = texto;
      return null;
    }
    case 'tamanho0':
    case 'tamanho1': {
      if (!Array.isArray(p.tamanho)) return 'a peça não tem tamanho';
      p.tamanho[Number(c.slice(-1))] = texto;
      return null;
    }
    case 'espessura': p.espessura = texto; return null;
    case 'repetir': p.repetir = texto; return null;
    case 'quando': p.quando = texto; return null;
  }
}

/**
 * Grava o texto no campo. Texto vazio (ou só espaços): em `repetir` e `quando` REMOVE o campo; nos demais é recusado
 * ("campo obrigatório"). A fórmula NÃO precisa compilar (o editor mostra o erro em vermelho), só não pode passar de LIMITES.formula.
 */
export function escreverCampo(f: Familia, pecaId: string, c: CampoPeca, texto: string): string | null {
  const peca = lista<Peca>(f.pecas).find((p) => p?.id === pecaId);
  if (peca === undefined) return `peça “${pecaId}” não existe`;

  const limpo = texto.trim();
  if (limpo === '') {
    if (c === 'repetir' || c === 'quando') {
      delete peca[c];
      return null;
    }
    return 'campo obrigatório: informe uma fórmula';
  }
  if (limpo.length > LIMITES.formula) return `a fórmula passa de ${LIMITES.formula} caracteres`;
  return aplicarCampo(peca, c, limpo);
}

/**
 * Lugares (no formato de `Problema.onde`, ex. `peca:base.origem[0]`, `parametro:esp.formula`, `plano:pDir.posicao`,
 * `ferragem:x.quantidade`, `aninhado:n1.origem[2]`, `tipo:A60.valores.L`, `peca:x.material`) onde o NOME de parâmetro ou de plano
 * `nome` é usado: dentro de qualquer fórmula (inclusive como `nome.esp`), como chave de `tipo.valores`, ou como `peca.material`.
 * Sem repetição, na ordem em que aparecem (parâmetros, planos, peças, aninhados, ferragens, tipos). Não conta o próprio parâmetro.
 */
export function usosDoNome(f: Familia, nome: string): string[] {
  return usosDoNomeEm(f, nome);
}

/**
 * Renomeia um parâmetro ou plano: troca o id e reescreve TODAS as fórmulas que o usam (inclusive `velho.esp` → `novo.esp`), as
 * chaves de `tipo.valores`, `peca.material` e `tipoPadrao` não (é id de tipo). `L`, `A` e `P` não podem ser renomeados.
 * Erros: id novo inválido/reservado/repetido, `velho` inexistente, `velho` é L, A ou P.
 */
export function renomearParametro(f: Familia, velho: string, novo: string): string | null {
  if (!idValido(novo)) return `id inválido: “${novo}”`;
  if (idReservado(novo)) return `id reservado: “${novo}”`;
  if ((PARAMETROS_PADRAO as readonly string[]).includes(velho)) return `“${velho}” não pode ser renomeado`;
  if (!idsOcupados(f).has(velho)) return `“${velho}” não existe`;
  if (idsOcupados(f).has(novo)) return `id repetido: “${novo}”`;

  const parametro = lista<Parametro>(f.parametros).find((p) => p?.id === velho);
  const plano = lista(f.planos).find((p) => p?.id === velho);
  if (parametro !== undefined) parametro.id = novo;
  else if (plano !== undefined) plano.id = novo;

  percorrerFamilia(f, {
    formula: (_onde, texto, gravar) => {
      const trocado = renomearNoTexto(texto, velho, novo);
      if (trocado !== texto) gravar(trocado);
    },
  });

  for (const t of lista<Tipo>(f.tipos)) {
    const valores = t?.valores;
    if (valores === undefined || !Object.prototype.hasOwnProperty.call(valores, velho)) continue;
    valores[novo] = valores[velho]!;
    delete valores[velho];
  }

  for (const p of lista<Peca>(f.pecas)) {
    if (p?.material === velho) p.material = novo;
  }

  return null;
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
  const peca = lista<Peca>(f.pecas).find((p) => p?.id === pecaId);
  if (peca === undefined) return `peça “${pecaId}” não existe`;
  if (campo === 'repetir' || campo === 'quando') return 'só medidas podem virar parâmetro';
  if (!CAMPOS_PECA.includes(campo)) return `campo desconhecido: “${String(campo)}”`;

  const texto = lerCampo(peca, campo);
  if (texto === undefined) return 'o campo está vazio';
  const limpo = texto.trim();
  if (limpo === '') return 'o campo está vazio';

  const numero = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(limpo) && Number.isFinite(Number(limpo)) ? Number(limpo) : undefined;
  const parametro: Parametro = numero !== undefined
    ? { id: novoId, nome, tipo: 'comprimento', escopo: 'tipo', padrao: numero, min: 0, max: 10000, passo: 1 }
    : { id: novoId, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula: texto, grupo: 'Derivados' };

  const erro = adicionarParametro(f, parametro);
  if (erro !== null) return erro;

  const erroCampo = aplicarCampo(peca, campo, novoId);
  if (erroCampo !== null) {
    f.parametros.pop();
    return erroCampo;
  }

  return null;
}
