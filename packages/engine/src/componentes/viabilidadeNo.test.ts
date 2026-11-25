import { familiaDaBiblioteca, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverNo } from './resolvedorNo.ts';
import { resolverFamilia } from './resolver.ts';
import { TIPOS_TUBULACAO } from './tiposTubulacao.ts';
import { COMPRIMENTO_MINIMO_TRECHO, listarProblemasDeViabilidade, verificarViabilidade, type ResultadoViabilidade } from './viabilidadeNo.ts';

const krona = TIPOS_TUBULACAO.find((t) => t.id === 'krona_esgoto')!;
const familias: Record<string, Familia> = {};
for (const id of Object.values(krona.regras)) {
  const f = id === '' ? null : familiaDaBiblioteca(id);
  if (f) familias[id] = f;
}

/** Recuo real (mm) do joelho de 90° da Krona em DN 100 (o mesmo que a ferramenta Tubo usa). */
const recuoJoelho = (): number => {
  const s = resolverNo({ tipo: krona, familias, no: { tipo: 'encontro', trechos: [{ direcao: [1, 0, 0], dn: 100 }, { direcao: [0, 1, 0], dn: 100 }] } });
  if (s.status !== 'ok') throw new Error('sem joelho');
  return (s.recuos[0] ?? 0) * 1000;
};
const diametroExterno = (): number => {
  const de = resolverFamilia(familias[krona.regras.tubo]!, { valores: { DN: 100, L: 1000 } }).env.De;
  return typeof de === 'number' ? de : 0;
};

const bloqueio = (r: ResultadoViabilidade) => {
  if (r.ok || r.severidade !== 'bloqueio') throw new Error('esperava bloqueio');
  return r;
};

describe('verificarViabilidade: trecho curto', () => {
  it('o mínimo é 10 mm', () => {
    expect(COMPRIMENTO_MINIMO_TRECHO).toBe(10);
  });
  it('sobra exatamente 10 mm: passa', () => {
    expect(verificarViabilidade({ trechos: [{ comprimento: 126, recuoInicio: 58, recuoFim: 58 }] })).toEqual({ ok: true });
  });
  it('sobra 9,9 mm: bloqueia com trecho_curto e os números no motivo', () => {
    const r = bloqueio(verificarViabilidade({ trechos: [{ comprimento: 125.9, recuoInicio: 58, recuoFim: 58 }] }));
    expect(r.codigo).toBe('trecho_curto');
    expect(r.motivo).toContain('9,9 mm');
    expect(r.motivo).toContain('10 mm');
    expect(r.trechoAfetado).toBe(0);
  });
  it('um nó só: 60 mm com recuo de 58 mm deixa 2 mm e bloqueia; 1 m passa', () => {
    expect(bloqueio(verificarViabilidade({ trechos: [{ comprimento: 60, recuoInicio: 58, recuoFim: 0 }] })).codigo).toBe('trecho_curto');
    expect(verificarViabilidade({ trechos: [{ comprimento: 1000, recuoInicio: 58, recuoFim: 0 }] })).toEqual({ ok: true });
  });
  it('sem recuos (família sem encaixe) nunca bloqueia, mesmo com trecho pequeno', () => {
    expect(verificarViabilidade({ trechos: [{ comprimento: 3, recuoInicio: 0, recuoFim: 0 }] })).toEqual({ ok: true });
  });
  it('trechoAfetado usa o indice informado, senão a posição', () => {
    const lista = [{ comprimento: 1000, recuoInicio: 58, recuoFim: 58 }, { comprimento: 65, recuoInicio: 58, recuoFim: 0 }];
    expect(bloqueio(verificarViabilidade({ trechos: lista })).trechoAfetado).toBe(1);
    expect(bloqueio(verificarViabilidade({ trechos: [{ ...lista[1]!, indice: 7 }] })).trechoAfetado).toBe(7);
  });
});

describe('verificarViabilidade: conexões que se tocam', () => {
  it('dois nós vizinhos que cabem (116 mm em 300 mm): passa', () => {
    expect(verificarViabilidade({ trechos: [{ comprimento: 300, recuoInicio: 58, recuoFim: 58 }] })).toEqual({ ok: true });
  });
  it('dois nós vizinhos que se sobrepõem (116 mm em 100 mm): conexoes_se_tocam, faltam 16 mm', () => {
    const r = bloqueio(verificarViabilidade({ trechos: [{ comprimento: 100, recuoInicio: 58, recuoFim: 58 }] }));
    expect(r.codigo).toBe('conexoes_se_tocam');
    expect(r.motivo).toContain('16 mm');
    expect(r.motivo).toContain('116 mm');
  });
  it('encostadas exatamente (116 em 116) deixam 0 mm: trecho_curto, não sobreposição', () => {
    expect(bloqueio(verificarViabilidade({ trechos: [{ comprimento: 116, recuoInicio: 58, recuoFim: 58 }] })).codigo).toBe('trecho_curto');
  });
});

