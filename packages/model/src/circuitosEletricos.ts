import type { Id } from './types.ts';

/*
 * MODELO de circuitos elétricos (ficha C4). Dado puro e operações imutáveis: cada operação recebe o mapa de circuitos e devolve
 * um mapa novo (lança `Error` em português quando o pedido não vale). Nenhum valor de norma aqui: potência, tensão e fator são
 * dados do projetista. A consulta com o projeto (pontos órfãos, quadros, totais) está em `circuitosEletricosConsulta.ts` e os
 * comandos do histórico em `circuitosCommands.ts`.
 */

export const TIPOS_CIRCUITO = ['iluminacao', 'tomadas_uso_geral', 'tomadas_uso_especifico'] as const;
export type TipoCircuito = (typeof TIPOS_CIRCUITO)[number];

/** Rótulo (português) de cada tipo de circuito. */
export const ROTULO_TIPO_CIRCUITO: Readonly<Record<TipoCircuito, string>> = {
  iluminacao: 'Iluminação',
  tomadas_uso_geral: 'Tomadas de uso geral',
  tomadas_uso_especifico: 'Tomadas de uso específico',
};

/** Tipo que todo circuito novo recebe (ficha C8b: o tipo só é sugerido pelo ponto enquanto ele ficar neste padrão). */
export const TIPO_PADRAO_CIRCUITO: TipoCircuito = 'iluminacao';

/**
 * Tipo sugerido pelo PRIMEIRO ponto atribuído (ficha C8b): tomadas (família `fam_tomada…`) puxam "Tomadas de uso geral"; luminárias
 * (`fam_luminaria…`) ficam em Iluminação. Interruptor e as demais famílias não sugerem nada (`undefined`).
 */
export function tipoSugeridoDaFamilia(familyId: string): TipoCircuito | undefined {
  if (familyId.startsWith('fam_tomada')) return 'tomadas_uso_geral';
  if (familyId.startsWith('fam_luminaria')) return 'iluminacao';
  return undefined;
}

/** Ponto de um circuito: instância de componente (tomada, interruptor, luminária...) com a potência aparente atribuída. */
export interface PontoCircuito {
  componenteId: Id;
  /** Potência aparente do ponto (VA). */
  potenciaVA: number;
  /** Fator aplicado à potência (ex.: simultaneidade); ausente = 1. */
  fator?: number;
}

export interface CircuitoEletrico {
  id: Id;
  /** Nome curto, único no projeto (ex.: "C1"). */
  nome: string;
  tipo: TipoCircuito;
  /** Componente do quadro que alimenta o circuito; ausente = circuito sem quadro. */
  quadroId?: Id;
  /** Tensão do circuito (V). */
  tensao: number;
  pontos: PontoCircuito[];
  /** Cor de destaque (#rrggbb) dos componentes do circuito. */
  cor: string;
  notas?: string;
  /** Verdadeiro quando a pessoa escolheu o tipo à mão: a sugestão pelo ponto nunca o sobrescreve (ficha C8b). */
  tipoManual?: boolean;
}

/** Quadro registrado: o `id` é o do COMPONENTE (instância da família do quadro); guarda só o nome dado pelo projetista. */
export interface QuadroEletrico {
  id: Id;
  nome: string;
}

export type MapaCircuitos = Readonly<Record<Id, CircuitoEletrico>>;

/** Cores de destaque (apenas visuais) usadas em rodízio pelos circuitos novos. */
export const CORES_CIRCUITO: readonly string[] = ['#d9480f', '#1c7ed6', '#2f9e44', '#9c36b5', '#e8a400', '#0b7285', '#c2255c', '#5c7cfa'];

const COR_HEX = /^#[0-9a-fA-F]{6}$/;

/** Fator efetivo do ponto (1 quando ausente). */
export const fatorDoPonto = (p: PontoCircuito): number => p.fator ?? 1;

/** Potência considerada do ponto (VA): potência atribuída vezes o fator. */
export const vaDoPonto = (p: PontoCircuito): number => p.potenciaVA * fatorDoPonto(p);

/** Total (VA) dos pontos do circuito. */
export const totalDoCircuito = (c: Pick<CircuitoEletrico, 'pontos'>): number => c.pontos.reduce((s, p) => s + vaDoPonto(p), 0);

