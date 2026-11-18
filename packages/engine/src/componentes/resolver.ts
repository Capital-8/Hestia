import { LIMITES, ordemDeAvaliacao, tentar, type Env, type Familia, type Parametro, type Peca, type Valor } from '@hestia/model';
import { resolverAninhados } from './aninhados.ts';
import { orientarAntiHorario, validarContorno } from './contorno.ts';
import type { EntradaResolucao, ErroResolucao, FerragemResolvida, PecaResolvida, ResolucaoFamilia, UsinagemResolvida } from './pecas.ts';

/*
 * Resolução da família (ADR 0049 §5): família + tipo + valores → peças resolvidas, só números, em metros.
 * Determinística, sem estado, nunca lança. O que depende de fórmulas é decidido aqui (TypeScript, para sempre); o núcleo
 * geométrico (TS hoje, Rust depois) só vê o resultado. Ordem: parâmetros e planos por ordem topológica; depois as peças.
 */

/** mm arredondado a 1 µm (3 casas), uma só vez por valor calculado. */
const mm3 = (v: number): number => Math.round(v * 1000) / 1000;
/** mm → m arredondado a 1 µm (6 casas). */
const metros = (v: number): number => Math.round(v * 1000) / 1e6;

type Erros = ErroResolucao[];

function valorInicial(p: Parametro, tipo: Familia['tipos'][number] | undefined, entrada: EntradaResolucao, erros: Erros): Valor {
  const bruto = entrada.valores?.[p.id] ?? tipo?.valores[p.id] ?? p.padrao;
  switch (p.tipo) {
    case 'comprimento': case 'numero': case 'inteiro': {
      const n = typeof bruto === 'number' ? bruto : Number(bruto);
      if (!Number.isFinite(n)) { erros.push({ onde: `parametro:${p.id}`, mensagem: 'valor não numérico; usado o padrão' }); return Number(p.padrao) || 0; }
      const v = p.tipo === 'inteiro' ? Math.round(n) : mm3(n);
      // Faixa do parâmetro (min/max, em mm): fora dela o valor é recusado com aviso e fica o limite mais próximo.
      const limitado = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
      if (limitado !== v) erros.push({ onde: `parametro:${p.id}`, mensagem: `valor ${v} fora da faixa ${p.min ?? '−∞'} a ${p.max ?? '∞'}; usado ${limitado}` });
      return limitado;
    }
    case 'booleano': return typeof bruto === 'boolean' ? bruto : bruto === 'true' || bruto === 1;
    default: return bruto;
  }
}

function prepararEnv(f: Familia, entrada: EntradaResolucao, erros: Erros): Record<string, Valor> {
  const tipo = f.tipos.find((t) => t.id === (entrada.tipoId ?? f.tipoPadrao));
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) {
    if (p.formula !== undefined) continue;
    const v = valorInicial(p, tipo, entrada, erros);
    env[p.id] = v;
    if ((p.tipo === 'enum' || p.tipo === 'chapa') && p.opcoes && !p.opcoes.some((o) => o.valor === v)) {
      erros.push({ onde: `parametro:${p.id}`, mensagem: `“${String(v)}” não está entre as opções` });
    }
    if (p.tipo === 'chapa') {
      const op = p.opcoes?.find((o) => o.valor === v);
      env[`${p.id}.esp`] = op?.esp ?? Number.NaN;
    }
  }
  return env;
}

function avaliarOrdem(f: Familia, env: Record<string, Valor>, erros: Erros): boolean {
  const ordem = ordemDeAvaliacao(f);
  if (!ordem.ok) { erros.push({ onde: 'familia', mensagem: `ciclo entre fórmulas: ${ordem.ciclo.join(' → ')}` }); return false; }
  const params = new Map(f.parametros.map((p) => [p.id, p]));
  const planos = new Map(f.planos.map((p) => [p.id, p]));
  for (const id of ordem.ordem) {
    const p = params.get(id);
    const formula = p ? p.formula : planos.get(id)?.posicao;
    const onde = p ? `parametro:${id}.formula` : `plano:${id}.posicao`;
    if (formula === undefined) continue;
    const r = tentar(formula, env);
    if (!r.ok) { erros.push({ onde, mensagem: r.erro.message }); env[id] = Number.NaN; continue; }
    env[id] = typeof r.valor === 'number' ? mm3(r.valor) : r.valor;
  }
  return true;
}

function numero(src: string, env: Env, onde: string, erros: Erros): number | null {
  const r = tentar(src, env);
  if (!r.ok) { erros.push({ onde, mensagem: r.erro.message }); return null; }
  if (typeof r.valor !== 'number' || !Number.isFinite(r.valor)) { erros.push({ onde, mensagem: 'a fórmula não resulta em número' }); return null; }
  return mm3(r.valor);
}

function materialDe(p: Peca, env: Env): string | null {
  if (p.material === undefined) return null;
  const v = env[p.material];
  return typeof v === 'string' ? v : p.material;
}

