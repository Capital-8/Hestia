import { describe, expect, it } from 'vitest';
import { categoriaDaTextura, mapasDaTextura, montarCatalogo, nomeDaTextura, nomeDoAtlas, posicaoIcone, urlTextura, validarCatalogo } from './texturasCatalogo.ts';

describe('catálogo de texturas online', () => {
  it('deriva categoria e nome legível do id da pasta', () => {
    expect(categoriaDaTextura('Bricks003')).toBe('Bricks');
    expect(categoriaDaTextura('Asphalt020L')).toBe('Asphalt');
    expect(categoriaDaTextura('WoodSiding012')).toBe('WoodSiding');
    expect(categoriaDaTextura('Sozinha')).toBe('Sozinha');
    expect(nomeDaTextura('Bricks003')).toBe('Bricks 003');
    expect(nomeDaTextura('WoodFloor012')).toBe('Wood Floor 012');
    expect(nomeDaTextura('Asphalt020L')).toBe('Asphalt 020L');
  });

  const chaves = [
    { key: 'textures/Bricks003/Color.jpg', size: 100 },
    { key: 'textures/Bricks003/NormalDX.jpg', size: 200 },
    { key: 'textures/Bricks003/Roughness.jpg', size: 50 },
    { key: 'textures/Asphalt015/Color.jpg', size: 10 },
    { key: 'textures/Tiles002/NormalDX.jpg', size: 5 }, // sem Color: fora
    { key: 'textures/_catalogo/miniaturas.jpg', size: 999 }, // pasta do catálogo: fora
    { key: 'textures/solto.jpg', size: 1 }, // fora do padrão: fora
    { key: 'shares/x/y.jpg', size: 1 },
    { key: 'textures/Bricks003/Leia.txt', size: 1 }, // arquivo desconhecido: fora
  ];

  it('monta o catálogo só com texturas que têm mapa de cor, ordenado e com a soma de bytes', () => {
    const c = montarCatalogo(chaves, { gerado: '2026-01-01T00:00:00.000Z' });
    expect(c.itens.map((i) => i.id)).toEqual(['Asphalt015', 'Bricks003']);
    const b = c.itens[1]!;
    expect(b).toMatchObject({ nome: 'Bricks 003', categoria: 'Bricks', bytes: 350 });
    expect(b.mapas).toEqual({ cor: 'textures/Bricks003/Color.jpg', normal: 'textures/Bricks003/NormalDX.jpg', rugosidade: 'textures/Bricks003/Roughness.jpg' });
    expect(c.itens[0]!.mapas.normal).toBeUndefined();
  });

  it('numera os ícones na ordem do catálogo quando há atlas', () => {
    const c = montarCatalogo(chaves, { miniaturas: { arquivo: 'textures/_catalogo/miniaturas.jpg', lado: 96, colunas: 4 } });
    expect(c.itens.map((i) => i.icone)).toEqual([0, 1]);
    expect(posicaoIcone(c.miniaturas!, 5)).toEqual({ x: 96, y: 96 });
  });

  it('une base e caminho sem barras duplicadas', () => {
    expect(urlTextura('https://x.dev/', '/textures/a.jpg')).toBe('https://x.dev/textures/a.jpg');
    expect(urlTextura('https://x.dev', 'textures/a.jpg')).toBe('https://x.dev/textures/a.jpg');
    expect(urlTextura('https://x.dev', 'https://y.io/m.abc.jpg')).toBe('https://y.io/m.abc.jpg');
    expect(nomeDoAtlas('9f2c')).toBe('miniaturas.9f2c.jpg');
  });

  it('valida o JSON baixado: ida e volta, descarta itens ruins e recusa versão errada', () => {
    const c = montarCatalogo(chaves, { miniaturas: { arquivo: 'm.jpg', lado: 96, colunas: 4 } });
    expect(validarCatalogo(JSON.parse(JSON.stringify(c)))).toEqual({ ...c });
    expect(validarCatalogo({ ...c, versao: 99 })).toBeNull();
    expect(validarCatalogo(null)).toBeNull();
    const sujo = { ...c, itens: [...c.itens, { id: 1 }, null, { id: 'X', nome: 'X', categoria: 'X', mapas: {} }] };
    expect(validarCatalogo(sujo)!.itens).toHaveLength(2);
  });

  it('guarda o ETag de cada mapa como hash e o valida ao ler', () => {
    const cat = montarCatalogo([
      { key: 'textures/Bricks003/Color.jpg', size: 100, etag: 'aaa' },
      { key: 'textures/Bricks003/NormalDX.jpg', size: 200, etag: 'bbb' },
      { key: 'textures/Bricks003/Roughness.jpg', size: 50 },
    ]);
    expect(cat.itens[0]!.hashes).toEqual({ cor: 'aaa', normal: 'bbb' });
    const lido = validarCatalogo(JSON.parse(JSON.stringify(cat)));
    expect(lido!.itens[0]!.hashes).toEqual({ cor: 'aaa', normal: 'bbb' });
    const sujo = validarCatalogo({ versao: 1, itens: [{ id: 'A1', nome: 'A 1', categoria: 'A', bytes: 1, mapas: { cor: 'textures/A1/Color.jpg' }, hashes: { cor: 5, normal: '' } }] });
    expect(sujo!.itens[0]!.hashes).toBeUndefined();
  });

  it('mapasDaTextura entrega slots, URLs absolutas e hash (ETag, ou o caminho sem ele)', () => {
    const cat = montarCatalogo([
      { key: 'textures/Bricks003/Color.jpg', size: 1, etag: 'aaa' },
      { key: 'textures/Bricks003/Roughness.jpg', size: 1 },
    ]);
    const m = mapasDaTextura(cat.itens[0]!, 'https://x.dev/');
    expect(m).toEqual([
      { slot: 'color', textureId: 'Bricks003:color', caminho: 'textures/Bricks003/Color.jpg', uri: 'https://x.dev/textures/Bricks003/Color.jpg', mime: 'image/jpeg', hash: 'aaa' },
      { slot: 'roughness', textureId: 'Bricks003:roughness', caminho: 'textures/Bricks003/Roughness.jpg', uri: 'https://x.dev/textures/Bricks003/Roughness.jpg', mime: 'image/jpeg', hash: 'textures/Bricks003/Roughness.jpg' },
    ]);
  });
});
