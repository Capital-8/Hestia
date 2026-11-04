// Comparação da sub-etapa B3 (decisão 0050 §3): `junction_nivel` do Rust x `levelCutterSet` e `junctionLevel` do motor TypeScript.
//
// Identidade, ordem, ids, marcas (núcleo, explícita, externa, plana) e campos escalares (prioridade, cotas das partes e a função de cota das peças nos
// vértices) a 1e-6; polígonos por canonicalização e diferença simétrica sob 1e-6 m², com a mesma topologia nos componentes significativos (0049, só quando // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
// `k0049` é dado; cada uso é contado e o maior K observado é devolvido). A tolerância NÃO se afrouxa para passar.
import { intersection, orientedRect, union, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { areaDaForma } from './kernelComparaA2.ts';
import { poligonoIgualB1, TOLERANCIA_B1 } from './kernelComparaB.ts';
import { LIMIAR_FIAPO } from './kernelComparaA3c.ts';
import type { JuncaoB3, ParedeJuncaoB3, ParteB3, PecaB3 } from './kernelB3.ts';

/**
 * Item inteiro de área abaixo do fiapo de arredondamento (0049, regra 2): a peça, a parte ou a faixa cujo polígono é só um fiapo. Existe de um lado e não do
 * outro quando uma aresta de um vão (que o TS arredonda a 1 µm no Clipper e o Rust deixa a 1 nm) fica a menos de 1 µm de um degrau do perfil que o JS enviou.
 * Estes itens são pareados à parte (e contados em `fiapos`); os demais itens seguem com identidade, ordem e campos a 1e-6.
 */
export interface FiapoB3 {
  pecas: number;
  partes: number;
  faixas: number;
  /** Maior área (m²) de um item sem par; acima de `LIMIAR_FIAPO` nenhum item pode ficar sem par. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  maiorArea: number;
}

export interface OpcoesCompararB3 {
  /** `K` da 0049 (limite `1e-5 + K x perímetro x 1e-6`); sem valor, só vale a tolerância geral (1e-6 m²). */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  k0049?: number;
  maxDivergencias?: number;
}

export interface SemParB3 {
  n: number;
  max: number;
  acima1e4: number;
  acima1e3: number;
  resolvidos: number;
  fiapos: number;
}

export interface ComparacaoB3 {
  divergencias: string[];
  cortadores: number;
  cortadoresPorTipo: number[];
  pecas: number;
  pecasExternas: number;
  pecasInclinadas: number;
  pecasSemMeta: number;
  membranas: number;
  elementos: number;
  elementosCortados: number;
  camadas: number;
  partes: number;
  paredes: number;
  paredesCortadas: number;
  faixas: number;
  regioes: number;
  poligonos: number;
  estritos: number;
  pela0049: number;
  maxSimetrica: number;
  maxK: number;
  desvioMaximo: number;
  semPar: SemParB3;
  /** Itens-fiapo sem par (0049, regra 2 estendida aos itens: ver `FiapoB3`). */
  fiapo: FiapoB3;
}

export const comparacaoB3Vazia = (): ComparacaoB3 => ({
  divergencias: [],
  cortadores: 0,
  cortadoresPorTipo: [0, 0, 0],
  pecas: 0,
  pecasExternas: 0,
  pecasInclinadas: 0,
  pecasSemMeta: 0,
  membranas: 0,
  elementos: 0,
  elementosCortados: 0,
  camadas: 0,
  partes: 0,
  paredes: 0,
  paredesCortadas: 0,
  faixas: 0,
  regioes: 0,
  poligonos: 0,
  estritos: 0,
  pela0049: 0,
  maxSimetrica: 0,
  maxK: 0,
  desvioMaximo: 0,
  semPar: { n: 0, max: 0, acima1e4: 0, acima1e3: 0, resolvidos: 0, fiapos: 0 },
  fiapo: { pecas: 0, partes: 0, faixas: 0, maiorArea: 0 },
});

/**
 * Pareia duas listas na ordem: itens que `pareia` seguem juntos; um item-fiapo sem par de um dos lados é pulado (e devolvido em `puladosA`/`puladosB`).
 * Item grande sem par é divergência (`erro`).
 */
function alinhar<T>(a: readonly T[], b: readonly T[], fiapo: (x: T) => boolean, pareia: (x: T, y: T) => boolean): { pares: Array<[T, T, number, number]>; puladosA: T[]; puladosB: T[]; erro: string | null } {
  const pares: Array<[T, T, number, number]> = [];
  const puladosA: T[] = [];
  const puladosB: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && pareia(a[i]!, b[j]!)) {
      pares.push([a[i]!, b[j]!, puladosA.length, puladosB.length]);
      i++;
      j++;
    } else if (j < b.length && fiapo(b[j]!)) puladosB.push(b[j++]!);
    else if (i < a.length && fiapo(a[i]!)) puladosA.push(a[i++]!);
    else return { pares, puladosA, puladosB, erro: `item ${i} (TS) x ${j} (Rust) sem par e acima do fiapo` };
  }
  return { pares, puladosA, puladosB, erro: null };
}


