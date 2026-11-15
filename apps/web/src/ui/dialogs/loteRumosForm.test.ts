import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isLot, type Lot } from '@hestia/model';
import { aplicarRumos, avaliarRumos, comandoDoFormRumos, formRumosL1, formRumosVazio, norteEmGraus, poligonoDoForm, type FormRumos } from './loteRumosForm.ts';

const GRAU = Math.PI / 180;
const L1 = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }];

/** L1 com a última linha trocada: o erro de fechamento é `30 − ultima` (a tabela não fecha). */
const comUltima = (ultima: number, fechar = false): FormRumos => {
  const f = formRumosL1();
  f.linhas[3] = { azimute: 180, distancia: ultima };
  return { ...f, fecharNoPrimeiro: fechar };
};

describe('erro de fechamento e regra de aceite (A.4 regra 19)', () => {
  it('L1 fecha com erro 0 e é aceita', () => {
    const a = avaliarRumos(formRumosL1(), createEmptyProject());
    expect(a.erroFechamento).toBeLessThan(1e-9);
    expect(a.fechamentoOk).toBe(true);
    expect(a.problema).toBeNull();
    a.pontos.forEach((q, i) => {
      expect(q.x).toBeCloseTo(L1[i]!.x, 9);
      expect(q.y).toBeCloseTo(L1[i]!.y, 9);
    });
  });

  it('erro de 0,10 m sem a caixa marcada: bloqueado, com a mensagem do erro', () => {
    const a = avaliarRumos(comUltima(29.9), createEmptyProject());
    expect(a.erroFechamento).toBeCloseTo(0.1, 9);
    expect(a.fechamentoOk).toBe(false);
    expect(a.problema).toContain('0,1');
  });

  it('o mesmo erro com "fechar no primeiro ponto" marcado é aceito', () => {
    const a = avaliarRumos(comUltima(29.9, true), createEmptyProject());
    expect(a.fechamentoOk).toBe(true);
    expect(a.problema).toBeNull();
  });

  it('erro de 0,04 m (dentro da tolerância de 0,05 m) é aceito sem a caixa; 0,06 m não', () => {
    expect(avaliarRumos(comUltima(29.96), createEmptyProject()).problema).toBeNull();
    expect(avaliarRumos(comUltima(29.94), createEmptyProject()).problema).not.toBeNull();
  });

  it('o erro é calculado ao vivo, mesmo com a tabela bloqueada', () => {
    expect(avaliarRumos(comUltima(28), createEmptyProject()).erroFechamento).toBeCloseTo(2, 9);
  });
});

describe('validação das linhas', () => {
  it('menos de 3 linhas é recusado', () => {
    const f = formRumosL1();
    f.linhas = f.linhas.slice(0, 2);
    expect(avaliarRumos(f, createEmptyProject()).problema).toContain('3');
  });

  it('formulário vazio (distâncias zero) é recusado apontando a linha 1', () => {
    const a = avaliarRumos(formRumosVazio(), createEmptyProject());
    expect(a.problema).toContain('Linha 1');
  });

  it('número inválido (NaN) na linha ou no ponto inicial é recusado', () => {
    const f = formRumosL1();
    f.linhas[2] = { azimute: Number.NaN, distancia: 12 };
    expect(avaliarRumos(f, createEmptyProject()).problema).toContain('Linha 3');
    const g = formRumosL1();
    g.inicio = { x: Number.NaN, y: 0 };
    expect(avaliarRumos(g, createEmptyProject()).problema).not.toBeNull();
  });

  it('polígono que se cruza é recusado com a mensagem do modelo', () => {
    const f: FormRumos = { inicio: { x: 0, y: 0 }, fecharNoPrimeiro: true, linhas: [{ azimute: 45, distancia: 10 }, { azimute: 135, distancia: 10 }, { azimute: 315, distancia: 10 }, { azimute: 225, distancia: 10 }] };
    const a = avaliarRumos(f, createEmptyProject());
    expect(a.problema).not.toBeNull();
  });
});

describe('norte verdadeiro do projeto (emenda E4: direção = azimute + norte)', () => {
  it('com norte a 30°, a linha de azimute 0° sai a 30° no sentido horário a partir de +y', () => {
    const p = createEmptyProject();
    p.localizacao = { origemE: 0, origemN: 0, cotaZero: 0, norteVerdadeiro: 30 * GRAU };
    expect(norteEmGraus(p)).toBeCloseTo(30, 9);
    const pol = poligonoDoForm(formRumosL1(), p.localizacao.norteVerdadeiro);
    // A 2ª linha (azimute 0°, 30 m) parte de pontos[1] e chega a pontos[2].
    expect(pol.pontos[2]!.x - pol.pontos[1]!.x).toBeCloseTo(30 * Math.sin(30 * GRAU), 9);
    expect(pol.pontos[2]!.y - pol.pontos[1]!.y).toBeCloseTo(30 * Math.cos(30 * GRAU), 9);
    expect(pol.erroFechamento).toBeLessThan(1e-9);
  });

  it('sem localização o norte é 0', () => {
    expect(norteEmGraus(createEmptyProject())).toBe(0);
  });
});

describe('criação do lote pela tabela', () => {
  it('L1 pela tabela com norte 0: contorno (0,0)-(12,30), primeiro lado frente, demais laterais com recuo 0 (1e-9)', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = aplicarRumos(s, formRumosL1(), 'lv_0', 'Lote 1', 'Criar lote por tabela');
    expect('id' in r).toBe(true);
    const l = Object.values(s.project.elements).filter(isLot)[0] as Lot;
    L1.forEach((q, i) => {
      expect(l.contorno[i]!.x).toBeCloseTo(q.x, 9);
      expect(l.contorno[i]!.y).toBeCloseTo(q.y, 9);
    });
    expect(l.lados.map((x) => x.papel)).toEqual(['frente', 'lateral', 'lateral', 'lateral']);
    expect(l.lados.every((x) => x.recuo === 0)).toBe(true);
    expect(l.levelId).toBe('lv_0');
    expect(l.name).toBe('Lote 1');
  });

  it('um desfazer remove o lote', () => {
    const s = new ProjectStore(createEmptyProject());
    aplicarRumos(s, formRumosL1(), 'lv_0', 'Lote 1', 'Criar lote por tabela');
    s.undo();
    expect(Object.values(s.project.elements).filter(isLot)).toHaveLength(0);
  });

  it('tabela bloqueada não cria nada e devolve o problema', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = aplicarRumos(s, comUltima(29.9), 'lv_0', 'Lote 1', 'x');
    expect('problema' in r).toBe(true);
    expect(Object.values(s.project.elements).filter(isLot)).toHaveLength(0);
  });

  it('com "fechar no primeiro ponto" a tabela aberta cria o polígono de 4 pontos', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = aplicarRumos(s, comUltima(29.9, true), 'lv_0', 'Lote 1', 'x');
    expect('id' in r).toBe(true);
    expect((Object.values(s.project.elements).filter(isLot)[0] as Lot).contorno).toHaveLength(4);
  });

  it('comandoDoFormRumos devolve um addLot com o id novo', () => {
    const r = comandoDoFormRumos(formRumosL1(), createEmptyProject(), 'lv_0', 'Lote 1');
    expect('command' in r && r.command.type).toBe('addLot');
    expect('id' in r && r.id.startsWith('lt')).toBe(true);
  });

  it('o nível inexistente é recusado pelo modelo e a mensagem volta', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = aplicarRumos(s, formRumosL1(), 'lv_nao_existe', 'Lote 1', 'x');
    expect('problema' in r).toBe(true);
  });
});
