import { LIMITES, editarConector, type Conector, type Escolha, type Familia, type LadoConector, type Parametro, type TipoParametro } from '@hestia/model';

/*
 * Helpers puros do diálogo de Encaixe (conectores e escolhas), sem React: rótulos dos lados, geração de id, conversão
 * do texto `aceita` para a lista e vice-versa, listagem de parâmetros e zonas que alimentam as escolhas, e a receita
 * de `folga` (a operação do modelo troca o texto, mas não remove o campo: texto vazio apaga).
 */

export const LADOS_CONECTOR: readonly LadoConector[] = ['esquerda', 'direita', 'frente', 'fundo', 'base', 'topo'];

export const ROTULO_LADO: Readonly<Record<LadoConector, string>> = {
  esquerda: 'Esquerda',
  direita: 'Direita',
  frente: 'Frente',
  fundo: 'Fundo',
  base: 'Base',
  topo: 'Topo',
};

/** Os mesmos tipos que `validarEncaixe` aceita para `escolhas[].parametro`. */
const TIPOS_DE_ESCOLHA: readonly TipoParametro[] = ['enum', 'booleano', 'inteiro'];

/** teto de valores listados para um `inteiro` com faixa (defesa contra faixas enormes travarem a interface). */
const MAX_OPCOES_LISTADAS = 64;

/** Parâmetros que podem alimentar uma escolha: `enum`, `booleano` ou `inteiro` sem fórmula (com fórmula o valor não é escolha do usuário). */
export function parametrosParaEscolha(f: Familia): Parametro[] {
  return f.parametros.filter((p) => p !== undefined && TIPOS_DE_ESCOLHA.includes(p.tipo) && p.formula === undefined);
}

/** Zonas clicáveis de uma escolha: os `grupo` das peças, na ordem da primeira aparição, sem repetição. */
export function zonasDaFamilia(f: Familia): string[] {
  const out: string[] = [];
  for (const peca of f.pecas) {
    const grupo = peca?.grupo;
    if (typeof grupo === 'string' && grupo !== '' && !out.includes(grupo)) out.push(grupo);
  }
  return out;
}

/** Motivo pelo qual ainda não dá para criar uma escolha nesta família; `null` quando dá. */
export function motivoNovoEscolha(f: Familia): string | null {
  if (parametrosParaEscolha(f).length === 0) return 'crie antes um parâmetro enum, booleano ou inteiro (sem fórmula) para a escolha usar';
  if (zonasDaFamilia(f).length === 0) return 'dê um grupo (zona) a alguma peça para a escolha apontar';
  return null;
}

/**
 * Opções visíveis de um parâmetro de escolha: rótulos no `enum`, Sim/Não no `booleano`, a sequência de valores no
 * `inteiro` com faixa listável. Lista vazia = valor livre (inteiro sem faixa ou parâmetro que não é de escolha).
 */
export function opcoesDeParametro(p: Parametro): string[] {
  if (p.tipo === 'booleano') return ['Sim', 'Não'];
  if (p.tipo === 'enum') return (p.opcoes ?? []).map((o) => o?.rotulo ?? String(o?.valor ?? ''));
  if (p.tipo === 'inteiro') {
    if (p.min === undefined || p.max === undefined) return [];
    const inicio = Math.ceil(p.min);
    const fim = Math.floor(p.max);
    if (!(fim >= inicio) || fim - inicio + 1 > MAX_OPCOES_LISTADAS) return [];
    return Array.from({ length: fim - inicio + 1 }, (_, i) => String(inicio + i));
  }
  return [];
}

/** Texto da célula `aceita`: lista separada por vírgula; ausente ou vazia vira texto vazio (= qualquer). */
export function textoDeAceita(aceita: readonly string[] | undefined): string {
  return (aceita ?? []).join(', ');
}

/** Texto separado por vírgula → lista sem brancos nem repetidos; texto vazio vira `[]` (o modelo trata como "qualquer"). */
export function aceitaDoTexto(texto: string): string[] {
  const out: string[] = [];
  for (const parte of texto.split(',')) {
    const limpo = parte.trim();
    if (limpo !== '' && !out.includes(limpo)) out.push(limpo);
  }
  return out;
}

function proximoId(prefixo: string, usados: Iterable<string>): string {
  const ocupados = new Set(usados);
  let n = 1;
  while (ocupados.has(`${prefixo}_${n}`)) n++;
  return `${prefixo}_${n}`;
}

/** Id livre para um conector novo (`conector_1`, `conector_2`, ...). */
export function proximoIdConector(f: Familia): string {
  return proximoId('conector', (f.conectores ?? []).map((c) => c?.id ?? ''));
}

/** Id livre para uma escolha nova (`escolha_1`, ...). */
export function proximoIdEscolha(f: Familia): string {
  return proximoId('escolha', (f.escolhas ?? []).map((e) => e?.id ?? ''));
}

export function conectorNovo(id: string, nome: string, lado: LadoConector): Conector {
  return { id, nome, lado, etiqueta: '' };
}

export function escolhaNova(id: string, nome: string, parametro: string, zona: string): Escolha {
  return { id, nome, parametro, zona };
}

/**
 * Grava a fórmula `folga` do conector (mm): texto vai por `editarConector`; texto vazio REMOVE o campo (a operação do
 * modelo não apaga campos), e nada acima de `LIMITES.formula` caracteres é aceito.
 */
export function escreverFolga(f: Familia, id: string, texto: string): string | null {
  const limpo = texto.trim();
  if (limpo !== '') {
    if (limpo.length > LIMITES.formula) return `a fórmula passa de ${LIMITES.formula} caracteres`;
    return editarConector(f, id, { folga: limpo });
  }
  const alvo = (Array.isArray(f.conectores) ? f.conectores : []).find((c) => c?.id === id);
  if (alvo === undefined) return `conector “${id}” não existe`;
  delete alvo.folga;
  return null;
}
