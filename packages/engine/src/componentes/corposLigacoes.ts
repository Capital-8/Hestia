import { LIMITES_LIGACAO, tentar, type DominioLigacao, type Env, type Familia } from '@hestia/model';
import type { LigacaoResolvida } from './corposTipos.ts';

/*
 * Resolução das LIGAÇÕES da família (CONTRATO §3): cada ponto vira um `LigacaoResolvida` com posição e medidas em METROS
 * (arredondadas a 1 µm, como os perfis), direção UNITÁRIA para fora (N7: `[0,0,-5]` vira `[0,0,-1]`), `aceita` padrão
 * `[dominio]`, `quando` falso remove o ponto e `propriedades` viram números. Propriedades e direção não são medidas de
 * comprimento: a direção é só sentido e as propriedades ficam como o número da fórmula.
 * Texto de erro sai como `DiagnosticoLigacao` (código, mensagem e `onde`); uma ligação com erro NÃO entra na lista.
 * Nunca lança por entrada do usuário: fórmula ruim vira diagnóstico. Função pura; o ambiente é o das fórmulas da instância.
 */

export type CodigoDiagnosticoLigacao = 'formula' | 'faixa' | 'tipo' | 'obrigatorio' | 'limite';

export interface DiagnosticoLigacao {
  codigo: CodigoDiagnosticoLigacao;
  mensagem: string;
  /** `ligacao:<id>.<campo>`, ou `ligacoes[k]` quando a ligação não tem id. */
  onde: string;
}

export interface ResultadoLigacoes {
  /** `true` quando nenhuma ligação gerou diagnóstico (ligações removidas por `quando` não contam como erro). */
  ok: boolean;
  ligacoes: LigacaoResolvida[];
  diagnosticos: DiagnosticoLigacao[];
}

type Vetor3 = [number, number, number];
type Ambiente = Env;

/** Metros arredondados a 1 µm a partir de um valor em mm (mesma regra do resolvedor de perfis). */
const METRO_EM_MM = 1000;
const ARREDONDAR_M = 1e6;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function resolverLigacoes(familia: Familia, ambiente: Ambiente): ResultadoLigacoes {
  const bruto: unknown = familia.ligacoes;
  if (bruto === undefined) return { ok: true, ligacoes: [], diagnosticos: [] };
  if (!Array.isArray(bruto)) {
    return { ok: false, ligacoes: [], diagnosticos: [{ codigo: 'tipo', mensagem: 'ligacoes precisa ser uma lista', onde: 'familia' }] };
  }

  const diagnosticos: DiagnosticoLigacao[] = [];
  const ligacoes: LigacaoResolvida[] = [];
  const lista: unknown[] = bruto;
  if (lista.length > LIMITES_LIGACAO.ligacoes) {
    diagnosticos.push({ codigo: 'limite', mensagem: `a família passa de ${LIMITES_LIGACAO.ligacoes} ligações`, onde: 'familia' });
  }
  lista.slice(0, LIMITES_LIGACAO.ligacoes).forEach((item, k) => {
    const r = resolverUma(item, k, ambiente);
    diagnosticos.push(...r.diagnosticos);
    if (r.ligacao !== null) ligacoes.push(r.ligacao);
  });
  return { ok: diagnosticos.length === 0, ligacoes, diagnosticos };
}

interface ResultadoUma {
  /** `null` quando a ligação foi removida por `quando` falso ou tem erro. */
  ligacao: LigacaoResolvida | null;
  diagnosticos: DiagnosticoLigacao[];
}

