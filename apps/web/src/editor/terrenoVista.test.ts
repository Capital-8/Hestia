import { describe, expect, it, vi } from 'vitest';
import { projetoTerreno } from '@hestia/engine';
import { unitsOf } from '@hestia/model';
import {
  SONDA_DISTANCIA_PX,
  SONDA_INTERVALO_MS,
  alvoDoAvisoDeTerreno,
  caixaDoCorteComTerreno,
  caixaDoTerreno,
  criarSondaDoTerreno,
  ligarRepinturaDoTerreno,
  precisaConsultar,
  textoDaCotaDoTerreno,
  type UltimaSonda,
} from './terrenoVista.ts';

describe('repintar quando o kernel do terreno carrega', () => {
  it('ao ficar pronto zera a chave do modelo, reinicia a planta, invalida o quadro e pede desenho, nesta ordem', () => {
    const chamadas: string[] = [];
    let ouvinte: (() => void) | null = null;
    const desliga = vi.fn();
    const servico = { aoMudarPronto: (f: () => void) => { ouvinte = f; return desliga; } };
    const fim = ligarRepinturaDoTerreno(servico, {
      zerarChaveDoModelo: () => chamadas.push('chave'),
      reiniciarPlanta: () => chamadas.push('planta'),
      invalidarQuadro: () => chamadas.push('quadro'),
      pedirDesenho: () => chamadas.push('tick'),
    });
    expect(chamadas).toEqual([]);
    ouvinte!();
    expect(chamadas).toEqual(['chave', 'planta', 'quadro', 'tick']);
    ouvinte!();
    expect(chamadas).toHaveLength(8);
    fim();
    expect(desliga).toHaveBeenCalledTimes(1);
  });
});

