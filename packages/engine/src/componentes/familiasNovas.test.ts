import { BIBLIOTECA_BASE, FAMILIAS_NOVAS, MAPA_ACABAMENTOS, familiaDaBiblioteca, resolverMaterialVisualPeca, validarFamilia, type Component, type Familia, type Parametro, type Valor } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { caixaEnvolvente } from './medidas.ts';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Famílias novas da Biblioteca: cada uma resolve sem erro em todos os tipos e em cada valor extremo/enum, sem peça de tamanho
 * zero, sem peças atravessadas, sobre o piso e de forma determinística. Valores de referência literais (calculados à mão).
 */

const biblioteca = (id: string): Familia | undefined => familiaDaBiblioteca(id);

function atravessada(pecas: readonly PecaResolvida[]): string {
  const ps = pecas.filter((p) => !p.vazio);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i]!; const b = ps[j]!;
    const ix = Math.min(a.origem[0] + a.extensao[0], b.origem[0] + b.extensao[0]) - Math.max(a.origem[0], b.origem[0]);
    const iy = Math.min(a.origem[1] + a.extensao[1], b.origem[1] + b.extensao[1]) - Math.max(a.origem[1], b.origem[1]);
    const iz = Math.min(a.origem[2] + a.extensao[2], b.origem[2] + b.extensao[2]) - Math.max(a.origem[2], b.origem[2]);
    if (ix > 1e-9 && iy > 1e-9 && iz > 1e-9) return `${a.id}#${a.indice} x ${b.id}#${b.indice}`;
  }
  return '';
}

function extremos(p: Parametro): Valor[] {
  if (p.tipo === 'comprimento' || p.tipo === 'numero' || p.tipo === 'inteiro') return p.min !== undefined && p.max !== undefined ? [p.min, p.max] : [];
  if (p.tipo === 'enum' || p.tipo === 'chapa') return (p.opcoes ?? []).map((o) => o.valor);
  if (p.tipo === 'booleano') return [true, false];
  return [];
}

function conferir(f: Familia, tipoId: string | undefined, valores: Record<string, Valor>, rotulo: string): void {
  const r = resolverFamilia(f, { tipoId, valores, biblioteca });
  expect(r.erros, `${f.id} ${rotulo}`).toEqual([]);
  expect(r.pecas.length, `${f.id} ${rotulo}: sem peças`).toBeGreaterThan(0);
  for (const p of r.pecas) {
    expect([...p.origem, ...p.extensao].every(Number.isFinite), `${f.id} ${rotulo} ${p.id}`).toBe(true);
    expect(Math.min(...p.extensao), `${f.id} ${rotulo} ${p.id}: tamanho ≤ 0`).toBeGreaterThan(0);
    expect(p.origem[2], `${f.id} ${rotulo} ${p.id}: abaixo do piso`).toBeGreaterThanOrEqual(-1e-6);
  }
  expect(atravessada(r.pecas), `${f.id} ${rotulo}`).toBe('');
}

describe('famílias novas: bateria geral', () => {
  it('ids únicos e prefixo fam_', () => {
    const ids = FAMILIAS_NOVAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('fam_')).toBe(true);
  });
  for (const f of FAMILIAS_NOVAS) {
    describe(f.id, () => {
      it('valida, tem descrição e hospedagem', () => {
        expect(validarFamilia(f)).toEqual([]);
        expect((f.descricao ?? '').length).toBeGreaterThan(20);
        expect(['nivel', 'parede']).toContain(f.hospedagem);
      });
      it('cada tipo resolve limpo e é determinístico', () => {
        for (const t of f.tipos) {
          conferir(f, t.id, {}, `tipo ${t.id}`);
          expect(resolverFamilia(f, { tipoId: t.id, biblioteca })).toEqual(resolverFamilia(f, { tipoId: t.id, biblioteca }));
        }
      });
      it('extremos e opções de cada parâmetro resolvem limpos', () => {
        for (const p of f.parametros.filter((q) => q.formula === undefined)) {
          for (const v of extremos(p)) conferir(f, f.tipoPadrao, { [p.id]: v }, `${p.id}=${String(v)}`);
        }
      });
      it('caixa total existe', () => {
        const r = resolverFamilia(f, { biblioteca });
        expect(caixaEnvolvente(r.pecas)).not.toBeNull();
      });
    });
  }
});

