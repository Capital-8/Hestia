import type { Vec2 } from '@hestia/geom';
import { copiarSecoes, massIssue, MASSA_LIMITES, normalizarSecoes, type ArranjoMassa, type Mass, type PerfilMassa, type ProjectStore, type SecaoMassa } from '@hestia/model';
import type { Lang } from '../editor/i18n.ts';

/**
 * Lógica pura do formulário "Seções da massa" e das edições do painel de propriedades da massa (ficha U1). Nada aqui
 * conhece React: o diálogo (`MassSecoesDialog.tsx`) e o painel (`MassProperties.tsx`) só chamam estas funções.
 * As funções de pilha devolvem uma pilha nova (ou `null` quando o limite recusa); a validação é a do modelo
 * (`massIssue`), então a mensagem exibida é a mesma que o comando daria ao recusar.
 */

export type Forma = PerfilMassa['forma'];
export const FORMAS: readonly Forma[] = ['circulo', 'elipse', 'poligono', 'livre'];

/** Passo de altura da seção nova quando a pilha não dá referência (m). */
const PASSO_Z_PADRAO = 1;
/** Pontos do contorno amostrado de círculo e elipse na prévia (e ao converter para perfil livre, com menos). */
const PONTOS_PREVIA = 48;
const PONTOS_CONVERSAO = 16;
const LADOS_PADRAO = 6;
const SECOES_MIN = 2;

const GRAUS = 180 / Math.PI;

const copiaPerfil = (p: PerfilMassa): PerfilMassa => (p.forma === 'livre' ? { forma: 'livre', pontos: p.pontos.map((q) => ({ ...q })) } : { ...p });

/** Passo de z usado para uma seção nova no topo: o último intervalo da pilha, ou 1 m. */
function passoNoTopo(secoes: readonly SecaoMassa[]): number {
  const n = secoes.length;
  if (n < 2) return PASSO_Z_PADRAO;
  return Math.max(MASSA_LIMITES.passoZMin, secoes[n - 1]!.z - secoes[n - 2]!.z);
}

/** Acrescenta uma seção no topo, copiando a última (z = último z + último intervalo). `null` no limite de 64. */
export function adicionarSecao(secoes: readonly SecaoMassa[]): SecaoMassa[] | null {
  if (secoes.length >= MASSA_LIMITES.secoes || secoes.length === 0) return null;
  const ultima = secoes[secoes.length - 1]!;
  return [...copiarSecoes(secoes), { ...copiarSecoes([ultima])[0]!, z: ultima.z + passoNoTopo(secoes) }];
}

/**
 * Remove a seção `i`. `null` quando restariam menos de 2 seções. Removendo a primeira, a pilha desce para que a nova
 * primeira fique em z = 0 (regra do modelo).
 */
export function removerSecao(secoes: readonly SecaoMassa[], i: number): SecaoMassa[] | null {
  if (secoes.length <= SECOES_MIN || i < 0 || i >= secoes.length) return null;
  const resto = copiarSecoes(secoes.filter((_, k) => k !== i));
  if (i !== 0) return resto;
  const base = resto[0]!.z;
  return resto.map((s) => ({ ...s, z: s.z - base }));
}

/**
 * Duplica a seção `i` logo acima dela: z no meio do intervalo até a próxima (ou um passo acima, se for a última).
 * `null` no limite de 64 ou quando o intervalo é pequeno demais para caber o passo mínimo entre as três.
 */
export function duplicarSecao(secoes: readonly SecaoMassa[], i: number): SecaoMassa[] | null {
  if (secoes.length >= MASSA_LIMITES.secoes || i < 0 || i >= secoes.length) return null;
  const atual = secoes[i]!;
  const prox = secoes[i + 1];
  const z = prox ? (atual.z + prox.z) / 2 : atual.z + passoNoTopo(secoes);
  if (prox && z - atual.z < MASSA_LIMITES.passoZMin) return null;
  const copia: SecaoMassa = { ...copiarSecoes([atual])[0]!, z };
  const out = copiarSecoes(secoes);
  out.splice(i + 1, 0, copia);
  return out;
}

/** Troca campos de uma seção (a pilha antiga não muda). */
export function editarSecao(secoes: readonly SecaoMassa[], i: number, patch: Partial<SecaoMassa>): SecaoMassa[] {
  return copiarSecoes(secoes).map((s, k) => (k === i ? { ...s, ...patch } : s));
}

