import { describe, expect, it } from 'vitest';
import { categoriaDaTextura, montarCatalogo, nomeDaTextura, posicaoIcone, urlTextura, validarCatalogo } from './texturasCatalogo.ts';

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
  });

  it('valida o JSON baixado: ida e volta, descarta itens ruins e recusa versão errada', () => {
    const c = montarCatalogo(chaves, { miniaturas: { arquivo: 'm.jpg', lado: 96, colunas: 4 } });
    expect(validarCatalogo(JSON.parse(JSON.stringify(c)))).toEqual({ ...c });
    expect(validarCatalogo({ ...c, versao: 99 })).toBeNull();
    expect(validarCatalogo(null)).toBeNull();
    const sujo = { ...c, itens: [...c.itens, { id: 1 }, null, { id: 'X', nome: 'X', categoria: 'X', mapas: {} }] };
    expect(validarCatalogo(sujo)!.itens).toHaveLength(2);
  });
});