/** Cota de topo de uma peça num ponto, por plano (`c + gx x + gy y`) ajustado a três vértices do polígono (a faixa inclinada de parede tem topo afim). */
function planoDoTopo(p: PecaB3): { c: number; gx: number; gy: number } | null {
  const v = p.poligono.flatMap((poly) => poly.flatMap((anel) => anel));
  if (v.length < 3) return null;
  const a = v[0]!;
  const b = v.reduce((m, q) => (Math.hypot(q.x - a.x, q.y - a.y) > Math.hypot(m.x - a.x, m.y - a.y) ? q : m), a);
  const area = (q: Vec2): number => Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
  const c3 = v.reduce((m, q) => (area(q) > area(m) ? q : m), a);
  const det = (b.x - a.x) * (c3.y - a.y) - (b.y - a.y) * (c3.x - a.x);
  if (Math.abs(det) < 1e-12) return null;
  const ha = p.span(a)[1];
  const db = p.span(b)[1] - ha;
  const dc = p.span(c3)[1] - ha;
  const gx = (db * (c3.y - a.y) - dc * (b.y - a.y)) / det;
  const gy = ((b.x - a.x) * dc - (c3.x - a.x) * db) / det;
  return { c: ha - gx * a.x - gy * a.y, gx, gy };
}

/** Região em planta ocupada pelas peças (faixas de uma camada de parede) na altura `z`: faixa inclinada só onde o topo ainda passa de `z`. */
function regiaoNaAltura(pecas: readonly PecaB3[], z: number): MultiPolygon {
  const partes: MultiPolygon[] = [];
  for (const p of pecas) {
    const v0 = p.poligono[0]?.[0]?.[0];
    if (!v0) continue;
    const [base, topo] = p.span(v0);
    if (z < base) continue;
    if (p.plana) {
      if (z <= topo) partes.push(p.poligono);
      continue;
    }
    const pl = planoDoTopo(p);
    if (!pl) {
      if (z <= topo) partes.push(p.poligono);
      continue;
    }
    const g = Math.hypot(pl.gx, pl.gy);
    if (g < 1e-12) {
      if (z <= pl.c) partes.push(p.poligono);
      continue;
    }
    const L = 200;
    const nx = pl.gx / g;
    const ny = pl.gy / g;
    const s0 = (z - pl.c) / g;
    const lado = orientedRect(nx * (s0 + L), ny * (s0 + L), nx, ny, L, L);
    const dentro = p.poligono.length ? intersection(p.poligono, [[lado]]) : [];
    if (dentro.length) partes.push(dentro);
  }
  return partes.length ? union(...partes) : [];
}

