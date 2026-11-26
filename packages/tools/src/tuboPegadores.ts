import { dist, type Vec2 } from '@hestia/geom';
import { centroDaPeca, classeDe } from '@hestia/engine';
import { isComponent, type Id, type Project } from '@hestia/model';
import { registrarAlcasDeElemento, type GripHold, type GripProvider } from './selectGrips.ts';
import { planejarMeio } from './tuboPegadoresMeio.ts';
import { aplicarPlanoTrecho, bloqueio, ensaiarPlano, itensDoPlanoTrecho, planejarPonta, vizinhoDaPonta, type PlanoTrecho } from './tuboPegadoresPlano.ts';
import { opcoesDoDominio, trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/*
 * Pegadores do trecho selecionado (fase 4, ficha F6a; no Revit, as alças azuis nas pontas e no meio do tubo ou eletroduto). UM trecho
 * selecionado mostra três pontos: as duas pontas (na ponta ligada a uma conexão o pegador fica no NÓ dela) e o meio. Arrastar a ponta
 * prolonga, encurta ou move a ponta (a conexão ligada acompanha, re-resolvida); arrastar o meio move o trecho inteiro e, com Ctrl, leva o
 * eixo à cota do campo Cota (as pontas ligadas ganham a prumada). Alt solta as ligações. A conta está em `tuboPegadoresPlano.ts` e
 * `tuboPegadoresMeio.ts`; aqui só o gesto: prévia viva, bloqueio vermelho e um passo de desfazer ao soltar.
 */

type Parte = 'a' | 'b' | 'meio';

/** Raio (px) do pegador. */
const RAIO_PX = 9;

/** Onde cada pegador fica (m, plano): o nó da conexão na ponta ligada a peça; senão a ponta; o meio do eixo. */
export function posicoesDosPegadores(p: Project, t: TrechoAlvo): Record<Parte, Vec2> {
  const ponta = (fim: 'a' | 'b'): Vec2 => {
    const ligId = fim === 'a' ? t.tubo.idA : t.tubo.idB;
    const v = vizinhoDaPonta(p, t.tubo.c, ligId);
    const e = fim === 'a' ? t.a : t.b;
    if (v && classeDe(p, v.comp) === 'peca') {
      const c = centroDaPeca(p, v.comp);
      return { x: c[0], y: c[1] };
    }
    return { x: e[0], y: e[1] };
  };
  return { a: ponta('a'), b: ponta('b'), meio: { x: (t.a[0] + t.b[0]) / 2, y: (t.a[1] + t.b[1]) / 2 } };
}

/** O único trecho selecionado, no nível da vista. */
function trechoSelecionado(env: ToolEnv): TrechoAlvo | null {
  const sel = env.selection();
  const id = sel.length === 1 ? sel[0] : undefined;
  const pr = env.project();
  const c = id === undefined ? undefined : pr.elements[id];
  return id !== undefined && isComponent(c) && c.levelId === env.levelId() ? trechoDoProjeto(pr, id) : null;
}

/** Pegador sob `at`: as pontas valem mais que o meio quando se sobrepõem (trecho curto). */
export function pegadorEm(p: Project, t: TrechoAlvo, at: Vec2, mpp: number): Parte | null {
  const pos = posicoesDosPegadores(p, t);
  const tol = RAIO_PX * mpp;
  for (const parte of ['a', 'b', 'meio'] as const) if (dist(pos[parte], at) <= tol) return parte;
  return null;
}

/** Cota do campo Cota quando a tecla de cota (Ctrl) está pressionada; senão `undefined` (a ponta mantém a cota ou a declividade). */
const cotaDoGesto = (t: TrechoAlvo, ctrl: boolean): number | undefined => (ctrl ? opcoesDoDominio(t.ferramenta).z : undefined);

/** Plano do gesto: o ponto `pt` (m) é o destino da ponta, ou o ponto onde o pegador do meio foi solto. */
export function planoDoPegador(p: Project, t: TrechoAlvo, parte: Parte, pt: Vec2, partida: Vec2, ctrl: boolean, alt: boolean): PlanoTrecho {
  const cota = cotaDoGesto(t, ctrl);
  if (parte === 'meio') return planejarMeio(p, t.id, { x: pt.x - partida.x, y: pt.y - partida.y }, { ...(cota !== undefined ? { cota } : {}), solta: alt });
  return planejarPonta(p, t.id, parte, pt, { ...(cota !== undefined ? { cota } : {}), solta: alt });
}

/** A prumada ensaia a rota inteira no projeto descartável: se não fecha, vira bloqueio vermelho (a prévia e o clique concordam). */
function conferido(env: ToolEnv, plano: PlanoTrecho): PlanoTrecho {
  const rota = plano.rotas[0];
  if (plano.bloqueado !== undefined || !rota) return plano;
  const r = ensaiarPlano(env, plano, 'ensaio');
  return r.ok ? plano : bloqueio(r.motivo, null, rota.de.xyz, rota.para.xyz);
}

/** O pegador pressionado: guarda o último plano para a prévia e para soltar. */
function pegadorHold(env: ToolEnv, t: TrechoAlvo, parte: Parte, partida: Vec2): GripHold {
  let ultimo: { plano: PlanoTrecho; pt: Vec2 } | null = null;
  const calcula = (p: { raw: Vec2; ctrl: boolean; alt: boolean }, pt: Vec2): PlanoTrecho => {
    const plano = conferido(env, planoDoPegador(env.project(), t, parte, pt, partida, p.ctrl, p.alt));
    ultimo = { plano, pt };
    return plano;
  };
  return {
    at: partida,
    keepsFocus: true,
    drag(p, snap) {
      const pt = snap({ from: parte === 'meio' ? partida : parteOposta(env.project(), t, parte), ignore: new Set<Id>([t.id]) });
      const plano = calcula(p, pt);
      if (plano.bloqueado !== undefined) env.say(`Bloqueado: ${plano.bloqueado}${plano.sugestao ? ' ' + plano.sugestao : ''}`);
      return itensDoPlanoTrecho(env.project(), plano);
    },
    release(p) {
      if (!ultimo) return;
      const plano = calcula(p, ultimo.pt);
      // Sem movimento e sem cota não há o que gravar (soltar no mesmo lugar).
      if (plano.bloqueado === undefined && plano.comandos.length === 0 && plano.rotas.length === 0) return;
      const r = aplicarPlanoTrecho(env, plano, 'Editar trecho');
      if (!r.ok) {
        env.say(`Bloqueado: ${r.motivo}`);
        return;
      }
      const alertas = plano.alertas.map((a) => a.motivo).join(' ');
      if (alertas !== '') {
        if (env.alert) env.alert(alertas, [t.id]);
        else env.say(alertas);
      }
      if (plano.nota) env.say(plano.nota);
    },
  };
}

/** Ponto de referência (plano) do outro lado do trecho: onde a captura de ângulo e de eixo mede a partir. */
function parteOposta(p: Project, t: TrechoAlvo, parte: 'a' | 'b'): Vec2 {
  const pos = posicoesDosPegadores(p, t);
  return parte === 'a' ? pos.b : pos.a;
}

/** Provedor de alças do trecho para `selectGrips`. */
export const alcaDoTrecho: GripProvider = (env, at) => {
  const t = trechoSelecionado(env);
  if (!t) return null;
  const parte = pegadorEm(env.project(), t, at, env.metersPerPixel());
  return parte ? pegadorHold(env, t, parte, posicoesDosPegadores(env.project(), t)[parte]) : null;
};

/** Os três pontos do pegador desenhados no trecho selecionado. */
export function previaDosPegadores(env: ToolEnv): PreviewItem[] {
  const t = trechoSelecionado(env);
  if (!t) return [];
  const pos = posicoesDosPegadores(env.project(), t);
  return [{ kind: 'point', at: pos.a }, { kind: 'point', at: pos.b }, { kind: 'point', at: pos.meio }];
}

let registrada = false;

/** Liga os pegadores do trecho à ferramenta de seleção (uma vez só; `selectTool` chama ao carregar). */
export function registrarPegadoresDoTrecho(): void {
  if (registrada) return;
  registrada = true;
  registrarAlcasDeElemento(alcaDoTrecho, previaDosPegadores);
}
