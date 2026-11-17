import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import type { TexturaItem } from '@hestia/io';
import {
  aplicarTexturaNoMaterial,
  categoriasDistintas,
  COR_NEUTRA_TEXTURA,
  criarMaterialDaTextura,
  filtrarTexturas,
  LOTE_TEXTURAS,
  megabytes,
  ordenarTexturas,
  paginar,
  podeAplicarTextura,
  rotuloCategoria,
  texturaDaCatalogo,
  texturaEhAtual,
} from './texturasLogic.ts';

function item(id: string, categoria: string, nome = id.replace(/(\d+)$/, ' $1')): TexturaItem {
  return { id, nome, categoria, bytes: 2 * 1024 * 1024, mapas: { cor: `textures/${id}/Color.jpg` } };
}

const CATALOGO: TexturaItem[] = [
  item('Bricks003', 'Bricks'),
  item('Bricks010', 'Bricks'),
  item('Bricks002', 'Bricks'),
  item('Wood012', 'Wood'),
  item('Onyx001', 'Onyx'),
  item('WoodFloor005', 'WoodFloor'),
];

describe('filtrarTexturas', () => {
  it('sem busca nem categoria devolve tudo, na ordem recebida', () => {
    expect(filtrarTexturas(CATALOGO, { busca: '', categoria: null }).map((i) => i.id)).toEqual(CATALOGO.map((i) => i.id));
  });

  it('busca pelo nome, ignorando maiúsculas e espaços ao redor', () => {
    expect(filtrarTexturas(CATALOGO, { busca: '  BRICKS 010 ', categoria: null }).map((i) => i.id)).toEqual(['Bricks010']);
  });

  it('busca também pelo id (sem o espaço do nome)', () => {
    expect(filtrarTexturas(CATALOGO, { busca: 'wood012', categoria: null }).map((i) => i.id)).toEqual(['Wood012']);
  });

  it('ignora acentos: "onix" acha "Ônix"', () => {
    const onix = [{ ...item('Onyx001', 'Onyx'), nome: 'Ônix 001' }];
    expect(filtrarTexturas(onix, { busca: 'onix', categoria: null })).toHaveLength(1);
  });

  it('filtra por categoria exata (Wood não traz WoodFloor)', () => {
    expect(filtrarTexturas(CATALOGO, { busca: '', categoria: 'Wood' }).map((i) => i.id)).toEqual(['Wood012']);
  });

  it('combina busca e categoria', () => {
    expect(filtrarTexturas(CATALOGO, { busca: '010', categoria: 'Bricks' }).map((i) => i.id)).toEqual(['Bricks010']);
    expect(filtrarTexturas(CATALOGO, { busca: '010', categoria: 'Wood' })).toEqual([]);
  });

  it('busca sem resultado devolve lista vazia', () => {
    expect(filtrarTexturas(CATALOGO, { busca: 'inexistente', categoria: null })).toEqual([]);
  });
});

describe('ordenarTexturas', () => {
  it('ordena por categoria e depois por nome com números em ordem natural', () => {
    const ids = ordenarTexturas(CATALOGO).map((i) => i.id);
    expect(ids).toEqual(['Bricks002', 'Bricks003', 'Bricks010', 'Onyx001', 'Wood012', 'WoodFloor005']);
  });

  it('não altera a lista recebida', () => {
    const copia = [...CATALOGO];
    ordenarTexturas(CATALOGO);
    expect(CATALOGO).toEqual(copia);
  });
});

describe('categoriasDistintas e rotuloCategoria', () => {
  it('lista categorias distintas em ordem alfabética', () => {
    expect(categoriasDistintas(CATALOGO)).toEqual(['Bricks', 'Onyx', 'Wood', 'WoodFloor']);
  });

  it('rótulo em português para pt e em inglês para os demais idiomas', () => {
    expect(rotuloCategoria('Tiles', 'pt')).toBe('Ladrilhos/Revestimentos');
    expect(rotuloCategoria('Onyx', 'pt')).toBe('Ônix');
    expect(rotuloCategoria('Tiles', 'en')).toBe('Tiles');
    expect(rotuloCategoria('Wood', 'es')).toBe('Wood');
  });

  it('categoria desconhecida mostra o próprio id', () => {
    expect(rotuloCategoria('Holografica', 'pt')).toBe('Holografica');
  });
});