function resolverUma(bruto: unknown, k: number, ambiente: Ambiente): ResultadoUma {
  if (!ehObjeto(bruto)) {
    return { ligacao: null, diagnosticos: [{ codigo: 'tipo', mensagem: 'a ligação precisa ser um objeto', onde: `ligacoes[${k}]` }] };
  }
  const id = typeof bruto.id === 'string' && bruto.id.trim() !== '' ? bruto.id : undefined;
  const onde = id !== undefined ? `ligacao:${id}` : `ligacoes[${k}]`;
  const diag: DiagnosticoLigacao[] = [];

  if (bruto.quando !== undefined) {
    const quando = avaliarBruto(bruto.quando, `${onde}.quando`, ambiente, diag);
    if (quando === undefined) return { ligacao: null, diagnosticos: diag };
    if (!quando.valor) return { ligacao: null, diagnosticos: [] };
  }

  const dominio = texto(bruto.dominio);
  if (dominio === undefined) diag.push(tipo(`${onde}.dominio`, 'domínio ausente ou não é texto'));
  const fluxo = texto(bruto.fluxo);
  if (fluxo === undefined) diag.push(tipo(`${onde}.fluxo`, 'fluxo ausente ou não é texto'));
  const nome = texto(bruto.nome) ?? id ?? `ligacao ${k + 1}`;

  const secao = resolverSecao(bruto, onde, ambiente, diag);
  const posicao = resolverPosicao(bruto.posicao, onde, ambiente, diag);
  const direcao = resolverDirecao(bruto.direcao, onde, ambiente, diag);
  const aceita = resolverAceita(bruto.aceita, dominio, `${onde}.aceita`, diag);
  const propriedades = resolverPropriedades(bruto.propriedades, onde, ambiente, diag);
  const encaixe = resolverEncaixe(bruto.encaixe, onde, ambiente, diag);

  if (diag.length > 0 || secao === undefined || posicao === undefined || direcao === undefined || aceita === undefined || propriedades === undefined) {
    return { ligacao: null, diagnosticos: diag };
  }

  const propaga = typeof bruto.propagaParametro === 'string' ? bruto.propagaParametro : null;
  const sistema = typeof bruto.sistema === 'string' ? bruto.sistema : null;
  const ligacao: LigacaoResolvida = {
    id: id ?? `ligacao_${k}`,
    nome,
    dominio: dominio as DominioLigacao,
    sistema,
    secao: secao.secao,
    posicao,
    direcao,
    diametro: secao.diametro,
    largura: secao.largura,
    altura: secao.altura,
    fluxo: fluxo as LigacaoResolvida['fluxo'],
    aceita,
    propriedades,
    propagaParametro: propaga,
    ...(encaixe ? { encaixe } : {}),
    ...(bruto.flexivel === true ? { flexivel: true } : {}),
  };
  return { ligacao, diagnosticos: [] };
}

interface Secao {
  secao: LigacaoResolvida['secao'];
  diametro: number;
  largura: number;
  altura: number;
}

/** Redonda exige diâmetro > 0; retangular exige largura e altura > 0. Medidas que não se aplicam ficam 0. */
function resolverSecao(l: Record<string, unknown>, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): Secao | undefined {
  if (l.secao === 'redonda') {
    const diametro = medidaPositiva(l.diametro, `${onde}.diametro`, ambiente, diag);
    if (diametro === undefined) return undefined;
    return { secao: 'redonda', diametro, largura: 0, altura: 0 };
  }
  if (l.secao === 'retangular') {
    const largura = medidaPositiva(l.largura, `${onde}.largura`, ambiente, diag);
    const altura = medidaPositiva(l.altura, `${onde}.altura`, ambiente, diag);
    if (largura === undefined || altura === undefined) return undefined;
    return { secao: 'retangular', diametro: 0, largura, altura };
  }
  diag.push(tipo(`${onde}.secao`, `seção desconhecida “${String(l.secao)}”`));
  return undefined;
}

function medidaPositiva(valor: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): number | undefined {
  if (valor === undefined) {
    diag.push({ codigo: 'obrigatorio', mensagem: 'medida obrigatória para esta seção', onde });
    return undefined;
  }
  const r = avaliarBruto(valor, onde, ambiente, diag);
  if (r === undefined) return undefined;
  const mm = numeroDe(r.valor, onde, diag);
  if (mm === undefined) return undefined;
  if (mm <= 0) {
    diag.push({ codigo: 'faixa', mensagem: 'medida precisa ser maior que zero', onde });
    return undefined;
  }
  return arredondarMetros(mm);
}

