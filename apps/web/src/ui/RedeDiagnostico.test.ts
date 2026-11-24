import { describe, expect, it } from 'vitest';
import type { Diagnostico } from '@hestia/engine';
import { comoAviso, gravidade, textoDoDiagnostico } from './RedeDiagnostico.tsx';

/** Tradutor de teste: devolve a chave e os parâmetros, para conferir o mapeamento sem o dicionário. */
const t = (chave: string, p?: Record<string, string | number>): string => (p ? `${chave}${JSON.stringify(p)}` : chave);

const base = { elementId: 'i1' } as const;

describe('textos do painel Verificar rede', () => {
  it('ligação aberta leva o identificador da ligação', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'ligacao_aberta', ligacaoId: 'a' }, t, 'pt')).toBe('rede_aberta{"ligacao":"a"}');
  });

  it('conexão inválida não tem parâmetros', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'conexao_invalida' }, t, 'pt')).toBe('rede_invalida');
  });

  it('afastamento formata a distância em mm com uma casa', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'conexao_afastada', ligacaoId: 'b', valor: 7.25 }, t, 'pt')).toBe('rede_afastada{"ligacao":"b","mm":"7,3"}');
  });

  it('incompatibilidade traduz o motivo fixo do engine pela chave de tradução', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'incompativel', ligacaoId: 'c', motivo: 'bitolas diferentes' }, t, 'pt')).toBe(
      'rede_incompativel{"ligacao":"c","motivo":"rede_motivo_bitola"}',
    );
  });

  it('motivo desconhecido cai no texto genérico', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'incompativel', ligacaoId: 'c', motivo: 'texto novo do motor' }, t, 'pt')).toBe(
      'rede_incompativel{"ligacao":"c","motivo":"rede_motivo_outro"}',
    );
  });

  it('declividade fora da faixa mostra o percentual', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'inclinacao_fora_limite', valor: 12 }, t, 'pt')).toBe('rede_inclinacao{"pct":"12"}');
  });

  it('rede sem saída mostra o número de instâncias', () => {
    expect(textoDoDiagnostico({ ...base, codigo: 'rede_sem_saida', valor: 3 }, t, 'pt')).toBe('rede_sem_saida{"n":3}');
  });
});

describe('gravidade e aviso para o Ir para', () => {
  it('conexão quebrada e incompatível são erro; o resto é aviso', () => {
    expect(gravidade({ ...base, codigo: 'conexao_invalida' })).toBe('error');
    expect(gravidade({ ...base, codigo: 'incompativel' })).toBe('error');
    expect(gravidade({ ...base, codigo: 'ligacao_aberta' })).toBe('warning');
    expect(gravidade({ ...base, codigo: 'conexao_afastada' })).toBe('warning');
    expect(gravidade({ ...base, codigo: 'inclinacao_fora_limite' })).toBe('warning');
    expect(gravidade({ ...base, codigo: 'rede_sem_saida' })).toBe('warning');
  });

  it('aviso leva o código com prefixo rede-, a instância e o texto', () => {
    const d: Diagnostico = { codigo: 'ligacao_aberta', elementId: 'tubo7', ligacaoId: 'a' };
    expect(comoAviso(d, 'texto')).toEqual({ severity: 'warning', code: 'rede-ligacao_aberta', message: 'texto', elementId: 'tubo7' });
  });
});