/** Usinagens da peça (instância `e`, com `i`/`n` da peça); erro numa usinagem descarta só ela. Dimensões em m, plano `a × b` (m). */
function resolverUsinagens(p: Peca, e: Env, espessura: number, a: number, b: number, erros: Erros): UsinagemResolvida[] {
  const saida: UsinagemResolvida[] = [];
  for (const u of p.usinagens ?? []) {
    const onde = (campo: string): string => `peca:${p.id}.usinagem:${u.id}.${campo}`;
    let n = 1;
    if (u.quantidade !== undefined) {
      const r = numero(u.quantidade, e, onde('quantidade'), erros);
      if (r === null) continue;
      n = Math.max(0, Math.min(LIMITES.repeticao, Math.floor(r)));
    }
    for (let k = 1; k <= n; k++) {
      const eu: Env = u.quantidade !== undefined ? { ...e, i: k, n } : e;
      if (u.quando !== undefined) {
        const q = tentar(u.quando, eu);
        if (!q.ok) { erros.push({ onde: onde('quando'), mensagem: q.erro.message }); continue; }
        if (!(typeof q.valor === 'string' ? q.valor !== '' : Boolean(q.valor))) continue;
      }
      const pu = numero(u.posicao[0], eu, onde('posicao[0]'), erros);
      const pv = numero(u.posicao[1], eu, onde('posicao[1]'), erros);
      const opc = (src: string | undefined, campo: string): number | null | undefined => (src === undefined ? undefined : numero(src, eu, onde(campo), erros));
      const d = opc(u.diametro, 'diametro');
      const w = opc(u.largura, 'largura');
      const c = opc(u.comprimento, 'comprimento');
      let prof = -1;
      const ehBorda = u.face === 'n' || u.face === 's' || u.face === 'l' || u.face === 'o';
      let falhou = pu === null || pv === null || d === null || w === null || c === null;
      if (u.profundidade !== 'passante') {
        const r = numero(u.profundidade, eu, onde('profundidade'), erros);
        if (r === null) falhou = true;
        else if (!(r > 0) || (!ehBorda && metros(r) > espessura + 1e-9)) { erros.push({ onde: onde('profundidade'), mensagem: 'profundidade precisa ser maior que 0 e não passar da espessura' }); falhou = true; }
        else prof = metros(r);
      }
      if (falhou) continue;
      const U = metros(pu as number);
      const V = metros(pv as number);
      const dm = metros(d ?? 0);
      const lg = metros(w ?? 0);
      const cp = metros(c ?? 0);
      const dentro = (x0: number, y0: number, x1: number, y1: number): boolean => x0 >= -1e-9 && y0 >= -1e-9 && x1 <= a + 1e-9 && y1 <= b + 1e-9;
      if (ehBorda) {
        const noV = u.face === 'n' || u.face === 's';
        const ao = noV ? a : b;
        const perpendicular = noV ? b : a;
        if (u.tipo !== 'furo') { erros.push({ onde: onde('face'), mensagem: 'só furo cabe na borda' }); continue; }
        if (!(dm > 0)) { erros.push({ onde: onde('diametro'), mensagem: 'furo precisa de diâmetro maior que 0' }); continue; }
        if (U - dm / 2 < -1e-9 || U + dm / 2 > ao + 1e-9 || V - dm / 2 < -1e-9 || V + dm / 2 > espessura + 1e-9) { erros.push({ onde: onde('posicao'), mensagem: 'furo fora da borda' }); continue; }
        if (prof > perpendicular + 1e-9) { erros.push({ onde: onde('profundidade'), mensagem: 'profundidade maior que a chapa' }); continue; }
      } else if (u.tipo === 'furo') {
        if (!(dm > 0)) { erros.push({ onde: onde('diametro'), mensagem: 'furo precisa de diâmetro maior que 0' }); continue; }
        if (!dentro(U - dm / 2, V - dm / 2, U + dm / 2, V + dm / 2)) { erros.push({ onde: onde('posicao'), mensagem: 'furo fora da chapa' }); continue; }
      } else {
        if (!(lg > 0 && cp > 0)) { erros.push({ onde: onde('largura'), mensagem: `${u.tipo} precisa de largura e comprimento maiores que 0` }); continue; }
        if (!dentro(U, V, U + cp, V + lg)) { erros.push({ onde: onde('posicao'), mensagem: `${u.tipo} fora da chapa` }); continue; }
      }
      saida.push({ id: u.id, tipo: u.tipo, face: u.face, u: U, v: V, diametro: dm, largura: lg, comprimento: cp, profundidade: prof });
    }
  }
  return saida;
}

