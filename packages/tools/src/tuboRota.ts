import { avaliarDerivacao, avaliarEncontro, posicionarConexao, tipoDaFamiliaDeTubo, trechoDeTubo, trechoMinimoDe, type PontoSegmento, type RegrasConexao } from '@hestia/engine';
import { familiaDaBiblioteca, newId, type Component, type Familia, type Project } from '@hestia/model';
import type { ContextoTraco } from './tuboApoio.ts';
import { tuboSob, type PontoTubo } from './tuboGeometria.ts';
import { eixoDaDirecao, eixoOposto, EIXOS, listarCaminhosOrtogonais, planejarCaminhoOrtogonal, type Eixo } from './tuboCaminho.ts';
import { semDerivacao, type MeioDeTubo } from './tuboMeio.ts';
import { planejarPrumada, recuosDoJoelho, type ModoCota, type PlanoPrumada } from './tuboPrumada.ts';
import { sugestaoDeBloqueio } from './tuboBloqueio.ts';
import { diametroExterno, viabilidadeDoTrecho } from './tuboViabilidade.ts';

/*
 * Rota até o alvo e conferência da cadeia (fase 4, ficha F5; a parte de `planejar` e `verificar` que morava no `tuboTool.ts`).
 * Com um ponto do MEIO de um tubo na origem ou no alvo (derivação: tê ou junção 45° do tipo) o programa calcula a rota candidata:
 * o trecho reto se ele já fecha, senão sequências de trechos nos eixos (mesma busca de `tuboCaminho.ts`) com joelhos de 90° do tipo,
 * saindo do tê perpendicular à corrida (horizontal ao lado ou vertical, subir ou descer) e chegando ao alvo no sentido da porta.
 * Vale a MENOR rota VIÁVEL: menos trechos, depois menor comprimento; viável = as peças do tipo existem em cada nó e `viabilidadeDoTrecho`
 * (trecho mínimo, tubo curto F1, cota da prumada, comprimento máximo) aprova cada trecho com os recuos reais. Declividade diferente de 0
 * mantém o tubo reto inclinado (sem rota). DN do ramal diferente do da corrida: tubo curto de DN da corrida e redução depois do tê.
 */

/** Margem (m) somada ao dobro do recuo da curva para o menor trecho entre dois joelhos, e desvio (m) de U/Z sem curva no catálogo. PROVISÓRIOS, não vêm de catálogo nem de norma: CONFERIR. */
const MARGEM_ENTRE_JOELHOS = 0.02;
const DESVIO_SEM_CURVA = 0.1;
/** Folga (m) somada ao tubo curto do tê até a redução, para a conta não cair no limite exato do mínimo. */
const FOLGA_DO_PE = 0.0005;
/** Seno de 2,5° (tolerância angular das regras): direção perpendicular à corrida. */
const SENO_TOLERANCIA = 0.0436;

/** Ajustes e contexto que a conferência precisa (montados pela ferramenta a cada chamada). */
export interface EntradaRota {
  projeto: Project;
  ctx: ContextoTraco;
  regras: RegrasConexao | null;
  levelId: string;
  dn: number;
  modo: ModoCota;
  declividade: number;
  luvaEmLinha: boolean;
  /** Ficha C8a: o trecho sai e chega de frente para a direção das entradas de caixa e dispositivo (Eletroduto). */
  respeitaEntradas: boolean;
}

/** Cadeia de pontos e o DN de cada trecho (`dns.length === pts.length - 1`). */
export interface PlanoCadeia {
  pts: PontoTubo[];
  dns: number[];
}

/** Bloqueio com motivo, sugestão e se a sugestão entra na fala do clique. */
export interface BloqueioRota {
  motivo: string;
  sugestao: string | null;
  naFala: boolean;
}

/** Resultado de `TuboTool.verificar`: o bloqueio ou a cadeia de pontos, as instâncias e o DN de cada trecho. */
export interface Verificacao {
  bloqueio: BloqueioRota | null;
  pts: PontoTubo[];
  cadeia: Array<Component | null>;
  dns?: number[];
}

const iguais = (x: number, y: number): boolean => Math.abs(x - y) <= 0.5;
const dist = (u: readonly number[], v: readonly number[]): number => Math.hypot((u[0] ?? 0) - (v[0] ?? 0), (u[1] ?? 0) - (v[1] ?? 0), (u[2] ?? 0) - (v[2] ?? 0));

