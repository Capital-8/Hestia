import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { trechoMinimoDe } from './conformidadeConexoes.ts';
import { LIMITES_DECLIVIDADE } from './diagnosticoRede.ts';
import { orientarSegmento } from './orientarSegmento.ts';
import { tipoDaFamiliaDeTubo } from './tiposTubulacao.ts';
import { centroDaPeca, chaveLigacao, classeDe, dotV, lerTuboMov, normaV, portasNoMundo, somaV, subV, unitarioV, vizinhoDe, type TuboLido, type V3 } from './movimentoLigadoRede.ts';
import { resolverPecaDoMovimento, type PernaDaPeca } from './movimentoLigadoPeca.ts';
import { conferirResultado, nomeDoComponente } from './movimentoLigadoValida.ts';
import type { AlertaMovimento, Bloqueio, Falha, PatchComponente, Rodada, TrechoEsticado } from './movimentoLigadoTipos.ts';

/*
 * Uma rodada do planejamento do movimento com as peças ligadas (ficha F4). Dado o vetor `d` (m) e o conjunto de ligações já cortadas,
 * calcula a geometria nova de tudo o que acompanha e devolve: `ok` (patches), `falha` (uma ligação que não tem como acompanhar, a
 * desfazer) ou `bloqueio` (trecho acima do `L` máximo). Regras:
 *  - os pedidos andam `d`; toda conexão ligada a um deles anda junto (é arrastada), de peça em peça;
 *  - o tubo ligado a algo que andou, sem andar ele mesmo, estica: cada ponta fica na âncora (centro do nó da conexão, ou a porta
 *    deslocada do terminal) e o eixo passa pelas duas âncoras; a ponta no nó recua pelo recuo da peça (bolsa);
 *  - a conexão cujos tubos mudaram de direção é re-resolvida (`resolverPecaDoMovimento`); sem peça igual para o ângulo, desfaz a ligação;
 *  - tubo reto horizontal de declividade 0 (rígido) NÃO vira inclinado: não há prumada automática no Mover, a ligação é desfeita;
 *  - ligação de quem anda com terminal que NÃO andou é desfeita (o tubo não fica agarrado numa caixa que ficou para trás).
 */

/** Desvio angular (rad) abaixo do qual a direção do tubo conta como a mesma: 0,1°. */
const DESVIO_IGUAL = 0.1 * Math.PI / 180;
/** Desnível (m) até o qual o tubo é horizontal; e horizontal (m) abaixo do qual é vertical. */
const NIVEL = 0.001;
const EPS = 1e-6;

interface Ancora {
  no: Component | null;
  pt: V3;
  deslocada: boolean;
}

interface GeoTubo {
  t: TuboLido;
  anc: { a: Ancora; b: Ancora };
  pa: V3;
  pb: V3;
  u: V3;
  uOld: V3;
  mov: boolean;
  ativo: boolean;
  rec: { a: number; b: number };
  fim: { a: V3; b: V3 };
}

// units-ok: mensagem em mm por contrato do engine (a ferramenta converte de metros); não é exibição de quantidade do projeto
const mmTexto = (m: number): string => String(Math.round(m * 10000) / 10).replace('.', ',');