describe('Ir para dos avisos do terreno', () => {
  it('terreno: nível dele e caixa das fontes (T5)', () => {
    const p = projetoTerreno('T5');
    const alvo = alvoDoAvisoDeTerreno(p, { elementId: 'tn_t5' });
    expect(alvo).not.toBeNull();
    expect(alvo!.elementId).toBe('tn_t5');
    expect(alvo!.levelId).toBe('lv_0');
    expect(alvo!.box).toBeDefined();
    const b = alvo!.box!;
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxY).toBeGreaterThan(b.minY);
    expect(alvo!.center).toEqual({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  });

  it('região: o alvo é a região (caixa do contorno), não o terreno', () => {
    const p = projetoTerreno('T5');
    const alvo = alvoDoAvisoDeTerreno(p, { elementId: 'rg_t5' });
    expect(alvo!.elementId).toBe('rg_t5');
    const r = p.elements['rg_t5'] as unknown as { contorno: Array<{ x: number; y: number }> };
    expect(alvo!.box!.minX).toBe(Math.min(...r.contorno.map((q) => q.x)));
    expect(alvo!.box!.maxY).toBe(Math.max(...r.contorno.map((q) => q.y)));
  });

  it('outro elemento, aviso sem elemento ou elemento ausente: null (segue o caminho comum)', () => {
    const p = projetoTerreno('T5');
    expect(alvoDoAvisoDeTerreno(p, { elementId: undefined })).toBeNull();
    expect(alvoDoAvisoDeTerreno(p, { elementId: 'nao_existe' })).toBeNull();
  });

  it('a caixa usa a borda do modelo quando existe, senão pontos, curvas e quebras', () => {
    expect(caixaDoTerreno({ pontos: [], curvas: [], quebras: [], borda: [0, 0, 10, 0, 10, 5, 0, 5] })).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
    expect(
      caixaDoTerreno({ pontos: [1, 2, 3], curvas: [{ xy: [-4, 0, 6, 9] }], quebras: [{ xyz: [0, -7, 1, 2, 2, 2] }] }),
    ).toEqual({ minX: -4, minY: -7, maxX: 6, maxY: 9 });
    expect(caixaDoTerreno({ pontos: [], curvas: [], quebras: [] })).toBeNull();
  });
});

describe('enquadramento vertical do corte com terreno', () => {
  const caixa = { minX: -0.8, maxX: 22.2, minY: -0.5, maxY: 3.5 };
  it('T5 em z 8 a 10 amplia a faixa vertical e mantém a horizontal', () => {
    const r = caixaDoCorteComTerreno(caixa, [{ pontos: [{ s: 0, z: 10 }, { s: 5, z: 8 }, { s: 20, z: 10 }] }]);
    expect(r.minX).toBe(-0.8);
    expect(r.maxX).toBe(22.2);
    expect(r.minY).toBe(-0.5);
    expect(r.maxY).toBe(10.5);
  });
  it('terreno abaixo do edifício amplia para baixo; sem linhas a caixa é a mesma', () => {
    expect(caixaDoCorteComTerreno(caixa, [{ pontos: [{ s: 0, z: -4 }, { s: 1, z: -3 }] }]).minY).toBe(-4.5);
    expect(caixaDoCorteComTerreno(caixa, [])).toBe(caixa);
    expect(caixaDoCorteComTerreno(caixa, [{ pontos: [] }])).toBe(caixa);
  });
});

describe('sonda da barra de status', () => {
  const ant: UltimaSonda = { x: 0, y: 0, t: 1000, chave: 'a', z: 5 };
  it('sem consulta anterior ou com outra chave, consulta', () => {
    expect(precisaConsultar(null, { x: 0, y: 0 }, 0, 0.01, 'a')).toBe(true);
    expect(precisaConsultar(ant, { x: 0, y: 0 }, 1000, 0.01, 'b')).toBe(true);
  });
  it('dentro do intervalo não consulta, mesmo com o cursor longe', () => {
    expect(precisaConsultar(ant, { x: 100, y: 0 }, 1000 + SONDA_INTERVALO_MS - 1, 0.01, 'a')).toBe(false);
  });
  it('passado o intervalo só consulta se o cursor andou mais que a distância em pixels', () => {
    const mpp = 0.01;
    const depois = 1000 + SONDA_INTERVALO_MS;
    expect(precisaConsultar(ant, { x: SONDA_DISTANCIA_PX * mpp * 0.5, y: 0 }, depois, mpp, 'a')).toBe(false);
    expect(precisaConsultar(ant, { x: SONDA_DISTANCIA_PX * mpp * 2, y: 0 }, depois, mpp, 'a')).toBe(true);
  });
  it('a sonda memoriza: mover o cursor sem passar dos limites não chama o kernel de novo', () => {
    const consulta = vi.fn((q: { x: number; y: number }) => (q.x < 50 ? q.x : null));
    const s = criarSondaDoTerreno(consulta);
    expect(s.ler({ x: 1, y: 0 }, 0, 0.01, 'k')).toBe(1);
    expect(s.ler({ x: 1.001, y: 0 }, 10, 0.01, 'k')).toBe(1);
    expect(s.ler({ x: 1.002, y: 0 }, 500, 0.01, 'k')).toBe(1);
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(s.ler({ x: 60, y: 0 }, 1000, 0.01, 'k')).toBeNull();
    expect(consulta).toHaveBeenCalledTimes(2);
    expect(s.ultima()?.z).toBeNull();
    expect(s.ler({ x: 60, y: 0 }, 1001, 0.01, 'outra')).toBeNull();
    expect(consulta).toHaveBeenCalledTimes(3);
  });
  it('o texto usa a cota exibida (z do projeto mais a cota zero) pela unidade do projeto', () => {
    const p = projetoTerreno('T2');
    const t = textoDaCotaDoTerreno(p, unitsOf(p), 10.5, 'pt');
    expect(t).toMatch(/10[,.]50?/);
    const q = { ...p, localizacao: { origemE: 0, origemN: 0, cotaZero: 100, norteVerdadeiro: 0 } };
    expect(textoDaCotaDoTerreno(q, unitsOf(q), 10.5, 'pt')).toMatch(/110[,.]50?/);
  });
});