/** Raio equivalente de um perfil, usado ao trocar de forma (média dos raios; no livre, a distância média ao centro). */
export function raioEquivalente(p: PerfilMassa): number {
  const r = p.forma === 'circulo' ? p.raio : p.forma === 'elipse' ? (p.rx + p.ry) / 2 : p.forma === 'poligono' ? p.raio : p.pontos.reduce((s, q) => s + Math.hypot(q.x, q.y), 0) / Math.max(1, p.pontos.length);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/** Contorno local (anti-horário, antes de escala, rotação e deslocamento). O polígono regular tem vértice em +x. */
export function anelLocal(p: PerfilMassa, n: number = PONTOS_PREVIA): Vec2[] {
  const volta = (k: number, total: number): number => (2 * Math.PI * k) / total;
  switch (p.forma) {
    case 'circulo':
      return Array.from({ length: n }, (_, k) => ({ x: p.raio * Math.cos(volta(k, n)), y: p.raio * Math.sin(volta(k, n)) }));
    case 'elipse':
      return Array.from({ length: n }, (_, k) => ({ x: p.rx * Math.cos(volta(k, n)), y: p.ry * Math.sin(volta(k, n)) }));
    case 'poligono': {
      const lados = Math.max(3, Math.round(p.lados));
      return Array.from({ length: lados }, (_, k) => ({ x: p.raio * Math.cos(volta(k, lados)), y: p.raio * Math.sin(volta(k, lados)) }));
    }
    case 'livre':
      return p.pontos.map((q) => ({ ...q }));
  }
}

/** Novo perfil da forma pedida, aproveitando o tamanho do atual. Para `livre`, parte do contorno amostrado. */
export function trocarForma(p: PerfilMassa, forma: Forma): PerfilMassa {
  if (p.forma === forma) return copiaPerfil(p);
  const r = raioEquivalente(p);
  switch (forma) {
    case 'circulo':
      return { forma, raio: r };
    case 'elipse':
      return p.forma === 'circulo' ? { forma, rx: p.raio, ry: p.raio } : { forma, rx: r, ry: r };
    case 'poligono':
      return { forma, lados: LADOS_PADRAO, raio: r };
    case 'livre':
      return { forma, pontos: anelLocal(p, PONTOS_CONVERSAO) };
  }
}

/** Contorno da seção em planta, relativo à origem da massa: escala, depois rotação, depois deslocamento (A.4 regra 3). */
export function contornoDaSecao(s: SecaoMassa, n: number = PONTOS_PREVIA): Vec2[] {
  const c = Math.cos(s.rotacao);
  const sn = Math.sin(s.rotacao);
  return anelLocal(s.perfil, n).map((q) => {
    const x = q.x * s.escala;
    const y = q.y * s.escala;
    return { x: x * c - y * sn + s.dx, y: x * sn + y * c + s.dy };
  });
}

/** Contornos de toda a pilha, só dos pontos finitos (seção com número inválido digitado não derruba a prévia). */
export function contornosDaPilha(secoes: readonly SecaoMassa[]): Vec2[][] {
  return secoes.map((s) => contornoDaSecao(s).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)));
}

export interface CaixaPrevia {
  minX: number;
  minY: number;
  largura: number;
  altura: number;
}

