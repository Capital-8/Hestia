import { copiarSecoes, type Id, type Mass, type Project, type ProjectStore, type SecaoMassa } from '@hestia/model';
import { t, type Lang } from '../editor/i18n.ts';
import { alturaTotal, editarMassas, type ResultadoEdicao } from './massSecoesForm.ts';

/**
 * Cotas de início e fim da massa (frente massa-forma-livre, fase B). Cotas ABSOLUTAS, em relação ao zero do projeto (metros):
 *   cota da base = elevação do nível da massa + `baseOffset`;   cota do topo = cota da base + altura total (z da última seção).
 * Regras (decididas e documentadas em docs/massa/ESTADO.md):
 *  - editar a COTA DA BASE move a pilha inteira sem mudar a altura (só `baseOffset`);
 *  - editar a ALTURA ou a COTA DO TOPO reescala TODAS as seções em z, proporcionalmente (z_i · nova/atual): preserva a forma, a
 *    interpolação e a distribuição da torção (a rotação de cada seção não muda e continua proporcional a z);
 *  - "de nível a nível": base = elevação do nível inicial, topo = elevação do nível final (o nível final tem de ser mais alto);
 *  - altura ≤ 0, ou não finita, é recusada com mensagem i18n; o resto da validação é a do modelo (`massIssue`, p.ex. passo mínimo de z).
 * Cada edição grava num único `updateMass` (um passo de desfazer) e nada muda quando é recusada.
 */

/** Elevação do nível da massa (0 se o nível não existe: o modelo recusa a massa sem nível antes disso). */
export const elevacaoDoNivelDaMassa = (p: Pick<Project, 'levels'>, m: Pick<Mass, 'levelId'>): number => p.levels.find((l) => l.id === m.levelId)?.elevation ?? 0;

export const cotaDaBase = (p: Pick<Project, 'levels'>, m: Pick<Mass, 'levelId' | 'baseOffset'>): number => elevacaoDoNivelDaMassa(p, m) + m.baseOffset;

export const cotaDoTopo = (p: Pick<Project, 'levels'>, m: Pick<Mass, 'levelId' | 'baseOffset' | 'secoes'>): number => cotaDaBase(p, m) + alturaTotal(m);

/** Pilha com todos os z multiplicados por `h / alturaAtual`; o topo fica exatamente em `h`. Altura atual ≤ 0: a pilha não muda. */
export function escalarAltura(secoes: readonly SecaoMassa[], h: number): SecaoMassa[] {
  const copia = copiarSecoes(secoes);
  const atual = copia[copia.length - 1]?.z ?? 0;
  if (!(atual > 0)) return copia;
  const k = h / atual;
  return copia.map((s, i) => ({ ...s, z: i === copia.length - 1 ? h : s.z * k }));
}

export interface CotasPedidas {
  /** Cota absoluta da base (m). */
  cotaBase?: number;
  /** Cota absoluta do topo (m). */
  cotaTopo?: number;
  /** Altura total (m). Vale mais que `cotaTopo` se vierem as duas. */
  altura?: number;
}

/** Valores finais (base absoluta e altura) para o pedido, ou a mensagem de recusa. */
export function resolverCotas(p: Pick<Project, 'levels'>, m: Mass, c: CotasPedidas, lang: Lang): { base: number; altura: number } | string {
  const base = c.cotaBase ?? cotaDaBase(p, m);
  const altura = c.altura ?? (c.cotaTopo !== undefined ? c.cotaTopo - base : alturaTotal(m));
  if (!Number.isFinite(base) || !Number.isFinite(altura) || !(altura > 0)) return t(lang, 'ui_ms_altura_invalida');
  return { base, altura };
}

/** Aplica as cotas pedidas à massa: `updateMass` com `baseOffset` e a pilha reescalada, num passo de desfazer. */
export function definirCotas(store: ProjectStore, id: Id, c: CotasPedidas, rotulo: string, lang: Lang): ResultadoEdicao {
  const m = store.project.elements[id];
  if (!m || m.kind !== 'mass') return { ok: false, erro: null };
  const r = resolverCotas(store.project, m, c, lang);
  if (typeof r === 'string') return { ok: false, erro: r };
  const patch: Partial<Mass> = { baseOffset: r.base - elevacaoDoNivelDaMassa(store.project, m) };
  if (Math.abs(r.altura - alturaTotal(m)) > 1e-12) patch.secoes = escalarAltura(m.secoes, r.altura);
  return editarMassas(store, [id], patch, rotulo, lang);
}

/** "De nível a nível": base na elevação do nível inicial, topo na do final (que tem de ser mais alto). */
export function definirNiveis(store: ProjectStore, id: Id, nivelIni: Id, nivelFim: Id, rotulo: string, lang: Lang): ResultadoEdicao {
  const a = store.project.levels.find((l) => l.id === nivelIni);
  const b = store.project.levels.find((l) => l.id === nivelFim);
  if (!a || !b || !(b.elevation > a.elevation)) return { ok: false, erro: t(lang, 'ui_ms_niveis_invalidos') };
  return definirCotas(store, id, { cotaBase: a.elevation, cotaTopo: b.elevation }, rotulo, lang);
}

/** Níveis (id, nome, elevação) em ordem de elevação, para os seletores. */
export const niveisOrdenados = (p: Pick<Project, 'levels'>): Array<{ id: Id; name: string; elevation: number }> => [...p.levels].sort((x, y) => x.elevation - y.elevation).map((l) => ({ id: l.id, name: l.name, elevation: l.elevation }));