export function rodada(p: Project, ids: readonly Id[], d: V3, rede: ReadonlySet<Id>, cortes: ReadonlySet<string>): Rodada | Falha | Bloqueio {
  const comp = (id: Id): Component => p.elements[id] as Component;
  const viva = (c: Component, lig: string) => (cortes.has(chaveLigacao(c.id, lig)) ? undefined : vizinhoDe(p, c, lig));
  const mov = new Set<Id>(ids.filter((id) => isComponent(p.elements[id])));
  // Arrasto: toda conexão ligada a quem anda anda junto, de conexão em conexão.
  const fila = [...mov];
  for (let id = fila.pop(); id !== undefined; id = fila.pop()) {
    const c = comp(id);
    for (const lig of Object.keys(c.ligacoes ?? {})) {
      const v = viva(c, lig);
      if (v && !mov.has(v.comp.id) && classeDe(p, v.comp) === 'peca') {
        mov.add(v.comp.id);
        fila.push(v.comp.id);
      }
    }
  }
  // Terminal que não andou: quem anda se solta dele.
  for (const id of mov) {
    const c = comp(id);
    for (const lig of Object.keys(c.ligacoes ?? {})) {
      const v = viva(c, lig);
      if (v && !mov.has(v.comp.id) && classeDe(p, v.comp) === 'terminal') {
        return { tipo: 'falha', motivo: `${nomeDoComponente(p, v.comp)} não foi movido: a ligação com ${nomeDoComponente(p, c)} foi desfeita para ele não ficar para trás.`, cortar: [{ a: id, la: lig }] };
      }
    }
  }

  const centros = new Map<Id, V3>();
  const centroNovo = (c: Component): V3 => {
    let C = centros.get(c.id);
    if (!C) {
      C = centroDaPeca(p, c);
      centros.set(c.id, C);
    }
    return mov.has(c.id) ? somaV(C, d) : C;
  };
  const ancora = (t: TuboLido, fim: 'a' | 'b'): Ancora => {
    const lig = fim === 'a' ? t.a : t.b;
    const v = viva(t.c, lig.id);
    if (v && classeDe(p, v.comp) === 'peca') return { no: v.comp, pt: centroNovo(v.comp), deslocada: mov.has(v.comp.id) };
    const anda = mov.has(t.c.id) || (v !== undefined && mov.has(v.comp.id));
    return { no: null, pt: anda ? somaV(lig.posicaoMundo, d) : lig.posicaoMundo, deslocada: anda };
  };
  const geos = new Map<Id, GeoTubo>();
  const geoDe = (c: Component): GeoTubo | null => {
    const feito = geos.get(c.id);
    if (feito) return feito;
    const t = lerTuboMov(p, c);
    if (!t) return null;
    const anc = { a: ancora(t, 'a'), b: ancora(t, 'b') };
    const g: GeoTubo = { t, anc, pa: anc.a.pt, pb: anc.b.pt, u: unitarioV(subV(anc.b.pt, anc.a.pt)), uOld: unitarioV(subV(t.b.posicaoMundo, t.a.posicaoMundo)), mov: mov.has(c.id), ativo: mov.has(c.id) || anc.a.deslocada || anc.b.deslocada, rec: { a: 0, b: 0 }, fim: { a: t.a.posicaoMundo, b: t.b.posicaoMundo } };
    geos.set(c.id, g);
    return g;
  };
  const noGeo = [...rede].map(comp).filter((c) => isComponent(c));
  for (const c of noGeo) geoDe(c);

  const patches = new Map<Id, PatchComponente>();
  const tocados = new Set<Id>(mov);
  const cortarLigacoes = (g: GeoTubo, modo: 'fixas' | 'deslocadas'): Array<{ a: Id; la: string }> => {
    const todas = (['a', 'b'] as const).map((e) => ({ an: g.anc[e], la: e === 'a' ? g.t.idA : g.t.idB })).filter((x) => viva(g.t.c, x.la) !== undefined);
    const fixas = todas.filter((x) => x.an.no !== null && !x.an.deslocada);
    const moveis = todas.filter((x) => x.an.deslocada);
    const lista = modo === 'fixas' && fixas.length > 0 ? fixas : moveis.length > 0 ? moveis : todas;
    return lista.map((x) => ({ a: g.t.c.id, la: x.la }));
  };

  for (const id of mov) {
    const c = comp(id);
    if (classeDe(p, c) === 'terminal') patches.set(id, { x: c.x + d[0], y: c.y + d[1], z: c.z + d[2] });
  }
  // Conexões: translação, ou nova posição quando o ângulo dos tubos mudou.
  for (const c of noGeo) {
    if (classeDe(p, c) !== 'peca') continue;
    const portas = portasNoMundo(p, c);
    const pernas: Array<PernaDaPeca & { g: GeoTubo; fim: 'a' | 'b' }> = [];
    for (const porta of portas) {
      const v = viva(c, porta.id);
      const g = v ? geoDe(v.comp) : null;
      if (!v || !g) continue;
      const fim: 'a' | 'b' = v.ligacaoId === g.t.idA ? 'a' : 'b';
      const sinal = fim === 'a' ? 1 : -1;
      pernas.push({ porta, tubo: g.t, g, fim, dir: [g.u[0] * sinal, g.u[1] * sinal, g.u[2] * sinal] });
    }
    const velho = (q: { g: GeoTubo; fim: 'a' | 'b' }): V3 => (q.fim === 'a' ? q.g.uOld : [-q.g.uOld[0], -q.g.uOld[1], -q.g.uOld[2]]);
    const mudou = pernas.filter((q) => q.g.ativo && Math.acos(Math.max(-1, Math.min(1, dotV(q.dir, velho(q))))) > DESVIO_IGUAL);
    const C0 = centroDaPeca(p, c);
    const Cn = centroNovo(c);
    const recVelho = (q: { g: GeoTubo; fim: 'a' | 'b' }): number => dotV(subV(q.fim === 'a' ? q.g.t.a.posicaoMundo : q.g.t.b.posicaoMundo, C0), velho(q));
    if (mudou.length === 0) {
      if (mov.has(c.id)) patches.set(c.id, { x: c.x + d[0], y: c.y + d[1], z: c.z + d[2] });
      for (const q of pernas) q.g.rec[q.fim] = recVelho(q);
      continue;
    }
    const r = resolverPecaDoMovimento(p, c, Cn, pernas, portas);
    if (!r.ok) return { tipo: 'falha', motivo: `${nomeDoComponente(p, c)}: ${r.motivo}`, cortar: mudou.map((q) => ({ a: c.id, la: q.porta.id })) };
    pernas.forEach((q, k) => { q.g.rec[q.fim] = r.recuos[k] ?? 0; });
    tocados.add(c.id);
    patches.set(c.id, { x: r.pos.x, y: r.pos.y, z: r.pos.z, rotation: r.pos.rotation, inclinacao: r.pos.inclinacao });
    for (const q of pernas) q.g.ativo = true;
  }

  // Tubos: pontas novas, limites e regras.
  const esticados: TrechoEsticado[] = [];
  const avisos: AlertaMovimento[] = [];
  for (const g of geos.values()) {
    const { t } = g;
    if (!g.ativo || !rede.has(t.c.id)) continue;
    tocados.add(t.c.id);
    if (g.mov) {
      patches.set(t.c.id, { x: t.c.x + d[0], y: t.c.y + d[1], z: t.c.z + d[2] });
      continue;
    }
    for (const e of ['a', 'b'] as const) if (!g.anc[e].no) g.rec[e] = 0;
    const eixo = subV(g.pb, g.pa);
    if (normaV(eixo) < EPS) return { tipo: 'falha', motivo: `${nomeDoComponente(p, t.c)}: as duas pontas ficariam no mesmo ponto.`, cortar: cortarLigacoes(g, 'deslocadas') };
    const a = somaV(g.pa, g.u, g.rec.a);
    const b = somaV(g.pb, g.u, -g.rec.b);
    const L = dotV(subV(b, a), g.u);
    const Lmm = L * 1000;
    const Lvelho = normaV(subV(t.b.posicaoMundo, t.a.posicaoMundo)) * 1000;
    if (t.lMax !== undefined && Lmm > t.lMax + EPS && Lmm > Lvelho + EPS) return { tipo: 'bloqueio', motivo: `o trecho de ${mmTexto(L)} mm passa do comprimento máximo da família (${mmTexto(t.lMax / 1000)} mm). Divida o trecho com um ponto intermediário.`, a, b };
    const ligado = g.anc.a.no !== null || g.anc.b.no !== null;
    const minimo = ligado ? trechoMinimoDe(tipoDaFamiliaDeTubo(t.c.familyId)) : t.lMin;
    if (L <= 0 || Lmm < minimo - EPS) return { tipo: 'falha', motivo: `${nomeDoComponente(p, t.c)}: o trecho ficaria com ${mmTexto(Math.max(0, L))} mm de tubo, abaixo do mínimo de ${mmTexto(minimo / 1000)} mm.`, cortar: cortarLigacoes(g, 'fixas') };
    const dzVelho = Math.abs(t.b.posicaoMundo[2] - t.a.posicaoMundo[2]);
    const hVelho = Math.hypot(t.b.posicaoMundo[0] - t.a.posicaoMundo[0], t.b.posicaoMundo[1] - t.a.posicaoMundo[1]);
    const dz = Math.abs(b[2] - a[2]);
    if (!t.flexivel && dzVelho <= NIVEL && hVelho > NIVEL && dz > NIVEL) {
      return { tipo: 'falha', motivo: `${nomeDoComponente(p, t.c)}: o trecho reto horizontal (declividade 0) ficaria inclinado ${mmTexto(dz)} mm. O Mover não cria prumada: desenhe-a com a ferramenta Tubo.`, cortar: cortarLigacoes(g, 'deslocadas') };
    }
    const o = orientarSegmento(a, b, t.c.inclinacao?.[1] ?? 0);
    patches.set(t.c.id, { x: o.x, y: o.y, z: o.z, rotation: o.rotation, inclinacao: o.inclinacao, values: { ...(t.c.values ?? {}), L: L * 1000 } });
    g.fim = { a, b };
    esticados.push({ id: t.c.id, a, b, dn: t.dn });
    const lim = LIMITES_DECLIVIDADE[t.a.dominio];
    const h = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (lim && t.dn > 0 && t.dn <= lim.dnMaxMm && h > NIVEL) {
      const pct = (dz / h) * 100;
      const antes = hVelho > NIVEL ? (dzVelho / hVelho) * 100 : 0;
      const dentro = (x: number): boolean => x >= lim.minPercentual && x <= lim.maxPercentual;
      // units-ok: percentual de declividade na mensagem do engine, não é quantidade do projeto
      if (!dentro(pct) && dentro(antes)) avisos.push({ codigo: 'declividade_fora_do_limite', elementId: t.c.id, motivo: `${nomeDoComponente(p, t.c)}: a declividade passou de ${String(Math.round(antes * 100) / 100).replace('.', ',')} % para ${String(Math.round(pct * 100) / 100).replace('.', ',')} %, fora da faixa de ${lim.minPercentual} % a ${lim.maxPercentual} % (faixa a CONFERIR com a norma).` });
    }
  }
  const falha = conferirResultado(p, patches, tocados, cortes, mov);
  if (falha) return falha;
  return { tipo: 'ok', patches, esticados, movidos: mov, avisos };
}
