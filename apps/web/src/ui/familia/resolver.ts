import { compilar, type Env, type Valor } from './expressao.ts';
import { CAMPOS, DERIVADOS, type CampoFormula, type Cor, type Eixo, type Papel, type Peca, type Valores } from './familiaModelo.ts';

/*
 * Resolução da família: família + valores → peças resolvidas (só números). É a FRONTEIRA do Rust no ADR 0049 §5.1: o
 * núcleo geométrico futuro recebe exatamente isto, sem texto nem fórmula. PROTÓTIPO: vira `packages/engine` na fase F2.
 */

export interface PecaResolvida {
  id: string;
  nome: string;
  papel: Papel;
  cor: Cor;
  eixo: Eixo;
  fita: string;
  veio: string;
  ox: number;
  oy: number;
  oz: number;
  /** Extensões nos três eixos (mm). */
  sx: number;
  sy: number;
  sz: number;
  /** As duas medidas no plano da chapa e a espessura. */
  ca: number;
  cb: number;
  ct: number;
  usinagens: number;
}
export interface Resolucao {
  pecas: PecaResolvida[];
  /** Erros por `${peça}.${campo}` ou `d.${derivado}`. */
  erros: Record<string, string>;
  env: Env;
  ms: number;
}

/** Arredonda a 1 µm (valores em mm), uma única vez na saída, como o contrato com o Rust (0045 §3). */
// units-ok: o protótipo trabalha em mm fixos (o modelo real guarda metros e formata pelas unidades do projeto)
export const q = (v: number): number => Math.round(v * 1000) / 1000;

function avaliar(src: string, env: Env): Valor {
  const c = compilar(src);
  if (c.err !== undefined || !c.f) throw new Error(c.err ?? 'fórmula inválida');
  return c.f(env);
}

export function resolverFamilia(valores: Valores, pecas: readonly Peca[]): Resolucao {
  const t0 = performance.now();
  const env: Env = { ...valores, 'corpo.esp': Number(valores.corpo ?? 0) };
  const erros: Record<string, string> = {};
  for (const d of DERIVADOS) {
    try { env[d.id] = q(Number(avaliar(d.f, env))); } catch (e) { erros[`d.${d.id}`] = (e as Error).message; env[d.id] = Number.NaN; }
  }
  const out: PecaResolvida[] = [];
  for (const p of pecas) {
    const campo = (c: CampoFormula, e: Env): Valor => {
      const src = p[c];
      if (src === undefined) throw new Error('campo vazio');
      try { return avaliar(src, e); } catch (err) { erros[`${p.id}.${c}`] = (err as Error).message; throw err; }
    };
    let existe = true;
    let n = 1;
    try {
      if (p.when !== undefined) existe = Boolean(campo('when', env));
      if (p.n !== undefined) n = Math.max(0, Math.min(64, Math.floor(Number(campo('n', env)))));
    } catch { continue; }
    if (!existe) continue;
    for (let i = 1; i <= n; i++) {
      const e2: Env = { ...env, i, n };
      const r: Record<string, number> = {};
      try {
        for (const c of CAMPOS.filter((x) => x !== 'n' && x !== 'when')) { r[c] = q(Number(campo(c, e2))); e2[c] = r[c]!; }
      } catch { continue; }
      const { ox = 0, oy = 0, oz = 0, a = 0, b = 0, t = 0 } = r;
      if (![a, b, t].every((x) => Number.isFinite(x) && x > 0)) { erros[`${p.id}.dim`] = `dimensão ≤ 0 (${a} × ${b} × ${t})`; continue; }
      const sx = p.eixo === 'x' ? t : a;
      const sy = p.eixo === 'y' ? t : p.eixo === 'x' ? a : b;
      const sz = p.eixo === 'z' ? t : b;
      let usinagens = 0;
      try { usinagens = Math.max(0, Math.round(Number(avaliar(p.usin, e2)))); } catch { /* contagem ilustrativa */ }
      out.push({ id: p.id, nome: n > 1 ? `${p.nome} ${i}` : p.nome, papel: p.papel, cor: p.cor, eixo: p.eixo, fita: p.fita, veio: p.veio, ox, oy, oz, sx, sy, sz, ca: a, cb: b, ct: t, usinagens });
    }
  }
  return { pecas: out, erros, env, ms: performance.now() - t0 };
}

export interface Aviso { nivel: 'ok' | 'erro'; msg: string }

/** Validação do "Flexionar": erro de fórmula, peça fora da caixa do módulo, peças de chapa que se atravessam. */
export function validar(res: Resolucao): Aviso[] {
  const out: Aviso[] = Object.entries(res.erros).map(([k, m]) => ({ nivel: 'erro' as const, msg: `${k}: ${m}` }));
  const L = Number(res.env.L);
  const A = Number(res.env.A);
  for (const p of res.pecas) {
    if (p.papel !== 'porta' && p.papel !== 'tampo' && (p.ox < -0.001 || p.ox + p.sx > L + 0.001 || p.oz + p.sz > A + 0.001)) out.push({ nivel: 'erro', msg: `${p.nome} sai da caixa do módulo` });
  }
  const chapa = res.pecas.filter((p) => ['lateral', 'base', 'travessa', 'prateleira', 'fundo'].includes(p.papel));
  for (let i = 0; i < chapa.length; i++) {
    for (let j = i + 1; j < chapa.length; j++) {
      const a = chapa[i]!;
      const b = chapa[j]!;
      const ix = Math.min(a.ox + a.sx, b.ox + b.sx) - Math.max(a.ox, b.ox);
      const iy = Math.min(a.oy + a.sy, b.oy + b.sy) - Math.max(a.oy, b.oy);
      const iz = Math.min(a.oz + a.sz, b.oz + b.sz) - Math.max(a.oz, b.oz);
      // units-ok: volume de sobreposição em mm³ do protótipo
      if (ix > 0.01 && iy > 0.01 && iz > 0.01) out.push({ nivel: 'erro', msg: `${a.nome} atravessa ${b.nome} (${q(ix * iy * iz)} mm³)` });
    }
  }
  return out.length ? out : [{ nivel: 'ok', msg: `Sem problemas: ${res.pecas.length} peças, nenhuma fora da caixa, nenhuma atravessando outra.` }];
}

/** Quantitativos da lista de peças (fita e usinagens são estimativas de exemplo neste protótipo). */
export function quantitativos(pecas: readonly PecaResolvida[]): { areaM2: number; porEspessura: Record<number, number>; fitaM: number; usinagens: number } {
  const porEspessura: Record<number, number> = {};
  let areaM2 = 0;
  let fitaMm = 0;
  let usinagens = 0;
  for (const p of pecas) {
    const m2 = (p.ca * p.cb) / 1e6;
    areaM2 += m2;
    porEspessura[p.ct] = (porEspessura[p.ct] ?? 0) + m2;
    usinagens += p.usinagens;
    fitaMm += p.fita === '4 lados' ? 2 * (p.ca + p.cb) : p.fita === 'nenhuma' ? 0 : p.ca;
  }
  // units-ok: conversão mm → m de um protótipo de lista de peças
  return { areaM2, porEspessura, fitaM: fitaMm / 1000, usinagens };
}
