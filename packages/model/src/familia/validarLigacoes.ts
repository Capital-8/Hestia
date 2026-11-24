import { compilar, referencias } from './expressao.ts';
import type { Familia } from './tipos.ts';
import type { DominioLigacao, FluxoLigacao, SecaoLigacao } from './tiposLigacao.ts';
import { LIMITES_LIGACAO } from './tiposLigacao.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import { exigirPositivo, literal } from './validarPerfil.ts';
import type { Problema } from './validar.ts';

/*
 * Validação das ligações (CONTRATO §3, ADR 0061 §D3), regra 11 de `validarFamilia`. Só o que dá para conferir sem resolver:
 * ids, limites, domínio, seção com as medidas que ela exige, direção literal não nula, `aceita`, fluxo, propriedades,
 * `propagaParametro` e a sintaxe/referências das fórmulas. A resolução (posição em metros, direção normalizada) fica em
 * `corposLigacoes.ts`. Os ids das ligações têm espaço próprio (não dividem nomes com parâmetros, peças ou corpos).
 * Nunca lança: entrada estranha vira `Problema`.
 */

export const DOMINIOS_LIGACAO: readonly DominioLigacao[] = [
  'agua_fria', 'agua_quente', 'esgoto', 'ventilacao', 'pluvial', 'gas', 'incendio', 'eletrica_forca', 'eletrica_dados',
  'eletroduto', 'eletrocalha', 'ar_insuflamento', 'ar_retorno', 'refrigerante', 'estrutural',
];
const SECOES: readonly SecaoLigacao[] = ['redonda', 'retangular'];
const FLUXOS: readonly FluxoLigacao[] = ['entrada', 'saida', 'ambos'];
const TIPOS_PROPAGAVEIS = new Set(['comprimento', 'numero']);
const RESERVADOS = new Set(['i', 'n']);

/** Escopo de nomes das fórmulas de ligação: parâmetros e planos (e `x.esp` para chapa). Sem `i`/`n`: ligação não repete. */
interface Escopo {
  ids: Set<string>;
  chapas: Set<string>;
  instanciaNumerica: Set<string>;
}

