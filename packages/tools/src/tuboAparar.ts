import { intersectLines, type Vec2 } from '@hestia/geom';
import { avaliarEncontro, frameOfWall, type RegrasConexao, type TrechoEncontro } from '@hestia/engine';
import { isComponent, isWall, type Component, type Id, type Project } from '@hestia/model';
import { aparar, derivarNoMeio, garantirFamilias, inserirConexao, type Aparo } from './tuboDerivacao.ts';
import { pontasDoTubo, ligacoesAbertas, type ContextoTraco } from './tuboApoio.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';
import { verificarTraco, type EntradaRota } from './tuboRota.ts';
import { bloqueio, comandoDePose, planoVazio, vizinhoDaPonta, type PassoDoPlano, type PlanoTrecho, type V3 } from './tuboPegadoresPlano.ts';
import { semDerivacao } from './tuboMeio.ts';
import { ehCorrugado, opcoesDoDominio, pontoDaPorta, regrasDoTrecho, trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';
import type { ToolEnv } from './types.ts';

/*
 * Aparar e Estender sobre tubo e eletroduto (fase 4, ficha F6a; no Revit, Trim/Extend funciona em tubo e conduit). A ponta que SAI é a do
 * lado oposto ao clique (o clique marca a parte que fica, como nas paredes). Referências: outro tubo (a ponta vai ao cruzamento dos
 * eixos em planta; no meio dele entra o tê ou a junção do tipo, e na ponta aberta o joelho), parede (a ponta vai ao eixo dela) ou peça (rota
 * até a porta livre). Dois tubos pelo 'canto' fecham o canto com o joelho do tipo e os recuos e tubos curtos da F1. Corrugado: sem peça,
 * a ponta liga direto e o raio mínimo é conferido. Tudo é PLANO puro (`PlanoTrecho`): quem aplica ensaia e grava num passo de desfazer.
 */

/** Distância (m) das pontas de um tubo de referência abaixo da qual o cruzamento conta como NA ponta (e não no meio). */
const MARGEM = 0.02;
/** Diferença de cota (m) tolerada entre os eixos que se encontram. */
const TOL_COTA = 0.001;

export type Referencia = { tipo: 'tubo' | 'parede' | 'peca'; id: Id; at: Vec2 };

const v2 = (q: readonly number[]): Vec2 => ({ x: q[0] ?? 0, y: q[1] ?? 0 });
const dir2 = (t: TrechoAlvo): Vec2 => ({ x: t.b[0] - t.a[0], y: t.b[1] - t.a[1] });
const plano2 = (t: TrechoAlvo): number => Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
const cotaEm = (t: TrechoAlvo, s: number): number => t.a[2] + s * (t.b[2] - t.a[2]);
// units-ok: mensagem em mm por contrato do motor
const mm = (m: number): string => String(Math.round(m * 1000));

/** Ponta que sai: a mais longe do clique (o clique marca a parte que fica). */
export const fimQueSai = (t: TrechoAlvo, at: Vec2): 'a' | 'b' => (Math.hypot(at.x - t.a[0], at.y - t.a[1]) > Math.hypot(at.x - t.b[0], at.y - t.b[1]) ? 'a' : 'b');

interface Cruzamento {
  X: Vec2;
  /** Parâmetro (0 em `a`, 1 em `b`) do cruzamento ao longo do alvo e da referência, em planta. */
  sT: number;
  sR: number;
}

/** Cruzamento dos eixos em planta; `null` se paralelos. */
function cruzar(t: TrechoAlvo, r: { a: readonly number[]; b: readonly number[] }): Cruzamento | null {
  const d = dir2(t);
  const e = { x: (r.b[0] ?? 0) - (r.a[0] ?? 0), y: (r.b[1] ?? 0) - (r.a[1] ?? 0) };
  const i = intersectLines(v2(t.a), d, v2(r.a), e);
  return i ? { X: i.point, sT: i.t, sR: i.u } : null;
}

const horizontal = (t: TrechoAlvo): boolean => plano2(t) > 1e-3;

/** O cruzamento fica do lado da ponta que SAI? (nunca do lado que o clique manda ficar). */
function ladoCerto(t: TrechoAlvo, fim: 'a' | 'b', at: Vec2, sT: number): boolean {
  const h = plano2(t);
  const sc = ((at.x - t.a[0]) * (t.b[0] - t.a[0]) + (at.y - t.a[1]) * (t.b[1] - t.a[1])) / (h * h);
  return fim === 'b' ? sT >= sc - 1e-6 : sT <= sc + 1e-6;
}

const contextoDe = (p: Project, t: TrechoAlvo): ContextoTraco | null => {
  const familia = p.componentFamilies?.[t.tubo.c.familyId];
  const pontas = familia ? pontasDoTubo(familia, t.tubo.dn) : null;
  return familia && pontas ? { familia, pontas } : null;
};

const ligDe = (t: TrechoAlvo, fim: 'a' | 'b'): string => (fim === 'a' ? t.tubo.idA : t.tubo.idB);

/** Verificação comum da ponta que sai: tem de ser livre (a ponta ligada a conexão anda pelo pegador, não pelo Aparar). */
function pontaOcupada(p: Project, t: TrechoAlvo, fim: 'a' | 'b'): string | null {
  const v = vizinhoDaPonta(p, t.tubo.c, ligDe(t, fim));
  return v ? `a ponta que sairia está ligada a ${v.comp.mark.trim() !== '' ? v.comp.mark : (p.componentFamilies?.[v.comp.familyId]?.nome ?? v.comp.familyId)}.` : null;
}
const SUGESTAO_OCUPADA = 'Sugestão: arraste a ponta com o pegador (a conexão acompanha) ou solte a ligação com Alt.';

/** Ponta do trecho `t` levada a `x` (m), na cota da reta dele. */
function levarPonta(t: TrechoAlvo, fim: 'a' | 'b', X: Vec2): [V3, V3] {
  const h = plano2(t);
  const s = ((X.x - t.a[0]) * (t.b[0] - t.a[0]) + (X.y - t.a[1]) * (t.b[1] - t.a[1])) / (h * h);
  const novo: V3 = [X.x, X.y, cotaEm(t, s)];
  return fim === 'a' ? [novo, t.b] : [t.a, novo];
}

// ---- passos de gravação -------------------------------------------------------------------------------------------------------

/** Passo: leva a ponta `fim` de `T` ao ponto `X` do MEIO do tubo `R` e instala o tê ou a junção do tipo (divide `R`). */
function passoDerivar(T: TrechoAlvo, fim: 'a' | 'b', a: V3, b: V3, X: V3): PassoDoPlano {
  return (env, avisos) => {
    const pr0 = env.project();
    const ctx = contextoDe(pr0, T);
    const regras = regrasDoTrecho(T.tubo);
    const pose = comandoDePose(pr0, T, a, b);
    if (!ctx || !regras || !pose) return false;
    garantirFamilias(env, ctx, regras, true);
    env.exec(pose);
    const aparos: Aparo[] = [];
    const novo: TrechoEncontro = { a, b, dn: T.tubo.dn };
    return derivar(env, ctx, T, fim, X, novo, regras, aparos, avisos);
  };
}

function derivar(env: ToolEnv, ctx: ContextoTraco, T: TrechoAlvo, fim: 'a' | 'b', X: V3, novo: TrechoEncontro, regras: RegrasConexao, aparos: Aparo[], avisos: string[]): boolean {
  const pt: PontoTubo = { xyz: X, alvo: null, derivacao: true };
  derivarNoMeio(env, ctx, T.id, ligDe(T, fim), fim, pt, novo, regras, aparos, avisos);
  for (const ap of aparos) aparar(env, ap.id, ap.ponta, ap.recuo, avisos);
  const c = env.project().elements[T.id];
  return isComponent(c) && c.ligacoes?.[ligDe(T, fim)] !== undefined;
}

/** Passo: leva as pontas `fimA` de `A` e `fimB` de `B` ao canto `X` e as liga (joelho do tipo com recuos, luva em linha reta; corrugado: ligação direta). */
function passoCanto(A: TrechoAlvo, fimA: 'a' | 'b', poseA: [V3, V3], B: TrechoAlvo, fimB: 'a' | 'b', poseB: [V3, V3], X: V3): PassoDoPlano {
  return (env, avisos) => {
    const pr0 = env.project();
    const ctx = contextoDe(pr0, A);
    const cmdA = comandoDePose(pr0, A, poseA[0], poseA[1]);
    const cmdB = comandoDePose(pr0, B, poseB[0], poseB[1]);
    if (!ctx || !cmdA || !cmdB) return false;
    const regras = regrasDoTrecho(A.tubo);
    if (regras) garantirFamilias(env, ctx, regras, true);
    env.exec(cmdA);
    env.exec(cmdB);
    const ligA = ligDe(A, fimA);
    const ligB = ligDe(B, fimB);
    if (!regras) {
      env.exec({ type: 'connectComponents', a: A.id, ligacaoA: ligA, b: B.id, ligacaoB: ligB });
      return true;
    }
    const pr = env.project();
    const extA = extremosDoTubo(pr, pr.elements[A.id] as Component);
    const extB = extremosDoTubo(pr, pr.elements[B.id] as Component);
    if (!extA || !extB) return false;
    const r = avaliarEncontro({ a: extA.a, b: extA.b, dn: extA.dn }, fimA, { a: extB.a, b: extB.b, dn: extB.dn }, fimB, regras, pr.componentFamilies);
    if (r.aviso) avisos.push(r.aviso);
    if (!r.conexao) return false;
    if (r.conexao.tipo === 'luva' && A.ferramenta !== 'eletroduto') {
      env.exec({ type: 'connectComponents', a: A.id, ligacaoA: ligA, b: B.id, ligacaoB: ligB });
      return true;
    }
    const pos = inserirConexao(env, r.conexao, X, [{ componentId: A.id, ligacaoId: ligA }, { componentId: B.id, ligacaoId: ligB }], avisos);
    if (!pos) return false;
    aparar(env, A.id, fimA, pos.recuos[0] ?? 0, avisos);
    aparar(env, B.id, fimB, pos.recuos[1] ?? 0, avisos);
    return true;
  };
}

// ---- planos ------------------------------------------------------------------------------------------------------------------

const fantasma = (t: TrechoAlvo, a: V3, b: V3): PlanoTrecho['fantasmas'][number] => ({ a, b, dn: t.tubo.dn });

function entradaDe(p: Project, t: TrechoAlvo, ctx: ContextoTraco, respeitaEntradas: boolean): EntradaRota {
  return { projeto: p, ctx, regras: regrasDoTrecho(t.tubo), levelId: t.tubo.c.levelId, dn: t.tubo.dn, modo: opcoesDoDominio(t.ferramenta).modoCota, declividade: 0, luvaEmLinha: t.ferramenta === 'eletroduto', respeitaEntradas };
}

/** Rota a partir da ponta livre de `T` até `b` (derivação no meio de um tubo ou porta de uma peça): a MESMA conta do Tubo (F5), gravada pela ferramenta. */
function planoDeRota(p: Project, T: TrechoAlvo, fim: 'a' | 'b', b: PontoTubo, respeitaEntradas: boolean): PlanoTrecho {
  const ctx = contextoDe(p, T);
  const ponta = fim === 'a' ? T.a : T.b;
  const saida = fim === 'a' ? T.tubo.a.direcaoMundo : T.tubo.b.direcaoMundo;
  if (!ctx) return bloqueio('a família do trecho não tem as duas ligações esperadas.', null, T.a, T.b);
  const de = pontoDaPorta(ponta, T.id, ligDe(T, fim), saida);
  const avisos: string[] = [];
  const v = verificarTraco(entradaDe(p, T, ctx, respeitaEntradas), de, b, avisos);
  if (v.bloqueio) return bloqueio(v.bloqueio.motivo[0]?.toUpperCase() + v.bloqueio.motivo.slice(1), v.bloqueio.sugestao, ponta, b.xyz);
  const pts: PontoTubo[] = v.pts.length >= 2 ? v.pts : [de, b];
  const fantasmas = pts.slice(1).map((q, k) => ({ a: (pts[k] as PontoTubo).xyz, b: q.xyz, dn: v.dns?.[k] ?? T.tubo.dn }));
  return planoVazio({ rotas: [{ trechoId: T.id, de, para: b, pts, dns: v.dns ?? pts.slice(1).map(() => T.tubo.dn) }], fantasmas });
}

/** Aparar ou Estender o trecho `alvo` (o clique `at` marca o lado que fica) até a referência. */
export function planejarAteReferencia(p: Project, alvoId: Id, at: Vec2, ref: Referencia): PlanoTrecho {
  const T = trechoDoProjeto(p, alvoId);
  if (!T) return planoVazio();
  const fim = fimQueSai(T, at);
  const ponta = fim === 'a' ? T.a : T.b;
  if (ref.tipo === 'peca') return ateAPeca(p, T, fim, ref);
  if (!horizontal(T)) return bloqueio('o trecho vertical não tem eixo em planta para estender ou aparar.', 'Sugestão: use o pegador da ponta com a tecla de cota.', T.a, T.b);
  if (ref.tipo === 'parede') return ateAParede(p, T, fim, at, ref);
  const R = trechoDoProjeto(p, ref.id);
  if (!R || R.id === T.id) return planoVazio();
  const ocupada = pontaOcupada(p, T, fim);
  if (ocupada) return bloqueio(ocupada, SUGESTAO_OCUPADA, T.a, T.b);
  if (!horizontal(R)) return bloqueio('o tubo de referência é vertical: não há cruzamento em planta.', null, T.a, T.b);
  const c = cruzar(T, R);
  if (!c) return bloqueio('os dois eixos são paralelos em planta: não há ponto de encontro.', 'Sugestão: use o pegador da ponta ou a ferramenta Tubo.', T.a, T.b);
  const X: V3 = [c.X.x, c.X.y, cotaEm(T, c.sT)];
  if (!ladoCerto(T, fim, at, c.sT)) return bloqueio('o ponto de encontro fica do lado do trecho que deve ficar.', 'Sugestão: clique no outro lado do trecho (o clique marca a parte que fica).', ponta, X);
  const dentroDeR = c.sR * plano2(R) > MARGEM && (1 - c.sR) * plano2(R) > MARGEM;
  if (!dentroDeR) return bloqueio('o tubo de referência não alcança o ponto de encontro: o prolongamento dele não é feito aqui.', 'Sugestão: use o modo Aparar ao canto (estende os dois) ou prolongue o tubo de referência antes.', ponta, X);
  const dz = Math.abs(X[2] - cotaEm(R, c.sR));
  const [a, b] = levarPonta(T, fim, c.X);
  const mesmoDN = T.tubo.dn === R.tubo.dn;
  const corrugado = ehCorrugado(T.tubo) || ehCorrugado(R.tubo);
  const regras = regrasDoTrecho(T.tubo);
  const sem = corrugado ? (semDerivacao(T.tubo.c.familyId, regras, T.tubo.a.dominio) ?? semDerivacao(R.tubo.c.familyId, null, R.tubo.a.dominio)) : semDerivacao(T.tubo.c.familyId, regras, T.tubo.a.dominio);
  if (corrugado || sem) return bloqueio(sem?.motivo ?? 'o eletroduto corrugado não tem tê: não deriva no meio de outro tubo.', sem?.sugestao ?? 'Sugestão: derive de uma caixa (ela tem as entradas).', ponta, X);
  if (dz <= TOL_COTA && mesmoDN) {
    return planoVazio({ passos: [passoDerivar(T, fim, a, b, [X[0], X[1], cotaEm(R, c.sR)])], fantasmas: [fantasma(T, a, b)] });
  }
  // Cotas ou bitolas diferentes: só estende (a ponta é prolongada pela rota do Tubo, F5: prumada, joelhos, tubo curto e redução).
  const estende = (fim === 'b' ? c.sT > 1 : c.sT < 0);
  if (!estende) return bloqueio(dz > TOL_COTA ? `os eixos estão em cotas diferentes (${mm(dz)} mm): aparar não gera prumada.` : 'as bitolas são diferentes: aparar não gera a redução.', 'Sugestão: use Estender (a rota gera a prumada e a redução) ou iguale a cota e a bitola.', ponta, X);
  return planoDeRota(p, T, fim, { xyz: [X[0], X[1], cotaEm(R, c.sR)], alvo: null, derivacao: true }, false);
}

/** A ponta vai ao eixo da parede (em planta), na cota do trecho; sem ligação nenhuma (parede não tem porta). */
function ateAParede(p: Project, T: TrechoAlvo, fim: 'a' | 'b', at: Vec2, ref: Referencia): PlanoTrecho {
  const ponta = fim === 'a' ? T.a : T.b;
  const w = p.elements[ref.id];
  const f = isWall(w) ? frameOfWall(p, w.id) : null;
  if (!f || f.arc) return bloqueio('a parede de referência precisa ser reta.', null, T.a, T.b);
  const ocupada = pontaOcupada(p, T, fim);
  if (ocupada) return bloqueio(ocupada, SUGESTAO_OCUPADA, T.a, T.b);
  const c = cruzar(T, { a: [f.a.x, f.a.y], b: [f.b.x, f.b.y] });
  if (!c) return bloqueio('o trecho é paralelo à parede: não há ponto de encontro.', null, T.a, T.b);
  if (!ladoCerto(T, fim, at, c.sT)) return bloqueio('o eixo da parede fica do lado do trecho que deve ficar.', 'Sugestão: clique no outro lado do trecho.', ponta, [c.X.x, c.X.y, ponta[2]]);
  const [a, b] = levarPonta(T, fim, c.X);
  const pose = comandoDePose(p, T, a, b);
  if (!pose) return bloqueio('o trecho ficaria sem comprimento.', null, T.a, T.b);
  return planoVazio({ comandos: [pose], fantasmas: [fantasma(T, a, b)] });
}

/** Estender até uma peça: a rota do Tubo até a porta livre da peça mais perto do clique. */
function ateAPeca(p: Project, T: TrechoAlvo, fim: 'a' | 'b', ref: Referencia): PlanoTrecho {
  const ponta = fim === 'a' ? T.a : T.b;
  const ocupada = pontaOcupada(p, T, fim);
  if (ocupada) return bloqueio(ocupada, SUGESTAO_OCUPADA, T.a, T.b);
  const portas = ligacoesAbertas(p).filter((l) => l.componentId === ref.id && l.lig.dominio === T.tubo.a.dominio);
  portas.sort((x, y) => Math.hypot(x.lig.posicaoMundo[0] - ref.at.x, x.lig.posicaoMundo[1] - ref.at.y) - Math.hypot(y.lig.posicaoMundo[0] - ref.at.x, y.lig.posicaoMundo[1] - ref.at.y));
  const porta = portas[0];
  if (!porta) return bloqueio('a peça não tem porta livre compatível com o trecho.', 'Sugestão: escolha uma peça com ligação aberta do mesmo tipo.', ponta, ponta);
  const dono = p.elements[ref.id];
  const cat = isComponent(dono) ? p.componentFamilies?.[dono.familyId]?.categoria : undefined;
  const comEntrada = cat !== 'eletroduto' && cat !== 'tubulacao' && cat !== 'conexao_tubo';
  return planoDeRota(p, T, fim, pontoDaPorta(porta.lig.posicaoMundo, ref.id, porta.lig.id, comEntrada ? porta.lig.direcaoMundo : undefined), true);
}

/** Aparar/Estender ao CANTO: as pontas de fora dos dois tubos vão ao cruzamento e se ligam com o joelho do tipo (corrugado: ligação direta). */
export function planejarCanto(p: Project, a: { id: Id; at: Vec2 }, b: { id: Id; at: Vec2 }): PlanoTrecho {
  const A = trechoDoProjeto(p, a.id);
  const B = trechoDoProjeto(p, b.id);
  if (!A || !B || A.id === B.id) return planoVazio();
  const fimA = fimQueSai(A, a.at);
  const fimB = fimQueSai(B, b.at);
  const vermelho = (motivo: string, sugestao: string | null, X?: V3): PlanoTrecho => bloqueio(motivo, sugestao, (fimA === 'a' ? A.a : A.b), X ?? (fimB === 'a' ? B.a : B.b));
  if (!horizontal(A) || !horizontal(B)) return vermelho('um dos trechos é vertical: não há canto em planta.', null);
  const ocA = pontaOcupada(p, A, fimA);
  const ocB = pontaOcupada(p, B, fimB);
  if (ocA ?? ocB) return vermelho((ocA ?? ocB) as string, SUGESTAO_OCUPADA);
  const c = cruzar(A, B);
  if (!c) return vermelho('os dois eixos são paralelos em planta: não há canto.', 'Sugestão: use Alinhar ou a ferramenta Tubo.');
  const zA = cotaEm(A, c.sT);
  const zB = cotaEm(B, c.sR);
  const X: V3 = [c.X.x, c.X.y, zA];
  if (!ladoCerto(A, fimA, a.at, c.sT) || !ladoCerto(B, fimB, b.at, c.sR)) return vermelho('o canto fica do lado de um trecho que deve ficar.', 'Sugestão: clique, em cada trecho, na parte que deve ficar.', X);
  if (Math.abs(zA - zB) > TOL_COTA) return vermelho(`os eixos estão em cotas diferentes no cruzamento (${mm(Math.abs(zA - zB))} mm): o canto não fecha com joelho.`, 'Sugestão: iguale a cota dos dois trechos (pegador do meio com a tecla de cota gera a prumada).', X);
  if (ehCorrugado(A.tubo) !== ehCorrugado(B.tubo)) return vermelho('o canto mistura eletroduto corrugado e rígido.', 'Sugestão: use dois trechos do mesmo tipo.', X);
  const poseA = levarPonta(A, fimA, c.X);
  const poseB = levarPonta(B, fimB, c.X);
  return planoVazio({ passos: [passoCanto(A, fimA, poseA, B, fimB, poseB, X)], fantasmas: [fantasma(A, poseA[0], poseA[1]), fantasma(B, poseB[0], poseB[1])] });
}
