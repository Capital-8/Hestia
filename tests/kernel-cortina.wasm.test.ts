/**
 * Parede cortina, fase 1 (decisão 0056): o adaptador TS monta as seções 100 a 105 e o Rust REAL as decodifica e responde às consultas 100, 101, 102, 104 e 105.
 * Roda só em `npm run test:wasm`. Também confere o adaptador contra o arquivo de paridade (`crates/geom-wasm/tests/fixtures/cortina_paridade.json`, gerado pelo
 * próprio Rust): cada entrada passa por `montarCenaCortina` e o wasm tem de devolver o mesmo que o arquivo, com os `id_num` traduzidos (o adaptador numera os
 * tipos na ordem de uso; o arquivo, pelo catálogo).
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ID_AUSENTE_CORTINA,
  enviarCenaCortina,
  lerAvisosCortina,
  lerGradeCortina,
  lerMalhaCortina,
  lerPlantaCortina,
  lerQuantCortina,
  montarCenaCortina,
  sincronizarCenaCortina,
  type CenaCortina,
  type EntradaCenaCortina,
} from '../packages/engine/src/kernelCortina.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { CODIGOS } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const criar = (c: CenaCortina): { cena: CenaV2; atual: { c: CenaCortina } } => {
  const atual = { c };
  return { cena: CenaV2.criar(ger!, (cena) => enviarCenaCortina(cena, atual.c)), atual };
};

const codigoDe = (f: () => unknown): number | null => {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ErroKernelLeve) return e.codigo;
    throw e;
  }
};

const entradaBasica = (): EntradaCenaCortina => ({
  montantes: [
    { id: 'ret', shape: 'rect', width: 0.05, depth: 0.1, materialId: 'alu' },
    { id: 'red', shape: 'round', width: 0.05, depth: 0.05, materialId: 'alu' },
  ],
  paineis: [
    { id: 'vidro', kind: 'glass', thickness: 0.01, materialId: 'vid' },
    { id: 'solido', kind: 'solid', thickness: 0.004, bite: 0.01, materialId: 'alu' },
  ],
  tipos: [
    {
      id: 'loja',
      depth: 0.12,
      u: { mode: 'fixedDistance', distance: 1.5, justify: 'center' },
      v: { mode: 'manual', positions: [1, 2.4], anchor: 'start' },
      mullions: { interiorVertical: 'ret', interiorHorizontal: 'red', borderStart: 'ret', borderEnd: 'ret', borderBottom: null, borderTop: 'ret', corner: null, joinPriority: 'horizontal' },
      defaultPanelTypeId: 'vidro',
    },
  ],
  cortinas: [
    { id: 'c1', levelNum: 0, typeId: 'loja', a: { x: 1, y: 2 }, b: { x: 7.5, y: 2 }, zBase: 0, height: 3 },
    { id: 'c2', levelNum: 1, typeId: 'loja', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, zBase: 3, height: 3, flipped: true, grid: { u: { mode: 'fixedNumber', count: 3 } }, defaultPanelTypeId: 'solido' },
  ],
  materialNum: (id) => (id === 'alu' ? 5 : id === 'vid' ? 6 : ID_AUSENTE_CORTINA),
});

describe('parede cortina no Rust real', () => {
  it.skipIf(!bytes)('as seções montadas pelo TS entram e as cinco consultas respondem', () => {
    const c = montarCenaCortina(entradaBasica());
    const { cena } = criar(c);
    const g = lerGradeCortina(cena.consultar('cortina_grade', [0]));
    // Nível 0: só c1. U: 6,5 m com d = 1,5 centrado (sobra 0,5: 0,25 de cada lado, maior que 0,05): linhas em 0,25; 1,75; 3,25; 4,75; 6,25. V manual: 1 e 2,4.
    expect(g.linhas.filter((l) => l.eixo === 'u').map((l) => l.pos)).toEqual([0.25, 1.75, 3.25, 4.75, 6.25]);
    expect(g.linhas.filter((l) => l.eixo === 'v').map((l) => [l.pos, l.origem])).toEqual([[1, 2], [2.4, 2]]);
    expect(g.celulas).toHaveLength(6 * 3);
    // Ligar o nível 1 (c2, em outra parede, invertida) e conferir a malha e a planta.
    const m = lerMalhaCortina(cena.consultar('cortina_malha', [0xffffffff, 1]));
    expect(m.protos.length).toBeGreaterThanOrEqual(3);
    expect(m.instancias.some((i) => i.transparente)).toBe(true);
    const planta = lerPlantaCortina(cena.consultar('cortina_planta', [0xffffffff, 1.5, 2]));
    expect(planta.length).toBeGreaterThan(10);
    const q = lerQuantCortina(cena.consultar('quant_cortina', [0xffffffff]));
    expect(q.filter((l) => l.papel === 20)).toHaveLength(2);
    expect(lerAvisosCortina(cena.consultar('cortina_avisos', [0]))).toBeInstanceOf(Array);
    cena.destruir();
  });

  it.skipIf(!bytes)('upsert e remover incrementais: editar uma cortina reenvia só as linhas dela', () => {
    const e = entradaBasica();
    const a = montarCenaCortina(e);
    const { cena, atual } = criar(a);
    e.cortinas[0]!.height = 3.3;
    const b = montarCenaCortina(e, a);
    const d = sincronizarCenaCortina(cena, a, b);
    atual.c = b;
    expect(d.map((x) => x.secao)).toEqual(['cortinas']);
    const g = lerGradeCortina(cena.consultar('cortina_grade', [0]));
    expect(Math.max(...g.celulas.map((c) => c.z1))).toBeCloseTo(3.3, 6);
    // Tirar a cortina c2 remove as linhas dela (cortina e grade da instância) e a consulta continua valendo.
    const c = montarCenaCortina({ ...e, cortinas: [e.cortinas[0]!] }, b);
    sincronizarCenaCortina(cena, b, c);
    atual.c = c;
    expect(lerQuantCortina(cena.consultar('quant_cortina', [0xffffffff])).filter((l) => l.papel === 20)).toHaveLength(1);
    cena.destruir();
  });

  it.skipIf(!bytes)('referência quebrada dá ENTRADA na consulta e dado fora do domínio dá ENTRADA ao definir', () => {
    const c = montarCenaCortina(entradaBasica());
    const { cena } = criar(c);
    cena.remover('tipos_painel_cortina', [c.painelDe.get('vidro')!]);
    expect(codigoDe(() => cena.consultar('cortina_grade', [0]))).toBe(CODIGOS.ENTRADA);
    cena.destruir();
    const { cena: outra } = criar(c);
    const g = { ...c.secoes.grades_cortina };
    g['modo'] = g['modo']!.map(() => 4);
    expect(codigoDe(() => outra.definirSecao('grades_cortina', g, c.nLinhas.grades_cortina))).toBe(CODIGOS.ENTRADA);
    outra.destruir();
  });

  it.skipIf(!bytes)('ângulo de grade diferente de zero é ENTRADA e mais de 4096 células é LIMITE', () => {
    const e = entradaBasica();
    e.tipos[0]!.u = { mode: 'fixedNumber', count: 2, angle: 0.4 };
    const { cena } = criar(montarCenaCortina(e));
    expect(codigoDe(() => cena.consultar('cortina_grade', [0]))).toBe(CODIGOS.ENTRADA);
    cena.destruir();
    const f = entradaBasica();
    f.tipos[0]!.u = { mode: 'fixedNumber', count: 100 };
    f.tipos[0]!.v = { mode: 'fixedNumber', count: 100 };
    const { cena: grande } = criar(montarCenaCortina(f));
    expect(codigoDe(() => grande.consultar('cortina_grade', [0]))).toBe(CODIGOS.LIMITE);
    grande.destruir();
  });
});

// ───────────── paridade com o arquivo gerado pelo Rust ─────────────

interface CasoFixture {
  id: string;
  entrada: {
    L: number;
    H: number;
    num?: number;
    tipo: { depth: number; u: never; v: never; mullions: never; defaultPanelTypeId: string; minCell?: number };
    instancia?: { grid?: { u?: never; v?: never }; defaultPanelTypeId?: string };
    montantes: Array<{ id: string; num: number; profile: { shape: 'rect' | 'round'; width: number; depth: number }; materialNum: number; offset?: number }>;
    paineis: Array<{ id: string; num: number; kind: 'glass' | 'solid' | 'empty'; thickness: number; bite?: number; offset?: number; materialNum: number }>;
  };
  saida: {
    erro?: string;
    cortina_grade: Record<string, number[]>;
    quant_cortina: { linhas: number[]; valores: number[] };
    cortina_avisos: { avisos: number[]; valores: number[] };
  };
}

const arquivo = new URL('../crates/geom-wasm/tests/fixtures/cortina_paridade.json', import.meta.url);
const fixture: { casos: CasoFixture[] } | null = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : null;

function entradaDoCaso(c: CasoFixture): EntradaCenaCortina {
  const e = c.entrada;
  return {
    montantes: e.montantes.map((m) => ({ id: m.id, shape: m.profile.shape, width: m.profile.width, depth: m.profile.depth, offset: m.offset, materialId: `m${m.materialNum}` })),
    paineis: e.paineis.map((p) => ({ id: p.id, kind: p.kind, thickness: p.thickness, bite: p.bite, offset: p.offset, materialId: `m${p.materialNum}` })),
    tipos: [{ id: 't', depth: e.tipo.depth, u: e.tipo.u, v: e.tipo.v, mullions: { corner: null, ...(e.tipo.mullions as object) } as never, defaultPanelTypeId: e.tipo.defaultPanelTypeId, ...(e.tipo.minCell !== undefined ? { minCell: e.tipo.minCell } : {}) }],
    cortinas: [
      {
        id: 'c',
        levelNum: 0,
        typeId: 't',
        a: { x: 0, y: 0 },
        b: { x: e.L, y: 0 },
        zBase: 0,
        height: e.H,
        grid: e.instancia?.grid,
        defaultPanelTypeId: e.instancia?.defaultPanelTypeId ?? null,
      },
    ],
    materialNum: (id) => (id ? Number(String(id).slice(1)) : ID_AUSENTE_CORTINA),
  };
}

const arred = (v: ArrayLike<number>): number[] => Array.from(v, (x) => Math.round(x * 1e6) / 1e6 + 0);
const PRECISA_TRADUCAO = (papel: number): boolean => papel <= 5 || (papel >= 10 && papel <= 12);

describe('paridade do adaptador TS com o arquivo do Rust', () => {
  it.skipIf(!bytes || !fixture)('todos os casos: grade, quantitativos e avisos iguais ao arquivo', () => {
    let comparados = 0;
    for (const caso of fixture!.casos) {
      const cenaTs = montarCenaCortina(entradaDoCaso(caso));
      const { cena } = criar(cenaTs);
      if (caso.saida.erro) {
        const cod = codigoDe(() => cena.consultar('cortina_grade', [0]));
        expect(cod, caso.id).toBe(caso.saida.erro === 'LIMITE' ? CODIGOS.LIMITE : CODIGOS.ENTRADA);
        cena.destruir();
        continue;
      }
      // id_num do adaptador -> id_num do arquivo.
      const paraArquivo = new Map<number, number>();
      for (const m of caso.entrada.montantes) if (cenaTs.montanteDe.has(m.id)) paraArquivo.set(cenaTs.montanteDe.get(m.id)! + 1_000_000, m.num);
      for (const p of caso.entrada.paineis) if (cenaTs.painelDe.has(p.id)) paraArquivo.set(cenaTs.painelDe.get(p.id)! + 2_000_000, p.num);
      const mont = (n: number): number => (n === ID_AUSENTE_CORTINA ? n : (paraArquivo.get(n + 1_000_000) ?? NaN));
      const pnl = (n: number): number => paraArquivo.get(n + 2_000_000) ?? NaN;
      const esp = caso.saida.cortina_grade;

      const g = cena.consultar('cortina_grade', [0]);
      expect(arred(g['linhas']!), `${caso.id} linhas`).toEqual(esp['linhas']);
      expect(arred(g['linhas_pos']!), `${caso.id} linhas_pos`).toEqual(esp['linhas_pos']);
      const cel = Array.from(g['celulas']!);
      for (let k = 0; k < cel.length; k += 6) cel[k + 4] = pnl(cel[k + 4]!);
      expect(cel, `${caso.id} celulas`).toEqual(esp['celulas']);
      expect(arred(g['celulas_ret']!), `${caso.id} celulas_ret`).toEqual(esp['celulas_ret']);
      const seg = Array.from(g['segmentos']!);
      for (let k = 0; k < seg.length; k += 5) seg[k + 4] = mont(seg[k + 4]!);
      expect(seg, `${caso.id} segmentos`).toEqual(esp['segmentos']);
      expect(arred(g['segmentos_ext']!), `${caso.id} segmentos_ext`).toEqual(esp['segmentos_ext']);

      const q = cena.consultar('quant_cortina', [0]);
      const linhasQ = Array.from(q['linhas']!);
      const valoresQ = arred(q['valores']!);
      const quant = Array.from({ length: linhasQ.length / 5 }, (_, k) => {
        const l = linhasQ.slice(5 * k, 5 * k + 5);
        if (PRECISA_TRADUCAO(l[1]!)) l[2] = l[1]! <= 5 ? mont(l[2]!) : pnl(l[2]!);
        return [...l, ...valoresQ.slice(4 * k, 4 * k + 4)];
      }).sort((a, b) => a[1]! - b[1]! || a[2]! - b[2]! || a[3]! - b[3]!);
      const esperadoQ = Array.from({ length: caso.saida.quant_cortina.linhas.length / 5 }, (_, k) => [...caso.saida.quant_cortina.linhas.slice(5 * k, 5 * k + 5), ...caso.saida.quant_cortina.valores.slice(4 * k, 4 * k + 4)]);
      expect(quant, `${caso.id} quant`).toEqual(esperadoQ);

      const a = cena.consultar('cortina_avisos', [0]);
      const linhasA = Array.from(a['avisos']!);
      const valoresA = arred(a['valores']!);
      const avisos = Array.from({ length: linhasA.length / 4 }, (_, k) => {
        const l = linhasA.slice(4 * k, 4 * k + 4);
        if (l[1] === 5) l[2] = mont(l[2]!);
        return [...l, ...valoresA.slice(5 * k, 5 * k + 5)];
      }).sort((x, y) => x[1]! - y[1]! || x[2]! - y[2]! || x[3]! - y[3]! || x[4]! - y[4]!);
      const esperadoA = Array.from({ length: caso.saida.cortina_avisos.avisos.length / 4 }, (_, k) => [...caso.saida.cortina_avisos.avisos.slice(4 * k, 4 * k + 4), ...caso.saida.cortina_avisos.valores.slice(5 * k, 5 * k + 5)]);
      expect(avisos, `${caso.id} avisos`).toEqual(esperadoA);
      cena.destruir();
      comparados++;
    }
    expect(comparados).toBeGreaterThan(200);
  });
});