/** Soma (VA) por quadro; circuitos sem quadro caem na chave `''`. */
export function totaisPorQuadro(cs: MapaCircuitos): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of Object.values(cs)) out[c.quadroId ?? ''] = (out[c.quadroId ?? ''] ?? 0) + totalDoCircuito(c);
  return out;
}

/** Próximo nome livre da forma "C<n>" (preenche o primeiro buraco). */
export function proximoNomeCircuito(cs: MapaCircuitos): string {
  const usados = new Set(Object.values(cs).map((c) => c.nome.trim().toLowerCase()));
  let n = 1;
  while (usados.has(`c${n}`)) n++;
  return `C${n}`;
}

/** Próximo id livre da forma "cir_<n>". */
export function proximoIdCircuito(cs: MapaCircuitos): Id {
  let n = Object.keys(cs).length + 1;
  while (cs[`cir_${n}`]) n++;
  return `cir_${n}`;
}

/** Cor do próximo circuito, em rodízio pela paleta (a primeira ainda não usada, senão pela contagem). */
export function proximaCorCircuito(cs: MapaCircuitos): string {
  const usadas = new Set(Object.values(cs).map((c) => c.cor.toLowerCase()));
  return CORES_CIRCUITO.find((c) => !usadas.has(c)) ?? CORES_CIRCUITO[Object.keys(cs).length % CORES_CIRCUITO.length]!;
}

function validarPonto(p: PontoCircuito): void {
  if (!p.componenteId) throw new Error('O ponto precisa de um componente.');
  if (!Number.isFinite(p.potenciaVA) || p.potenciaVA < 0) throw new Error('A potência do ponto precisa ser um número maior ou igual a zero (VA).');
  if (p.fator !== undefined && (!Number.isFinite(p.fator) || p.fator < 0)) throw new Error('O fator do ponto precisa ser um número maior ou igual a zero.');
}

function validarDados(c: Pick<CircuitoEletrico, 'nome' | 'tipo' | 'tensao' | 'cor'>): void {
  if (!c.nome.trim()) throw new Error('O circuito precisa de um nome.');
  if (!TIPOS_CIRCUITO.includes(c.tipo)) throw new Error('Tipo de circuito inválido: ' + String(c.tipo));
  if (!Number.isFinite(c.tensao) || c.tensao <= 0) throw new Error('A tensão do circuito precisa ser maior que zero (V).');
  if (!COR_HEX.test(c.cor)) throw new Error('A cor do circuito precisa ser #rrggbb.');
}

function nomeLivre(cs: MapaCircuitos, nome: string, exceto?: Id): void {
  const n = nome.trim().toLowerCase();
  if (Object.values(cs).some((c) => c.id !== exceto && c.nome.trim().toLowerCase() === n)) throw new Error(`Já existe um circuito chamado "${nome.trim()}".`);
}

function existente(cs: MapaCircuitos, id: Id): CircuitoEletrico {
  const c = cs[id];
  if (!c) throw new Error('Circuito inexistente: ' + id);
  return c;
}

/** Cria o circuito. Pontos iniciais não podem repetir componente nem estar em outro circuito. */
export function criarCircuito(cs: MapaCircuitos, c: CircuitoEletrico): MapaCircuitos {
  if (!c.id.trim()) throw new Error('O circuito precisa de um id.');
  if (cs[c.id]) throw new Error('Já existe um circuito com este id: ' + c.id);
  validarDados(c);
  nomeLivre(cs, c.nome);
  const vistos = new Set<Id>();
  const ocupados = new Set(Object.values(cs).flatMap((x) => x.pontos.map((p) => p.componenteId)));
  for (const p of c.pontos) {
    validarPonto(p);
    if (vistos.has(p.componenteId) || ocupados.has(p.componenteId)) throw new Error('O componente já pertence a um circuito: ' + p.componenteId);
    vistos.add(p.componenteId);
  }
  return { ...cs, [c.id]: { ...c, nome: c.nome.trim(), pontos: c.pontos.map((p) => ({ ...p })) } };
}

/** Renomeia o circuito (nome único, sem diferenciar maiúsculas). */
export function renomearCircuito(cs: MapaCircuitos, id: Id, nome: string): MapaCircuitos {
  const c = existente(cs, id);
  if (!nome.trim()) throw new Error('O circuito precisa de um nome.');
  nomeLivre(cs, nome, id);
  return { ...cs, [id]: { ...c, nome: nome.trim() } };
}

