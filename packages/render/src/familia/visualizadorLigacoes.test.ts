import type { LigacaoResolvida } from '@hestia/engine';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { corDoDominio } from './corDoDominio.ts';
import { LigacoesNaCena, MINIMO_MARCA_LIGACAO, marcadorDaLigacao } from './visualizadorLigacoes.ts';

/** Ligação resolvida mínima (medidas em metros) para os testes; `extra` sobrescreve. */
const ligacao = (extra: Partial<LigacaoResolvida> = {}): LigacaoResolvida => ({
  id: 'lig1',
  nome: 'Água fria 1',
  dominio: 'agua_fria',
  sistema: null,
  secao: 'redonda',
  posicao: [0.1, 0.2, 0.3],
  direcao: [0, 0, 1],
  diametro: 0.02,
  largura: 0,
  altura: 0,
  fluxo: 'ambos',
  aceita: ['agua_fria'],
  propriedades: {},
  propagaParametro: null,
  ...extra,
});

describe('marcadorDaLigacao', () => {
  it('redonda vira disco com raio igual à metade do diâmetro', () => {
    expect(marcadorDaLigacao(ligacao({ diametro: 0.05 }))).toEqual({ forma: 'disco', raio: 0.025, largura: 0, altura: 0 });
  });

  it('retangular vira placa com a largura e a altura resolvidas', () => {
    const m = marcadorDaLigacao(ligacao({ secao: 'retangular', diametro: 0, largura: 0.1, altura: 0.05 }));
    expect(m).toEqual({ forma: 'placa', raio: 0, largura: 0.1, altura: 0.05 });
  });

  it('medida zero vira o piso, para a ligação continuar visível', () => {
    const m = marcadorDaLigacao(ligacao({ diametro: 0 }));
    expect(m.raio).toBe(MINIMO_MARCA_LIGACAO);
  });
});

describe('LigacoesNaCena', () => {
  it('uma cena por ligação, vazia quando a lista é vazia', () => {
    const cena = new LigacoesNaCena();
    expect(cena.definir([ligacao(), ligacao({ id: 'lig2', dominio: 'gas' })], null)).toBe(2);
    expect(cena.quantidade()).toBe(2);
    expect(cena.grupo.children).toHaveLength(2);
    expect(cena.definir([], null)).toBe(0);
    expect(cena.grupo.children).toHaveLength(0);
  });

  it('a cor do marcador é a do domínio e só a ligação selecionada tem brilho', () => {
    const cena = new LigacoesNaCena();
    cena.definir([ligacao({ id: 'a' }), ligacao({ id: 'b', dominio: 'gas' })], 'b');
    const marcas = cena.grupo.children.map((g) => g.children.find((c) => c.name.startsWith('marca')));
    const [marcaA, marcaB] = marcas as [THREE.Mesh, THREE.Mesh];
    const materialA = marcaA.material as THREE.MeshStandardMaterial;
    const materialB = marcaB.material as THREE.MeshStandardMaterial;
    expect(materialB.color.getHex()).toBe(corDoDominio('gas'));
    expect(materialA.emissiveIntensity).toBe(0);
    expect(materialB.emissiveIntensity).toBeGreaterThan(0);
    cena.realcar(null);
    expect(materialB.emissiveIntensity).toBe(0);
  });

  it('a seta nasce na posição da ligação', () => {
    const cena = new LigacoesNaCena();
    cena.definir([ligacao({ direcao: [1, 0, 0], posicao: [0.5, 0, 0] })], null);
    const grupo = cena.grupo.children[0]!;
    expect(grupo.position.toArray()).toEqual([0.5, 0, 0]);
    expect(grupo.children.some((c) => c.name === 'seta lig1')).toBe(true);
  });
});
