import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FamiliaCatalogoMep } from './FamiliaCatalogoMep.tsx';

/*
 * Diálogo "Catálogos de tubos e conexões" (ficha P3), renderizado no servidor: mostra o catálogo da Krona (somente leitura, sem campo
 * de edição), a tabela do primeiro item com as cotas e a legenda, o aviso de que a transcrição é automática e as três fontes.
 */

describe('diálogo Catálogos de tubos e conexões', () => {
  const html = renderToStaticMarkup(createElement(FamiliaCatalogoMep));

  it('mostra as três fontes e o aviso de transcrição automática, somente leitura', () => {
    expect(html).toContain('Krona — esgoto');
    expect(html).toContain('Krona — água fria soldável');
    expect(html).toContain('Meus catálogos');
    expect(html).toContain('Transcrição automática');
    expect(html).toContain('Somente leitura');
  });
  it('mostra a tabela do primeiro item (tubo 6 m) com as cotas reais e a legenda das letras', () => {
    expect(html).toContain('Tubo de PVC Esgoto Primário 6m');
    expect(html).toContain('101.6');
    expect(html).toContain('0103');
    expect(html).toContain('profundidade da bolsa');
    expect(html).toContain('CONFERIR');
  });
  it('no catálogo do fabricante não há campo de edição de célula nem excluir item', () => {
    expect(html).not.toContain('aria-label="100 B"');
    expect(html).not.toContain('Excluir item');
    expect(html).toContain('Copiar para Meus catálogos');
    expect(html).toContain('Exportar CSV');
  });
  it('avisa que as famílias do fabricante já estão na biblioteca', () => {
    expect(html).toContain('já estão em Novo módulo');
  });
});
