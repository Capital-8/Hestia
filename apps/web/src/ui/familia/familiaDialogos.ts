import type { Escopo, Familia, OpcaoParametro, Parametro, Tipo, TipoParametro, Valor } from '@hestia/model';

/*
 * Helpers puros dos diálogos de Parâmetros e Tipos (sem React): rótulos, padrões iniciais, leitura de números e as receitas
 * de edição da lista de opções, que ainda não existem em `@hestia/model`.
 */

export const TIPOS_PARAMETRO: readonly TipoParametro[] = [
  'comprimento', 'numero', 'inteiro', 'booleano', 'texto', 'enum', 'chapa', 'material',
];

export const ROTULO_TIPO: Readonly<Record<TipoParametro, string>> = {
  comprimento: 'Comprimento',
  numero: 'Número',
  inteiro: 'Inteiro',
  booleano: 'Sim/Não',
  texto: 'Texto',
  enum: 'Enumeração',
  chapa: 'Chapa',
  material: 'Material',
};

export const ROTULO_ESCOPO: Readonly<Record<Escopo, string>> = {
  tipo: 'Tipo',
  instancia: 'Instância',
};

/** Mín, máx e passo só fazem sentido para medidas e contagens. */
export function temFaixa(tipo: TipoParametro): boolean {
  return tipo === 'comprimento' || tipo === 'numero' || tipo === 'inteiro';
}

/** A validação da família só aceita fórmula nestes tipos. */
export function aceitaFormula(tipo: TipoParametro): boolean {
  return tipo === 'comprimento' || tipo === 'numero' || tipo === 'inteiro' || tipo === 'booleano';
}

export function temOpcoes(tipo: TipoParametro): boolean {
  return tipo === 'enum' || tipo === 'chapa';
}

/** Valor padrão coerente com o tipo; em enum/chapa é a primeira opção criada. */
export function padraoInicial(tipo: TipoParametro, opcoes?: readonly OpcaoParametro[]): Valor {
  switch (tipo) {
    case 'comprimento':
    case 'numero':
    case 'inteiro':
      return 0;
    case 'booleano':
      return false;
    case 'enum':
    case 'chapa':
      return opcoes?.[0]?.valor ?? '';
    case 'texto':
      return '';
    case 'material':
      // `material` exige texto não vazio; sem cadastro do projeto, o id genérico serve de ponto de partida.
      return 'material';
  }
}

/** Opções iniciais de um parâmetro novo de enumeração/chapa (a ficha não pede opções no formulário). */
export function opcoesIniciais(tipo: TipoParametro): OpcaoParametro[] | undefined {
  if (tipo === 'enum') return [{ valor: 'opcao_1', rotulo: 'Opção 1' }];
  if (tipo === 'chapa') return [{ valor: 'chapa_1', rotulo: 'Chapa 1', esp: 18 }];
  return undefined;
}

export function parametroNovo(id: string, nome: string, tipo: TipoParametro, escopo: Escopo): Parametro {
  const idLimpo = id.trim();
  const nomeLimpo = nome.trim();
  const opcoes = opcoesIniciais(tipo);
  return {
    id: idLimpo,
    nome: nomeLimpo === '' ? idLimpo : nomeLimpo,
    tipo,
    escopo,
    padrao: padraoInicial(tipo, opcoes),
    ...(opcoes === undefined ? {} : { opcoes }),
  };
}

/** Valor que a célula de tipos mostra: o do tipo, ou o padrão do parâmetro quando o tipo não define. */
export function valorDoTipo(t: Tipo, p: Parametro): { valor: Valor; definido: boolean } {
  const definido = Object.prototype.hasOwnProperty.call(t.valores, p.id);
  return { valor: definido ? t.valores[p.id]! : p.padrao, definido };
}

