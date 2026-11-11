/**
 * Casos da fase 2 (`casos2.json`): entrada, instância normalizada e saída esperada. Este teste (1) confere que o arquivo é
 * exatamente o que `gerarCasos2()` produz, (2) confere a forma dos vetores e (3) confere que cada regra do ADR está coberta.
 * Regenerar: `GERAR_CASOS2=1 npx vitest run packages/engine/src/cortinaRef/casos2.test.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gerarCasos2, type CasoFase2 } from './casos2.ts';
import { paraConsulta, resolverCortina, type SaidaConsulta } from './consulta.ts';
import { AVISO_CELULA_NAO_RETANGULAR, AVISO_ORFA_CELULA } from './avisos.ts';

const CAMINHO = new URL('./casos2.json', import.meta.url);

interface Caso extends CasoFase2 { esperado: SaidaConsulta }
interface Arquivo { versao: number; adr: string; fase: number; casos: Caso[] }

function montar(): Arquivo {
  return {
    versao: 1, adr: '0056', fase: 2,
    casos: gerarCasos2().map((c) => ({ ...c, esperado: paraConsulta(resolverCortina(c.entrada)) })),
  };
}

/** Um caso por linha (diffs legíveis), números como o JavaScript os escreve. */
function serializar(a: Arquivo): string {
  return `{"versao":${a.versao},"adr":${JSON.stringify(a.adr)},"fase":${a.fase},"casos":[\n${a.casos.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`;
}

if (process.env.GERAR_CASOS2 === '1') writeFileSync(CAMINHO, serializar(montar()), 'utf8');

const arq = JSON.parse(readFileSync(CAMINHO, 'utf8')) as Arquivo;

describe('cortinaRef/casos2.json (fase 2)', () => {
  it('tem pelo menos 30 casos, com nomes únicos', () => {
    expect(arq.casos.length).toBeGreaterThanOrEqual(30);
    expect(new Set(arq.casos.map((c) => c.nome)).size).toBe(arq.casos.length);
  });

  it('é exatamente o que gerarCasos2() produz (rode com GERAR_CASOS2=1 se mudou de propósito)', () => {
    const lido = readFileSync(CAMINHO, 'utf8').replace(/\r\n/g, '\n'); // o checkout no Windows pode trazer CRLF
    expect(lido).toBe(serializar(montar()));
  });

  it('cobre cada regra do ADR §4.4, linhas extras e sobrescritas de linha, e região retangular e não retangular', () => {
    const regras = new Set(arq.casos.map((c) => c.regra));
    for (const r of ['regra1', 'regra2', 'regra3', 'regra4', 'regra5', 'regra6', 'linha', 'regiao']) expect(regras, r).toContain(r);
    const nomes = arq.casos.map((c) => c.nome).join('\n');
    for (const trecho of ['retangular 1 × 2', 'retangular 2 × 2', 'em L', 'em T', 'linha extra', 'linha gerada']) expect(nomes, trecho).toContain(trecho);
  });

  it('os avisos de órfã e de região não retangular aparecem nos casos que os exercitam', () => {
    const porNome = (trecho: string) => arq.casos.find((c) => c.nome.includes(trecho))!;
    const codigos = (c: Caso): number[] => c.esperado.cortina_avisos.avisos.filter((_, i) => i % 4 === 1);
    expect(codigos(porNome('regra5 órfã isolada'))).toContain(AVISO_ORFA_CELULA);
    expect(codigos(porNome('regiao não retangular em L'))).toContain(AVISO_CELULA_NAO_RETANGULAR);
  });

  for (const c of arq.casos) {
    it(`forma dos vetores e grade cheia: ${c.nome}`, () => {
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
      // células: nu × nv, e as células cobrem L × H sem fresta (região fundida não muda a grade)
      const nu = new Set(g.celulas.filter((_, i) => i % 6 === 1)).size;
      const nv = new Set(g.celulas.filter((_, i) => i % 6 === 2)).size;
      expect(g.celulas.length / 6).toBe(nu * nv);
      let area = 0;
      for (let i = 0; i < g.celulas_ret.length; i += 4) area += (g.celulas_ret[i + 1]! - g.celulas_ret[i]!) * (g.celulas_ret[i + 3]! - g.celulas_ret[i + 2]!);
      expect(area).toBeCloseTo(c.entrada.L * c.entrada.H, 4);
      // segmentos: (nu+1) linhas verticais × nv + (nv+1) horizontais × nu (removidos continuam na lista, com removido = 1)
      expect(g.segmentos.length / 5).toBe((nu + 1) * nv + (nv + 1) * nu);
      // remapeamento presente só com sobrescrita, e sempre com o mesmo número de entradas por tipo
      if (c.entrada.instancia && (c.entrada.instancia.cells?.length || c.entrada.instancia.lineOverrides?.length || c.entrada.instancia.removedSegments?.length)) {
        expect(g.remapeamento).toBeDefined();
        expect(g.remapeamento!.sobrescritas.length % 7).toBe(0);
        expect(g.remapeamento!.chaves.length / 2).toBe(g.remapeamento!.sobrescritas.length / 7);
      } else {
        expect(g.remapeamento).toBeUndefined();
      }
    });
  }
});