function unitario(u: readonly number[], v: readonly number[]): [number, number, number] {
  const n = dist(u, v) || 1;
  return [((v[0] ?? 0) - (u[0] ?? 0)) / n, ((v[1] ?? 0) - (u[1] ?? 0)) / n, ((v[2] ?? 0) - (u[2] ?? 0)) / n];
}

/** Plano do trecho sem derivação. Com entrada de caixa ou dispositivo numa ponta (ficha C8a) o caminho é calculado em 90° respeitando a direção dela; sem caminho cai no plano de sempre, com aviso. */
export function planoSemDerivacao(e: EntradaRota, a: PontoTubo, b: PontoTubo, avisos: string[]): PlanoPrumada {
  const saida = a.direcao ? eixoDaDirecao(a.direcao) : null;
  const dirB = b.direcao ? eixoDaDirecao(b.direcao) : null;
  if ((saida || dirB) && e.respeitaEntradas && e.declividade === 0 && e.modo !== 'diagonal') {
    const [r0, r1] = recuosDoJoelho(e.projeto, e.regras, e.dn, [0, 0, 0], [1, 0, 0], [1, 1, 0]);
    const recuo = Math.max(r0, r1);
    const caminho = planejarCaminhoOrtogonal(a.xyz, b.xyz, saida, dirB ? eixoOposto(dirB) : null, e.modo, recuo > 0 ? 2 * recuo + MARGEM_ENTRE_JOELHOS : 0.05, recuo > 0 ? 3 * recuo : DESVIO_SEM_CURVA);
    if (caminho) return { bloqueio: null, intermediarios: caminho.intermediarios };
    avisos.push('Sem caminho em 90° que respeite a direção das entradas: o trecho foi ligado direto e a rede pode acusar ligação incompatível.');
  }
  return planejarPrumada(a.xyz, b.xyz, e.modo, e.declividade, e.ctx.familia.id);
}

/** Famílias do projeto mais as da biblioteca que as regras citam (a conta de recuo vale antes de a conexão estar gravada). */
function familiasDasRegras(p: Project, regras: RegrasConexao): Record<string, Familia> {
  const fams: Record<string, Familia> = {};
  for (const id of Object.values(regras)) {
    const f = id !== '' ? (p.componentFamilies?.[id] ?? familiaDaBiblioteca(id)) : undefined;
    if (f) fams[id] = f;
  }
  return { ...fams, ...(p.componentFamilies ?? {}) };
}

/** Recuo (m) do ramal no tê ou na junção de `sob` em `xyz` para o ramal na direção `dir` e bitola `dnRamal`; null se não há peça para o ângulo. */
function recuoDaDerivacao(p: Project, regras: RegrasConexao, sob: MeioDeTubo, xyz: readonly number[], dir: readonly number[], dnRamal: number): number | null {
  const fim: PontoSegmento = [(xyz[0] ?? 0) + (dir[0] ?? 0), (xyz[1] ?? 0) + (dir[1] ?? 0), (xyz[2] ?? 0) + (dir[2] ?? 0)];
  const r = avaliarDerivacao({ a: sob.ext.a, b: sob.ext.b, dn: sob.ext.dn }, [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0], { a: [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0], b: fim, dn: dnRamal }, 'a', regras);
  const fam = r.conexao ? (p.componentFamilies?.[r.conexao.familiaId] ?? familiaDaBiblioteca(r.conexao.familiaId)) : undefined;
  const pos = r.conexao && fam ? posicionarConexao(fam, [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0], r.conexao) : null;
  return pos ? (pos.recuos[2] ?? 0) : null;
}

/** Bloqueio de derivação em tipo que não deriva (corrugado; rígido sem tê); null se pode ou se nenhum ponto é derivação. */
export function bloqueioDeDerivacao(ctx: ContextoTraco, regras: RegrasConexao | null, a: PontoTubo, b: PontoTubo): Verificacao | null {
  if (!a.derivacao && !b.derivacao) return null;
  const sem = semDerivacao(ctx.familia.id, regras, ctx.pontas.inicio.dominio);
  return sem ? { bloqueio: { motivo: sem.motivo, sugestao: sem.sugestao, naFala: true }, pts: [a, b], cadeia: [] } : null;
}

