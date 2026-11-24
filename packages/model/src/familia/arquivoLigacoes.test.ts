import { describe, expect, it } from 'vitest';
import { exportarFamilias, lerArquivo, serializar } from './arquivo.ts';
import { adicionarLigacao, criarLigacaoPadrao } from './edicaoLigacoes.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia } from './tipos.ts';

/** Armário de exemplo com duas ligações (uma redonda, uma retangular), montadas pelas operações do modelo. */
function familiaComLigacoes(): Familia {
  const f = structuredClone(FAMILIA_ARMARIO);
  expect(adicionarLigacao(f, criarLigacaoPadrao('agua_fria', 'redonda', 'lig1'))).toBeNull();
  expect(adicionarLigacao(f, criarLigacaoPadrao('eletrica_forca', 'retangular', 'lig2'))).toBeNull();
  return f;
}

describe('ligações no arquivo de famílias', () => {
  it('salvar e reabrir devolve as mesmas ligações, e a segunda gravação sai idêntica à primeira leitura', () => {
    const f = familiaComLigacoes();
    const reaberta = lerArquivo(serializar(exportarFamilias([f])));
    expect(reaberta.ignoradas).toEqual([]);
    expect(reaberta.familias[0]!.ligacoes).toEqual(f.ligacoes);
    // O importador completa campos padrão (ex.: tipoPadrao); a partir daí o arquivo se estabiliza.
    const primeiro = serializar(exportarFamilias(reaberta.familias));
    expect(serializar(exportarFamilias(lerArquivo(primeiro).familias))).toBe(primeiro);
  });

  it('a chave ligacoes fica no arquivo, com o domínio e a seção gravados', () => {
    const texto = serializar(exportarFamilias([familiaComLigacoes()]));
    expect(texto).toContain('"ligacoes": [');
    expect(texto).toContain('"dominio": "agua_fria"');
    expect(texto).toContain('"secao": "retangular"');
  });
});
