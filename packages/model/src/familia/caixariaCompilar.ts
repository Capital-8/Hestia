import type { Familia, Ferragem, OpcaoParametro, Parametro, Peca } from './tipos.ts';
import type { Caixaria, DivisaoItem, PreenchimentoVao, Vao } from './tiposCaixaria.ts';

/*
 * Compilação da árvore de caixaria paramétrica para `Peca[]` e `Ferragem[]` (ADR 0049 / Caixaria).
 * Todas as posições e medidas são representadas como combinações afins `(kD * D + kE * esp + kC)` ao longo
 * de cada eixo (`L`, `P`, `A`), mantendo fórmulas curtas (<= 512 chars) em qualquer profundidade de vãos.
 */

export const FITA_CAIXARIA = 'fita_pvc';

export const CHAPAS_CAIXARIA: OpcaoParametro[] = [
  { valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 },
  { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 },
  { valor: 'mdf25', rotulo: 'MDF 25 mm', esp: 25 },
];

/** Expressão afim ao longo de um único eixo: `kD * D + kE * esp + kC`. */
export interface Afim {
  kD: number;
  kE: number;
  kC: number;
}

export interface CaixaAfim {
  x0: Afim;
  x1: Afim;
  y0: Afim;
  y1: Afim;
  z0: Afim;
  z1: Afim;
}

export interface BordasExternas {
  esq: boolean;
  dir: boolean;
  base: boolean;
  topo: boolean;
  topoAberto: boolean;
}

const ZERO_EPS = 1e-9;

export const afim = (kD: number, kE: number, kC: number): Afim => ({ kD, kE, kC });

export const addAfim = (a: Afim, b: Afim): Afim => ({
  kD: a.kD + b.kD,
  kE: a.kE + b.kE,
  kC: a.kC + b.kC,
});

export const subAfim = (a: Afim, b: Afim): Afim => ({
  kD: a.kD - b.kD,
  kE: a.kE - b.kE,
  kC: a.kC - b.kC,
});

export const scaleAfim = (a: Afim, s: number): Afim => ({
  kD: a.kD * s,
  kE: a.kE * s,
  kC: a.kC * s,
});

export const avaliarAfim = (a: Afim, dim: number, esp: number): number =>
  a.kD * dim + a.kE * esp + a.kC;

function roundCoef(v: number): number {
  if (Math.abs(v) < ZERO_EPS) return 0;
  return Number(v.toFixed(6));
}

function formatarNumero(v: number): string {
  const n = roundCoef(v);
  return Object.is(n, -0) ? '0' : String(n);
}

/** Formata uma combinação afim em expressão compacta para a linguagem de fórmulas. */
export function formatarAfim(a: Afim, dimVar: 'L' | 'A' | 'P'): string {
  const kD = roundCoef(a.kD);
  const kE = roundCoef(a.kE);
  const kC = roundCoef(a.kC);
  const partes: string[] = [];

  const adicionarTermo = (coef: number, nome?: string): void => {
    if (coef === 0) return;
    const neg = coef < 0;
    const mag = Math.abs(coef);
    const corpo = nome ? (mag === 1 ? nome : `${formatarNumero(mag)} * ${nome}`) : formatarNumero(mag);
    if (partes.length === 0) {
      partes.push(neg ? `-${corpo}` : corpo);
    } else {
      partes.push(neg ? `- ${corpo}` : `+ ${corpo}`);
    }
  };

  adicionarTermo(kD, dimVar);
  adicionarTermo(kE, 'esp');
  adicionarTermo(kC);

  return partes.length === 0 ? '0' : partes.join(' ');
}

export function criarCaixariaPadrao(estrutura: Caixaria['estrutura'] = 'base_topo'): Caixaria {
  return {
    versao: 1,
    estrutura,
    rodape: { tipo: 'nenhum', altura: 0, recuo: 50 },
    fundo: { tipo: 'encaixado', espessura: 6, recuo: 15 },
    raiz: { id: 'raiz' },
  };
}

/** Calcula os limites afins (mm) do vão raiz e das faces da carcaça. */
export function calcularCaixaRaizAfim(cx: Caixaria): {
  zRodape: number;
  tampoEsp: number;
  yFundo: Afim;
  profLat: Afim;
  raiz: CaixaAfim;
  bordas: BordasExternas;
} {
  const zRodape = cx.rodape.tipo === 'nenhum' ? 0 : Math.max(0, cx.rodape.altura);
  const tampoEsp = cx.tampo ? Math.max(0, cx.tampo.espessura) : 0;

  let fundoDeduct = 0;
  let latDeduct = 0;
  if (cx.fundo.tipo === 'pregado') {
    fundoDeduct = Math.max(0, cx.fundo.espessura);
    latDeduct = fundoDeduct;
  } else if (cx.fundo.tipo === 'encaixado') {
    fundoDeduct = Math.max(0, cx.fundo.espessura) + Math.max(0, cx.fundo.recuo);
  } else if (cx.fundo.tipo === 'espesso') {
    fundoDeduct = Math.max(0, cx.fundo.espessura);
  }

  const yFundo = afim(1, 0, -fundoDeduct);
  const profLat = afim(1, 0, -latDeduct);
  const z0 = afim(0, 1, zRodape);
  const z1 = cx.estrutura === 'aberta'
    ? afim(1, 0, -tampoEsp)
    : afim(1, -1, -tampoEsp);

  return {
    zRodape,
    tampoEsp,
    yFundo,
    profLat,
    raiz: {
      x0: afim(0, 1, 0),
      x1: afim(1, -1, 0),
      y0: afim(0, 0, 0),
      y1: yFundo,
      z0,
      z1,
    },
    bordas: {
      esq: true,
      dir: true,
      base: true,
      topo: cx.estrutura !== 'aberta',
      topoAberto: cx.estrutura === 'aberta',
    },
  };
}

