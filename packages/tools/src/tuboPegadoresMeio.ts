import { planejarMovimentoLigado, portasNoMundo, tipoDaFamiliaDeTubo, trechoMinimoDe } from '@hestia/engine';
import { isComponent, type Command, type Id, type Project } from '@hestia/model';
import { bloqueiaSeInviavel, bloqueio, comandoDePose, planoVazio, projetoCom, sugestaoDoMotivo, vizinhoDaPonta, type PlanoTrecho, type RotaDoPlano, type V3 } from './tuboPegadoresPlano.ts';
import { pontasDoTubo, type ContextoTraco } from './tuboApoio.ts';
import type { PontoTubo } from './tuboGeometria.ts';
import { verificarTraco, type EntradaRota } from './tuboRota.ts';
import { ehCorrugado, opcoesDoDominio, pontoDaPorta, regrasDoTrecho, trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';

/*
 * Pegador do MEIO do trecho (fase 4, ficha F6a). Em planta, move o trecho inteiro como o Mover da F4 (as conexões vão junto, os
 * vizinhos esticam). Com cota (tecla de cota: o campo Cota da ferramenta), o trecho muda de cota e cada ponta ligada GANHA A PRUMADA:
 * da porta onde estava ligado até a ponta nova, pelo roteiro do Tubo (`verificarTraco`: sai de frente para a porta, sobe ou desce, e chega
 * de frente para o trecho), com joelhos do tipo, tubo curto da F1 e a ponta do trecho recuada o necessário para caber a curva.
 */

/** Recuos (m) que a ponta ligada pode ceder ao trecho para caber a prumada: o menor que fecha vale. */
const RECUOS = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.9, 1.2];

const dir = (de: readonly number[], para: readonly number[]): V3 => {
  const d: V3 = [(para[0] ?? 0) - (de[0] ?? 0), (para[1] ?? 0) - (de[1] ?? 0), (para[2] ?? 0) - (de[2] ?? 0)];
  const n = Math.hypot(...d) || 1;
  return [d[0] / n, d[1] / n, d[2] / n];
};
const soma = (a: readonly number[], u: readonly number[], k: number): V3 => [(a[0] ?? 0) + k * (u[0] ?? 0), (a[1] ?? 0) + k * (u[1] ?? 0), (a[2] ?? 0) + k * (u[2] ?? 0)];

export interface OpcoesMeio {
  /** Cota (m) do eixo no meio do trecho depois do gesto; sem ela só anda em planta. */
  cota?: number;
  /** Alt: solta as ligações (o trecho anda sozinho; nada acompanha). */
  solta?: boolean;
}

const posar = comandoDePose;

/** Plano de levar o trecho `id` inteiro por `d` (m, plano), com a cota do meio em `opc.cota` quando dada. */
export function planejarMeio(p: Project, id: Id, d: { x: number; y: number }, opc: OpcoesMeio = {}): PlanoTrecho {
  const t = trechoDoProjeto(p, id);
  if (!t) return planoVazio();
  const zMeio = (t.a[2] + t.b[2]) / 2;
  const dz = opc.cota === undefined ? 0 : opc.cota - zMeio;
  const horizontal = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]) > 1e-3;
  if (opc.solta) return soltoDoMeio(p, t, [d.x, d.y, dz]);
  if (Math.abs(dz) < 1e-3 || !horizontal) {
    if (Math.hypot(d.x, d.y) < 1e-6) return planoVazio();
    const plano = planejarMovimentoLigado(p, [id], [d.x, d.y, 0]);
    const recusa = bloqueiaSeInviavel(plano, t);
    return recusa ?? planoVazio({ comandos: plano.comandos, alertas: plano.alertas, esticados: plano.esticados });
  }
  const d3: V3 = [d.x, d.y, dz];
  const A0 = [t.a[0] + d3[0], t.a[1] + d3[1], t.a[2] + d3[2]] as V3;
  const B0 = [t.b[0] + d3[0], t.b[1] + d3[1], t.b[2] + d3[2]] as V3;
  if (ehCorrugado(t.tubo)) return bloqueio('o eletroduto corrugado muda de cota livremente pelas pontas: não precisa de prumada.', 'Sugestão: arraste uma ponta com a tecla de cota (o corrugado fica inclinado).', A0, B0);
  return prumada(p, t, A0, B0);
}

/** Alt: o trecho anda sozinho e as ligações das pontas se desfazem (com alerta). */
function soltoDoMeio(p: Project, t: TrechoAlvo, d3: V3): PlanoTrecho {
  const a: V3 = [t.a[0] + d3[0], t.a[1] + d3[1], t.a[2] + d3[2]];
  const b: V3 = [t.b[0] + d3[0], t.b[1] + d3[1], t.b[2] + d3[2]];
  const pose = posar(p, t, a, b);
  if (!pose || Math.hypot(...d3) < 1e-6) return planoVazio();
  const soltar: Command[] = [];
  for (const lig of [t.tubo.idA, t.tubo.idB]) if (t.tubo.c.ligacoes?.[lig]) soltar.push({ type: 'disconnectComponents', a: t.id, ligacaoA: lig });
  return planoVazio({ comandos: [...soltar, pose], fantasmas: [{ a, b, dn: t.tubo.dn }], nota: soltar.length > 0 ? 'As ligações do trecho foram soltas (Alt).' : undefined });
}

