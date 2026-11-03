import { LIMITES, ordemDeAvaliacao, tentar, type Env, type Familia, type Parametro, type Peca, type Valor } from '@hestia/model';
import { resolverAninhados } from './aninhados.ts';
import { orientarAntiHorario, validarContorno } from './contorno.ts';
import type { EntradaResolucao, ErroResolucao, PecaResolvida, ResolucaoFamilia } from './pecas.ts';

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
      return p.tipo === 'inteiro' ? Math.round(n) : mm3(n);
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

function resolverPeca(p: Peca, env: Record<string, Valor>, erros: Erros): PecaResolvida[] {
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
      fita: p.fita ? { ...p.fita } : null,
      veio: p.veio ?? null,
      grupo: p.grupo ?? null,
      deAninhado: null,
    });
  }
  return saida;
}

export function resolverFamilia(f: Familia, entrada: EntradaResolucao = {}): ResolucaoFamilia {
  const erros: Erros = [];
  let env: Record<string, Valor> = {};
  const pecas: PecaResolvida[] = [];
  try {
    env = prepararEnv(f, entrada, erros);
    if (!avaliarOrdem(f, env, erros)) return { pecas: [], erros, env };
    for (const p of f.pecas) {
      try { pecas.push(...resolverPeca(p, env, erros)); } catch (e) { erros.push({ onde: `peca:${String((p as { id?: unknown }).id)}`, mensagem: `peça malformada: ${(e as Error).message}` }); }
    }
    if (f.aninhados.length > 0) {
      const r = resolverAninhados({ familia: f, env, entrada, resolver: resolverFamilia });
      pecas.push(...r.pecas);
      erros.push(...r.erros);
    }
  } catch (e) {
    erros.push({ onde: 'familia', mensagem: `família malformada: ${(e as Error).message}` });
  }
  return { pecas, erros, env };
}