/** Peça que falta num nó da cadeia (derivação sem peça para o ângulo, joelho ou redução que o tipo não tem); `null` se todos os nós têm peça. */
function pecaFaltando(e: EntradaRota, plano: PlanoCadeia, fams: Record<string, Familia>): BloqueioRota | null {
  const regras = e.regras;
  if (!regras) return null;
  const { pts, dns } = plano;
  const n = pts.length;
  const falta = (motivo: string | null, sugestao: string | null = null): BloqueioRota => ({ motivo: motivo ?? 'Sem conexão para este encontro.', sugestao, naFala: true });
  for (const [ponta, pt] of [['a', pts[0]], ['b', pts[n - 1]]] as const) {
    if (!pt?.derivacao) continue;
    const sob = tuboSob(e.projeto, e.ctx.familia.id, pt.xyz, 1e-6, 1e-6);
    if (!sob) continue;
    const k = ponta === 'a' ? 0 : n - 2;
    const r = avaliarDerivacao({ a: sob.ext.a, b: sob.ext.b, dn: sob.ext.dn }, pt.xyz, { a: (pts[k] as PontoTubo).xyz, b: (pts[k + 1] as PontoTubo).xyz, dn: dns[k] as number }, ponta, regras);
    if (!r.conexao) return falta(r.aviso);
  }
  for (let k = 1; k < n - 1; k++) {
    const p0 = (pts[k - 1] as PontoTubo).xyz;
    const p1 = (pts[k] as PontoTubo).xyz;
    const p2 = (pts[k + 1] as PontoTubo).xyz;
    const r = avaliarEncontro({ a: p0, b: p1, dn: dns[k - 1] as number }, 'b', { a: p1, b: p2, dn: dns[k] as number }, 'a', regras, fams);
    if (!r.conexao) return falta(r.aviso, iguais(dns[k - 1] as number, dns[k] as number) ? null : `Sugestão: mudar o DN do trecho para o da corrida (DN ${dns[k - 1]}).`);
  }
  return null;
}

/**
 * Confere a cadeia SEM gravar (o clique e a prévia usam a mesma conta): cria as instâncias, confere as peças dos nós (`exigirPecas`) e a
 * viabilidade de cada trecho com os recuos reais dos joelhos, do tê e da redução. Devolve o bloqueio com motivo e sugestão, ou a cadeia.
 */
export function conferirCadeia(e: EntradaRota, plano: PlanoCadeia, avisos: string[], exigirPecas: boolean): Verificacao {
  const { pts, dns } = plano;
  const a = pts[0] as PontoTubo;
  const b = pts[pts.length - 1] as PontoTubo;
  const cadeia = pts.slice(1).map((q, k) => trechoDeTubo((pts[k] as PontoTubo).xyz, q.xyz, e.ctx.familia, dns[k] as number, { id: newId('cm'), levelId: e.levelId }));
  if (cadeia.some((c) => !c)) return { bloqueio: null, pts, cadeia, dns };
  if (exigirPecas && e.regras) {
    const falta = pecaFaltando(e, plano, familiasDasRegras(e.projeto, e.regras));
    if (falta) return { bloqueio: falta, pts, cadeia, dns };
  }
  const regras = e.regras;
  const derivando = a.derivacao === true || b.derivacao === true;
  const joelhos = pts.map((q, k) => (k > 0 && k < pts.length - 1 ? recuosDoJoelho(e.projeto, regras, dns[k - 1] as number, (pts[k - 1] as PontoTubo).xyz, q.xyz, (pts[k + 1] as PontoTubo).xyz, dns[k]) : ([0, 0] as [number, number])));
  const viabilidade = (de: PontoTubo, para: PontoTubo, dn: number, recuos?: { a: number; b: number }) => viabilidadeDoTrecho(e.projeto, e.ctx.familia, e.ctx.pontas.inicio.dominio, regras, dn, de, para, recuos, e.luvaEmLinha);
  for (let k = 0; k < cadeia.length; k++) {
    const viab = viabilidade(pts[k] as PontoTubo, pts[k + 1] as PontoTubo, dns[k] as number, { a: (joelhos[k] as [number, number])[1], b: (joelhos[k + 1] as [number, number])[0] });
    if (viab.bloqueio) {
      let sugestao = sugestaoDeBloqueio(regras, viab.codigo, a, b, viab.faltam, (c) => viabilidade(a, c, dns[0] as number).bloqueio === null);
      if (!sugestao && derivando && (viab.codigo === 'trecho_curto' || viab.codigo === 'conexoes_se_tocam')) sugestao = 'Sugestão: derive mais longe das conexões vizinhas ou alongue o trecho.';
      return { bloqueio: { motivo: viab.bloqueio, sugestao, naFala: true }, pts, cadeia, dns };
    }
    avisos.push(...viab.avisos);
  }
  return { bloqueio: null, pts, cadeia, dns };
}

