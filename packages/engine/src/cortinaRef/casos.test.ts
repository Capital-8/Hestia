/**
 * Casos canônicos da referência TS da parede cortina: `casos.json` guarda entrada e saída esperada (formato de
 * consulta). Este teste (1) confere que o arquivo é exatamente o que `gerarCasos()` produz hoje e (2) confere a
 * forma dos vetores. Regenerar: `GERAR_CASOS=1 npx vitest run packages/engine/src/cortinaRef/casos.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gerarCasos } from './casos.ts';
import { paraConsulta, resolverCortina, type SaidaConsulta } from './consulta.ts';
import type { CortinaEntrada } from './tipos.ts';

const CAMINHO = new URL('./casos.json', import.meta.url);

interface Arquivo { versao: number; adr: string; casos: Array<{ nome: string; entrada: CortinaEntrada; esperado: SaidaConsulta }> }

function montar(): Arquivo {
  return { versao: 1, adr: '0056', casos: gerarCasos().map((entrada) => ({ nome: entrada.nome as string, entrada, esperado: paraConsulta(resolverCortina(entrada)) })) };
}

/** Um caso por linha (diffs legíveis), números como o JavaScript os escreve. */
function serializar(a: Arquivo): string {
  return `{"versao":${a.versao},"adr":${JSON.stringify(a.adr)},"casos":[\n${a.casos.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`;
}

if (process.env.GERAR_CASOS === '1') writeFileSync(CAMINHO, serializar(montar()), 'utf8');

const arq = JSON.parse(readFileSync(CAMINHO, 'utf8')) as Arquivo;

describe('cortinaRef/casos.json', () => {
  it('tem cerca de 30 casos, com nomes únicos', () => {
    expect(arq.casos.length).toBeGreaterThanOrEqual(30);
    expect(new Set(arq.casos.map((c) => c.nome)).size).toBe(arq.casos.length);
  });

  it('é exatamente o que gerarCasos() produz (rode com GERAR_CASOS=1 se mudou de propósito)', () => {
    const lido = readFileSync(CAMINHO, 'utf8').replace(/\r\n/g, '\n'); // o checkout no Windows pode trazer CRLF
    expect(lido).toBe(serializar(montar()));
  });

  for (const c of arq.casos) {
    it(`forma dos vetores: ${c.nome}`, () => {
      const s = paraConsulta(resolverCortina(c.entrada));
      expect(s).toEqual(c.esperado); // a referência reproduz a si mesma depois da ida e volta por JSON
      const { cortina_grade: g, cortina_pecas: p, quant_cortina: q, cortina_avisos: a } = s;
      expect(g.linhas.length % 5).toBe(0);
      expect(g.linhas_pos.length).toBe(g.linhas.length / 5);
      expect(g.celulas.length % 6).toBe(0);
      expect(g.celulas_ret.length).toBe((g.celulas.length / 6) * 4);
      expect(g.segmentos.length % 5).toBe(0);
      expect(g.segmentos_ext.length).toBe((g.segmentos.length / 5) * 2);
      expect(p.montantes.length / 7).toBe(p.montantes_geo.length / 5);
      expect(p.paineis.length / 5).toBe(p.paineis_geo.length / 6);
      expect(q.linhas.length / 5).toBe(q.valores.length / 4);
      expect(a.avisos.length / 4).toBe(a.valores.length / 5);
      // células: nu × nv, todas as células cobrem L × H sem fresta
      const nu = new Set(g.celulas.filter((_, i) => i % 6 === 1)).size;
      const nv = new Set(g.celulas.filter((_, i) => i % 6 === 2)).size;
      expect(g.celulas.length / 6).toBe(nu * nv);
      let area = 0;
      for (let i = 0; i < g.celulas_ret.length; i += 4) area += (g.celulas_ret[i + 1]! - g.celulas_ret[i]!) * (g.celulas_ret[i + 3]! - g.celulas_ret[i + 2]!);
      expect(area).toBeCloseTo(c.entrada.L * c.entrada.H, 4);
      // linhas internas: nu-1 em U e nv-1 em V
      expect(g.linhas.filter((_, i) => i % 5 === 1 && g.linhas[i] === 0).length).toBe(nu - 1);
      expect(g.linhas.filter((_, i) => i % 5 === 1 && g.linhas[i] === 1).length).toBe(nv - 1);
      // segmentos: (nu+1) linhas verticais × nv + (nv+1) horizontais × nu
      expect(g.segmentos.length / 5).toBe((nu + 1) * nv + (nv + 1) * nu);
    });
  }

  it('cada família de caso exigida pela tarefa está presente', () => {
    const nomes = arq.casos.map((c) => c.nome).join('\n');
    for (const trecho of ['count=1', 'maior que L', 'igual a L', 'minuscula', 'minima', 'dedupe', 'muito pequeno', 'offset', 'center', 'end', 'manual', 'maxDistance', 'joinPriority']) {
      expect(nomes, trecho).toContain(trecho);
    }
  });
});
