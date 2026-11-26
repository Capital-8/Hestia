import type { Vec2 } from '@hestia/geom';
import { avaliarDerivacao, avaliarEncontro, trechoDeTubo } from '@hestia/engine';
import { isComponent, newId, type Component, type Id, type Project } from '@hestia/model';
import { aparar, garantirFamilias, inserirConexao } from './tuboDerivacao.ts';
import { pontasDoTubo } from './tuboApoio.ts';
import { extremosDoTubo } from './tuboGeometria.ts';
import { semDerivacao } from './tuboMeio.ts';
import { aplicarPlanoTrecho, bloqueio, comandoDePose, itensDoPlanoTrecho, planoVazio, type PassoDoPlano, type PlanoTrecho, type V3 } from './tuboPegadoresPlano.ts';
import { ehCorrugado, regrasDoTrecho, trechoEm, trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';
import type { PointerInfo, PreviewItem, SplitTuboInserir, ToolEnv } from './types.ts';

/*
 * Dividir sobre tubo e eletroduto (fase 4, ficha F6a; no Revit, Split Element divide o tubo e Split with Gap deixa um vão). O trecho é
 * dividido no ponto clicado e, conforme a opção da barra, entra a LUVA do tipo (recuos e tubo curto da F1), a UNIÃO (se o tipo tem; nenhum
 * dos tipos transcritos tem), o TÊ (a derivação abre o traçado do ramal) ou ficam as duas pontas LIVRES. A primeira metade mantém o id e as
 * ligações do início; a segunda leva a ligação do fim.
 */

/** Distância mínima (m) de cada ponta ao corte. */
const MARGEM = 0.05;
/** Comprimento (m) do ramal de referência que só escolhe o tê (o ramal real é traçado depois). */
const RAMAL_REFERENCIA = 0.5;

/** Corte de `t` sob o ponto `at` (plano): o ponto do eixo e a distância s (m) desde a ponta `a`. */
function corte(t: TrechoAlvo, at: Vec2): { X: V3; s: number; L: number } | null {
  const dx = t.b[0] - t.a[0];
  const dy = t.b[1] - t.a[1];
  const h = Math.hypot(dx, dy);
  if (h < 1e-3) return null;
  const k = Math.min(1, Math.max(0, ((at.x - t.a[0]) * dx + (at.y - t.a[1]) * dy) / (h * h)));
  const L = Math.hypot(dx, dy, t.b[2] - t.a[2]);
  return { X: [t.a[0] + k * dx, t.a[1] + k * dy, t.a[2] + k * (t.b[2] - t.a[2])], s: k * L, L };
}

function passoDividir(T: TrechoAlvo, X: V3, opcao: SplitTuboInserir, idSegundo: Id): PassoDoPlano {
  return (env, avisos) => {
    const pr0 = env.project();
    const c = pr0.elements[T.id];
    const fam = isComponent(c) ? pr0.componentFamilies?.[c.familyId] : undefined;
    const pontas = fam ? pontasDoTubo(fam, T.tubo.dn) : null;
    const regras = regrasDoTrecho(T.tubo);
    if (!isComponent(c) || !fam || !pontas) return false;
    if (regras && opcao !== 'livre') garantirFamilias(env, { familia: fam, pontas }, regras, true);
    const primeiro = comandoDePose(pr0, T, T.a, X);
    const segundo = trechoDeTubo(X, T.b, fam, T.tubo.dn, { id: idSegundo, levelId: c.levelId });
    if (!primeiro || !segundo) return false;
    const antigoFim = c.ligacoes?.[T.tubo.idB];
    env.exec({ type: 'addComponent', component: { ...segundo, values: { ...c.values, L: segundo.values?.L ?? 0 } } });
    if (antigoFim) env.exec({ type: 'disconnectComponents', a: T.id, ligacaoA: T.tubo.idB });
    env.exec(primeiro);
    if (antigoFim) env.exec({ type: 'connectComponents', a: idSegundo, ligacaoA: T.tubo.idB, b: antigoFim.componenteId, ligacaoB: antigoFim.ligacaoId });
    if (opcao === 'livre' || !regras) return true;
    const pr = env.project();
    const e1 = extremosDoTubo(pr, pr.elements[T.id] as Component);
    const e2 = extremosDoTubo(pr, pr.elements[idSegundo] as Component);
    if (!e1 || !e2) return false;
    const alvos = [{ componentId: T.id, ligacaoId: T.tubo.idB }, { componentId: idSegundo, ligacaoId: T.tubo.idA }];
    const r = opcao === 'luva'
      ? avaliarEncontro({ a: e1.a, b: e1.b, dn: e1.dn }, 'b', { a: e2.a, b: e2.b, dn: e2.dn }, 'a', regras, pr.componentFamilies)
      : avaliarDerivacao({ a: T.a, b: T.b, dn: T.tubo.dn }, X, { a: X, b: perpendicular(T, X), dn: T.tubo.dn }, 'a', regras);
    if (r.aviso) avisos.push(r.aviso);
    if (!r.conexao) return false;
    if (opcao === 'luva' && r.conexao.tipo !== 'luva') return false;
    const pos = inserirConexao(env, r.conexao, X, alvos, avisos);
    if (!pos) return false;
    ajustarPonta(env, T.id, 'b', pos.recuosComSinal[0] ?? 0, avisos);
    ajustarPonta(env, idSegundo, 'a', pos.recuosComSinal[1] ?? 0, avisos);
    return true;
  };
}

/** Recuo com sinal: positivo encurta a ponta (entra na bolsa), negativo a ESTENDE (a luva pede o tubo mais fundo). */
function ajustarPonta(env: ToolEnv, id: Id, ponta: 'a' | 'b', recuo: number, avisos: string[]): void {
  if (recuo >= 0) return aparar(env, id, ponta, recuo, avisos);
  const pr = env.project();
  const c = pr.elements[id];
  const ext = isComponent(c) ? extremosDoTubo(pr, c) : null;
  if (!isComponent(c) || !ext) return;
  const de = ponta === 'a' ? ext.a : ext.b;
  const para = ponta === 'a' ? ext.b : ext.a;
  const n = Math.hypot(de[0] - para[0], de[1] - para[1], de[2] - para[2]) || 1;
  const k = -recuo / n;
  const novo: V3 = [de[0] + (de[0] - para[0]) * k, de[1] + (de[1] - para[1]) * k, de[2] + (de[2] - para[2]) * k];
  const t = trechoDeTubo(ponta === 'a' ? novo : ext.a, ponta === 'a' ? ext.b : novo, { id: c.familyId }, ext.dn, { id, levelId: c.levelId });
  if (t) env.exec({ type: 'updateComponent', id, patch: { x: t.x, y: t.y, z: t.z, rotation: t.rotation, inclinacao: t.inclinacao, values: { ...c.values, L: t.values?.L ?? 0 } } });
}

/** Ponto do ramal de referência: perpendicular ao eixo, em planta, à esquerda. */
function perpendicular(T: TrechoAlvo, X: V3): V3 {
  const dx = T.b[0] - T.a[0];
  const dy = T.b[1] - T.a[1];
  const h = Math.hypot(dx, dy) || 1;
  return [X[0] - (dy / h) * RAMAL_REFERENCIA, X[1] + (dx / h) * RAMAL_REFERENCIA, X[2]];
}

/** Plano de dividir o trecho `id` no ponto `at` inserindo `opcao`. */
export function planejarDivisao(p: Project, id: Id, at: Vec2, opcao: SplitTuboInserir): PlanoTrecho {
  const T = trechoDoProjeto(p, id);
  if (!T) return planoVazio();
  const c = corte(T, at);
  if (!c) return bloqueio('o trecho vertical não tem corte em planta.', 'Sugestão: divida o trecho com a ferramenta Tubo (ponto intermediário).', T.a, T.b);
  const marco = { a: T.a, b: T.b };
  if (c.s < MARGEM || c.L - c.s < MARGEM) return bloqueio('o corte fica colado numa ponta do trecho.', 'Sugestão: clique mais para o meio do trecho.', marco.a, marco.b);
  const regras = regrasDoTrecho(T.tubo);
  if (opcao !== 'livre' && ehCorrugado(T.tubo)) return bloqueio('o eletroduto corrugado não tem luva, união nem tê: o corte só deixa as duas pontas livres.', 'Sugestão: escolha "Pontas livres" ou derive de uma caixa.', marco.a, c.X);
  if (opcao === 'uniao') return bloqueio(`o tipo de tubulação da família não tem união no catálogo transcrito.`, 'Sugestão: escolha "Luva" (emenda do tipo) ou "Pontas livres".', marco.a, c.X);
  if (opcao === 'luva' && regras && regras.luva === '') return bloqueio('o tipo de tubulação não tem luva neste catálogo.', 'Sugestão: escolha "Pontas livres".', marco.a, c.X);
  if (opcao === 'te') {
    const sem = semDerivacao(T.tubo.c.familyId, regras, T.tubo.a.dominio);
    if (sem) return bloqueio(sem.motivo, sem.sugestao, marco.a, c.X);
  }
  const idSegundo = newId('cm');
  return planoVazio({ passos: [passoDividir(T, c.X, opcao, idSegundo)], fantasmas: [], nota: opcao === 'te' ? 'Tê inserido: o ramal fica aberto.' : undefined, ...(opcao === 'te' ? { alertas: [] } : {}) });
}

/** A parte de tubo da ferramenta Dividir (`SplitTool` delega a ela quando o cursor está sobre um tubo). */
export class DivideTubo {
  constructor(private readonly env: ToolEnv) {}

  private tubo(at: Vec2): TrechoAlvo | null {
    return trechoEm(this.env.project(), this.env.levelId(), at, Math.max(0.02, 6 * this.env.metersPerPixel()));
  }

  trata(at: Vec2): boolean {
    return this.tubo(at) !== null;
  }

  private opcao(): SplitTuboInserir {
    return this.env.options().splitTuboInserir ?? 'luva';
  }

  move(p: PointerInfo): PreviewItem[] | null {
    const t = this.tubo(p.raw);
    if (!t) return null;
    const plano = planejarDivisao(this.env.project(), t.id, p.raw, this.opcao());
    const c = corte(t, p.raw);
    if (plano.bloqueado !== undefined) this.env.say(`Bloqueado: ${plano.bloqueado}${plano.sugestao ? ' ' + plano.sugestao : ''}`);
    const marca: PreviewItem[] = c ? [{ kind: 'point', at: { x: c.X[0], y: c.X[1] } }] : [];
    return [{ kind: 'highlight', ids: [t.id] }, ...marca, ...itensDoPlanoTrecho(this.env.project(), plano)];
  }

  click(p: PointerInfo): void {
    const t = this.tubo(p.raw);
    if (!t) return;
    const opcao = this.opcao();
    const plano = planejarDivisao(this.env.project(), t.id, p.raw, opcao);
    const r = aplicarPlanoTrecho(this.env, plano, 'Dividir tubo');
    if (!r.ok) {
      this.env.say(`Bloqueado: ${r.motivo}`);
      return;
    }
    this.env.say(`Trecho dividido (${opcao === 'livre' ? 'pontas livres' : opcao}). ${r.avisos.join(' ')}`.trim());
    if (opcao !== 'te') return;
    const regras = regrasDoTrecho(t.tubo);
    const c = corte(t, p.raw);
    const pr = this.env.project();
    const te = Object.values(pr.elements).find((e) => isComponent(e) && regras && e.familyId === regras.te && c && Math.hypot(e.x - c.X[0], e.y - c.X[1]) < 1e-3);
    if (te) this.env.abrirTracado?.(te.id);
  }
}