/** Quadro da rota: gira o mundo em torno de `o` para o eixo X ficar ao longo da corrida (os joelhos de 90° valem em qualquer ângulo de tubo). */
interface Quadro {
  cs: number;
  sn: number;
  o: readonly number[];
}

const paraQuadro = (q: Quadro, p: readonly number[]): PontoSegmento => [q.cs * ((p[0] ?? 0) - (q.o[0] ?? 0)) + q.sn * ((p[1] ?? 0) - (q.o[1] ?? 0)), -q.sn * ((p[0] ?? 0) - (q.o[0] ?? 0)) + q.cs * ((p[1] ?? 0) - (q.o[1] ?? 0)), p[2] ?? 0];
const doQuadro = (q: Quadro, p: readonly number[]): [number, number, number] => [(q.o[0] ?? 0) + q.cs * (p[0] ?? 0) - q.sn * (p[1] ?? 0), (q.o[1] ?? 0) + q.sn * (p[0] ?? 0) + q.cs * (p[1] ?? 0), p[2] ?? 0];
const eixoMundo = (q: Quadro, e: Eixo): [number, number, number] => [q.cs * e[0] - q.sn * e[1], q.sn * e[0] + q.cs * e[1], e[2]];

/** Sentidos do quadro perpendiculares à corrida (o ramal de um tê); a bitola e o lado do ramal decidem o resto. */
function perpendiculares(q: Quadro, sob: MeioDeTubo): Eixo[] {
  const c = unitario(sob.ext.a, sob.ext.b);
  return EIXOS.filter((e) => Math.abs(eixoMundo(q, e).reduce((s, v, i) => s + v * (c[i] as number), 0)) <= SENO_TOLERANCIA);
}

/** Sentido de uma direção do mundo no quadro, ou null se não é um eixo dele. */
function eixoNoQuadro(q: Quadro, d: readonly number[]): Eixo | null {
  return eixoDaDirecao([q.cs * (d[0] ?? 0) + q.sn * (d[1] ?? 0), -q.sn * (d[0] ?? 0) + q.cs * (d[1] ?? 0), d[2] ?? 0]);
}

/** Caminhos em eixos de `a` a `b` com as saídas e chegadas permitidas pelo tê (corrida perpendicular) e pelas portas com direção. */
function rotasEmEixos(e: EntradaRota, a: PontoTubo, b: PontoTubo, sobA: MeioDeTubo | null, sobB: MeioDeTubo | null): PlanoCadeia[] {
  const regras = e.regras;
  const corrida = sobA ?? sobB;
  if (!regras || !corrida) return [];
  const th = Math.atan2(corrida.ext.b[1] - corrida.ext.a[1], corrida.ext.b[0] - corrida.ext.a[0]);
  const q: Quadro = { cs: Math.cos(th), sn: Math.sin(th), o: a.xyz };
  let saidas: readonly Eixo[] | null = null;
  let chegadas: readonly Eixo[] | null = null;
  if (a.derivacao && sobA) saidas = perpendiculares(q, sobA);
  else if (a.direcao) saidas = [eixoNoQuadro(q, a.direcao)].filter((x): x is Eixo => x !== null);
  if (b.derivacao && sobB) chegadas = perpendiculares(q, sobB);
  else if (b.direcao) chegadas = [eixoNoQuadro(q, b.direcao)].filter((x): x is Eixo => x !== null).map(eixoOposto);
  if ((saidas && saidas.length === 0) || (chegadas && chegadas.length === 0)) return [];
  const lateral: [number, number, number] = [-q.sn, q.cs, 0];
  const rTe = Math.max(sobA ? (recuoDaDerivacao(e.projeto, regras, sobA, a.xyz, lateral, e.dn) ?? 0) : 0, sobB ? (recuoDaDerivacao(e.projeto, regras, sobB, b.xyz, lateral, e.dn) ?? 0) : 0);
  const [r0, r1] = recuosDoJoelho(e.projeto, regras, e.dn, [0, 0, 0], [1, 0, 0], [1, 1, 0]);
  const recuo = Math.max(r0, r1, rTe);
  const caminhos = listarCaminhosOrtogonais(paraQuadro(q, a.xyz), paraQuadro(q, b.xyz), saidas, chegadas, e.modo, recuo > 0 ? 2 * recuo + MARGEM_ENTRE_JOELHOS : 0.05, recuo > 0 ? 3 * recuo : DESVIO_SEM_CURVA);
  return caminhos.map((c) => {
    const pts: PontoTubo[] = [a, ...c.intermediarios.map((p): PontoTubo => ({ xyz: doQuadro(q, p), alvo: null })), b];
    return { pts, dns: pts.slice(1).map(() => e.dn) };
  });
}