/** Calcula as posições afins das divisórias/prateleiras e os sub-intervalos dos filhos. */
export function dividirIntervaloAfim(
  a: Afim,
  b: Afim,
  itens: readonly DivisaoItem[],
): { posicoes: Afim[]; intervalos: Array<[Afim, Afim]> } {
  const m = itens.length;
  const span = subAfim(b, a);
  const luzUtil = subAfim(span, afim(0, m, 0));

  const posicoes: Afim[] = itens.map((item, k) => {
    switch (item.modo) {
      case 'fixo_inicio':
        return addAfim(a, afim(0, 0, item.valor));
      case 'fixo_fim':
        return subAfim(b, afim(0, 1, item.valor));
      case 'proporcional':
      default:
        return addAfim(a, addAfim(scaleAfim(luzUtil, item.valor), afim(0, k, 0)));
    }
  });

  const intervalos: Array<[Afim, Afim]> = [];
  for (let c = 0; c <= m; c++) {
    const start = c === 0 ? a : addAfim(posicoes[c - 1]!, afim(0, 1, 0));
    const end = c === m ? b : posicoes[c]!;
    intervalos.push([start, end]);
  }
  return { posicoes, intervalos };
}

function limparId(id: string): string {
  const limpo = id.replace(/[^A-Za-z0-9_]/g, '_');
  return limpo === '' ? 'x' : limpo;
}

function idUnico(base: string, usados: Set<string>): string {
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  let k = 2;
  while (usados.has(`${base}_${k}`)) k++;
  const res = `${base}_${k}`;
  usados.add(res);
  return res;
}

function formulaDobradicasPorAltura(alturaExpr: string): string {
  const h = alturaExpr.includes(' ') ? `(${alturaExpr})` : alturaExpr;
  return `${h} <= 900 ? 2 : (${h} <= 1600 ? 3 : (${h} <= 2200 ? 4 : 5))`;
}