/** Prumada em cada ponta ligada; as pontas livres só acompanham o deslocamento. */
function prumada(p: Project, t: TrechoAlvo, A0: V3, B0: V3): PlanoTrecho {
  const c = t.tubo.c;
  const soltar: Command[] = [];
  const ligadas: Array<{ fim: 'a' | 'b'; ligId: string; comp: Id; ligN: string }> = [];
  for (const fim of ['a', 'b'] as const) {
    const ligId = fim === 'a' ? t.tubo.idA : t.tubo.idB;
    const v = vizinhoDaPonta(p, c, ligId);
    if (!v) continue;
    soltar.push({ type: 'disconnectComponents', a: t.id, ligacaoA: ligId });
    ligadas.push({ fim, ligId, comp: v.comp.id, ligN: v.ligacaoId });
  }
  const dn = t.tubo.dn;
  const familia = p.componentFamilies?.[c.familyId];
  const pontas = familia ? pontasDoTubo(familia, dn) : null;
  if (!familia || !pontas) return bloqueio('a família do trecho não tem as duas ligações esperadas.', null, A0, B0);
  const ctx: ContextoTraco = { familia, pontas };
  const f = t.ferramenta;
  const minimo = Math.max(t.tubo.lMin, trechoMinimoDe(tipoDaFamiliaDeTubo(c.familyId)));
  const u = dir(t.a, t.b);
  let A = A0;
  let B = B0;
  const rotas: RotaDoPlano[] = [];
  const fantasmas: PlanoTrecho['fantasmas'] = [];
  for (const lig of ligadas) {
    const sentido: V3 = lig.fim === 'a' ? u : [-u[0], -u[1], -u[2]];
    const saida: V3 = lig.fim === 'a' ? [-u[0], -u[1], -u[2]] : u;
    const origemP = p.elements[lig.comp];
    const porta = isComponent(origemP) ? portasNoMundo(p, origemP).find((l) => l.id === lig.ligN) : undefined;
    if (!porta) return bloqueio('a conexão ligada ao trecho não tem a porta esperada.', null, A0, B0);
    // O tubo novo nasce onde o trecho terminava (dentro da bolsa da conexão), não na boca da porta.
    const de = pontoDaPorta(lig.fim === 'a' ? t.a : t.b, lig.comp, lig.ligN, porta.direcaoMundo);
    let primeiro: { motivo: string; sugestao: string | null; a: V3; b: V3 } | null = null;
    let melhor: { r: number; a1: V3; b1: V3; rota: RotaDoPlano; pts: PontoTubo[]; dns: number[] } | null = null;
    for (const r of RECUOS) {
      const extremo = soma(lig.fim === 'a' ? A : B, sentido, r);
      const outro = lig.fim === 'a' ? B : A;
      const compr = Math.hypot(extremo[0] - outro[0], extremo[1] - outro[1], extremo[2] - outro[2]) * 1000;
      if (compr < minimo) break;
      const a1: V3 = lig.fim === 'a' ? extremo : A;
      const b1: V3 = lig.fim === 'b' ? extremo : B;
      const pose = posar(p, t, a1, b1);
      const feito = pose ? projetoCom(p, [...soltar, pose]) : null;
      if (!feito || feito.p === null) break;
      const para = pontoDaPorta(extremo, t.id, lig.ligId, saida);
      const e: EntradaRota = { projeto: feito.p, ctx, regras: regrasDoTrecho(t.tubo), levelId: c.levelId, dn, modo: opcoesDoDominio(f).modoCota, declividade: 0, luvaEmLinha: f === 'eletroduto', respeitaEntradas: true };
      const avisos: string[] = [];
      const v = verificarTraco(e, de, para, avisos);
      // Rota que não sai e chega de frente para as portas não vale (a rede acusaria ligação incompatível).
      const semCaminho = avisos.find((x) => /Sem caminho em 90/.test(x));
      if (v.bloqueio || semCaminho) {
        primeiro ??= { motivo: v.bloqueio?.motivo ?? 'não há caminho em 90° que saia e chegue de frente para as portas.', sugestao: v.bloqueio?.sugestao ?? 'Sugestão: mude a cota ou use um trecho mais longo.', a: de.xyz, b: para.xyz };
        continue;
      }
      const pts: PontoTubo[] = v.pts.length >= 2 ? v.pts : [de, para];
      // A menor rota vale: menos trechos (menos joelhos) e, empatando, a que cede menos tubo.
      if (!melhor || pts.length < melhor.pts.length) melhor = { r, a1, b1, rota: { trechoId: t.id, de, para, pts, dns: v.dns ?? pts.slice(1).map(() => dn) }, pts, dns: v.dns ?? pts.slice(1).map(() => dn) };
    }
    const achou = melhor !== null;
    if (melhor) {
      if (lig.fim === 'a') A = melhor.a1;
      else B = melhor.b1;
      rotas.push(melhor.rota);
      const { pts, dns } = melhor;
      pts.slice(1).forEach((q, k) => fantasmas.push({ a: (pts[k] as PontoTubo).xyz, b: q.xyz, dn: dns[k] ?? dn }));
    }
    if (!achou) {
      const m = primeiro ?? { motivo: 'o trecho ficaria curto demais para caber a prumada.', sugestao: 'Sugestão: use um trecho mais longo ou mude a cota em planta e em z menos de uma vez.', a: de.xyz, b: soma(lig.fim === 'a' ? A : B, sentido, 0) };
      return bloqueio(m.motivo[0]?.toUpperCase() + m.motivo.slice(1), m.sugestao ?? sugestaoDoMotivo(m.motivo), m.a, m.b);
    }
  }
  const pose = posar(p, t, A, B);
  if (!pose) return bloqueio('o trecho ficaria sem comprimento.', null, A, B);
  fantasmas.unshift({ a: A, b: B, dn });
  return planoVazio({ comandos: [...soltar, pose], rotas, fantasmas, nota: ligadas.length > 0 ? `Prumada gerada em ${String(ligadas.length)} ponta(s) do trecho.` : undefined });
}