/** Caixa que contém todos os contornos, com 8% de folga; sem pontos, uma caixa de 2 m em torno da origem. */
export function caixaDaPrevia(aneis: readonly (readonly Vec2[])[]): CaixaPrevia {
  const pts = aneis.flat();
  if (pts.length === 0) return { minX: -1, minY: -1, largura: 2, altura: 2 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  const lado = Math.max(maxX - minX, maxY - minY, 0.1);
  const folga = lado * 0.08;
  // Quadrada: a planta não deforma na prévia.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX: cx - lado / 2 - folga, minY: cy - lado / 2 - folga, largura: lado + 2 * folga, altura: lado + 2 * folga };
}

/** Torção total (graus) deduzida da última seção: a rotação dela. Pilha sem seções: 0. */
export function torcaoTotalGraus(secoes: readonly SecaoMassa[]): number {
  const ultima = secoes[secoes.length - 1];
  if (!ultima || secoes.length < 2) return 0;
  return ultima.rotacao * GRAUS;
}

/** Distribui a torção linearmente em z: rotacao_i = total · z_i / z_última. Sem altura (z_última ≤ 0), a pilha não muda. */
export function distribuirTorcao(secoes: readonly SecaoMassa[], graus: number): SecaoMassa[] {
  const copia = copiarSecoes(secoes);
  const topo = copia[copia.length - 1]?.z ?? 0;
  if (!(topo > 0) || !Number.isFinite(graus)) return copia;
  const total = graus / GRAUS;
  return copia.map((s) => ({ ...s, rotacao: (total * s.z) / topo }));
}

/** Mensagem do modelo para a pilha (ou `null` se válida): a mesma que `addMass`/`updateMass`/`setMassSecoes` dariam. */
export function validacaoAoVivo(massa: Mass, secoes: readonly SecaoMassa[], lang: Lang): string | null {
  return massIssue({ ...massa, secoes: normalizarSecoes(secoes) }, lang);
}

export interface ResultadoEdicao {
  ok: boolean;
  /** Mensagem do modelo quando recusado; nada foi gravado. */
  erro: string | null;
}

const OK: ResultadoEdicao = { ok: true, erro: null };

/** Roda uma gravação do modelo: a recusa (exceção do comando) vira `erro`, sem sujar o histórico. */
function tentar(fn: () => void): ResultadoEdicao {
  try {
    fn();
    return OK;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Aplica a pilha de seções: UM `setMassSecoes` (um passo de desfazer). Pilha inválida é recusada. */
export function aplicarSecoes(store: ProjectStore, id: string, secoes: readonly SecaoMassa[], rotulo: string, lang: Lang): ResultadoEdicao {
  return tentar(() => store.exec({ type: 'setMassSecoes', id, secoes: copiarSecoes(secoes) }, rotulo, lang));
}

/** Aplica a torção total (graus) na massa: reescreve a rotação de cada seção, num passo de desfazer. */
export function aplicarTorcao(store: ProjectStore, id: string, graus: number, rotulo: string, lang: Lang): ResultadoEdicao {
  const m = store.project.elements[id];
  if (!m || m.kind !== 'mass') return { ok: false, erro: null };
  return aplicarSecoes(store, id, distribuirTorcao(m.secoes, graus), rotulo, lang);
}

/**
 * Edita campos comuns de uma ou mais massas (`updateMass`), num único passo de desfazer. Valida TODAS antes de gravar
 * (a transação não desfaz o que já gravou): se alguma ficar inválida, nenhuma muda e a mensagem dela volta.
 */
export function editarMassas(store: ProjectStore, ids: readonly string[], patch: Partial<Omit<Mass, 'id' | 'kind' | 'order'>>, rotulo: string, lang: Lang): ResultadoEdicao {
  const massas = ids.map((id) => store.project.elements[id]).filter((e): e is Mass => e?.kind === 'mass');
  for (const m of massas) {
    const issue = massIssue({ ...m, ...patch, secoes: normalizarSecoes(patch.secoes ?? m.secoes) }, lang);
    if (issue) return { ok: false, erro: issue };
  }
  return tentar(() => store.transaction(rotulo, () => {
    for (const m of massas) store.exec({ type: 'updateMass', id: m.id, patch }, rotulo, lang);
  }));
}

/** Arranjo padrão ao ligar: 6 cópias em volta da origem da massa, volta completa. */
export function arranjoPadrao(m: Mass): ArranjoMassa {
  return { n: 6, cx: m.origem.x, cy: m.origem.y, anguloTotal: 2 * Math.PI };
}

/** Liga (com os dados) ou desliga (`null`) o arranjo polar: `setMassArranjo`, um passo de desfazer. */
export function aplicarArranjo(store: ProjectStore, id: string, arranjo: ArranjoMassa | null, rotulo: string, lang: Lang): ResultadoEdicao {
  return tentar(() => store.exec({ type: 'setMassArranjo', id, arranjo }, rotulo, lang));
}

/** Altura total da massa: z da última seção (somente leitura no painel). */
export function alturaTotal(m: Pick<Mass, 'secoes'>): number {
  return m.secoes[m.secoes.length - 1]?.z ?? 0;
}