/** Alturas elementares (3 amostras por intervalo entre as cotas de base e de topo de todas as peças), como a A3d compara as faixas com perfil. */
function alturasElementares(pecas: readonly PecaB3[]): number[] {
  const zs: number[] = [];
  for (const p of pecas) {
    if (p.faixa) zs.push(p.faixa[0], p.faixa[1]);
    for (const poly of p.poligono) for (const anel of poly) for (const v of anel) zs.push(...p.span(v));
  }
  zs.sort((x, y) => x - y);
  const pontos: number[] = [];
  for (const z of zs) if (pontos.length === 0 || z - pontos[pontos.length - 1]! > 1e-6) pontos.push(z);
  const out: number[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) for (const k of [0.25, 0.5, 0.75]) out.push(pontos[i]! + k * (pontos[i + 1]! - pontos[i]!));
  return out;
}


/** Compara a saída do Rust (`rust`) com a referência (`ref`): cortadores, peças, elementos, camadas, partes, paredes e o resultado final das faixas de parede por altura (sempre bloqueante). */
export function compararB3(ref: JuncaoB3, rust: JuncaoB3, opcoes: OpcoesCompararB3 = {}): ComparacaoB3 {
  const max = opcoes.maxDivergencias ?? 20;
  const r = comparacaoB3Vazia();
  const falha = (m: string): void => {
    if (r.divergencias.length < max) r.divergencias.push(m);
  };
  const num = (rotulo: string, a: number, b: number): void => {
    const d = Math.abs(a - b);
    r.desvioMaximo = Math.max(r.desvioMaximo, Number.isNaN(d) ? Infinity : d);
    if (!(d <= TOLERANCIA_B1)) falha(`${rotulo}: ${b} (Rust) x ${a} (TS)`);
  };
  const poligono = (rotulo: string, a: MultiPolygon, b: MultiPolygon): void => {
    const c = poligonoIgualB1(a, b, opcoes.k0049);
    r.poligonos++;
    if (c.estrito) r.estritos++;
    if (c.pela0049) r.pela0049++;
    r.maxSimetrica = Math.max(r.maxSimetrica, c.sim);
    r.maxK = Math.max(r.maxK, c.k);
    for (const campo of ['n', 'acima1e4', 'acima1e3', 'resolvidos', 'fiapos'] as const) r.semPar[campo] += c.semPar[campo];
    r.semPar.max = Math.max(r.semPar.max, c.semPar.max);
    if (c.erro) falha(`${rotulo}: ${c.erro}`);
  };
  const fiapo = (area: number, tipo: 'pecas' | 'partes' | 'faixas'): void => {
    r.fiapo[tipo]++;
    r.fiapo.maiorArea = Math.max(r.fiapo.maiorArea, area);
  };
  const partes = (rotulo: string, a: ParteB3[], b: ParteB3[]): void => {
    const al = alinhar(
      a,
      b,
      (x) => areaDaForma(x.poligono) < LIMIAR_FIAPO,
      (x, y) => Math.abs(x.z0 - y.z0) <= TOLERANCIA_B1 && Math.abs(x.z1 - y.z1) <= TOLERANCIA_B1 && (areaDaForma(x.poligono) < LIMIAR_FIAPO) === (areaDaForma(y.poligono) < LIMIAR_FIAPO),
    );
    if (al.erro) return falha(`${rotulo}: partes ${b.length} (Rust) x ${a.length} (TS): ${al.erro}`);
    for (const x of al.puladosA) fiapo(areaDaForma(x.poligono), 'partes');
    for (const x of al.puladosB) fiapo(areaDaForma(x.poligono), 'partes');
    al.pares.forEach(([pa, pb], i) => {
      r.partes++;
      num(`${rotulo}, parte ${i}: z0`, pa.z0, pb.z0);
      num(`${rotulo}, parte ${i}: z1`, pa.z1, pb.z1);
      poligono(`${rotulo}, parte ${i}: polígono`, pa.poligono, pb.poligono);
    });
  };
  /**
   * Faixas de parede (cortador de parede): o `fuseBands` do TS e o Rust (A3d) podem partir as faixas de uma camada em alturas diferentes, então as peças
   * NÃO se pareiam por índice: cada camada de cada parede (identidade e ordem exatas) se compara pela região em alturas elementares, como a A3d.
   */
  // Cotas do próprio nível: a faixa de uma peça externa só vale (e só é mantida por `levelCutterSet`) onde alcança estas cotas.
  const proprias = ref.cortadores.flatMap((c) => c.pecas).filter((p) => !p.externa && p.faixa);
  const lo = Math.min(...proprias.map((p) => p.faixa![0]));
  const hi = Math.max(...proprias.map((p) => p.faixa![1]));
  const paredesDoCortador = (nome: string, a: PecaB3[], b: PecaB3[]): void => {
    const agrupa = (lista: PecaB3[], contar: boolean): Map<string, PecaB3[]> => {
      const m = new Map<string, PecaB3[]>();
      for (const x of lista) {
        if (contar) {
          r.pecas++;
          if (x.externa) r.pecasExternas++;
          if (!x.plana) r.pecasInclinadas++;
        }
        const k = `${x.externa ? 'x' : ''}${x.meta?.dono}/${x.meta?.camada}`;
        m.set(k, [...(m.get(k) ?? []), x]);
      }
      return m;
    };
    const ga = agrupa(a, true);
    const gb = agrupa(b, false);
    const ka = [...ga.keys()];
    const kb = [...gb.keys()];
    if (ka.join('|') !== kb.join('|')) return falha(`${nome}: camadas de parede ${kb.length} (Rust) x ${ka.length} (TS), ordem ou identidade diferentes`);
    for (const k of ka) {
      const la = ga.get(k)!.filter((x) => areaDaForma(x.poligono) > 1e-6);
      const lb = gb.get(k)!.filter((x) => areaDaForma(x.poligono) > 1e-6);
      for (const x of [...ga.get(k)!, ...gb.get(k)!]) if (areaDaForma(x.poligono) <= 1e-6) fiapo(areaDaForma(x.poligono), 'pecas');
      const ma = ga.get(k)![0]!.meta;
      const mb = gb.get(k)![0]!.meta;
      if (ma && mb) {
        for (const campo of ['tipo', 'nucleo', 'explicita'] as const) if (ma[campo] !== mb[campo]) falha(`${nome}, camada ${k}: meta.${campo} ${mb[campo]} (Rust) x ${ma[campo]} (TS)`);
        num(`${nome}, camada ${k}: prioridade`, ma.prioridade, mb.prioridade);
      }
      // Peça externa: só as alturas dentro do nível. `levelCutterSet` mantém a faixa inteira que alcança o nível, e a partição das faixas (fusão do TS x A3c do
      // Rust) decide quanto dela fica abaixo ou acima do nível; fora do nível a peça não corta nada.
      const externa = ga.get(k)![0]!.externa;
      for (const z of alturasElementares([...la, ...lb]).filter((h) => !externa || (h > lo + 1e-6 && h < hi - 1e-6))) {
        const ra = regiaoNaAltura(la, z);
        const rb = regiaoNaAltura(lb, z);
        if (ra.length === 0 && rb.length === 0) continue;
        r.regioes++;
        poligono(`${nome}, camada ${k}, altura ${z}: região das faixas`, ra, rb);
      }
    }
  };
  const peca = (rotulo: string, a: PecaB3, b: PecaB3, semBanda = false): void => {
    r.pecas++;
    if (a.externa) r.pecasExternas++;
    if (!a.plana) r.pecasInclinadas++;
    if (!a.meta) r.pecasSemMeta++;
    if (a.meta && a.faixa && a.faixa[1] - a.faixa[0] <= 1e-9) r.membranas++;
    if ((a.meta === null) !== (b.meta === null)) falha(`${rotulo}: meta ${JSON.stringify(b.meta)} (Rust) x ${JSON.stringify(a.meta)} (TS)`);
    else if (a.meta && b.meta) {
      for (const campo of ['tipo', 'nucleo', 'explicita', 'dono', 'camada', 'banda'] as const) if ((campo !== 'banda' || !semBanda) && a.meta[campo] !== b.meta[campo]) falha(`${rotulo}: meta.${campo} ${b.meta[campo]} (Rust) x ${a.meta[campo]} (TS)`);
      num(`${rotulo}: prioridade`, a.meta.prioridade, b.meta.prioridade);
    }
    for (const campo of ['externa', 'plana'] as const) if (a[campo] !== b[campo]) falha(`${rotulo}: ${campo} ${b[campo]} (Rust) x ${a[campo]} (TS)`);
    if ((a.faixa === null) !== (b.faixa === null)) falha(`${rotulo}: faixa ${JSON.stringify(b.faixa)} (Rust) x ${JSON.stringify(a.faixa)} (TS)`);
    else if (a.faixa && b.faixa) {
      num(`${rotulo}: faixa z0`, a.faixa[0], b.faixa[0]);
      num(`${rotulo}: faixa z1`, a.faixa[1], b.faixa[1]);
    }
    // a função de cota nos vértices do polígono do TS (a do Rust é a do motor alimentada com os parâmetros devolvidos)
    for (const poly of a.poligono) for (const anel of poly) for (const v of anel) {
      const x = a.span(v);
      const y = b.span(v);
      num(`${rotulo}: span z0 em (${v.x}, ${v.y})`, x[0], y[0]);
      num(`${rotulo}: span z1 em (${v.x}, ${v.y})`, x[1], y[1]);
    }
    poligono(`${rotulo}: polígono`, a.poligono, b.poligono);
  };

  if (ref.cortadores.length !== rust.cortadores.length) {
    falha(`${rust.cortadores.length} cortadores (Rust) x ${ref.cortadores.length} (TS)`);
  } else {
    ref.cortadores.forEach((a, i) => {
      const b = rust.cortadores[i]!;
      const nome = `cortador ${i}`;
      r.cortadores++;
      r.cortadoresPorTipo[a.tipo] = (r.cortadoresPorTipo[a.tipo] ?? 0) + 1;
      if (a.tipo !== b.tipo) return falha(`${nome}: tipo ${b.tipo} (Rust) x ${a.tipo} (TS)`);
      if (a.tipo === 0) return paredesDoCortador(nome, a.pecas, b.pecas);
      const fp = (x: PecaB3): boolean => areaDaForma(x.poligono) < LIMIAR_FIAPO;
      const chave = (x: PecaB3): string => (x.meta ? `${x.meta.tipo}/${x.meta.dono}/${x.meta.camada}` : '-');
      const al = alinhar(
        a.pecas,
        b.pecas,
        fp,
        (x, y) => chave(x) === chave(y) && x.externa === y.externa && x.plana === y.plana && (x.faixa === null ? y.faixa === null : y.faixa !== null && Math.abs(x.faixa[0] - y.faixa[0]) <= TOLERANCIA_B1 && Math.abs(x.faixa[1] - y.faixa[1]) <= TOLERANCIA_B1),
      );
      if (al.erro) return falha(`${nome} (tipo ${a.tipo}): ${b.pecas.length} peças (Rust) x ${a.pecas.length} (TS): ${al.erro}`);
      for (const x of [...al.puladosA, ...al.puladosB]) fiapo(areaDaForma(x.poligono), 'pecas');
      al.pares.forEach(([pa, pb], k) => peca(`${nome} (tipo ${a.tipo}), peça ${k}`, pa, pb));
    });
  }

  if (ref.elementos.length !== rust.elementos.length) {
    falha(`${rust.elementos.length} elementos na junção (Rust: ${rust.elementos.map((e) => `${e.tipo}/${e.dono}`).join(', ')}) x ${ref.elementos.length} (TS: ${ref.elementos.map((e) => `${e.tipo}/${e.dono}`).join(', ')})`);
  } else {
    ref.elementos.forEach((a, i) => {
      const b = rust.elementos[i]!;
      const nome = `elemento ${i} (${a.tipo === 1 ? 'piso' : 'laje'} ${a.dono})`;
      r.elementos++;
      if (a.corte) r.elementosCortados++;
      if (a.tipo !== b.tipo || a.dono !== b.dono) return falha(`${nome}: identidade ${b.tipo}/${b.dono} (Rust)`);
      if (a.corte !== b.corte) falha(`${nome}: corte ${b.corte} (Rust) x ${a.corte} (TS)`);
      if (a.camadas.length !== b.camadas.length) return falha(`${nome}: ${b.camadas.length} camadas (Rust) x ${a.camadas.length} (TS)`);
      a.camadas.forEach((ca, k) => {
        const cb = b.camadas[k]!;
        r.camadas++;
        if (ca.camada !== cb.camada) falha(`${nome}, camada ${k}: índice ${cb.camada} (Rust) x ${ca.camada} (TS)`);
        partes(`${nome}, camada ${k}`, ca.partes, cb.partes);
      });
      if (a.corte && b.corte) {
        r.regioes++;
        poligono(`${nome}: região`, a.regiao, b.regiao);
      } else if (a.regiao.length !== b.regiao.length) falha(`${nome}: região de ${b.regiao.length} polígonos (Rust) x ${a.regiao.length} (TS) sem corte`);
    });
  }

  /**
   * Faixas de parede da junção: compara o RESULTADO FINAL da camada de parede por altura elementar, SEMPRE bloqueante. Comparar faixa a faixa (ou só a
   * região das partes) não tem sentido aqui: a partição vertical não é canônica (fusão do TS por `sigOf` sobre a saída do `polygon-clipping` x A3c do
   * Rust) e a junção só guarda as faixas PLANAS, então o TS pode recortar um bloco plano que o Rust representa como faixas inclinadas que cobrem a
   * mesma região (diagnóstico da pendência de 0050, "B3 entregue"). Regra (a mesma de `wallLayerBandsAfterJunction` em `junctionLevel.ts`): cada faixa
   * da camada sai com as PARTES da junção quando ela as tem (parede cortada e faixa plana com entrada na junção) ou com a FAIXA INTEIRA quando não.
   * Em cada altura elementar (união dos pontos de quebra verticais dos DOIS lados: cotas das faixas próprias, dos vértices com `span`, e das partes) a
   * região final dos dois lados se compara por diferença simétrica a 1e-6 m², com a 0049 só quando é arredondamento (K medido). A flag `corte` não é
   * comparada isolada: vale a geometria final (um `corte` que não muda a região não reprova, uma mudança de região sem `corte` reprova).
   */
  const propriasPorParede = (j: JuncaoB3): Map<number, Map<number, PecaB3[]>> => {
    const m = new Map<number, Map<number, PecaB3[]>>();
    for (const c of j.cortadores) {
      if (c.tipo !== 0) continue;
      for (const p of c.pecas) {
        if (p.externa || !p.meta) continue;
        const camadas = m.get(p.meta.dono) ?? new Map<number, PecaB3[]>();
        camadas.set(p.meta.camada, [...(camadas.get(p.meta.camada) ?? []), p]);
        m.set(p.meta.dono, camadas);
      }
    }
    return m;
  };
  const propA = propriasPorParede(ref);
  const propB = propriasPorParede(rust);
  /** Partes guardadas pela junção por `(camada, banda)`, como `wallBandCut`: nada quando a parede não foi cortada. */
  const partesPorBanda = (w: ParedeJuncaoB3): Map<number, Map<number, ParteB3[]>> => {
    const m = new Map<number, Map<number, ParteB3[]>>();
    if (w.corte) for (const f of w.faixas) m.set(f.camada, new Map([...(m.get(f.camada) ?? []), [f.banda, f.partes] as const]));
    return m;
  };
  /** Região final da camada na altura `z`: partes quando a faixa as tem, senão a faixa inteira (topo inclinado por `regiaoNaAltura`). */
  const regiaoFinalDaCamada = (bandas: readonly PecaB3[], fp: Map<number, ParteB3[]> | undefined, z: number): MultiPolygon => {
    const partes: MultiPolygon[] = [];
    for (const p of bandas) {
      const banda = p.meta?.banda;
      const ps = banda === undefined || banda === null ? undefined : fp?.get(banda);
      if (ps) {
        for (const x of ps) if (x.z0 <= z && z <= x.z1 && x.poligono.length) partes.push(x.poligono);
        continue;
      }
      const ra = regiaoNaAltura([p], z);
      if (ra.length) partes.push(ra);
    }
    return partes.length ? union(...partes) : [];
  };
  if (ref.paredes.length !== rust.paredes.length) {
    falha(`${rust.paredes.length} paredes na junção (Rust) x ${ref.paredes.length} (TS)`);
  } else {
    ref.paredes.forEach((a, i) => {
      const b = rust.paredes[i]!;
      const nome = `parede ${i} (${a.parede})`;
      r.paredes++;
      if (a.corte) r.paredesCortadas++;
      if (a.parede !== b.parede) return falha(`${nome}: identidade ${b.parede} (Rust)`);
      const ca = propA.get(a.parede);
      const cb = propB.get(b.parede);
      if (!ca || !cb) return falha(`${nome}: parede ${ca ? 'com' : 'SEM'} faixas próprias no cortador (TS) x ${cb ? 'com' : 'SEM'} (Rust)`);
      const ka = [...ca.keys()];
      const kb = [...cb.keys()];
      if (ka.join('|') !== kb.join('|')) return falha(`${nome}: camadas de parede ${kb.join(',')} (Rust) x ${ka.join(',')} (TS)`);
      const fpA = partesPorBanda(a);
      const fpB = partesPorBanda(b);
      for (const camada of ka) {
        r.faixas++;
        const bandasA = ca.get(camada)!.filter((x) => areaDaForma(x.poligono) > 1e-6);
        const bandasB = cb.get(camada)!.filter((x) => areaDaForma(x.poligono) > 1e-6);
        const pa = fpA.get(camada);
        const pb = fpB.get(camada);
        const zs: number[] = [];
        for (const [bandas, ps] of [[bandasA, pa], [bandasB, pb]] as const) {
          for (const p of bandas) {
            if (p.faixa) zs.push(p.faixa[0], p.faixa[1]);
            for (const poly of p.poligono) for (const anel of poly) for (const v of anel) zs.push(...p.span(v));
          }
          for (const lista of ps ? [...ps.values()] : []) for (const x of lista) zs.push(x.z0, x.z1);
        }
        zs.sort((x, y) => x - y);
        const pontos: number[] = [];
        for (const z of zs) if (pontos.length === 0 || z - pontos[pontos.length - 1]! > 1e-6) pontos.push(z);
        for (let k = 0; k + 1 < pontos.length; k++) {
          for (const q of [0.25, 0.5, 0.75]) {
            const z = pontos[k]! + q * (pontos[k + 1]! - pontos[k]!);
            const ra = regiaoFinalDaCamada(bandasA, pa, z);
            const rb = regiaoFinalDaCamada(bandasB, pb, z);
            if (ra.length === 0 && rb.length === 0) continue;
            r.regioes++;
            poligono(`${nome}, camada ${camada}, altura ${z}: região final da camada`, ra, rb);
          }
        }
      }
    });
  }
  return r;
}