export function validarLigacoes(f: Familia): Problema[] {
  if (f.ligacoes === undefined) return [];
  if (!Array.isArray(f.ligacoes)) return [criarProblema('tipo', 'ligacoes precisa ser uma lista', 'familia')];
  const ligacoes = comoArray<unknown>(f.ligacoes);

  const out: Problema[] = [];
  if (ligacoes.length > LIMITES_LIGACAO.ligacoes) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_LIGACAO.ligacoes} ligações`, 'familia'));
  }

  const escopo = escopoDeLigacoes(f);
  const vistos = new Set<string>();
  ligacoes.forEach((ligacao, k) => {
    if (!ehObjeto(ligacao)) {
      out.push(criarProblema('tipo', 'a ligação precisa ser um objeto', `ligacoes[${k}]`));
      return;
    }
    const onde = `ligacao:${texto(ligacao.id)}`;
    if (typeof ligacao.id !== 'string' || ligacao.id.trim() === '') {
      out.push(criarProblema('id_invalido', 'ligação sem id (o id precisa ser texto não vazio)', `ligacoes[${k}]`));
    } else if (vistos.has(ligacao.id)) {
      out.push(criarProblema('id_duplicado', `id “${ligacao.id}” já existe em outra ligação`, onde));
    } else {
      vistos.add(ligacao.id);
    }
    validarUmaLigacao(ligacao, onde, escopo, out);
  });
  return out;
}

function escopoDeLigacoes(f: Familia): Escopo {
  const ids = new Set<string>();
  const chapas = new Set<string>();
  const instanciaNumerica = new Set<string>();
  for (const p of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(p) || typeof p.id !== 'string') continue;
    ids.add(p.id);
    if (p.tipo === 'chapa') chapas.add(p.id);
    if (p.escopo === 'instancia' && typeof p.tipo === 'string' && TIPOS_PROPAGAVEIS.has(p.tipo)) instanciaNumerica.add(p.id);
  }
  for (const p of comoArray<unknown>(f.planos)) {
    if (ehObjeto(p) && typeof p.id === 'string') ids.add(p.id);
  }
  return { ids, chapas, instanciaNumerica };
}

function validarUmaLigacao(l: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (!DOMINIOS_LIGACAO.includes(l.dominio as DominioLigacao)) {
    out.push(criarProblema('tipo', `domínio desconhecido “${texto(l.dominio)}”`, `${onde}.dominio`));
  }
  if (!FLUXOS.includes(l.fluxo as FluxoLigacao)) {
    out.push(criarProblema('tipo', `fluxo desconhecido “${texto(l.fluxo)}”`, `${onde}.fluxo`));
  }

  validarSecao(l, onde, escopo, out);
  validarPosicaoEDirecao(l, onde, escopo, out);
  validarAceita(l, onde, out);
  validarPropriedades(l, onde, escopo, out);
  validarPropagacao(l, onde, escopo, out);

  if (l.quando !== undefined) validarFormula(l.quando, `${onde}.quando`, escopo, out);
}

/** `secao` precisa ser conhecida e vir com as medidas que ela exige (CONTRATO §3). */
function validarSecao(l: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (!SECOES.includes(l.secao as SecaoLigacao)) {
    out.push(criarProblema('tipo', `seção desconhecida “${texto(l.secao)}”`, `${onde}.secao`));
    return;
  }
  if (l.secao === 'redonda') {
    exigirMedida(l.diametro, `${onde}.diametro`, escopo, out);
  } else {
    exigirMedida(l.largura, `${onde}.largura`, escopo, out);
    exigirMedida(l.altura, `${onde}.altura`, escopo, out);
  }
}

function exigirMedida(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'medida obrigatória para esta seção', campo));
    return;
  }
  if (typeof valor !== 'string') {
    out.push(criarProblema('tipo', 'medida precisa ser texto (número ou fórmula)', campo));
    return;
  }
  exigirPositivo(valor, campo, out);
  validarFormula(valor, campo, escopo, out);
}

/** `posicao` e `direcao` são ternas de fórmulas; direção literal toda zero não define sentido (vetor nulo). */
function validarPosicaoEDirecao(l: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  const posicao = comoArray<unknown>(l.posicao);
  if (l.posicao === undefined) {
    out.push(criarProblema('obrigatorio', 'posição ausente', `${onde}.posicao`));
  } else if (!Array.isArray(l.posicao) || posicao.length !== 3) {
    out.push(criarProblema('tipo', 'posição precisa de 3 coordenadas', `${onde}.posicao`));
  } else {
    posicao.forEach((v, j) => validarFormula(v, `${onde}.posicao[${j}]`, escopo, out));
  }

  const direcao = comoArray<unknown>(l.direcao);
  if (l.direcao === undefined) {
    out.push(criarProblema('obrigatorio', 'direção ausente', `${onde}.direcao`));
    return;
  }
  if (!Array.isArray(l.direcao) || direcao.length !== 3) {
    out.push(criarProblema('tipo', 'direção precisa de 3 componentes', `${onde}.direcao`));
    return;
  }
  direcao.forEach((v, j) => validarFormula(v, `${onde}.direcao[${j}]`, escopo, out));
  const literais = direcao.map((v) => literal(v));
  if (literais.every((n) => n !== undefined) && literais.every((n) => n === 0)) {
    out.push(criarProblema('faixa', 'direção nula (vetor zero não aponta para lado nenhum)', `${onde}.direcao`));
  }
}

/** `aceita` é lista de domínios válidos; ausente vale `[dominio]` (decidido na resolução). */
function validarAceita(l: Record<string, unknown>, onde: string, out: Problema[]): void {
  if (l.aceita === undefined) return;
  if (!Array.isArray(l.aceita)) {
    out.push(criarProblema('tipo', 'aceita precisa ser uma lista de domínios', `${onde}.aceita`));
    return;
  }
  comoArray<unknown>(l.aceita).forEach((d, k) => {
    if (!DOMINIOS_LIGACAO.includes(d as DominioLigacao)) {
      out.push(criarProblema('tipo', `domínio desconhecido “${texto(d)}” em aceita`, `${onde}.aceita[${k}]`));
    }
  });
}

/** `propriedades` são fórmulas numéricas (vazão, pressão, potência...); limite de quantas. */
function validarPropriedades(l: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (l.propriedades === undefined) return;
  if (!ehObjeto(l.propriedades)) {
    out.push(criarProblema('tipo', 'propriedades precisa ser um objeto', `${onde}.propriedades`));
    return;
  }
  const chaves = Object.keys(l.propriedades);
  if (chaves.length > LIMITES_LIGACAO.propriedades) {
    out.push(criarProblema('limite', `a ligação passa de ${LIMITES_LIGACAO.propriedades} propriedades`, `${onde}.propriedades`));
  }
  for (const chave of chaves.slice(0, LIMITES_LIGACAO.propriedades)) {
    validarFormula(l.propriedades[chave], `${onde}.propriedades.${chave}`, escopo, out);
  }
}

/** `propagaParametro` aponta para parâmetro de escopo `instancia` e tipo `comprimento` ou `numero`. */
function validarPropagacao(l: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (l.propagaParametro === undefined) return;
  const campo = `${onde}.propagaParametro`;
  if (typeof l.propagaParametro !== 'string') {
    out.push(criarProblema('tipo', 'propagaParametro precisa ser o id de um parâmetro', campo));
    return;
  }
  if (!escopo.ids.has(l.propagaParametro)) {
    out.push(criarProblema('referencia', `“${l.propagaParametro}” não é parâmetro da família`, campo));
    return;
  }
  if (!escopo.instanciaNumerica.has(l.propagaParametro)) {
    out.push(criarProblema('tipo', `“${l.propagaParametro}” precisa ser parâmetro de instância do tipo comprimento ou numero`, campo));
  }
}

/** Fórmula de ligação: compila e só usa nomes do escopo (sem `i`/`n`, pois ligação não repete). */
function validarFormula(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (typeof valor !== 'string') {
    out.push(criarProblema('tipo', 'expressão precisa ser texto', campo));
    return;
  }
  const compilado = compilar(valor);
  if ('erro' in compilado) {
    out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo));
    return;
  }
  for (const nome of referencias(compilado.no)) {
    if (!referenciaValida(nome, escopo)) out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo));
  }
}

function referenciaValida(nome: string, escopo: Escopo): boolean {
  if (RESERVADOS.has(nome)) return false;
  if (escopo.ids.has(nome)) return true;
  const partes = nome.split('.');
  return partes.length === 2 && partes[1] === 'esp' && partes[0] !== undefined && escopo.chapas.has(partes[0]);
}
