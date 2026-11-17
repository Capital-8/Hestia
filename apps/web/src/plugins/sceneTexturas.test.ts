import { describe, expect, it } from 'vitest';
import { montarCatalogo } from '@hestia/io';
import type { Material } from '@hestia/model';
import { texturasDoMaterial } from './sceneTexturas.ts';

const catalogo = montarCatalogo([
  { key: 'textures/Bricks003/Color.jpg', size: 1, etag: 'c1' },
  { key: 'textures/Bricks003/NormalDX.jpg', size: 1, etag: 'n1' },
]);
const base: Material = { id: 'm1', name: 'M', color: '#b9a98f', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' };
const comTextura = (imagemId: string): Material => ({ ...base, aparencia: { textura: { imagemId, escalaMetros: 0.5, rotacao: 90, deslocamento: [0.1, 0.2], repetir: true } } });

describe('texturas do material para o contrato de cena', () => {
  it('textura do catálogo vira slots, mapeamento em metros e SceneTexture com hash', () => {
    const r = texturasDoMaterial(comTextura('catalogo:Bricks003'), catalogo, 'https://x.dev')!;
    expect(r.campos.textures).toEqual([{ slot: 'color', textureId: 'Bricks003:color' }, { slot: 'normal', textureId: 'Bricks003:normal' }]);
    expect(r.campos.textureMapping).toEqual({ scaleMeters: 0.5, rotationDeg: 90, offsetMeters: [0.1, 0.2], repeat: true });
    expect(r.texturas).toEqual([
      { id: 'Bricks003:color', mime: 'image/jpeg', hash: 'c1', uri: 'https://x.dev/textures/Bricks003/Color.jpg' },
      { id: 'Bricks003:normal', mime: 'image/jpeg', hash: 'n1', uri: 'https://x.dev/textures/Bricks003/NormalDX.jpg' },
    ]);
  });
  it('sem textura, catálogo ainda não baixado, id fora do catálogo ou id de outro tipo: null', () => {
    expect(texturasDoMaterial(base, catalogo, 'https://x.dev')).toBeNull();
    expect(texturasDoMaterial(comTextura('catalogo:Bricks003'), null, 'https://x.dev')).toBeNull();
    expect(texturasDoMaterial(comTextura('catalogo:Nada999'), catalogo, 'https://x.dev')).toBeNull();
    expect(texturasDoMaterial(comTextura('zip:abc'), catalogo, 'https://x.dev')).toBeNull();
  });
});