function resolverPosicao(valor: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): [number, number, number] | undefined {
  const trio = trioDe(valor, `${onde}.posicao`, diag);
  if (trio === undefined) return undefined;
  const out: number[] = [];
  for (let j = 0; j < 3; j++) {
    const r = avaliarBruto(trio[j], `${onde}.posicao[${j}]`, ambiente, diag);
    if (r === undefined) return undefined;
    const mm = numeroDe(r.valor, `${onde}.posicao[${j}]`, diag);
    if (mm === undefined) return undefined;
    out.push(arredondarMetros(mm));
  }
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

/** Direção: só sentido, então não converte unidade; normaliza e rejeita vetor nulo. */
function resolverDirecao(valor: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): Vetor3 | undefined {
  const trio = trioDe(valor, `${onde}.direcao`, diag);
  if (trio === undefined) return undefined;
  const v: number[] = [];
  for (let j = 0; j < 3; j++) {
    const r = avaliarBruto(trio[j], `${onde}.direcao[${j}]`, ambiente, diag);
    if (r === undefined) return undefined;
    const n = numeroDe(r.valor, `${onde}.direcao[${j}]`, diag);
    if (n === undefined) return undefined;
    v.push(n);
  }
  const [x = 0, y = 0, z = 0] = v;
  const comprimento = Math.hypot(x, y, z);
  if (!(comprimento > 0)) {
    diag.push({ codigo: 'faixa', mensagem: 'direção nula (vetor zero não aponta para lado nenhum)', onde: `${onde}.direcao` });
    return undefined;
  }
  // `+ 0` troca -0 por 0, para que a direção normalizada compare igual a `[0, 0, -1]`.
  return [x / comprimento + 0, y / comprimento + 0, z / comprimento + 0];
}

function resolverAceita(valor: unknown, dominio: string | undefined, onde: string, diag: DiagnosticoLigacao[]): DominioLigacao[] | undefined {
  if (valor === undefined) return dominio === undefined ? [] : [dominio as DominioLigacao];
  if (!Array.isArray(valor)) {
    diag.push(tipo(onde, 'aceita precisa ser uma lista de domínios'));
    return undefined;
  }
  const lista: unknown[] = valor;
  const out: DominioLigacao[] = [];
  for (const d of lista) {
    if (typeof d !== 'string') {
      diag.push(tipo(onde, 'domínio em aceita precisa ser texto'));
      return undefined;
    }
    out.push(d as DominioLigacao);
  }
  return out;
}

/** Propriedades viram número (sem conversão de unidade: vazão, pressão, potência...). */
/** Encaixe: bolsa traz a profundidade (mm → m); ponta, 0. Ausente = sem encaixe. Erro de fórmula entra nos diagnósticos. */
function resolverEncaixe(valor: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): LigacaoResolvida['encaixe'] | undefined {
  if (valor === undefined || !ehObjeto(valor)) return undefined;
  const aceitaMesmoTipo = valor.aceitaMesmoTipo === true;
  if (valor.tipo === 'ponta') return { tipo: 'ponta', profundidade: 0, aceitaMesmoTipo };
  if (valor.tipo !== 'bolsa') return undefined;
  const campo = `${onde}.encaixe.profundidade`;
  const r = avaliarBruto(valor.profundidade, campo, ambiente, diag);
  if (r === undefined) return undefined;
  const mm = numeroDe(r.valor, campo, diag);
  return mm === undefined ? undefined : { tipo: 'bolsa', profundidade: mm / 1000, aceitaMesmoTipo };
}

function resolverPropriedades(valor: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  if (valor === undefined) return out;
  if (!ehObjeto(valor)) {
    diag.push(tipo(`${onde}.propriedades`, 'propriedades precisa ser um objeto'));
    return undefined;
  }
  const chaves = Object.keys(valor);
  if (chaves.length > LIMITES_LIGACAO.propriedades) {
    diag.push({ codigo: 'limite', mensagem: `a ligação passa de ${LIMITES_LIGACAO.propriedades} propriedades`, onde: `${onde}.propriedades` });
  }
  for (const chave of chaves.slice(0, LIMITES_LIGACAO.propriedades)) {
    const campo = `${onde}.propriedades.${chave}`;
    const r = avaliarBruto(valor[chave], campo, ambiente, diag);
    if (r === undefined) return undefined;
    const n = numeroDe(r.valor, campo, diag);
    if (n === undefined) return undefined;
    out[chave] = n;
  }
  return out;
}

/** Lê uma terna de fórmulas; devolve `undefined` com diagnóstico quando não é uma terna. */
function trioDe(valor: unknown, onde: string, diag: DiagnosticoLigacao[]): [unknown, unknown, unknown] | undefined {
  if (!Array.isArray(valor) || valor.length !== 3) {
    diag.push(tipo(onde, 'precisa de 3 componentes'));
    return undefined;
  }
  const lista: unknown[] = valor;
  return [lista[0], lista[1], lista[2]];
}

function texto(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function tipo(onde: string, mensagem: string): DiagnosticoLigacao {
  return { codigo: 'tipo', mensagem, onde };
}

/** Avalia uma fórmula; erro de texto ou de avaliação vira diagnóstico e devolve `undefined`. */
function avaliarBruto(expr: unknown, onde: string, ambiente: Ambiente, diag: DiagnosticoLigacao[]): { valor: number | string | boolean } | undefined {
  if (typeof expr !== 'string') {
    diag.push(tipo(onde, 'expressão precisa ser texto'));
    return undefined;
  }
  const r = tentar(expr, ambiente);
  if (!r.ok) {
    diag.push({ codigo: 'formula', mensagem: `fórmula não resolve: ${r.erro.message}`, onde });
    return undefined;
  }
  return { valor: r.valor };
}

function numeroDe(valor: number | string | boolean, onde: string, diag: DiagnosticoLigacao[]): number | undefined {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    diag.push(tipo(onde, 'a fórmula não resolve para um número'));
    return undefined;
  }
  return valor;
}

function arredondarMetros(mm: number): number {
  return Math.round(mm * METRO_EM_MM) / ARREDONDAR_M;
}
