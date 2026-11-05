import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RenderAsset } from '../../editor/renderGallery.ts';
import {
  extensaoPadrao,
  filtrarRenders,
  formatarData,
  formatarDuracao,
  formatarResolucao,
  nomeDoArquivo,
  RenderGalleryDialog,
} from './RenderGalleryDialog.tsx';

const asset = (over: Partial<RenderAsset> = {}): RenderAsset => ({
  id: 'r1',
  projectName: 'Casa',
  kind: 'image',
  name: 'perspectiva',
  createdAt: new Date(2026, 0, 2, 14, 5).getTime(),
  width: 1920,
  height: 1080,
  mime: 'image/png',
  ...over,
});

describe('galeria: nome do arquivo para download', () => {
  it('preserva a extensão que veio no nome salvo', () => {
    expect(nomeDoArquivo(asset({ name: 'casa-final.png' }))).toBe('casa-final.png');
    expect(nomeDoArquivo(asset({ kind: 'video', name: 'tour.mp4', mime: 'video/mp4' }))).toBe('tour.mp4');
  });

  it('completa a extensão pelo MIME quando o nome não tem uma', () => {
    expect(nomeDoArquivo(asset({ name: 'perspectiva' }))).toBe('perspectiva.png');
    expect(nomeDoArquivo(asset({ kind: 'video', name: 'tour', mime: 'video/webm' }))).toBe('tour.webm');
    expect(nomeDoArquivo(asset({ kind: 'video', name: 'tour', mime: 'video/mp4; codecs=avc1' }))).toBe('tour.mp4');
  });

  it('escolhe uma extensão de reserva coerente com o tipo', () => {
    expect(extensaoPadrao(asset({ mime: 'application/octet-stream' }))).toBe('.png');
    expect(extensaoPadrao(asset({ kind: 'video', mime: 'application/octet-stream' }))).toBe('.mp4');
    expect(nomeDoArquivo(asset({ name: '   ' }))).toBe('render.png');
  });
});

describe('galeria: metadados do cartão', () => {
  it('mostra data e hora locais em dd/mm/aaaa hh:mm', () => {
    expect(formatarData(asset().createdAt)).toBe('02/01/2026 14:05');
    expect(formatarData(0)).toBe('—');
    expect(formatarData(Number.NaN)).toBe('—');
  });

  it('mostra a duração em m:ss e não inventa medida quando falta', () => {
    expect(formatarDuracao(5)).toBe('0:05');
    expect(formatarDuracao(65.4)).toBe('1:05');
    expect(formatarDuracao(3725)).toBe('1:02:05');
    expect(formatarDuracao(undefined)).toBe('—');
    expect(formatarDuracao(-1)).toBe('—');
  });

  it('mostra a resolução e protege contra valores inválidos', () => {
    expect(formatarResolucao(asset())).toBe('1920×1080');
    expect(formatarResolucao(asset({ width: 0 }))).toBe('—');
    expect(formatarResolucao(asset({ height: Number.NaN }))).toBe('—');
  });
});

describe('galeria: filtro por tipo', () => {
  const lista = [
    asset({ id: 'a' }),
    asset({ id: 'b', kind: 'video', name: 'tour', mime: 'video/mp4' }),
    asset({ id: 'c' }),
  ];

  it('todos devolve a lista inteira', () => {
    expect(filtrarRenders(lista, 'todos').map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('separa imagens e vídeos', () => {
    expect(filtrarRenders(lista, 'image').map((i) => i.id)).toEqual(['a', 'c']);
    expect(filtrarRenders(lista, 'video').map((i) => i.id)).toEqual(['b']);
  });

  it('não altera a lista original', () => {
    const copia = filtrarRenders(lista, 'todos');
    copia.pop();
    expect(lista).toHaveLength(3);
  });
});

describe('galeria: renderização do diálogo', () => {
  it('monta o estado inicial sem DOM e avisa que o IndexedDB não está disponível', () => {
    const html = renderToStaticMarkup(createElement(RenderGalleryDialog));
    expect(html).toContain('Galeria de renderização');
    expect(html).toContain('Carregando galeria…');
    expect(html).toContain('IndexedDB');
    expect(html).toContain('rg-toolbar');
  });
});

describe('galeria: folha de estilo', () => {
  const css = readFileSync(new URL('./renderGallery.css', import.meta.url), 'utf8');

  it('usa as variáveis do tema, sem cores literais', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
  });

  it('define as classes da grade com o prefixo rg-', () => {
    expect(css).toContain('.rg-grid');
    expect(css).toContain('.rg-card');
    expect(css).toContain('.rg-thumb');
    expect(css).toContain('.rg-acoes');
  });
});