/** Altera tipo, tensão, cor e notas (`notas: ''` apaga). */
export function atualizarCircuito(cs: MapaCircuitos, id: Id, patch: Partial<Pick<CircuitoEletrico, 'tipo' | 'tensao' | 'cor' | 'notas'>>): MapaCircuitos {
  const c = existente(cs, id);
  const novo: CircuitoEletrico = {
    ...c,
    ...(patch.tipo !== undefined ? { tipo: patch.tipo, tipoManual: true } : {}),
    ...(patch.tensao !== undefined ? { tensao: patch.tensao } : {}),
    ...(patch.cor !== undefined ? { cor: patch.cor } : {}),
  };
  validarDados(novo);
  if (patch.notas !== undefined) {
    if (patch.notas.trim()) novo.notas = patch.notas;
    else delete novo.notas;
  }
  return { ...cs, [id]: novo };
}

/** Apaga o circuito (os componentes ficam no projeto, sem circuito). */
export function apagarCircuito(cs: MapaCircuitos, id: Id): MapaCircuitos {
  existente(cs, id);
  const { [id]: _removido, ...resto } = cs;
  void _removido;
  return resto;
}

/** Atribui o ponto ao circuito. Se o componente estava em outro circuito, sai de lá (um ponto pertence a no máximo um circuito). */
export function atribuirPonto(cs: MapaCircuitos, circuitoId: Id, ponto: PontoCircuito): MapaCircuitos {
  existente(cs, circuitoId);
  validarPonto(ponto);
  const novo: Record<Id, CircuitoEletrico> = {};
  for (const [id, c] of Object.entries(cs)) {
    const sem = c.pontos.filter((p) => p.componenteId !== ponto.componenteId);
    novo[id] = id === circuitoId ? c : sem.length === c.pontos.length ? c : { ...c, pontos: sem };
  }
  const alvo = novo[circuitoId]!;
  const copia: PontoCircuito = { componenteId: ponto.componenteId, potenciaVA: ponto.potenciaVA, ...(ponto.fator !== undefined ? { fator: ponto.fator } : {}) };
  const i = alvo.pontos.findIndex((p) => p.componenteId === ponto.componenteId);
  const pontos = i >= 0 ? alvo.pontos.map((p, k) => (k === i ? copia : p)) : [...alvo.pontos, copia];
  novo[circuitoId] = { ...alvo, pontos };
  return novo;
}

/** Tira o componente do circuito a que pertence (sem efeito se não está em nenhum). */
export function removerPonto(cs: MapaCircuitos, componenteId: Id): MapaCircuitos {
  const novo: Record<Id, CircuitoEletrico> = {};
  for (const [id, c] of Object.entries(cs)) {
    const sem = c.pontos.filter((p) => p.componenteId !== componenteId);
    novo[id] = sem.length === c.pontos.length ? c : { ...c, pontos: sem };
  }
  return novo;
}

/** Move o circuito para outro quadro (`undefined` o deixa sem quadro). */
export function moverCircuito(cs: MapaCircuitos, id: Id, quadroId: Id | undefined): MapaCircuitos {
  const c = existente(cs, id);
  const novo: CircuitoEletrico = { ...c };
  if (quadroId === undefined) delete novo.quadroId;
  else novo.quadroId = quadroId;
  return { ...cs, [id]: novo };
}

/** Circuito a que o componente pertence, ou `undefined`. */
export function circuitoDoComponente(cs: MapaCircuitos, componenteId: Id): CircuitoEletrico | undefined {
  return Object.values(cs).find((c) => c.pontos.some((p) => p.componenteId === componenteId));
}

/** Tira dos circuitos os componentes `excluidos` e solta o quadro excluído dos circuitos que o usavam. */
export function limparExcluidos(cs: MapaCircuitos, excluidos: ReadonlySet<Id>): MapaCircuitos {
  const novo: Record<Id, CircuitoEletrico> = {};
  for (const [id, c] of Object.entries(cs)) {
    const pontos = c.pontos.filter((p) => !excluidos.has(p.componenteId));
    const solta = c.quadroId !== undefined && excluidos.has(c.quadroId);
    if (pontos.length === c.pontos.length && !solta) {
      novo[id] = c;
      continue;
    }
    const n: CircuitoEletrico = { ...c, pontos };
    if (solta) delete n.quadroId;
    novo[id] = n;
  }
  return novo;
}