describe('verificarViabilidade: cota insuficiente (prumada)', () => {
  it('DN 100 da Krona: o recuo real do joelho é 58 mm e o De é 101,6 mm', () => {
    expect(recuoJoelho()).toBeCloseTo(58, 6);
    expect(diametroExterno()).toBeCloseTo(101.6, 6);
  });
  it('mudança de cota de 5 cm bloqueia', () => {
    const r = bloqueio(verificarViabilidade({ prumadas: [{ desvioVertical: 50, diametroExterno: diametroExterno(), recuoBaixo: recuoJoelho(), recuoCima: recuoJoelho() }] }));
    expect(r.codigo).toBe('cota_insuficiente');
    expect(r.motivo).toContain('50 mm');
    expect(r.motivo).toContain('101,6 mm');
  });
  it('mudança de cota de 40 cm passa', () => {
    expect(verificarViabilidade({ prumadas: [{ desvioVertical: 400, diametroExterno: diametroExterno(), recuoBaixo: recuoJoelho(), recuoCima: recuoJoelho() }] })).toEqual({ ok: true });
  });
  it('maior que o De mas o trecho vertical sobra menos de 10 mm depois dos recuos: bloqueia', () => {
    const r = bloqueio(verificarViabilidade({ prumadas: [{ desvioVertical: 120, diametroExterno: 101.6, recuoBaixo: 58, recuoCima: 58 }] }));
    expect(r.codigo).toBe('cota_insuficiente');
    expect(r.motivo).toContain('126 mm');
  });
  it('limite exato (126 mm com recuos de 58 mm) passa; sem recuos, o limite é o De', () => {
    expect(verificarViabilidade({ prumadas: [{ desvioVertical: 126, diametroExterno: 101.6, recuoBaixo: 58, recuoCima: 58 }] })).toEqual({ ok: true });
    expect(verificarViabilidade({ prumadas: [{ desvioVertical: 101.6, diametroExterno: 101.6 }] })).toEqual({ ok: true });
    expect(bloqueio(verificarViabilidade({ prumadas: [{ desvioVertical: 101, diametroExterno: 101.6 }] })).codigo).toBe('cota_insuficiente');
  });
  it('desvio zero não é prumada; descida vale como subida', () => {
    expect(verificarViabilidade({ prumadas: [{ desvioVertical: 0, diametroExterno: 101.6 }] })).toEqual({ ok: true });
    expect(bloqueio(verificarViabilidade({ prumadas: [{ desvioVertical: -50, diametroExterno: 101.6 }] })).codigo).toBe('cota_insuficiente');
  });
});

describe('verificarViabilidade: declividade (só avisa)', () => {
  it('esgoto DN 100 a 0,5 % (abaixo de 1 %): aviso, não bloqueio, com o número', () => {
    const r = verificarViabilidade({ declividades: [{ percentual: 0.5, dominio: 'esgoto', dn: 100 }] });
    expect(r).toMatchObject({ ok: false, severidade: 'aviso', codigo: 'declividade_fora_do_limite' });
    expect(r.ok ? '' : r.motivo).toContain('0,5 %');
  });
  it('esgoto a 8 % (acima de 5 %): aviso; a 1 % e a 5 % (limites exatos): passa', () => {
    expect(verificarViabilidade({ declividades: [{ percentual: 8, dominio: 'esgoto', dn: 50 }] })).toMatchObject({ ok: false, severidade: 'aviso' });
    expect(verificarViabilidade({ declividades: [{ percentual: 1, dominio: 'esgoto', dn: 100 }] })).toEqual({ ok: true });
    expect(verificarViabilidade({ declividades: [{ percentual: 5, dominio: 'esgoto', dn: 100 }] })).toEqual({ ok: true });
  });
  it('declividade negativa vale em módulo; DN acima do limite da faixa e outro domínio não são conferidos', () => {
    expect(verificarViabilidade({ declividades: [{ percentual: -2, dominio: 'esgoto', dn: 100 }] })).toEqual({ ok: true });
    expect(verificarViabilidade({ declividades: [{ percentual: 0.1, dominio: 'esgoto', dn: 150 }] })).toEqual({ ok: true });
    expect(verificarViabilidade({ declividades: [{ percentual: 0.1, dominio: 'agua_fria', dn: 25 }] })).toEqual({ ok: true });
  });
});

describe('verificarViabilidade: combinação e determinismo', () => {
  it('entrada vazia passa', () => {
    expect(verificarViabilidade({})).toEqual({ ok: true });
  });
  it('bloqueio vem antes de aviso, mesmo que o aviso apareça primeiro na lista', () => {
    const r = verificarViabilidade({ declividades: [{ percentual: 0.5, dominio: 'esgoto', dn: 100 }], trechos: [{ comprimento: 60, recuoInicio: 58, recuoFim: 0 }] });
    expect(r).toMatchObject({ ok: false, severidade: 'bloqueio', codigo: 'trecho_curto' });
    expect(listarProblemasDeViabilidade({ declividades: [{ percentual: 0.5, dominio: 'esgoto', dn: 100 }], trechos: [{ comprimento: 60, recuoInicio: 58, recuoFim: 0 }] })).toHaveLength(2);
  });
  it('é determinístico: a mesma entrada dá o mesmo resultado', () => {
    const e = { trechos: [{ comprimento: 90, recuoInicio: 58, recuoFim: 58 }] };
    expect(verificarViabilidade(e)).toEqual(verificarViabilidade(e));
  });
});
