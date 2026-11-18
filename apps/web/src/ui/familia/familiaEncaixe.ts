import { LIMITES, compilar, editarConector, referencias, type Conector, type Escolha, type Familia, type LadoConector, type Parametro, type TipoParametro } from '@hestia/model';

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

/**
 * Conector criado pelo botão "+ Conector": lado `esquerda`, etiqueta `base` e `aceita` vazio ("qualquer").
 * A etiqueta nunca nasce vazia — o arquivo da família exige um texto não vazio e reimportaria com erro.
 */
export function conectorPadrao(id: string): Conector {
  return { id, nome: 'Novo conector', lado: 'esquerda', etiqueta: 'base', aceita: [] };
}

/** Motivo pelo qual a etiqueta digitada na célula não pode ser gravada (o arquivo da família exige texto não vazio); `null` quando vale. */
export function motivoEtiqueta(texto: string): string | null {
  return texto.trim() === '' ? 'A etiqueta não pode ficar vazia' : null;
}

export function escolhaNova(id: string, nome: string, parametro: string, zona: string): Escolha {
  return { id, nome, parametro, zona };
}

/**
 * Motivo pelo qual a fórmula de `folga` não pode ser gravada, em português; `null` quando está certa. Texto vazio (ou só
 * brancos) é válido: significa REMOVER a folga. Além de compilar, a fórmula só pode referenciar parâmetros existentes
 * (com o mesmo tratamento `x.esp` das outras fórmulas: `x.esp` só vale quando `x` é parâmetro `chapa`).
 */
export function validarFolga(texto: string, parametros: readonly Parametro[]): string | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  if (limpo.length > LIMITES.formula) return `a fórmula passa de ${LIMITES.formula} caracteres`;

  const compilada = compilar(limpo);
  if ('erro' in compilada) return compilada.erro.message;

  const nomes = new Set<string>();
  const chapas = new Set<string>();
  for (const p of parametros) {
    if (!p || typeof p.id !== 'string') continue;
    nomes.add(p.id);
    if (p.tipo === 'chapa') chapas.add(p.id);
  }

  for (const nome of referencias(compilada.no)) {
    const partes = nome.split('.');
    const base = partes[0] ?? '';
    const soNome = partes.length === 1 && nomes.has(base);
    const membro = partes.length === 2 && partes[1] === 'esp' && chapas.has(base);
    if (!soNome && !membro) return `“${nome}” não existe`;
  }
  return null;
}

/**
 * Grava a fórmula `folga` do conector (mm): valida com `validarFolga` antes de mexer (fórmula inválida ou parâmetro
 * inexistente é recusada e nada muda); texto vai por `editarConector`; texto vazio REMOVE o campo (a operação do modelo
 * não apaga campos).
 */
export function escreverFolga(f: Familia, id: string, texto: string): string | null {
  const limpo = texto.trim();
  if (limpo === '') {
    const alvo = (Array.isArray(f.conectores) ? f.conectores : []).find((c) => c?.id === id);
    if (alvo === undefined) return `conector “${id}” não existe`;
    delete alvo.folga;
    return null;
  }
  const motivo = validarFolga(limpo, f.parametros);
  if (motivo !== null) return motivo;
  return editarConector(f, id, { folga: limpo });
}
