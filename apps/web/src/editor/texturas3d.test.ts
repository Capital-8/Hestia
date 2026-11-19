import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { montarCatalogo } from '@hestia/io';
import { TexturasApp3D } from './texturas3d.ts';
import * as online from './texturasOnline.ts';

const catalogo = montarCatalogo([
  { key: 'textures/A1/Color.jpg', size: 1, etag: 'c' },
  { key: 'textures/A1/NormalDX.jpg', size: 1 },
]);
const espera = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('provedor de texturas do 3D', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('baixa só quando pedido, uma vez, e sobe a versão ao completar', async () => {
    vi.spyOn(online, 'catalogoEmCache').mockReturnValue(catalogo);
    const pedidos: string[] = [];
    const p = new TexturasApp3D(async (uri) => { pedidos.push(uri); return new THREE.Texture(); });
    let avisos = 0;
    p.aoMudar(() => avisos++);
    expect(pedidos).toEqual([]);
    expect(p.obter('catalogo:A1')).toBeUndefined();
    expect(p.obter('catalogo:A1')).toBeUndefined();
    await espera(); await espera();
    expect(pedidos.length).toBe(2);
    expect(p.versao).toBe(1);
    expect(avisos).toBe(1);
    const m = p.obter('catalogo:A1')!;
    expect(m.cor?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(m.normal?.colorSpace).toBe(THREE.NoColorSpace);
    expect(m.cor?.wrapS).toBe(THREE.RepeatWrapping);
    expect(pedidos.length).toBe(2);
  });
  it('falha de rede não derruba: fica sem textura e não tenta de novo em laço', async () => {
    vi.spyOn(online, 'catalogoEmCache').mockReturnValue(catalogo);
    let n = 0;
    const p = new TexturasApp3D(async () => { n++; throw new Error('rede'); });
    p.obter('catalogo:A1');
    await espera(); await espera();
    expect(p.obter('catalogo:A1')).toBeUndefined();
    expect(p.versao).toBe(0);
    expect(n).toBe(2);
  });
  it('id fora do catálogo ou de outro tipo não baixa nada', async () => {
    vi.spyOn(online, 'catalogoEmCache').mockReturnValue(catalogo);
    let n = 0;
    const p = new TexturasApp3D(async () => { n++; return new THREE.Texture(); });
    expect(p.obter('catalogo:Nada')).toBeUndefined();
    expect(p.obter('zip:x')).toBeUndefined();
    await espera();
    expect(n).toBe(0);
  });
  it('carrega textura básica local uma única vez, configura sRGB/RepeatWrapping e dispara aoMudar', async () => {
    const pedidos: string[] = [];
    const p = new TexturasApp3D(async (uri) => { pedidos.push(uri); return new THREE.Texture(); });
    let avisos = 0;
    p.aoMudar(() => avisos++);
    expect(p.obter('basica:Bricks051')).toBeUndefined();
    expect(p.obter('basica:Bricks051')).toBeUndefined();
    await espera(); await espera();
    expect(pedidos).toEqual(['/texturas-basicas/Bricks051.webp']);
    expect(p.versao).toBe(1);
    expect(avisos).toBe(1);
    const m = p.obter('basica:Bricks051')!;
    expect(m.cor?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(m.cor?.wrapS).toBe(THREE.RepeatWrapping);
    expect(m.cor?.wrapT).toBe(THREE.RepeatWrapping);
    expect(pedidos.length).toBe(1);
  });
});