/**
 * Comprimento (m) do tubo curto de DN da corrida entre o tê e a redução do ramal: recuo do tê + recuo da redução (lado grande) + o tubo
 * mínimo do tipo (F1) e, se maior, o diâmetro externo (a prumada pede). Bloqueio se o tipo não tem redução ou não tem o par de bitolas.
 */
function comprimentoDoPe(e: EntradaRota, fams: Record<string, Familia>, sob: MeioDeTubo, xyz: readonly number[], dir: readonly number[]): number | BloqueioRota {
  const regras = e.regras as RegrasConexao;
  const dnC = sob.ext.dn;
  const sugestao = `Sugestão: mudar o DN do trecho para ${dnC} (o da corrida) ou escolher um tipo com redução desse par.`;
  if (regras.reducao === '') return { motivo: `Este tipo de tubulação não tem redução: o ramal (DN ${e.dn}) precisa ter o DN da corrida (DN ${dnC}).`, sugestao, naFala: true };
  const mais = (s: number): PontoSegmento => [(xyz[0] ?? 0) + (dir[0] ?? 0) * s, (xyz[1] ?? 0) + (dir[1] ?? 0) * s, (xyz[2] ?? 0) + (dir[2] ?? 0) * s];
  const r = avaliarEncontro({ a: mais(-1), b: mais(0), dn: dnC }, 'b', { a: mais(0), b: mais(1), dn: e.dn }, 'a', regras, fams);
  if (!r.conexao || r.conexao.tipo !== 'reducao') return { motivo: r.aviso ?? `Não há redução de DN ${dnC} para DN ${e.dn} neste tipo de tubulação.`, sugestao, naFala: true };
  const te = recuoDaDerivacao(e.projeto, regras, sob, xyz, dir, dnC) ?? 0;
  const [grande] = recuosDoJoelho(e.projeto, regras, dnC, mais(-1), mais(0), mais(1), e.dn);
  const minimo = trechoMinimoDe(tipoDaFamiliaDeTubo(e.ctx.familia.id)) / 1000;
  return Math.max(te + grande + minimo + FOLGA_DO_PE, diametroExterno(e.ctx.familia, dnC) / 1000 + FOLGA_DO_PE);
}

/** Planta o tubo curto + redução nas pontas em derivação cujo DN da corrida difere do ramal (a cadeia ganha um trecho de DN da corrida). */
function comPes(e: EntradaRota, plano: PlanoCadeia, sobA: MeioDeTubo | null, sobB: MeioDeTubo | null, fams: Record<string, Familia>): PlanoCadeia | BloqueioRota {
  let { pts, dns } = plano;
  const curto = (nome: string, ls: number, len: number): BloqueioRota => ({ motivo: `Trecho curto demais: o ${nome} do ramal tem ${Math.round(len * 1000)} mm e o tubo curto mais a redução precisam de ${Math.round(ls * 1000)} mm.`, sugestao: 'Sugestão: afaste o ponto final ou use o DN da corrida.', naFala: true });
  if (sobA && !iguais(sobA.ext.dn, dns[0] as number)) {
    const dir = unitario((pts[0] as PontoTubo).xyz, (pts[1] as PontoTubo).xyz);
    const ls = comprimentoDoPe(e, fams, sobA, (pts[0] as PontoTubo).xyz, dir);
    if (typeof ls !== 'number') return ls;
    const len = dist((pts[0] as PontoTubo).xyz, (pts[1] as PontoTubo).xyz);
    if (ls >= len - 1e-4) return curto('primeiro trecho', ls, len);
    const p = (pts[0] as PontoTubo).xyz;
    pts = [pts[0] as PontoTubo, { xyz: [p[0] + dir[0] * ls, p[1] + dir[1] * ls, p[2] + dir[2] * ls], alvo: null }, ...pts.slice(1)];
    dns = [sobA.ext.dn, ...dns];
  }
  if (sobB && !iguais(sobB.ext.dn, dns[dns.length - 1] as number)) {
    const n = pts.length;
    const p = (pts[n - 1] as PontoTubo).xyz;
    const dir = unitario(p, (pts[n - 2] as PontoTubo).xyz);
    const ls = comprimentoDoPe(e, fams, sobB, p, dir);
    if (typeof ls !== 'number') return ls;
    const len = dist(p, (pts[n - 2] as PontoTubo).xyz);
    if (ls >= len - 1e-4) return curto('último trecho', ls, len);
    pts = [...pts.slice(0, n - 1), { xyz: [p[0] + dir[0] * ls, p[1] + dir[1] * ls, p[2] + dir[2] * ls], alvo: null }, pts[n - 1] as PontoTubo];
    dns = [...dns, sobB.ext.dn];
  }
  return { pts, dns };
}