// ───────────────────────── caixas nominais (metros, valores calculados à mão) ─────────────────────────

/** [id, tipo (ou undefined = padrão), valores extras, largura, profundidade, altura] em metros. */
const CAIXAS: ReadonlyArray<readonly [string, string | undefined, Record<string, Valor>, number, number, number]> = [
  ['fam_mesa_jantar', undefined, {}, 1.6, 0.9, 0.75],
  ['fam_mesa_jantar', 'mesa120', {}, 1.2, 0.8, 0.75],
  ['fam_mesa_jantar', 'mesa200', { base: 'cruz', tipoTampo: 'vidro' }, 2.0, 1.0, 0.75],
  ['fam_mesa_jantar_redonda', undefined, {}, 1.2, 1.2, 0.75],
  ['fam_mesa_jantar_oval', undefined, {}, 1.8, 1.0, 0.75],
  ['fam_mesa_jantar_extensivel', 'fechada', {}, 1.4, 0.9, 0.75],
  ['fam_mesa_jantar_extensivel', 'aberta', {}, 2.0, 0.9, 0.75],
  ['fam_mesa_centro', undefined, {}, 1.0, 0.6, 0.4],
  ['fam_mesa_centro', 'centro_redonda', {}, 0.8, 0.8, 0.38],
  ['fam_mesa_lateral', undefined, {}, 0.45, 0.45, 0.55],
  ['fam_aparador', undefined, {}, 1.6, 0.42, 0.85],
  ['fam_bancada_alta', undefined, {}, 1.6, 0.6, 1.0],
  ['fam_mesa_escritorio', undefined, {}, 1.4, 0.7, 0.74],
  ['fam_mesa_escritorio_l', undefined, {}, 1.6, 1.4, 0.74],
  ['fam_mesa_escritorio_gavetas', undefined, {}, 1.4, 0.7, 0.74],
  ['fam_conjunto_centro', 'duas', {}, 1.4, 0.6, 0.45],
  ['fam_conjunto_centro', 'tres', {}, 1.8, 0.6, 0.45],
  ['fam_mesa_cadeiras', undefined, {}, 1.6, 1.92, 0.9],
  ['fam_cadeira', undefined, {}, 0.45, 0.46, 0.9],
  ['fam_cadeira_bracos', undefined, {}, 0.58, 0.54, 0.9],
  ['fam_banqueta', undefined, {}, 0.38, 0.38, 0.65],
  ['fam_banco_corrido', undefined, {}, 1.5, 0.35, 0.45],
  ['fam_puff', undefined, {}, 0.45, 0.45, 0.42],
  ['fam_sofa', 'dois', {}, 1.6, 0.9, 0.85],
  ['fam_sofa', 'tres', {}, 2.0, 0.9, 0.85],
  ['fam_sofa_l', undefined, {}, 2.4, 1.6, 0.85],
  ['fam_poltrona', undefined, {}, 0.8, 0.85, 0.85],
  ['fam_cama', 'solteiro', {}, 0.88, 1.94, 1.0],
  ['fam_cama', 'casal', {}, 1.38, 1.94, 1.0],
  ['fam_beliche', undefined, {}, 1.0, 2.0, 1.65],
  ['fam_closet_aberto', undefined, {}, 2.4, 0.55, 2.4],
  ['fam_nicho_embutido', undefined, {}, 0.6, 0.15, 0.6],
  ['fam_home_office', undefined, {}, 1.8, 0.6, 2.1],
  ['fam_bancada_banheiro', undefined, {}, 0.8, 0.48, 0.85],
  ['fam_painel_ripado_fundo', undefined, {}, 1.8, 0.04, 2.4],
  ['fam_painel_ripado_horizontal', undefined, {}, 1.8, 0.04, 2.4],
  ['fam_geladeira', undefined, {}, 0.7, 0.7, 1.8],
  ['fam_geladeira', 'uma_porta', {}, 0.6, 0.65, 1.5],
  ['fam_fogao', undefined, {}, 0.5, 0.6, 0.88],
  ['fam_cooktop', undefined, {}, 0.58, 0.51, 0.06],
  ['fam_forno_embutido', undefined, {}, 0.595, 0.55, 0.595],
  ['fam_microondas', undefined, {}, 0.52, 0.4, 0.3],
  ['fam_lava_loucas', undefined, {}, 0.6, 0.6, 0.85],
  ['fam_maquina_lavar', undefined, {}, 0.6, 0.55, 0.85],
  ['fam_coifa', undefined, {}, 0.9, 0.5, 0.7],
  ['fam_ar_split', undefined, {}, 0.9, 0.22, 0.29],
  ['fam_tv', undefined, {}, 1.218, 0.08, 0.685],
  ['fam_tv_painel', undefined, {}, 2.4, 0.098, 1.5],
  ['fam_bloco_caixa', undefined, {}, 0.6, 0.6, 0.6],
  ['fam_bloco_caixa', 'caixa_oca', {}, 0.8, 0.4, 0.4],
  ['fam_painel_plano', undefined, {}, 1.2, 0.018, 2.4],
  ['fam_perfil_linear', undefined, {}, 1.0, 0.04, 0.04],
  ['fam_cuba_inox', undefined, {}, 0.4, 0.4, 0.2],
  ['fam_cuba_embutir', undefined, {}, 0.5, 0.4, 0.18],
  ['fam_bancada_recorte_cuba', undefined, {}, 1.2, 0.55, 0.31],
  ['fam_box_reto', undefined, {}, 1.2, 0.04, 1.9],
  ['fam_box_canto', undefined, {}, 0.9, 0.9, 1.9],
  ['fam_prateleira_banheiro', undefined, {}, 0.6, 0.12, 0.1],
  ['fam_espelho_moldura', undefined, {}, 0.6, 0.04, 0.9],
];

