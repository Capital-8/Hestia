import { describe, expect, it } from 'vitest';
import { aplicarPredefinicao, predefinicoes, LIMITE_EXTERNO_AJUDA, LIMITE_EXTERNO_OPCOES, TERMINO_AJUDA, TERMINO_OPCOES, formDoLimiteExterno, formDoTermino, limiteExternoDoForm, terminoDoForm } from './terminoForm.ts';

describe('campo "Término nas paredes" (decisão 0023 §2, P8; decisão 0025)', () => {
  it('oferece as sete opções, nesta ordem, com rótulos de até 22 caracteres', () => {
    expect(TERMINO_OPCOES.map((o) => o.value)).toEqual(['auto', 'face', 'nucleo', 'passa', 'ate', 'cm', 'camada']);
    for (const o of TERMINO_OPCOES) expect([...o.label].length).toBeLessThanOrEqual(22);
  });

  it('cada opção tem uma dica curta', () => {
    for (const o of TERMINO_OPCOES) expect(TERMINO_AJUDA[o.value].length).toBeGreaterThan(10);
  });

  it('lê o término guardado: nomes não têm texto; deslocamento e prioridade mostram o número', () => {
    expect(formDoTermino('auto')).toEqual({ kind: 'auto', cmText: '0' });
    expect(formDoTermino('face')).toEqual({ kind: 'face', cmText: '0' });
    expect(formDoTermino('passa')).toEqual({ kind: 'passa', cmText: '0' });
    expect(formDoTermino({ cm: -1.5 })).toEqual({ kind: 'cm', cmText: '-1.5' });
    expect(formDoTermino({ ate: { prioridade: 3 } })).toEqual({ kind: 'ate', cmText: '3' });
  });

  it('automático não grava a chave (volta ao padrão); nome grava o valor', () => {
    expect(terminoDoForm('auto', '5')).toEqual({ termino: undefined });
    expect(terminoDoForm('nucleo', '')).toEqual({ termino: 'nucleo' });
    expect(terminoDoForm('passa', '')).toEqual({ termino: 'passa' });
  });

  it('deslocamento aceita vírgula, arredonda a 1 mm e recusa fora de −30 a +30 cm', () => {
    expect(terminoDoForm('cm', '-1,26')).toEqual({ termino: { cm: -1.3 } });
    expect(terminoDoForm('cm', ' 30 ')).toEqual({ termino: { cm: 30 } });
    expect(terminoDoForm('cm', '30,1')).toEqual({ erro: 'Entre −30 e 30 cm' });
    expect(terminoDoForm('cm', '')).toEqual({ erro: 'Entre −30 e 30 cm' });
    expect(terminoDoForm('cm', 'abc')).toEqual({ erro: 'Entre −30 e 30 cm' });
  });

  it('limite no perímetro externo: três opções, rótulos curtos e ida e volta com a camada', () => {
    expect(LIMITE_EXTERNO_OPCOES.map((o) => o.value)).toEqual(['auto', 'parede', 'nucleo']);
    for (const o of LIMITE_EXTERNO_OPCOES) {
      expect([...o.label].length).toBeLessThanOrEqual(22);
      expect(LIMITE_EXTERNO_AJUDA[o.value].length).toBeGreaterThan(10);
    }
    expect(limiteExternoDoForm('auto')).toBeUndefined();
    expect(limiteExternoDoForm('parede')).toBe('parede');
    expect(limiteExternoDoForm('nucleo')).toBe('nucleo');
    expect(formDoLimiteExterno(undefined)).toBe('auto');
    expect(formDoLimiteExterno('nucleo')).toBe('nucleo');
  });

  it('prioridade é inteira de 1 a 9; fora disso, erro sem gravar', () => {
    expect(terminoDoForm('ate', '4')).toEqual({ termino: { ate: { prioridade: 4 } } });
    expect(terminoDoForm('ate', ' 9 ')).toEqual({ termino: { ate: { prioridade: 9 } } });
    expect(terminoDoForm('ate', '0')).toEqual({ erro: 'Informe um número de 1 a 9' });
    expect(terminoDoForm('ate', '10')).toEqual({ erro: 'Informe um número de 1 a 9' });
    expect(terminoDoForm('ate', '2,5')).toEqual({ erro: 'Informe um número de 1 a 9' });
    expect(terminoDoForm('ate', '')).toEqual({ erro: 'Informe um número de 1 a 9' });
  });
});

describe('modo "Até uma camada da parede"', () => {
  const cam = { funcao: 'substrate', lado: 'distante', face: 'proxima', cmText: '0' } as const;

  it('grava o término por camada e lê de volta', () => {
    const r = terminoDoForm('camada', '', 'pt', cam);
    expect(r).toEqual({ termino: { camada: { funcao: 'substrate', lado: 'distante', face: 'proxima', cm: 0 } } });
    expect(formDoTermino({ camada: { funcao: 'eixo', lado: 'proximo', face: 'meio', cm: -1.5 } })).toEqual({
      kind: 'camada',
      cmText: '0',
      camada: { funcao: 'eixo', lado: 'proximo', face: 'meio', cmText: '-1.5' },
    });
  });

  it('recuo aceita vírgula e recusa fora de −30 a +30 cm', () => {
    expect(terminoDoForm('camada', '', 'pt', { ...cam, cmText: '2,5' })).toEqual({ termino: { camada: { funcao: 'substrate', lado: 'distante', face: 'proxima', cm: 2.5 } } });
    expect(terminoDoForm('camada', '', 'pt', { ...cam, cmText: '31' })).toEqual({ erro: 'Entre −30 e 30 cm' });
  });

  it('predefinições: rótulo e explicação em todos os idiomas; a estrutural só toca a camada de estrutura', () => {
    for (const lang of ['pt', 'en', 'es', 'de'] as const) {
      const ps = predefinicoes(lang);
      expect(ps).toHaveLength(3);
      for (const p of ps) expect(p.label.length > 5 && p.ajuda.length > 15).toBe(true);
    }
    const layers = [
      { function: 'finish1', materialId: 'a', thickness: 0.01, wraps: false },
      { function: 'structure', materialId: 'b', thickness: 0.1, wraps: false },
    ] as const;
    const r = aplicarPredefinicao('laje-substrato-externo', layers);
    expect(r[0]!.termino).toBeUndefined();
    expect(r[1]!.termino).toEqual({ camada: { funcao: 'substrate', lado: 'distante', face: 'proxima', cm: 0 } });
    expect(aplicarPredefinicao('laje-face-externa', layers).every((l) => l.termino !== undefined)).toBe(true);
  });
});
