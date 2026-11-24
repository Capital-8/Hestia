import { describe, expect, it } from 'vitest';
import { exportarFamilias, importarFamilias, lerArquivo, serializar } from './arquivo.ts';
import { criarFamiliaCaixaria } from './caixaria.ts';

describe('caixaria atravessa o arquivo (ficha I3, lista branca de arquivo.ts)', () => {
  it('família de caixaria faz ida e volta sem perder a árvore de vãos', () => {
    const original = criarFamiliaCaixaria({ nome: 'Módulo teste' });
    expect(original.caixaria).toBeDefined();

    const r = importarFamilias(JSON.parse(serializar(exportarFamilias([original]))));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toHaveLength(1);
    expect(r.familias[0]!.caixaria).toEqual(original.caixaria);
  });

  it('a caixaria sobrevive ao texto do arquivo (lerArquivo)', () => {
    const original = criarFamiliaCaixaria({ nome: 'Módulo texto', L: 900, A: 700, P: 500 });
    const r = lerArquivo(serializar(exportarFamilias([original])));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias[0]!.caixaria).toEqual(original.caixaria);
  });

  it('chave proibida dentro da caixaria faz a família ser ignorada, com o motivo', () => {
    const original = criarFamiliaCaixaria({ nome: 'Módulo suspeito' });
    const texto = serializar(exportarFamilias([original])).replace(
      '"caixaria": {',
      '"caixaria": { "__proto__": { "polui": true },',
    );
    const r = lerArquivo(texto);
    expect(r.familias).toHaveLength(0);
    expect(r.ignoradas[0]!.motivo).toContain('chave proibida');
    expect(({} as Record<string, unknown>).polui).toBeUndefined();
  });
});