describe('famílias novas: caixa total nominal (± 1 mm)', () => {
  for (const [id, tipo, valores, l, p, a] of CAIXAS) {
    it(`${id}${tipo ? ` (${tipo})` : ''} = ${l} × ${p} × ${a} m`, () => {
      const f = familiaDaBiblioteca(id)!;
      const r = resolverFamilia(f, { tipoId: tipo, valores, biblioteca });
      expect(r.erros).toEqual([]);
      const c = caixaEnvolvente(r.pecas)!;
      expect(c.min[0]).toBeCloseTo(0, 3);
      expect(c.min[1]).toBeCloseTo(0, 3);
      expect(c.min[2]).toBeCloseTo(0, 3);
      expect(c.max[0]).toBeCloseTo(l, 3);
      expect(c.max[1]).toBeCloseTo(p, 3);
      expect(c.max[2]).toBeCloseTo(a, 3);
    });
  }
  it('todas as famílias novas têm caixa conferida', () => {
    const conferidas = new Set(CAIXAS.map((c) => c[0]));
    for (const f of FAMILIAS_NOVAS) expect(conferidas.has(f.id), f.id).toBe(true);
  });
});

describe('famílias novas: detalhes literais', () => {
  const pecas = (id: string, valores: Record<string, Valor> = {}, tipo?: string): PecaResolvida[] => resolverFamilia(familiaDaBiblioteca(id)!, { tipoId: tipo, valores, biblioteca }).pecas;

  it('mesa redonda: tampo de 64 vértices a 0,600 m do centro', () => {
    const t = pecas('fam_mesa_jantar_redonda').filter((p) => p.papel === 'tampo');
    expect(t).toHaveLength(1);
    const pts = t[0]!.contorno!;
    expect(pts.length / 2).toBe(64);
    for (let k = 0; k < 64; k++) expect(Math.hypot(pts[2 * k]! - 0.6, pts[2 * k + 1]! - 0.6)).toBeCloseTo(0.6, 3);
    expect(t[0]!.espessura).toBeCloseTo(0.03, 6);
  });

  it('mesa oval: tampo em pista de 66 vértices dentro de 1,800 × 1,000', () => {
    const t = pecas('fam_mesa_jantar_oval').find((p) => p.papel === 'tampo')!;
    expect(t.contorno!.length / 2).toBe(66);
    const us = t.contorno!.filter((_, i) => i % 2 === 0);
    const vs = t.contorno!.filter((_, i) => i % 2 === 1);
    expect(Math.min(...us)).toBeCloseTo(0, 3);
    expect(Math.max(...us)).toBeCloseTo(1.8, 3);
    expect(Math.min(...vs)).toBeCloseTo(0, 3);
    expect(Math.max(...vs)).toBeCloseTo(1.0, 3);
  });

  it('espessura do tampo por tipo: madeira 30, vidro 12, mármore e quartzo 20 mm', () => {
    const esp = (t: string): number => pecas('fam_mesa_jantar', { tipoTampo: t }).find((p) => p.papel === 'tampo')!.espessura;
    expect(esp('madeira')).toBeCloseTo(0.03, 6);
    expect(esp('vidro')).toBeCloseTo(0.012, 6);
    expect(esp('marmore')).toBeCloseTo(0.02, 6);
    expect(esp('quartzo')).toBeCloseTo(0.02, 6);
  });

  it('cada base da mesa de jantar sobe até a face de baixo do tampo (altura da base 0,720 m)', () => {
    for (const base of ['pes4', 'pedestal', 'cavalete', 'trapezio', 'cruz']) {
      const ps = pecas('fam_mesa_jantar', { base }).filter((p) => p.papel !== 'tampo');
      expect(ps.length, base).toBeGreaterThanOrEqual(2);
      expect(Math.max(...ps.map((p) => p.origem[2] + p.extensao[2])), base).toBeCloseTo(0.72, 3);
    }
  });

  it('vidro, mármore e quartzo usam o acabamento certo (vidro no grupo vidro)', () => {
    const comp = { values: {} } as unknown as Component;
    const mat = (t: string): string => pecas('fam_mesa_jantar', { tipoTampo: t }).find((p) => p.papel === 'tampo')!.material!;
    expect(resolverMaterialVisualPeca(comp, 'tampo', mat('vidro'))).toBe('comp_vidro_incolor');
    expect(MAPA_ACABAMENTOS.comp_vidro_incolor?.grupo).toBe('vidro');
    expect(MAPA_ACABAMENTOS.comp_vidro_bronze?.grupo).toBe('vidro');
    expect(MAPA_ACABAMENTOS.comp_vidro_verde?.grupo).toBe('vidro');
    expect(resolverMaterialVisualPeca(comp, 'tampo', mat('marmore'))).toBe('comp_marmore_escuro');
    expect(resolverMaterialVisualPeca(comp, 'tampo', mat('quartzo'))).toBe('comp_calacatta');
    const bronze = { values: { acabTampo: 'comp_vidro_bronze' } } as unknown as Component;
    expect(resolverMaterialVisualPeca(bronze, 'tampo', mat('vidro'))).toBe('comp_vidro_bronze');
    // os dois vidros do box seguem o acabamento das portas
    const verde = { values: { acabPorta: 'comp_vidro_verde' } } as unknown as Component;
    expect(resolverMaterialVisualPeca(verde, 'porta', 'mat_vidro_incolor')).toBe('comp_vidro_verde');
    expect(MAPA_ACABAMENTOS[resolverMaterialVisualPeca({ values: {} } as unknown as Component, 'porta', 'mat_vidro_incolor')]?.grupo).toBe('vidro');
  });

  it('mesa extensível: aberta tem duas abas de 0,300 m; fechada não tem', () => {
    const abas = (tipo: string): PecaResolvida[] => pecas('fam_mesa_jantar_extensivel', {}, tipo).filter((p) => p.id === 'aba_madeira');
    expect(abas('fechada')).toHaveLength(0);
    const a = abas('aberta');
    expect(a).toHaveLength(2);
    expect(a[0]!.extensao[0]).toBeCloseTo(0.3, 6);
    expect(a[1]!.origem[0]).toBeCloseTo(1.7, 6);
  });

  it('mesa com 4 cadeiras: 2 de cada lado, sem colisão e com 0,450 m de largura cada', () => {
    const ps = pecas('fam_mesa_cadeiras');
    const assentos = ps.filter((p) => p.id === 'cadF[1]/assento' || p.id === 'cadF[2]/assento' || p.id === 'cadT[1]/assento' || p.id === 'cadT[2]/assento');
    expect(assentos).toHaveLength(4);
    for (const a of assentos) expect(a.extensao[0]).toBeCloseTo(0.45, 6);
    // frontais em x = 0,175 e 0,975; traseiras idem (passo 0,800 m, folga (0,800 - 0,450) / 2)
    expect(assentos.map((a) => a.origem[0]).sort((x, y) => x - y)[0]).toBeCloseTo(0.175, 6);
    expect(atravessada(ps)).toBe('');
    const oito = pecas('fam_mesa_cadeiras', {}, 'mesa8').filter((p) => /^cad[FT]\[\d\]\/assento$/.test(p.id));
    expect(oito).toHaveLength(8);
  });

  it('cadeira: assento a 0,450 m do piso', () => {
    const a = pecas('fam_cadeira').find((p) => p.id === 'assento')!;
    expect(a.origem[2] + a.extensao[2]).toBeCloseTo(0.45, 6);
  });

  it('geladeira duplex tem 2 portas e a de 1 porta tem 1', () => {
    expect(pecas('fam_geladeira').filter((p) => p.papel === 'porta')).toHaveLength(2);
    expect(pecas('fam_geladeira', {}, 'uma_porta').filter((p) => p.papel === 'porta')).toHaveLength(1);
  });

  it('beliche e sofá em L não têm peças atravessadas e o L tem chaise de 0,900 m', () => {
    expect(atravessada(pecas('fam_beliche'))).toBe('');
    const c = pecas('fam_sofa_l').find((p) => p.id === 'baseC')!;
    expect(c.extensao[0]).toBeCloseTo(0.9, 6);
    expect(c.origem[0]).toBeCloseTo(1.5, 6);
  });
});

describe('famílias novas: categorias da paleta', () => {
  it('cada categoria tem pelo menos 3 famílias na biblioteca base', () => {
    const cont: Record<string, number> = {};
    for (const f of BIBLIOTECA_BASE) cont[f.categoria] = (cont[f.categoria] ?? 0) + 1;
    for (const c of ['marcenaria', 'mobiliario', 'loucas', 'equipamento', 'generico']) expect(cont[c] ?? 0, c).toBeGreaterThanOrEqual(3);
    // 16 = 11 de antes + 5 de exemplo por disciplina (ficha 3.4b: tomada, interruptor, luminária, quadro e difusor).
    expect(cont.mobiliario).toBe(30);
    expect(cont.equipamento).toBe(16);
    // 10 = 7 de antes + 3 de exemplo por disciplina (ficha 3.4b: vaso sanitário, lavatório e ralo).
    expect(cont.loucas).toBe(10);
  });
});