/** Texto vazio → `undefined` (campo removido); texto não numérico → `null`; senão o número (aceita vírgula). */
export function lerNumeroOpcional(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Mantém o tipo original da opção: se ela já era número e o texto é numérico, continua número. */
function valorDeOpcao(texto: string, anterior: string | number): string | number {
  if (typeof anterior === 'number') {
    const n = lerNumeroOpcional(texto);
    if (n !== undefined && n !== null) return n;
  }
  return texto;
}

function proximoValorOpcao(opcoes: readonly OpcaoParametro[]): string {
  const usados = new Set(opcoes.map((o) => String(o?.valor)));
  let n = opcoes.length + 1;
  while (usados.has(`opcao_${n}`)) n++;
  return `opcao_${n}`;
}

/** Altera `valor`, `rótulo` ou, em chapa, `esp` (mm) de uma opção. Se o valor alterado for o padrão, o padrão acompanha. */
export function alterarOpcao(f: Familia, paramId: string, indice: number, campo: 'valor' | 'rotulo' | 'esp', texto: string): string | null {
  const alvo = f.parametros.find((p) => p?.id === paramId);
  if (alvo === undefined) return `parâmetro “${paramId}” não existe`;
  const opcoes = alvo.opcoes;
  if (!Array.isArray(opcoes)) return 'o parâmetro não tem opções';
  const opcao = opcoes[indice];
  if (opcao === undefined) return 'opção não existe';

  if (campo === 'valor') {
    const limpo = texto.trim();
    if (limpo === '') return 'o valor da opção não pode ficar vazio';
    const novo = valorDeOpcao(limpo, opcao.valor);
    if (opcoes.some((o, i) => i !== indice && String(o?.valor) === String(novo))) return `já existe uma opção “${String(novo)}”`;
    const antigo = opcao.valor;
    opcao.valor = novo;
    if (alvo.padrao === antigo) alvo.padrao = novo;
    for (const t of f.tipos) {
      if (t?.valores !== undefined && t.valores[paramId] === antigo) t.valores[paramId] = novo;
    }
    return null;
  }

  if (campo === 'rotulo') {
    const limpo = texto.trim();
    if (limpo === '') delete opcao.rotulo;
    else opcao.rotulo = limpo;
    return null;
  }

  if (alvo.tipo !== 'chapa') return 'só opções de chapa têm espessura';
  const esp = lerNumeroOpcional(texto);
  if (esp === undefined || esp === null) return 'informe a espessura em mm';
  if (esp <= 0) return 'a espessura precisa ser maior que zero';
  opcao.esp = esp;
  return null;
}

/** Acrescenta uma opção com valor único. Se era a primeira, ela vira o padrão. */
export function adicionarOpcao(f: Familia, paramId: string): string | null {
  const alvo = f.parametros.find((p) => p?.id === paramId);
  if (alvo === undefined) return `parâmetro “${paramId}” não existe`;
  if (!temOpcoes(alvo.tipo)) return 'só parâmetros de enumeração ou chapa têm opções';
  if (!Array.isArray(alvo.opcoes)) alvo.opcoes = [];
  const opcoes = alvo.opcoes;
  const valor = proximoValorOpcao(opcoes);
  const opcao: OpcaoParametro = alvo.tipo === 'chapa'
    ? { valor, rotulo: 'Nova chapa', esp: 18 }
    : { valor, rotulo: 'Nova opção' };
  opcoes.push(opcao);
  if (opcoes.length === 1) alvo.padrao = valor;
  return null;
}

/** Remove a opção; a que é o padrão não pode sair. Limpa também as definições dos tipos que usavam o valor removido. */
export function removerOpcao(f: Familia, paramId: string, indice: number): string | null {
  const alvo = f.parametros.find((p) => p?.id === paramId);
  if (alvo === undefined) return `parâmetro “${paramId}” não existe`;
  const opcoes = alvo.opcoes;
  if (!Array.isArray(opcoes)) return 'o parâmetro não tem opções';
  const opcao = opcoes[indice];
  if (opcao === undefined) return 'opção não existe';
  if (opcao.valor === alvo.padrao) return 'não dá para remover a opção que é o padrão';
  opcoes.splice(indice, 1);
  for (const t of f.tipos) {
    if (t?.valores !== undefined && t.valores[paramId] === opcao.valor) delete t.valores[paramId];
  }
  return null;
}
