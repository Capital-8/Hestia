import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KRONA_ESGOTO } from '@hestia/model';
import { FamiliaCatalogoMep } from './FamiliaCatalogoMep.tsx';
import { PainelConferencia } from './FamiliaCatalogoMepConferencia.tsx';

/*
 * Conferência linha a linha no diálogo (ficha P3, fase 2), renderizada no servidor: a coluna "Conferida" com uma caixa por linha,
 * o progresso "N de M linhas conferidas", o selo do item e o link para a página do PDF. Sem navegador: nenhuma conferência
 * guardada aparece (o servidor não tem localStorage), então o estado inicial é 0 de 5.
 */

describe('diálogo: coluna Conferida, progresso e link do PDF', () => {
  const html = renderToStaticMarkup(createElement(FamiliaCatalogoMep));

  it('tem a coluna Conferida e uma caixa por linha do primeiro item (tubo 6 m, cinco bitolas)', () => {
    expect(html).toContain('<th>Conferida</th>');
    for (const b of ['50', '75', '100', '150', '200']) expect(html).toContain(`aria-label="Conferida ${b}"`);
  });
  it('mostra o progresso do item e o selo CONFERIR', () => {
    expect(html).toContain('0 de 5 linhas conferidas');
    expect(html).toContain('CONFERIR');
  });
  it('mostra o link para a página do PDF e a fonte (documento, edição e SHA-256 curto)', () => {
    const url = KRONA_ESGOTO.fonte.url ?? '';
    expect(html).toContain(`href="${url}#page=10"`);
    expect(html).toContain('Abrir o PDF na página 10');
    expect(html).toContain(`SHA-256 ${(KRONA_ESGOTO.fonte.sha256 ?? '').slice(0, 12)}`);
  });
  it('tem o nome de quem confere, marcar todas as linhas e exportar conferências (sem confirm)', () => {
    expect(html).toContain('aria-label="Conferido por"');
    expect(html).toContain('Marcar todas as linhas');
    expect(html).toContain('Exportar conferências');
  });
});

describe('painel de conferência', () => {
  const tubo = KRONA_ESGOTO.itens[0];
  if (!tubo) throw new Error('item de referência ausente');
  const base = { item: tubo, ignoradas: 0, conferente: 'Fulana', confirmando: false, onConferente: () => undefined, onPedirTodas: () => undefined, onConfirmarTodas: () => undefined, onCancelarTodas: () => undefined, onExportar: () => undefined };

  it('item conferido mostra "conferido por X em AAAA-MM-DD" e o selo conferido', () => {
    const html = renderToStaticMarkup(createElement(PainelConferencia, { ...base, item: { ...tubo, estado: 'conferido', conferidoPor: 'Fulana', conferidoEm: '2026-11-25' } }));
    expect(html).toContain('conferido por Fulana em 2026-11-25');
    expect(html).toContain('fam-cmep-selo ok');
  });
  it('a confirmação de "Marcar todas" aparece dentro da página, com nome e data', () => {
    const html = renderToStaticMarkup(createElement(PainelConferencia, { ...base, confirmando: true }));
    expect(html).toContain('aria-label="Confirmar conferência de todas as linhas"');
    expect(html).toContain('como conferidas por Fulana em');
  });
  it('aviso de conferência ignorada por troca da fonte aparece', () => {
    const html = renderToStaticMarkup(createElement(PainelConferencia, { ...base, ignoradas: 2 }));
    expect(html).toContain('2 item(ns) deste catálogo');
    expect(html).toContain('SHA-256 diferente');
  });
  it('em Meus catálogos (sem fonte) não há link para PDF', () => {
    const html = renderToStaticMarkup(createElement(PainelConferencia, { ...base, item: { ...tubo, pagina: undefined } }));
    expect(html).not.toContain('Abrir o PDF');
    expect(html).toContain('Dados seus');
  });
});