function compilarCarcaca(cx: Caixaria, info: ReturnType<typeof calcularCaixaRaizAfim>): Peca[] {
  const pecas: Peca[] = [];
  const { zRodape, tampoEsp, yFundo, profLat, raiz } = info;
  const profStr = formatarAfim(profLat, 'P');
  const zBaseStr = formatarAfim(raiz.z0, 'A');
  const zTopoStr = formatarAfim(afim(1, -1, -tampoEsp), 'A');

  const latSobreBase = cx.estrutura === 'base_topo' || cx.estrutura === 'sem_topo';
  const zLat = latSobreBase ? zBaseStr : formatarAfim(afim(0, 0, zRodape), 'A');
  const hLat = cx.estrutura === 'base_topo'
    ? formatarAfim(afim(1, -2, -(tampoEsp + zRodape)), 'A')
    : cx.estrutura === 'sem_topo'
      ? formatarAfim(afim(1, -1, -(tampoEsp + zRodape)), 'A')
      : formatarAfim(afim(1, 0, -(tampoEsp + zRodape)), 'A');

  pecas.push(
    { id: 'cx_latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', zLat], tamanho: [profStr, hLat], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'b' },
    { id: 'cx_latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', zLat], tamanho: [profStr, hLat], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'b' },
  );

  const basePassante = cx.estrutura === 'base_topo' || cx.estrutura === 'sem_topo';
  pecas.push({
    id: 'cx_base',
    nome: 'Base',
    papel: 'base',
    eixo: 'z',
    origem: [basePassante ? '0' : 'esp', '0', String(zRodape)],
    tamanho: [basePassante ? 'L' : 'L - 2 * esp', profStr],
    espessura: 'esp',
    material: 'corpo',
    fita: { n: FITA_CAIXARIA },
    veio: 'a',
  });

  if (cx.estrutura === 'base_topo' || cx.estrutura === 'laterais_passantes') {
    const topoPassante = cx.estrutura === 'base_topo';
    pecas.push({
      id: 'cx_topo',
      nome: 'Topo',
      papel: 'topo',
      eixo: 'z',
      origem: [topoPassante ? '0' : 'esp', '0', zTopoStr],
      tamanho: [topoPassante ? 'L' : 'L - 2 * esp', profStr],
      espessura: 'esp',
      material: 'corpo',
      fita: { n: FITA_CAIXARIA },
      veio: 'a',
    });
  } else if (cx.estrutura === 'sem_topo') {
    pecas.push(
      { id: 'cx_trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['esp', '0', zTopoStr], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
      { id: 'cx_trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['esp', formatarAfim(subAfim(yFundo, afim(0, 0, 80)), 'P'), zTopoStr], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
    );
  }

  if (cx.fundo.tipo !== 'nenhum') {
    const fEsp = Math.max(1, cx.fundo.espessura);
    const pregado = cx.fundo.tipo === 'pregado';
    const fundoH = pregado ? afim(1, 0, -(tampoEsp + zRodape)) : subAfim(raiz.z1, raiz.z0);
    pecas.push({
      id: 'cx_fundo',
      nome: 'Fundo',
      papel: 'fundo',
      eixo: 'y',
      origem: [pregado ? '0' : 'esp', formatarAfim(yFundo, 'P'), pregado ? String(zRodape) : zBaseStr],
      tamanho: [pregado ? 'L' : 'L - 2 * esp', formatarAfim(fundoH, 'A')],
      espessura: String(fEsp),
      material: 'mat_fundo',
      veio: 'livre',
    });
  }

  if (cx.rodape.tipo === 'recuado' && cx.rodape.altura > 0) {
    pecas.push({
      id: 'cx_rodape',
      nome: 'Rodapé',
      papel: 'rodape',
      eixo: 'y',
      origem: ['esp', String(Math.max(0, cx.rodape.recuo)), '0'],
      tamanho: ['L - 2 * esp', String(cx.rodape.altura)],
      espessura: 'esp',
      material: 'corpo',
      fita: { n: FITA_CAIXARIA },
      veio: 'a',
    });
  }

  if (cx.tampo) {
    const t = cx.tampo;
    const zTampo = formatarAfim(afim(1, 0, -tampoEsp), 'A');
    pecas.push({
      id: 'cx_tampo',
      nome: 'Tampo',
      papel: 'tampo',
      eixo: 'z',
      origem: [String(-t.avancoEsq), String(-t.avancoFrente), zTampo],
      tamanho: [formatarAfim(afim(1, 0, t.avancoEsq + t.avancoDir), 'L'), formatarAfim(afim(1, 0, t.avancoFrente + t.avancoFundo), 'P')],
      espessura: String(tampoEsp),
      material: 'mat_tampo',
      fita: { n: FITA_CAIXARIA },
      veio: 'a',
    });
    if (t.recorte) {
      const r = t.recorte;
      const rx = formatarAfim(afim(0.5, 0, (t.avancoDir - t.avancoEsq - r.largura) / 2 + (r.dx ?? 0)), 'L');
      const ry = formatarAfim(afim(0.5, 0, (t.avancoFundo - t.avancoFrente - r.profundidade) / 2 + (r.dy ?? 0)), 'P');
      pecas.push({
        id: 'cx_tampo_recorte',
        nome: 'Recorte do tampo',
        papel: 'bloco',
        eixo: 'z',
        vazio: true,
        origem: [rx, ry, zTampo],
        tamanho: [String(r.largura), String(r.profundidade)],
        espessura: String(tampoEsp),
      });
    }
  }

  if (cx.tamponamentos) {
    const tam = cx.tamponamentos;
    const tEsp = tam.espessura ?? 18;
    const avF = tam.avancoFrente ?? 0;
    const pTam = formatarAfim(afim(1, 0, avF), 'P');
    const hTam = formatarAfim(afim(1, 0, -(tampoEsp + zRodape)), 'A');
    if (tam.esquerda) {
      pecas.push({ id: 'cx_tamp_esq', nome: 'Tamponamento esquerdo', papel: 'painel', eixo: 'x', origem: [String(-tEsp), String(-avF), String(zRodape)], tamanho: [pTam, hTam], espessura: String(tEsp), material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'b' });
    }
    if (tam.direita) {
      pecas.push({ id: 'cx_tamp_dir', nome: 'Tamponamento direito', papel: 'painel', eixo: 'x', origem: ['L', String(-avF), String(zRodape)], tamanho: [pTam, hTam], espessura: String(tEsp), material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'b' });
    }
    const xTamMin = tam.esquerda ? -tEsp : 0;
    const xTamAdd = (tam.esquerda ? tEsp : 0) + (tam.direita ? tEsp : 0);
    const lTam = formatarAfim(afim(1, 0, xTamAdd), 'L');
    if (tam.topo) {
      pecas.push({ id: 'cx_tamp_topo', nome: 'Tamponamento superior', papel: 'painel', eixo: 'z', origem: [String(xTamMin), String(-avF), formatarAfim(afim(1, 0, -tampoEsp), 'A')], tamanho: [lTam, pTam], espessura: String(tEsp), material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a' });
    }
    if (tam.base) {
      pecas.push({ id: 'cx_tamp_base', nome: 'Tamponamento inferior', papel: 'painel', eixo: 'z', origem: [String(xTamMin), String(-avF), String(zRodape - tEsp)], tamanho: [lTam, pTam], espessura: String(tEsp), material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a' });
    }
  }

  return pecas;
}

function bordasDaFrente(
  caixa: CaixaAfim,
  bordas: BordasExternas,
  montagem: 'sobreposta' | 'embutida',
  folga: number,
): { x0: Afim; x1: Afim; z0: Afim; z1: Afim; y: string } {
  if (montagem === 'embutida') {
    return {
      x0: addAfim(caixa.x0, afim(0, 0, folga)),
      x1: subAfim(caixa.x1, afim(0, 0, folga)),
      z0: addAfim(caixa.z0, afim(0, 0, folga)),
      z1: subAfim(caixa.z1, afim(0, 0, folga)),
      y: formatarAfim(caixa.y0, 'P'),
    };
  }
  const ovEsq = bordas.esq ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovDir = bordas.dir ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovBase = bordas.base ? afim(0, 1, -folga) : afim(0, 0.5, -folga / 2);
  const ovTopo = bordas.topo
    ? afim(0, 1, -folga)
    : bordas.topoAberto
      ? afim(0, 0, -folga)
      : afim(0, 0.5, -folga / 2);

  return {
    x0: subAfim(caixa.x0, ovEsq),
    x1: addAfim(caixa.x1, ovDir),
    z0: subAfim(caixa.z0, ovBase),
    z1: addAfim(caixa.z1, ovTopo),
    y: '-18',
  };
}

function compilarPreenchimento(
  vao: Vao,
  caixa: CaixaAfim,
  bordas: BordasExternas,
  p: PreenchimentoVao,
  pecas: Peca[],
  ferragens: Ferragem[],
  pecasUsadas: Set<string>,
  ferragensUsadas: Set<string>,
): void {
  if (p.tipo === 'nenhum') return;
  const vid = limparId(vao.id);
  const fita4 = { n: FITA_CAIXARIA, s: FITA_CAIXARIA, l: FITA_CAIXARIA, o: FITA_CAIXARIA };

  switch (p.tipo) {
    case 'porta': {
      const folga = p.folga ?? 2;
      const fr = bordasDaFrente(caixa, bordas, p.montagem, folga);
      const pw = subAfim(fr.x1, fr.x0);
      const ph = subAfim(fr.z1, fr.z0);
      const hStr = formatarAfim(ph, 'A');
      const zStr = formatarAfim(fr.z0, 'A');

      if (p.estilo === 'giro_1' || p.estilo === 'basculante') {
        const nome = p.estilo === 'basculante' ? 'Porta basculante' : 'Porta';
        pecas.push({
          id: idUnico(`cx_porta_${vid}_1`, pecasUsadas),
          nome,
          papel: 'porta',
          eixo: 'y',
          origem: [formatarAfim(fr.x0, 'L'), fr.y, zStr],
          tamanho: [formatarAfim(pw, 'L'), hStr],
          espessura: '18',
          material: 'mat_porta',
          fita: fita4,
          veio: p.estilo === 'basculante' ? 'a' : 'b',
          grupo: vao.id,
        });
        if (p.estilo === 'basculante') {
          ferragens.push({ id: idUnico(`cx_fer_articulador_${vid}`, ferragensUsadas), nome: 'Articulador', quantidade: '2' });
        } else {
          ferragens.push({ id: idUnico(`cx_fer_dobradica_${vid}`, ferragensUsadas), nome: 'Dobradiça', quantidade: formulaDobradicasPorAltura(hStr) });
        }
        ferragens.push({ id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: '1' });
      } else if (p.estilo === 'giro_2') {
        const wFolha = subAfim(scaleAfim(pw, 0.5), afim(0, 0, folga / 2));
        const xDir = addAfim(fr.x0, addAfim(scaleAfim(pw, 0.5), afim(0, 0, folga / 2)));
        const wStr = formatarAfim(wFolha, 'L');
        pecas.push(
          { id: idUnico(`cx_porta_${vid}_1`, pecasUsadas), nome: 'Porta esquerda', papel: 'porta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, zStr], tamanho: [wStr, hStr], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'b', grupo: vao.id },
          { id: idUnico(`cx_porta_${vid}_2`, pecasUsadas), nome: 'Porta direita', papel: 'porta', eixo: 'y', origem: [formatarAfim(xDir, 'L'), fr.y, zStr], tamanho: [wStr, hStr], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'b', grupo: vao.id },
        );
        ferragens.push(
          { id: idUnico(`cx_fer_dobradica_${vid}`, ferragensUsadas), nome: 'Dobradiça', quantidade: `(${formulaDobradicasPorAltura(hStr)}) * 2` },
          { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: '2' },
        );
      } else {
        const nFolhas = Math.max(2, Math.min(8, Math.round(p.folhasCorrer ?? 2)));
        const passoX = scaleAfim(pw, 1 / nFolhas);
        const wFolha = addAfim(passoX, afim(0, 0, 15));
        const wStr = formatarAfim(wFolha, 'L');
        const yBase = p.montagem === 'sobreposta' ? -18 : 0;
        for (let k = 0; k < nFolhas; k++) {
          const xK = addAfim(fr.x0, scaleAfim(passoX, k));
          const yK = yBase - (k % 2) * 22;
          pecas.push({
            id: idUnico(`cx_porta_${vid}_${k + 1}`, pecasUsadas),
            nome: `Porta de correr ${k + 1}`,
            papel: 'porta',
            eixo: 'y',
            origem: [formatarAfim(xK, 'L'), String(yK), zStr],
            tamanho: [wStr, hStr],
            espessura: '18',
            material: 'mat_porta',
            fita: fita4,
            veio: 'b',
            grupo: vao.id,
          });
        }
        ferragens.push(
          { id: idUnico(`cx_fer_correr_${vid}`, ferragensUsadas), nome: 'Kit porta de correr', quantidade: '1' },
          { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: String(nFolhas) },
        );
      }
      break;
    }

    case 'gavetas': {
      const qty = Math.max(1, Math.min(24, Math.round(p.quantidade)));
      const gavetoes = Math.max(0, Math.min(qty, Math.round(p.gavetoes ?? 0)));
      const folga = p.folga ?? 3;
      const fr = bordasDaFrente(caixa, bordas, p.montagem, folga);
      const pw = subAfim(fr.x1, fr.x0);
      const ph = subAfim(fr.z1, fr.z0);
      const wInt = subAfim(caixa.x1, caixa.x0);
      const profDisp = formatarAfim(subAfim(subAfim(caixa.y1, caixa.y0), afim(0, 0, 50)), 'P');
      const profCaixa = `min(500, ${profDisp})`;
      const profCaixaMenosEsp = `min(500, ${profDisp}) - esp`;
      const xLatE = formatarAfim(addAfim(caixa.x0, afim(0, 0, 13)), 'L');
      const xLatD = formatarAfim(subAfim(caixa.x1, afim(0, 1, 13)), 'L');
      const xTras = formatarAfim(addAfim(caixa.x0, afim(0, 1, 13)), 'L');
      const wCaixa = formatarAfim(subAfim(wInt, afim(0, 2, 26)), 'L');

      if (gavetoes === 0) {
        const slotH = scaleAfim(ph, 1 / qty);
        const hFrente = subAfim(slotH, afim(0, 0, folga));
        const hCaixa = subAfim(hFrente, afim(0, 0, 40));
        const slotStr = formatarAfim(slotH, 'A');
        const zBaseFrente = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2)), 'A');
        const zBaseCaixa = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2 + 20)), 'A');
        const zBaseFundo = formatarAfim(addAfim(fr.z0, afim(0, 0, folga / 2 + 28)), 'A');
        const rep = String(qty);

        pecas.push(
          { id: idUnico(`cx_gav_frente_${vid}`, pecasUsadas), nome: 'Frente de gaveta', papel: 'frente_gaveta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, `${zBaseFrente} + (i - 1) * (${slotStr})`], tamanho: [formatarAfim(pw, 'L'), formatarAfim(hFrente, 'A')], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_latE_${vid}`, pecasUsadas), nome: 'Lateral esquerda gaveta', papel: 'lateral', eixo: 'x', origem: [xLatE, formatarAfim(caixa.y0, 'P'), `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_latD_${vid}`, pecasUsadas), nome: 'Lateral direita gaveta', papel: 'lateral', eixo: 'x', origem: [xLatD, formatarAfim(caixa.y0, 'P'), `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_tras_${vid}`, pecasUsadas), nome: 'Traseira gaveta', papel: 'painel', eixo: 'y', origem: [xTras, profCaixaMenosEsp, `${zBaseCaixa} + (i - 1) * (${slotStr})`], tamanho: [wCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', veio: 'a', repetir: rep, grupo: vao.id },
          { id: idUnico(`cx_gav_fundo_${vid}`, pecasUsadas), nome: 'Fundo gaveta', papel: 'fundo', eixo: 'z', origem: [xTras, formatarAfim(caixa.y0, 'P'), `${zBaseFundo} + (i - 1) * (${slotStr})`], tamanho: [wCaixa, profCaixaMenosEsp], espessura: '6', material: 'mat_fundo', veio: 'livre', repetir: rep, grupo: vao.id },
        );
      } else {
        const pesoTotal = qty + gavetoes;
        let offsetPeso = 0;
        for (let k = 0; k < qty; k++) {
          const peso = k < gavetoes ? 2 : 1;
          const zSlot = addAfim(fr.z0, scaleAfim(ph, offsetPeso / pesoTotal));
          const slotH = scaleAfim(ph, peso / pesoTotal);
          const hFrente = subAfim(slotH, afim(0, 0, folga));
          const hCaixa = subAfim(hFrente, afim(0, 0, 40));
          const zF = addAfim(zSlot, afim(0, 0, folga / 2));
          const zC = addAfim(zF, afim(0, 0, 20));
          const zFd = addAfim(zF, afim(0, 0, 28));
          const sufixo = `${vid}_${k + 1}`;
          pecas.push(
            { id: idUnico(`cx_gav_frente_${sufixo}`, pecasUsadas), nome: `Frente gaveta ${k + 1}`, papel: 'frente_gaveta', eixo: 'y', origem: [formatarAfim(fr.x0, 'L'), fr.y, formatarAfim(zF, 'A')], tamanho: [formatarAfim(pw, 'L'), formatarAfim(hFrente, 'A')], espessura: '18', material: 'mat_porta', fita: fita4, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_latE_${sufixo}`, pecasUsadas), nome: `Lateral esq. gaveta ${k + 1}`, papel: 'lateral', eixo: 'x', origem: [xLatE, formatarAfim(caixa.y0, 'P'), formatarAfim(zC, 'A')], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_latD_${sufixo}`, pecasUsadas), nome: `Lateral dir. gaveta ${k + 1}`, papel: 'lateral', eixo: 'x', origem: [xLatD, formatarAfim(caixa.y0, 'P'), formatarAfim(zC, 'A')], tamanho: [profCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', fita: { n: FITA_CAIXARIA }, veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_tras_${sufixo}`, pecasUsadas), nome: `Traseira gaveta ${k + 1}`, papel: 'painel', eixo: 'y', origem: [xTras, profCaixaMenosEsp, formatarAfim(zC, 'A')], tamanho: [wCaixa, formatarAfim(hCaixa, 'A')], espessura: 'esp', material: 'corpo', veio: 'a', grupo: vao.id },
            { id: idUnico(`cx_gav_fundo_${sufixo}`, pecasUsadas), nome: `Fundo gaveta ${k + 1}`, papel: 'fundo', eixo: 'z', origem: [xTras, formatarAfim(caixa.y0, 'P'), formatarAfim(zFd, 'A')], tamanho: [wCaixa, profCaixaMenosEsp], espessura: '6', material: 'mat_fundo', veio: 'livre', grupo: vao.id },
          );
          offsetPeso += peso;
        }
      }

      ferragens.push(
        { id: idUnico(`cx_fer_corredica_${vid}`, ferragensUsadas), nome: 'Corrediça telescópica', quantidade: String(qty) },
        { id: idUnico(`cx_fer_puxador_${vid}`, ferragensUsadas), nome: 'Puxador', quantidade: String(qty) },
      );
      break;
    }

    case 'cabideiro': {
      const offset = Math.max(0, p.alturaOffsetTopo ?? 60);
      const midY = subAfim(scaleAfim(addAfim(caixa.y0, caixa.y1), 0.5), afim(0, 0, 12.5));
      const zCab = subAfim(caixa.z1, afim(0, 0, offset + 25));
      pecas.push({
        id: idUnico(`cx_cabideiro_${vid}`, pecasUsadas),
        nome: 'Cabideiro',
        papel: 'generica',
        eixo: 'z',
        origem: [formatarAfim(caixa.x0, 'L'), formatarAfim(midY, 'P'), formatarAfim(zCab, 'A')],
        tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), '25'],
        espessura: '25',
        material: 'aluminio',
        grupo: vao.id,
      });
      ferragens.push({ id: idUnico(`cx_fer_suporte_cab_${vid}`, ferragensUsadas), nome: 'Suporte de cabideiro', quantidade: '2' });
      break;
    }

    case 'ripado': {
      const larg = Math.max(5, p.larguraRipa);
      const espac = Math.max(0, p.espacamento);
      const prof = Math.max(5, p.profundidadeRipa ?? 20);
      const passo = larg + espac;
      const yRipa = formatarAfim(subAfim(caixa.y1, afim(0, 0, prof)), 'P');
      if (p.direcao === 'vertical') {
        const wStr = formatarAfim(subAfim(caixa.x1, caixa.x0), 'L');
        pecas.push({
          id: idUnico(`cx_ripado_${vid}`, pecasUsadas),
          nome: 'Ripado vertical',
          papel: 'painel',
          eixo: 'x',
          origem: [`${formatarAfim(caixa.x0, 'L')} + (i - 1) * ${passo}`, yRipa, formatarAfim(caixa.z0, 'A')],
          tamanho: [String(prof), formatarAfim(subAfim(caixa.z1, caixa.z0), 'A')],
          espessura: String(larg),
          material: 'corpo',
          fita: { n: FITA_CAIXARIA },
          repetir: `clamp(floor((${wStr} + ${espac}) / ${passo}), 1, 64)`,
          grupo: vao.id,
        });
      } else {
        const hStr = formatarAfim(subAfim(caixa.z1, caixa.z0), 'A');
        pecas.push({
          id: idUnico(`cx_ripado_${vid}`, pecasUsadas),
          nome: 'Ripado horizontal',
          papel: 'painel',
          eixo: 'z',
          origem: [formatarAfim(caixa.x0, 'L'), yRipa, `${formatarAfim(caixa.z0, 'A')} + (i - 1) * ${passo}`],
          tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), String(prof)],
          espessura: String(larg),
          material: 'corpo',
          fita: { n: FITA_CAIXARIA },
          repetir: `clamp(floor((${hStr} + ${espac}) / ${passo}), 1, 64)`,
          grupo: vao.id,
        });
      }
      break;
    }

    case 'sapateira': {
      const qty = Math.max(1, Math.min(32, Math.round(p.quantidade)));
      const hVao = formatarAfim(subAfim(caixa.z1, caixa.z0), 'A');
      const dVao = formatarAfim(subAfim(caixa.y1, addAfim(caixa.y0, afim(0, 0, 20))), 'P');
      pecas.push({
        id: idUnico(`cx_sapateira_${vid}`, pecasUsadas),
        nome: 'Prateleira sapateira',
        papel: 'prateleira',
        eixo: 'z',
        origem: [formatarAfim(caixa.x0, 'L'), formatarAfim(addAfim(caixa.y0, afim(0, 0, 20)), 'P'), `${formatarAfim(caixa.z0, 'A')} + i * (${hVao} - ${qty} * esp) / ${qty + 1} + (i - 1) * esp`],
        tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), dVao],
        espessura: 'esp',
        material: 'corpo',
        fita: { n: FITA_CAIXARIA },
        veio: 'a',
        repetir: String(qty),
        grupo: vao.id,
      });
      ferragens.push({ id: idUnico(`cx_fer_pino_sap_${vid}`, ferragensUsadas), nome: 'Pino de prateleira', quantidade: String(4 * qty) });
      break;
    }
  }
}

