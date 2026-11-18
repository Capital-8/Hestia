import {
  CHAPAS_CAIXARIA,
  FITA_CAIXARIA,
  addAfim,
  afim,
  calcularCaixaRaizAfim,
  criarCaixariaPadrao,
  dividirIntervaloAfim,
  formatarAfim,
  idUnico,
  limparId,
  subAfim,
  type BordasExternas,
  type CaixaAfim,
} from './caixariaAfim.ts';
import { compilarPreenchimento } from './caixariaPreenchimentos.ts';
import type { Familia, Ferragem, Parametro, Peca } from './tipos.ts';
import type { Caixaria, Vao } from './tiposCaixaria.ts';

export {
  CHAPAS_CAIXARIA,
  FITA_CAIXARIA,
  addAfim,
  afim,
  avaliarAfim,
  calcularCaixaRaizAfim,
  criarCaixariaPadrao,
  dividirIntervaloAfim,
  formatarAfim,
  scaleAfim,
  subAfim,
  type Afim,
  type BordasExternas,
  type CaixaAfim,
} from './caixariaAfim.ts';

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