/**
 * Verificação de um trecho com derivação na origem, no alvo ou nos dois: a MENOR rota viável (reta quando ela já fecha, senão em eixos).
 * Mantém o motivo da primeira rota em eixos que falhou (a mais curta) para a prévia vermelha e a fala.
 */
function verificarComDerivacao(e: EntradaRota, a: PontoTubo, b: PontoTubo, avisos: string[]): Verificacao {
  const regras = e.regras as RegrasConexao;
  const fam = e.ctx.familia.id;
  const sobA = a.derivacao ? tuboSob(e.projeto, fam, a.xyz, 1e-6, 1e-6) : null;
  const sobB = b.derivacao ? tuboSob(e.projeto, fam, b.xyz, 1e-6, 1e-6) : null;
  const fams = familiasDasRegras(e.projeto, regras);
  const planos: Array<{ plano: PlanoCadeia; reta: boolean }> = [];
  const reta = planejarPrumada(a.xyz, b.xyz, e.modo, e.declividade, fam);
  if (reta.bloqueio === null && reta.intermediarios.length === 0) planos.push({ plano: { pts: [a, b], dns: [e.dn] }, reta: true });
  if (e.declividade === 0) planos.push(...rotasEmEixos(e, a, b, sobA, sobB).map((plano) => ({ plano, reta: false })));
  let erroReta: Verificacao | null = null;
  let erroRota: Verificacao | null = null;
  for (const { plano, reta: ehReta } of planos) {
    const comPe = comPes(e, plano, sobA, sobB, fams);
    const avisosDoPlano: string[] = [];
    const v: Verificacao = 'motivo' in comPe ? { bloqueio: comPe, pts: plano.pts, cadeia: [], dns: plano.dns } : conferirCadeia(e, comPe, avisosDoPlano, true);
    if (!v.bloqueio) {
      avisos.push(...avisosDoPlano);
      return v;
    }
    if (ehReta) erroReta ??= v;
    else erroRota ??= v;
  }
  const semRota: Verificacao = { bloqueio: { motivo: 'Não há rota com os joelhos do tipo entre os dois pontos: o ramal sai do tê perpendicular ao tubo (ao lado, subindo ou descendo) e chega de frente para a porta.', sugestao: 'Sugestão: mude a cota ou clique um ponto intermediário.', naFala: true }, pts: [a, b], cadeia: [] };
  if (!erroRota && !erroReta && reta.bloqueio) return { bloqueio: { motivo: reta.bloqueio, sugestao: null, naFala: false }, pts: [], cadeia: [] };
  return erroRota ?? erroReta ?? semRota;
}

/**
 * Verificação do trecho `a`→`b` (a conta única do clique e da prévia). Com ponto do meio de tubo: derivação e rota até o alvo; sem ele,
 * o plano de sempre (prumada, entradas de caixa) conferido por `conferirCadeia`.
 */
export function verificarTraco(e: EntradaRota, a: PontoTubo, b: PontoTubo, avisos: string[]): Verificacao {
  const impossivel = bloqueioDeDerivacao(e.ctx, e.regras, a, b);
  if (impossivel) return impossivel;
  if ((a.derivacao || b.derivacao) && e.regras) return verificarComDerivacao(e, a, b, avisos);
  const plano = planoSemDerivacao(e, a, b, avisos);
  if (plano.bloqueio !== null) return { bloqueio: { motivo: plano.bloqueio, sugestao: sugestaoDeBloqueio(e.regras, 'angulo', a, b, undefined, () => true), naFala: false }, pts: [], cadeia: [] };
  const pts: PontoTubo[] = [a, ...plano.intermediarios.map((q): PontoTubo => ({ xyz: [q[0], q[1], q[2]], alvo: null })), b];
  return conferirCadeia(e, { pts, dns: pts.slice(1).map(() => e.dn) }, avisos, false);
}