function compilarVaoRecursivo(
  vao: Vao,
  caixa: CaixaAfim,
  bordas: BordasExternas,
  pecas: Peca[],
  ferragens: Ferragem[],
  pecasUsadas: Set<string>,
  ferragensUsadas: Set<string>,
  contagemPrateleiras: { total: number },
): void {
  if (vao.preenchimento && vao.preenchimento.tipo !== 'nenhum') {
    compilarPreenchimento(vao, caixa, bordas, vao.preenchimento, pecas, ferragens, pecasUsadas, ferragensUsadas);
  }

  const div = vao.divisao;
  const filhos = vao.filhos;
  if (!div || div.itens.length === 0 || !filhos || filhos.length !== div.itens.length + 1) return;

  if (div.eixo === 'z') {
    const { posicoes, intervalos } = dividirIntervaloAfim(caixa.z0, caixa.z1, div.itens);
    contagemPrateleiras.total += div.itens.length;
    div.itens.forEach((item, k) => {
      const recuo = Math.max(0, item.recuoFrente ?? 0);
      const yPrat = addAfim(caixa.y0, afim(0, 0, recuo));
      pecas.push({
        id: idUnico(`cx_prat_${limparId(item.id)}`, pecasUsadas),
        nome: 'Prateleira',
        papel: 'prateleira',
        eixo: 'z',
        origem: [formatarAfim(caixa.x0, 'L'), formatarAfim(yPrat, 'P'), formatarAfim(posicoes[k]!, 'A')],
        tamanho: [formatarAfim(subAfim(caixa.x1, caixa.x0), 'L'), formatarAfim(subAfim(caixa.y1, yPrat), 'P')],
        espessura: 'esp',
        material: 'corpo',
        fita: { n: FITA_CAIXARIA },
        veio: 'a',
        grupo: vao.id,
      });
    });
    filhos.forEach((filho, c) => {
      const [z0, z1] = intervalos[c]!;
      const m = div.itens.length;
      const subBordas: BordasExternas = {
        ...bordas,
        base: c === 0 ? bordas.base : false,
        topo: c === m ? bordas.topo : false,
        topoAberto: c === m ? bordas.topoAberto : false,
      };
      compilarVaoRecursivo(filho, { ...caixa, z0, z1 }, subBordas, pecas, ferragens, pecasUsadas, ferragensUsadas, contagemPrateleiras);
    });
  } else {
    const { posicoes, intervalos } = dividirIntervaloAfim(caixa.x0, caixa.x1, div.itens);
    div.itens.forEach((item, k) => {
      const recuo = Math.max(0, item.recuoFrente ?? 0);
      const yDiv = addAfim(caixa.y0, afim(0, 0, recuo));
      pecas.push({
        id: idUnico(`cx_div_${limparId(item.id)}`, pecasUsadas),
        nome: 'Divisória',
        papel: 'divisoria',
        eixo: 'x',
        origem: [formatarAfim(posicoes[k]!, 'L'), formatarAfim(yDiv, 'P'), formatarAfim(caixa.z0, 'A')],
        tamanho: [formatarAfim(subAfim(caixa.y1, yDiv), 'P'), formatarAfim(subAfim(caixa.z1, caixa.z0), 'A')],
        espessura: 'esp',
        material: 'corpo',
        fita: { n: FITA_CAIXARIA },
        veio: 'b',
        grupo: vao.id,
      });
    });
    filhos.forEach((filho, c) => {
      const [x0, x1] = intervalos[c]!;
      const m = div.itens.length;
      const subBordas: BordasExternas = {
        ...bordas,
        esq: c === 0 ? bordas.esq : false,
        dir: c === m ? bordas.dir : false,
      };
      compilarVaoRecursivo(filho, { ...caixa, x0, x1 }, subBordas, pecas, ferragens, pecasUsadas, ferragensUsadas, contagemPrateleiras);
    });
  }
}

