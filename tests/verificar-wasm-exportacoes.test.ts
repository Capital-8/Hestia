import { describe, expect, it } from 'vitest';
import { conferirExportacoes, EXPORTS_V1, EXPORTS_V2 } from '../scripts/verificar-wasm-exportacoes.mjs';

describe('conferência das exportações do wasm (0046 §3.1)', () => {
  it('a lista da v2 tem as 18 exportações da decisão', () => {
    expect(EXPORTS_V2).toHaveLength(18);
    expect(EXPORTS_V2).toContain('memoria_usada');
    expect(EXPORTS_V2).toContain('abi2_versao');
  });

  it('módulo v1 completo: sem erro, sem aviso, versão lida', () => {
    const r = conferirExportacoes(EXPORTS_V1);
    expect(r).toEqual({ abi2: false, v1Completa: true, erros: [], avisos: [] });
  });

  it('módulo v1 sem alguma exportação: só aviso (como antes), sem erro', () => {
    const r = conferirExportacoes(['preparar_entrada', 'executar']);
    expect(r.abi2).toBe(false);
    expect(r.erros).toEqual([]);
    expect(r.v1Completa).toBe(false);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain('saida_area, versao_abi');
  });

  it('módulo v2 completo (com a v1 também): sem erro', () => {
    const r = conferirExportacoes([...EXPORTS_V1, ...EXPORTS_V2]);
    expect(r).toEqual({ abi2: true, v1Completa: true, erros: [], avisos: [] });
  });

  it('exporta abi2_versao mas falta uma da v2: erro listando a ausente', () => {
    const sem = 'cena_executar';
    const r = conferirExportacoes(EXPORTS_V2.filter((n) => n !== sem));
    expect(r.abi2).toBe(true);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain('faltam 1 exportações da v2');
    expect(r.erros[0]).toContain(sem);
    expect(r.erros[0]).not.toContain('abi2_versao,');
  });

  it('exporta abi2_versao e faltam várias: erro lista todas, na ordem da decisão', () => {
    const r = conferirExportacoes(['abi2_versao', 'cena_criar', 'saida_n']);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toContain('faltam 15 exportações da v2');
    expect(r.erros[0]).toContain('abi2_esquema_versao, abi2_alocar, abi2_liberar, cena_destruir');
    expect(r.erros[0]).toContain('memoria_usada');
    expect(r.erros[0]).not.toContain('cena_criar,');
  });

  it('sem abi2_versao, as da v2 isoladas não disparam a regra da v2', () => {
    const r = conferirExportacoes(['cena_criar', 'saida_n', ...EXPORTS_V1]);
    expect(r.abi2).toBe(false);
    expect(r.erros).toEqual([]);
  });
});
