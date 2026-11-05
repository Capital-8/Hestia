import { describe, expect, it } from 'vitest';
import { MAX_NOME_PASTA, nomeDePasta, nomeDePastaUnico, nomeDoProjeto } from './nomes.ts';
import { comProjeto, indiceVazio, lerIndice, MAX_MINIATURA, mesclarDescobertos, miniaturaValida, ordenarProjetos, semProjeto, serializarIndice } from './indice.ts';
import type { ProjetoDaBiblioteca } from './tipos.ts';

const MINI = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const projeto = (pasta: string, extra: Partial<ProjetoDaBiblioteca> = {}): ProjetoDaBiblioteca => ({
  pasta,
  nome: pasta,
  modificadoEm: '2026-11-05T10:00:00.000Z',
  miniatura: null,
  ...extra,
});

describe('nome da pasta do projeto', () => {
  it('troca os caracteres proibidos no Windows e apara sobras', () => {
    expect(nomeDePasta('Casa: 2 quartos / térreo?')).toBe('Casa 2 quartos térreo');
    expect(nomeDePasta('  obra  ')).toBe('obra');
  });

  it('tira ponto e espaço do fim (o Windows os descarta e a pasta fica "invisível")', () => {
    expect(nomeDePasta('Projeto final. ')).toBe('Projeto final');
  });

  it('nome vazio ou só inválido cai em "Projeto"', () => {
    expect(nomeDePasta('')).toBe('Projeto');
    expect(nomeDePasta('   ')).toBe('Projeto');
    expect(nomeDePasta('///')).toBe('Projeto');
  });

  it('escapa nomes reservados do Windows', () => {
    expect(nomeDePasta('CON')).toBe('_CON');
    expect(nomeDePasta('nul.txt')).toBe('_nul.txt');
    expect(nomeDePasta('CONDOMINIO')).toBe('CONDOMINIO');
  });

  it('limita o tamanho do nome', () => {
    expect(nomeDePasta('a'.repeat(200)).length).toBeLessThanOrEqual(MAX_NOME_PASTA);
  });

  it('evita repetir pasta, sem diferenciar maiúsculas', () => {
    expect(nomeDePastaUnico('Casa', [])).toBe('Casa');
    expect(nomeDePastaUnico('Casa', ['Casa'])).toBe('Casa (2)');
    expect(nomeDePastaUnico('casa', ['CASA', 'Casa (2)'])).toBe('casa (3)');
  });

  it('nome do projeto a partir da pasta descarta o sufixo de cópia', () => {
    expect(nomeDoProjeto('Casa (2)')).toBe('Casa');
    expect(nomeDoProjeto('Casa')).toBe('Casa');
  });
});

describe('miniatura', () => {
  it('aceita só data URL de imagem e dentro do limite', () => {
    expect(miniaturaValida(MINI)).toBe(MINI);
    expect(miniaturaValida('https://exemplo/imagem.png')).toBeNull();
    expect(miniaturaValida('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(miniaturaValida(`data:image/png;base64,${'A'.repeat(MAX_MINIATURA)}`)).toBeNull();
    expect(miniaturaValida(42)).toBeNull();
  });
});

describe('índice da biblioteca', () => {
  it('arquivo corrompido ou estranho devolve índice vazio em vez de quebrar', () => {
    expect(lerIndice('{{{', '/pasta').projetos).toEqual([]);
    expect(lerIndice('null', '/pasta').projetos).toEqual([]);
    expect(lerIndice('{"projetos": "nada"}', '/pasta').projetos).toEqual([]);
  });

  it('descarta entradas sem pasta válida, repetidas ou com miniatura suspeita', () => {
    const texto = JSON.stringify({
      versao: 1,
      raiz: '/pasta',
      projetos: [
        { pasta: 'Casa', nome: 'Casa', modificadoEm: '2026-01-01T00:00:00.000Z', miniatura: MINI },
        { pasta: 'casa', nome: 'Repetida', modificadoEm: '2026-02-01T00:00:00.000Z' },
        { pasta: '../fora', nome: 'Fuga', modificadoEm: '2026-03-01T00:00:00.000Z' },
        { pasta: 'Obra', nome: 'Obra', modificadoEm: 'data ruim', miniatura: 'https://x/y.png' },
        { nome: 'Sem pasta' },
      ],
    });
    const indice = lerIndice(texto, '/pasta');
    expect(indice.projetos.map((p) => p.pasta)).toEqual(['Casa', 'Obra']);
    expect(indice.projetos[0]!.miniatura).toBe(MINI);
    expect(indice.projetos[1]!.miniatura).toBeNull();
    expect(indice.projetos[1]!.modificadoEm).toBe('');
  });

  it('ordena do mais recente para o mais antigo', () => {
    const lista = ordenarProjetos([
      projeto('A', { modificadoEm: '2026-01-01T00:00:00.000Z' }),
      projeto('B', { modificadoEm: '2026-03-01T00:00:00.000Z' }),
      projeto('C', { modificadoEm: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(lista.map((p) => p.pasta)).toEqual(['B', 'C', 'A']);
  });

  it('ida e volta preserva os dados e omite o tamanho quando desconhecido', () => {
    const indice = comProjeto(indiceVazio('/pasta'), projeto('Casa', { miniatura: MINI, bytes: 1234 }));
    const lido = lerIndice(serializarIndice(indice), '/pasta');
    expect(lido.projetos).toEqual(indice.projetos);
    expect(serializarIndice(comProjeto(indiceVazio('/p'), projeto('X')))).not.toContain('bytes');
  });

  it('substitui a entrada da mesma pasta e remove por pasta', () => {
    let indice = comProjeto(indiceVazio('/p'), projeto('Casa', { nome: 'Antiga' }));
    indice = comProjeto(indice, projeto('Casa', { nome: 'Nova' }));
    expect(indice.projetos).toHaveLength(1);
    expect(indice.projetos[0]!.nome).toBe('Nova');
    expect(semProjeto(indice, 'casa').projetos).toHaveLength(0);
  });

  it('a varredura das pastas manda: o que sumiu sai, o mais novo fica e a miniatura guardada não se perde', () => {
    const guardado = comProjeto(
      comProjeto(indiceVazio('/p'), projeto('Casa', { miniatura: MINI, modificadoEm: '2026-05-01T00:00:00.000Z' })),
      projeto('Antiga'),
    );
    const achados = [projeto('Casa', { modificadoEm: '2026-05-01T00:00:00.000Z', miniatura: null })];
    const indice = mesclarDescobertos(guardado, achados);
    expect(indice.projetos.map((p) => p.pasta)).toEqual(['Casa']);
    expect(indice.projetos[0]!.miniatura).toBe(MINI);
  });
});