function resolverPeca(p: Peca, env: Record<string, Valor>, chapas: ReadonlySet<string>, erros: Erros): PecaResolvida[] {
  let n = 1;
  if (p.repetir !== undefined) {
    const r = numero(p.repetir, env, `peca:${p.id}.repetir`, erros);
    if (r === null) return [];
    n = Math.max(0, Math.min(LIMITES.repeticao, Math.floor(r)));
  }
  const saida: PecaResolvida[] = [];
  for (let i = 1; i <= n; i++) {
    const e: Env = p.repetir !== undefined ? { ...env, i, n } : env;
    if (p.quando !== undefined) {
      const q = tentar(p.quando, e);
      if (!q.ok) { erros.push({ onde: `peca:${p.id}.quando`, mensagem: q.erro.message }); continue; }
      if (!(typeof q.valor === 'string' ? q.valor !== '' : Boolean(q.valor))) continue;
    }
    const o = p.origem.map((s, k) => numero(s, e, `peca:${p.id}.origem[${k}]`, erros));
    const t = p.tamanho.map((s, k) => numero(s, e, `peca:${p.id}.tamanho[${k}]`, erros));
    const esp = numero(p.espessura, e, `peca:${p.id}.espessura`, erros);
    if (o.includes(null) || t.includes(null) || esp === null) continue;
    const [a, b] = t as [number, number];
    if (!(a > 0 && b > 0 && esp > 0)) { erros.push({ onde: `peca:${p.id}.dimensao`, mensagem: `dimensão ≤ 0 (${a} × ${b} × ${esp} mm)` }); continue; }
    let contorno: number[] | null = null;
    if (p.contorno?.tipo === 'poligono') {
      const pts: number[] = [];
      let ok = true;
      p.contorno.pontos.forEach(([u, v], k) => {
        const cu = numero(u, e, `peca:${p.id}.contorno[${k}][0]`, erros);
        const cv = numero(v, e, `peca:${p.id}.contorno[${k}][1]`, erros);
        if (cu === null || cv === null) ok = false; else pts.push(metros(cu), metros(cv));
      });
      if (!ok) continue;
      const motivo = validarContorno(pts);
      if (motivo) { erros.push({ onde: `peca:${p.id}.contorno`, mensagem: motivo }); continue; }
      contorno = orientarAntiHorario(pts);
    }
    const [ox, oy, oz] = o as [number, number, number];
    const extensao: [number, number, number] = p.eixo === 'x' ? [metros(esp), metros(a), metros(b)] : p.eixo === 'y' ? [metros(a), metros(esp), metros(b)] : [metros(a), metros(b), metros(esp)];
    saida.push({
      id: p.id,
      nome: p.repetir !== undefined && n > 1 ? `${p.nome} ${i}` : p.nome,
      indice: i,
      papel: p.papel,
      eixo: p.eixo,
      vazio: p.vazio === true,
      origem: [metros(ox), metros(oy), metros(oz)],
      tamanho: [metros(a), metros(b)],
      espessura: metros(esp),
      extensao,
      contorno,
      material: materialDe(p, env),
      chapa: p.material !== undefined && chapas.has(p.material) && typeof env[p.material] === 'string' ? String(env[p.material]) : null,
      usinagens: resolverUsinagens(p, e, metros(esp), metros(a), metros(b), erros),
      fita: p.fita ? { ...p.fita } : null,
      veio: p.veio ?? null,
      grupo: p.grupo ?? null,
      deAninhado: null,
    });
  }
  return saida;
}

function resolverFerragens(f: Familia, env: Env, erros: Erros): FerragemResolvida[] {
  const saida: FerragemResolvida[] = [];
  for (const g of f.ferragens) {
    if (g.quando !== undefined) {
      const q = tentar(g.quando, env);
      if (!q.ok) { erros.push({ onde: `ferragem:${g.id}.quando`, mensagem: q.erro.message }); continue; }
      if (!(typeof q.valor === 'string' ? q.valor !== '' : Boolean(q.valor))) continue;
    }
    const n = numero(g.quantidade, env, `ferragem:${g.id}.quantidade`, erros);
    if (n === null) continue;
    const quantidade = Math.max(0, Math.floor(n));
    if (quantidade > 0) saida.push({ id: g.id, nome: g.nome, codigo: g.codigo ?? null, quantidade, custo: g.custo ?? null });
  }
  return saida;
}

export function resolverFamilia(f: Familia, entrada: EntradaResolucao = {}): ResolucaoFamilia {
  const erros: Erros = [];
  let env: Record<string, Valor> = {};
  const pecas: PecaResolvida[] = [];
  let ferragens: FerragemResolvida[] = [];
  try {
    env = prepararEnv(f, entrada, erros);
    if (!avaliarOrdem(f, env, erros)) return { pecas: [], ferragens: [], erros, env };
    const chapas = new Set(f.parametros.filter((q) => q.tipo === 'chapa').map((q) => q.id));
    for (const p of f.pecas) {
      try { pecas.push(...resolverPeca(p, env, chapas, erros)); } catch (e) { erros.push({ onde: `peca:${String((p as { id?: unknown }).id)}`, mensagem: `peça malformada: ${(e as Error).message}` }); }
    }
    ferragens = resolverFerragens(f, env, erros);
    if (f.aninhados.length > 0) {
      const r = resolverAninhados({ familia: f, env, entrada, resolver: resolverFamilia });
      pecas.push(...r.pecas);
      erros.push(...r.erros);
    }
  } catch (e) {
    erros.push({ onde: 'familia', mensagem: `família malformada: ${(e as Error).message}` });
  }
  return { pecas, ferragens, erros, env };
}