describe('paginar', () => {
  const muitos = Array.from({ length: 150 }, (_, i) => i);

  it('mostra o primeiro lote e conta o que ficou de fora', () => {
    const p = paginar(muitos, LOTE_TEXTURAS);
    expect(LOTE_TEXTURAS).toBe(60);
    expect(p.visiveis).toHaveLength(60);
    expect(p.visiveis[0]).toBe(0);
    expect(p.restantes).toBe(90);
  });

  it('limite maior que a lista mostra tudo e não sobra nada', () => {
    expect(paginar(muitos, 1000)).toEqual({ visiveis: muitos, restantes: 0 });
  });

  it('limite zero ou negativo não mostra nada, e fracionário é arredondado para baixo', () => {
    expect(paginar(muitos, 0)).toEqual({ visiveis: [], restantes: 150 });
    expect(paginar(muitos, -5)).toEqual({ visiveis: [], restantes: 150 });
    expect(paginar(muitos, 2.9).visiveis).toHaveLength(2);
  });
});

describe('megabytes', () => {
  it('converte bytes em MB binários', () => {
    expect(megabytes(1024 * 1024)).toBe(1);
    expect(megabytes(0)).toBe(0);
  });
});

describe('blocos aparencia.textura', () => {
  const base: Material = {
    id: 'mat_1',
    name: 'Tijolo',
    color: '#aa0000',
    hatch: 'diagonal',
    gloss: 0.6,
    opacity: 0.8,
    cost: 12,
    unit: 'm2',
    identidade: { fabricante: 'Fabrica X' },
    aparencia: { cor: '#123456', rugosidade: 0.3 },
  };

  it('bloco de textura do catálogo: imagemId com prefixo catalogo: e valores padrão', () => {
    expect(texturaDaCatalogo('Bricks003')).toEqual({
      imagemId: 'catalogo:Bricks003',
      escalaMetros: 1,
      rotacao: 0,
      deslocamento: [0, 0],
      repetir: true,
    });
  });

  it('criar material: nome da textura, cor neutra, padrões do gerenciador e a textura', () => {
    const m = criarMaterialDaTextura(item('Bricks003', 'Bricks'), 'mat_novo');
    expect(m).toEqual({
      id: 'mat_novo',
      name: 'Bricks 003',
      color: COR_NEUTRA_TEXTURA,
      hatch: 'none',
      gloss: 0.2,
      opacity: 1,
      cost: 0,
      unit: 'm2',
      aparencia: { textura: texturaDaCatalogo('Bricks003') },
    });
    expect(COR_NEUTRA_TEXTURA).toBe('#b9a98f');
  });

  it('aplicar: troca só aparencia.textura e preserva o resto do material', () => {
    const antes = JSON.parse(JSON.stringify(base));
    const m = aplicarTexturaNoMaterial(base, item('Wood012', 'Wood'));
    expect(m.aparencia).toEqual({ cor: '#123456', rugosidade: 0.3, textura: texturaDaCatalogo('Wood012') });
    expect(m.identidade).toEqual(base.identidade);
    expect(m.color).toBe(base.color);
    expect(m.name).toBe(base.name);
    expect(base).toEqual(antes);
  });

  it('aplicar a um material sem aparência cria o bloco', () => {
    const { aparencia: _a, ...sem } = base;
    expect(aplicarTexturaNoMaterial(sem as Material, item('Onyx001', 'Onyx')).aparencia).toEqual({ textura: texturaDaCatalogo('Onyx001') });
  });

  it('"Aplicar" fica desabilitado sem material selecionado', () => {
    expect(podeAplicarTextura(undefined, item('Bricks003', 'Bricks'))).toBe(false);
  });

  it('"Aplicar" fica desabilitado sem textura escolhida, e habilitado com material e textura', () => {
    expect(podeAplicarTextura(base, null)).toBe(false);
    expect(podeAplicarTextura(base, item('Bricks003', 'Bricks'))).toBe(true);
  });

  it('selo "textura atual": só quando o material selecionado já usa aquela textura do catálogo', () => {
    const b = item('Bricks003', 'Bricks');
    const com = aplicarTexturaNoMaterial(base, b);
    expect(texturaEhAtual(com, b)).toBe(true);
    expect(texturaEhAtual(com, item('Wood012', 'Wood'))).toBe(false);
    expect(texturaEhAtual(base, b)).toBe(false);
    expect(texturaEhAtual(undefined, b)).toBe(false);
    expect(texturaEhAtual(com, null)).toBe(false);
  });
});