/** Compila a árvore de `Caixaria` da família em peças (`cx_*`) e ferragens (`cx_fer_*`). */
export function compilarCaixaria(f: Familia): { pecas: Peca[]; ferragens: Ferragem[] } {
  if (!f.caixaria?.raiz) return { pecas: [], ferragens: [] };
  const cx = f.caixaria;
  const info = calcularCaixaRaizAfim(cx);
  const pecas = compilarCarcaca(cx, info);
  const ferragens: Ferragem[] = [];

  const pecasUsadas = new Set(pecas.map((p) => p.id));
  const ferragensUsadas = new Set<string>();
  const contagemPrateleiras = { total: 0 };

  compilarVaoRecursivo(cx.raiz, info.raiz, info.bordas, pecas, ferragens, pecasUsadas, ferragensUsadas, contagemPrateleiras);

  if (contagemPrateleiras.total > 0) {
    ferragens.push({
      id: idUnico('cx_fer_pino', ferragensUsadas),
      nome: 'Pino de prateleira',
      quantidade: String(4 * contagemPrateleiras.total),
    });
  }

  if (cx.rodape.tipo === 'pes' && cx.rodape.altura > 0) {
    ferragens.push({
      id: idUnico('cx_fer_pes', ferragensUsadas),
      nome: 'Pé regulável',
      quantidade: 'L >= 900 ? 6 : 4',
    });
  }

  return { pecas, ferragens };
}

