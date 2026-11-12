import type { ConfigRef, DegrauRef, PadraoRef, ParamPostesRef, PosteRef, SaidaRef, TrechoRef } from './distribuicao.ts';

// --- formato JSON dos casos de ouro (compartilhado com o teste cargo) ---------------------------------------------------------------------------

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: Json, k: string, d: number): number => (typeof v?.[k] === 'number' ? v[k] : d);
const posteDe = (v: Json): PosteRef => ({ ativo: v !== null && v !== undefined, largura: typeof v === 'number' ? v : 0.05 });

export function casoParaConfig(c: Json): { trecho: TrechoRef; cfg: ConfigRef } {
  const trecho: TrechoRef = {
    nos: (c.nos as number[][]).map((q) => ({ x: q[0]!, y: q[1]!, z: q[2]! })),
    curvo: c.curvo === true,
    fechado: c.fechado === true,
    origem: typeof c.origem === 'number' ? c.origem : 2,
  };
  const pj = c.postes;
  const postesCfg: ParamPostesRef = {
    inicio: posteDe(pj.inicio), fim: posteDe(pj.fim), canto: posteDe(pj.canto), intermediario: posteDe(pj.intermediario),
    angCanto: num(pj, 'ang_canto', 0.0873), modo: num(pj, 'modo', 0), espacamento: num(pj, 'espacamento', 0), numero: num(pj, 'numero', 0),
  };
  let padrao: PadraoRef | null = null;
  if (c.padrao) {
    const d = c.padrao;
    const pd = d.por_degrau ?? {};
    padrao = {
      elementos: (d.elementos as Json[]).map((e) => ({
        largura: typeof e.largura === 'number' ? e.largura : null, dist: num(e, 'dist', 0), lateral: num(e, 'lateral', 0), base: num(e, 'base', 0), topo: num(e, 'topo', 0),
      })),
      periodo: num(d, 'periodo', 0.11), justif: num(d, 'justif', 3), sobra: num(d, 'sobra', 0), quebra: num(d, 'quebra', 2), angQuebra: num(d, 'ang_quebra', 0.0873),
      escopo: num(d, 'escopo', 0), hBase: num(d, 'h_base', 0.1), hTopo: num(d, 'h_topo', 1),
      porDegrau: { ativo: pd.ativo === true, quantidade: num(pd, 'quantidade', 1), distQuina: num(pd, 'dist_quina', 0), centro: pd.centro === true, largura: typeof pd.largura === 'number' ? pd.largura : null },
    };
  }
  const painel = c.painel ? { larguraMax: num(c.painel, 'largura_max', 0), folga: num(c.painel, 'folga', 0) } : null;
  const degraus: DegrauRef[] = ((c.degraus ?? []) as Json[]).map((d) => ({ s0: num(d, 's0', 0), prof: num(d, 'prof', 0.28), z: num(d, 'z', 0), bocel: num(d, 'bocel', 0), bocelSeguinte: num(d, 'bocel_seguinte', 0) }));
  return { trecho, cfg: { altura: num(c, 'altura', 1.1), postes: postesCfg, padrao, painel, degraus, esfera: typeof c.esfera === 'number' ? c.esfera : null } };
}

/** Saída no mesmo formato (e na mesma ordem de colunas) que o teste cargo grava em `esperado`. */
export function saidaParaJson(o: SaidaRef): { postes: number[][]; balaustres: number[][]; paineis: number[][]; avisos: number[][] } {
  return {
    postes: o.postes.map((q) => [q.s, q.papel, q.x, q.y, q.z0, q.z1]),
    balaustres: o.balaustres.map((b) => [b.s, b.x, b.y, b.z0, b.z1, b.elem]),
    paineis: o.paineis.map((q) => [q[0], q[1]]),
    avisos: o.avisos.map((a) => [a.codigo, a.s]),
  };
}
