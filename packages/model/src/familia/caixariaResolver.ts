import { avaliarAfim, calcularCaixaRaizAfim, dividirIntervaloAfim, type CaixaAfim } from './caixariaCompilar.ts';
import type { Familia } from './tipos.ts';
import type { Vao, VaoResolvido } from './tiposCaixaria.ts';

/*
 * Resolução geométrica da árvore de vãos da Caixaria em METROS (ADR 0049 / picking e destaque 3D).
 */

const metros = (mm: number): number => Math.round(mm * 1000) / 1e6;

function numeroParametro(f: Familia, env: Record<string, unknown>, id: string, fallback: number): number {
  const bruto = env[id];
  if (typeof bruto === 'number' && Number.isFinite(bruto)) return bruto;
  const param = f.parametros?.find((p) => p.id === id);
  if (param && typeof param.padrao === 'number' && Number.isFinite(param.padrao)) return param.padrao;
  return fallback;
}

function resolverEsp(f: Familia, env: Record<string, unknown>): number {
  const espEnv = env['esp'];
  if (typeof espEnv === 'number' && Number.isFinite(espEnv) && espEnv > 0) return espEnv;

  const corpoEsp = env['corpo.esp'];
  if (typeof corpoEsp === 'number' && Number.isFinite(corpoEsp) && corpoEsp > 0) return corpoEsp;

  const corpoParam = f.parametros?.find((p) => p.id === 'corpo');
  const valorCorpo = typeof env['corpo'] === 'string' ? env['corpo'] : corpoParam?.padrao;
  const opcao = corpoParam?.opcoes?.find((o) => o.valor === valorCorpo);
  if (opcao && typeof opcao.esp === 'number' && Number.isFinite(opcao.esp) && opcao.esp > 0) return opcao.esp;

  return 18;
}

function resolverVaoRecursivo(
  vao: Vao,
  caixa: CaixaAfim,
  L: number,
  A: number,
  P: number,
  esp: number,
  saida: VaoResolvido[],
): void {
  const x0 = avaliarAfim(caixa.x0, L, esp);
  const x1 = Math.max(x0, avaliarAfim(caixa.x1, L, esp));
  const y0 = avaliarAfim(caixa.y0, P, esp);
  const y1 = Math.max(y0, avaliarAfim(caixa.y1, P, esp));
  const z0 = avaliarAfim(caixa.z0, A, esp);
  const z1 = Math.max(z0, avaliarAfim(caixa.z1, A, esp));

  const div = vao.divisao;
  const filhos = vao.filhos;
  const temDivisao = Boolean(div && div.itens.length > 0 && filhos && filhos.length === div.itens.length + 1);
  const temPreenchimento = Boolean(vao.preenchimento && vao.preenchimento.tipo !== 'nenhum');

  saida.push({
    id: vao.id,
    min: [metros(x0), metros(y0), metros(z0)],
    max: [metros(x1), metros(y1), metros(z1)],
    folha: !temDivisao,
    temDivisao,
    temPreenchimento,
    ...(temDivisao && div ? { eixoDivisao: div.eixo } : {}),
  });

  if (!temDivisao || !div || !filhos) return;

  if (div.eixo === 'z') {
    const { intervalos } = dividirIntervaloAfim(caixa.z0, caixa.z1, div.itens);
    filhos.forEach((filho, c) => {
      const [sz0, sz1] = intervalos[c]!;
      resolverVaoRecursivo(filho, { ...caixa, z0: sz0, z1: sz1 }, L, A, P, esp, saida);
    });
  } else {
    const { intervalos } = dividirIntervaloAfim(caixa.x0, caixa.x1, div.itens);
    filhos.forEach((filho, c) => {
      const [sx0, sx1] = intervalos[c]!;
      resolverVaoRecursivo(filho, { ...caixa, x0: sx0, x1: sx1 }, L, A, P, esp, saida);
    });
  }
}

/** Resolve todos os vãos da árvore de caixaria em coordenadas locais em METROS (`/ 1000`). */
export function resolverVaosCaixaria(f: Familia, env: Record<string, unknown>): VaoResolvido[] {
  if (!f.caixaria?.raiz) return [];
  const L = numeroParametro(f, env, 'L', 800);
  const A = numeroParametro(f, env, 'A', 720);
  const P = numeroParametro(f, env, 'P', 560);
  const esp = resolverEsp(f, env);
  const info = calcularCaixaRaizAfim(f.caixaria);
  const saida: VaoResolvido[] = [];
  resolverVaoRecursivo(f.caixaria.raiz, info.raiz, L, A, P, esp, saida);
  return saida;
}