function garantirParametro(f: Familia, p: Parametro): void {
  if (f.parametros.some((x) => x.id === p.id)) return;
  f.parametros.push(p);
}

/**
 * Sincroniza `f.parametros`, `f.pecas` e `f.ferragens` a partir de `f.caixaria`.
 * Preserva peças que não começam por `cx_` e peças `cx_*` listadas em `pecasDesvinculadas`.
 */
export function sincronizarCaixaria(f: Familia): void {
  if (!f.caixaria || typeof f.caixaria !== 'object' || !f.caixaria.raiz) {
    f.caixaria = criarCaixariaPadrao();
  }
  if (!Array.isArray(f.parametros)) f.parametros = [];
  if (!Array.isArray(f.pecas)) f.pecas = [];
  if (!Array.isArray(f.ferragens)) f.ferragens = [];

  garantirParametro(f, { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 800, min: 200, max: 3000, passo: 10, grupo: 'Dimensões' });
  garantirParametro(f, { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: 720, min: 200, max: 3000, passo: 10, grupo: 'Dimensões' });
  garantirParametro(f, { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 560, min: 150, max: 1200, passo: 10, grupo: 'Dimensões' });
  garantirParametro(f, { id: 'corpo', nome: 'Chapa do corpo', tipo: 'chapa', escopo: 'tipo', padrao: 'mdf18', grupo: 'Material', opcoes: CHAPAS_CAIXARIA });
  garantirParametro(f, { id: 'esp', nome: 'Espessura do corpo', tipo: 'numero', escopo: 'tipo', padrao: 0, formula: 'corpo.esp', grupo: 'Derivados' });
  garantirParametro(f, { id: 'mat_porta', nome: 'Material das portas', tipo: 'material', escopo: 'tipo', padrao: 'mdf18', grupo: 'Material' });
  garantirParametro(f, { id: 'mat_tampo', nome: 'Material do tampo', tipo: 'material', escopo: 'tipo', padrao: 'mdf25', grupo: 'Material' });
  garantirParametro(f, { id: 'mat_fundo', nome: 'Material do fundo', tipo: 'material', escopo: 'tipo', padrao: 'mdf6', grupo: 'Material' });

  const { pecas: compiladas, ferragens: ferragensCompiladas } = compilarCaixaria(f);
  const desvinculadas = new Set(f.caixaria.pecasDesvinculadas ?? []);

  const existentesDesvinculadas = new Map<string, Peca>();
  const customizadas: Peca[] = [];
  for (const p of f.pecas) {
    if (!p.id.startsWith('cx_')) {
      customizadas.push(p);
    } else if (desvinculadas.has(p.id)) {
      existentesDesvinculadas.set(p.id, p);
    }
  }

  const novasPecas: Peca[] = [];
  const colocadas = new Set<string>();
  for (const p of compiladas) {
    if (desvinculadas.has(p.id)) {
      const mantida = existentesDesvinculadas.get(p.id);
      if (mantida) {
        novasPecas.push(mantida);
        colocadas.add(mantida.id);
      }
      continue;
    }
    novasPecas.push(p);
    colocadas.add(p.id);
  }
  for (const [id, p] of existentesDesvinculadas) {
    if (!colocadas.has(id)) novasPecas.push(p);
  }
  novasPecas.push(...customizadas);
  f.pecas = novasPecas;

  const ferragensCustom = f.ferragens.filter((g) => !g.id.startsWith('cx_fer_'));
  f.ferragens = [...ferragensCompiladas, ...ferragensCustom];
}
