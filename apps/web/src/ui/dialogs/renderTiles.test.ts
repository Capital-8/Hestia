import { describe, expect, it } from 'vitest';
import {
  criarLimitadorConcorrencia,
  LIMITE_BUSCA_TILE_MS,
  posicionarTiles,
  proximoTileIndice,
  TAMANHO_TILE_SERVICO,
  tilesDaImagem,
  tilesExpirados,
  tilesParaBuscar,
} from './renderTiles.ts';

const tile = (i: number, x: number, y: number, w: number, h: number) => ({ i, x, y, w, h });

/*
 * Ordem de referência para 640x360 (lado 256), calculada com dx = 2x + w - 640, dy = 2y + h - 360,
 * chave (dx² + dy², y, x):
 *   (256,0,256,256)   dx=128   dy=-104  d2=27200
 *   (256,256,256,104) dx=128   dy=256   d2=81920
 *   (0,0,256,256)     dx=-384  dy=-104  d2=158272
 *   (0,256,256,104)   dx=-384  dy=256   d2=212992
 *   (512,0,128,256)   dx=512   dy=-104  d2=272960
 *   (512,256,128,104) dx=512   dy=256   d2=327680
 */
describe('tilesDaImagem (lado 256)', () => {
  it('640x360 tem 6 tiles: 640/256 = 2,5 -> 3 colunas; 360/256 = 1,41 -> 2 linhas; 3 x 2 = 6', () => {
    expect(TAMANHO_TILE_SERVICO).toBe(256);
    const tiles = tilesDaImagem(640, 360);
    expect(tiles).toHaveLength(6);
    expect(tiles).toEqual([
      { x: 256, y: 0, w: 256, h: 256 },
      { x: 256, y: 256, w: 256, h: 104 },
      { x: 0, y: 0, w: 256, h: 256 },
      { x: 0, y: 256, w: 256, h: 104 },
      { x: 512, y: 0, w: 128, h: 256 },
      { x: 512, y: 256, w: 128, h: 104 },
    ]);
  });

  it('1000x600 cobre a área (soma = 600000) e não há sobreposição', () => {
    const tiles = tilesDaImagem(1000, 600);
    const soma = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(soma).toBe(600000);
    for (let a = 0; a < tiles.length; a++) {
      for (let b = a + 1; b < tiles.length; b++) {
        const p = tiles[a]!;
        const q = tiles[b]!;
        const separados = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        expect(separados).toBe(true);
      }
    }
  });

  it('o primeiro tile de 1000x600 é o que contém o centro (500, 300)', () => {
    const primeiro = tilesDaImagem(1000, 600)[0];
    expect(primeiro).toEqual({ x: 256, y: 256, w: 256, h: 256 });
  });

  it('a distância ao centro da imagem não decresce ao longo da lista', () => {
    const largura = 1000;
    const altura = 600;
    const tiles = tilesDaImagem(largura, altura);
    const distancias = tiles.map((t) =>
      Math.hypot(t.x + t.w / 2 - largura / 2, t.y + t.h / 2 - altura / 2),
    );
    for (let k = 1; k < distancias.length; k++) {
      expect(distancias[k]!).toBeGreaterThanOrEqual(distancias[k - 1]! - 1e-9);
    }
  });

  it('640x360 segue a ordem de referência acima', () => {
    const d2 = (t: { x: number; y: number; w: number; h: number }) => {
      const dx = 2 * t.x + t.w - 640;
      const dy = 2 * t.y + t.h - 360;
      return dx * dx + dy * dy;
    };
    expect(tilesDaImagem(640, 360).map(d2)).toEqual([27200, 81920, 158272, 212992, 272960, 327680]);
  });

  it('lado 0 ou dimensão 0 lança Error em pt-BR', () => {
    expect(() => tilesDaImagem(640, 360, 0)).toThrow('devem ser maiores que zero');
    expect(() => tilesDaImagem(0, 360)).toThrow('devem ser maiores que zero');
    expect(() => tilesDaImagem(640, 0)).toThrow('devem ser maiores que zero');
  });
});

describe('posicionarTiles (imagem 640x360, tiles de 256)', () => {
  it('converte o tile (256,0,256,256) em porcentagens corretas', () => {
    const r = posicionarTiles(640, 360, [tile(0, 256, 0, 256, 256)], 6);
    expect(r.concluidos).toHaveLength(1);
    const c = r.concluidos[0]!;
    expect(c.i).toBe(0);
    expect(c.left).toBeCloseTo(40, 6);
    expect(c.top).toBeCloseTo(0, 6);
    expect(c.width).toBeCloseTo(40, 6);
    expect(c.height).toBeCloseTo(71.1111, 3);
    expect(r.divergente).toBe(false);
  });

  it('pendentes são tilesDaImagem[k] para k de concluidos.length até total-1', () => {
    const plano = tilesDaImagem(640, 360);
    const r = posicionarTiles(640, 360, [tile(0, 256, 0, 256, 256)], 6);
    expect(r.pendentes.map((p) => p.i)).toEqual([1, 2, 3, 4, 5]);
    for (const p of r.pendentes) {
      const t = plano[p.i]!;
      expect(p.left).toBeCloseTo((t.x / 640) * 100, 6);
      expect(p.top).toBeCloseTo((t.y / 360) * 100, 6);
      expect(p.width).toBeCloseTo((t.w / 640) * 100, 6);
      expect(p.height).toBeCloseTo((t.h / 360) * 100, 6);
    }
    // Segundo pendente: (0,0) da grade, 256 px = 40% de largura.
    expect(r.pendentes[1]!.left).toBeCloseTo(0, 6);
    expect(r.pendentes[1]!.width).toBeCloseTo(40, 6);
  });

  it('com concluídos reais, a geometria do serviço é usada como veio', () => {
    const concluidos = [tile(0, 256, 0, 256, 256), tile(1, 256, 256, 256, 104)];
    const r = posicionarTiles(640, 360, concluidos, 6);
    expect(r.concluidos[1]!.top).toBeCloseTo((256 / 360) * 100, 6);
    expect(r.pendentes.map((p) => p.i)).toEqual([2, 3, 4, 5]);
  });

  it('destaque é o próximo índice (concluidos.length)', () => {
    const r = posicionarTiles(640, 360, [tile(0, 256, 0, 256, 256)], 6);
    expect(r.destaque).toBe(1);
  });

  it('total 0 devolve tudo vazio', () => {
    expect(posicionarTiles(640, 360, [], 0)).toEqual({
      concluidos: [],
      pendentes: [],
      destaque: null,
      divergente: false,
    });
  });

  it('sem nenhum tile concluído, pendentes são todo o plano', () => {
    const r = posicionarTiles(640, 360, [], 6);
    expect(r.pendentes.map((p) => p.i)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.destaque).toBe(0);
    expect(r.divergente).toBe(false);
  });

  it('total diferente do plano calculado sinaliza divergente e não inventa pendentes', () => {
    const concluidos = [tile(0, 256, 0, 256, 256)];
    const r = posicionarTiles(640, 360, concluidos, 7);
    expect(r.divergente).toBe(true);
    expect(r.pendentes).toEqual([]);
    expect(r.destaque).toBeNull();
    expect(r.concluidos).toHaveLength(1);
  });


  it('tudo concluído: sem pendentes e sem destaque', () => {
    const concluidos = [
      tile(0, 0, 0, 256, 256),
      tile(1, 256, 0, 256, 256),
      tile(2, 512, 0, 128, 256),
      tile(3, 0, 256, 256, 104),
      tile(4, 256, 256, 256, 104),
      tile(5, 512, 256, 128, 104),
    ];
    const r = posicionarTiles(640, 360, concluidos, 6);
    expect(r.pendentes).toEqual([]);
    expect(r.destaque).toBeNull();
    expect(r.concluidos).toHaveLength(6);
  });
});

describe('proximoTileIndice', () => {
  it('devolve o índice seguinte ou null', () => {
    expect(proximoTileIndice(0, 6)).toBe(0);
    expect(proximoTileIndice(2, 6)).toBe(2);
    expect(proximoTileIndice(6, 6)).toBeNull();
    expect(proximoTileIndice(0, 0)).toBeNull();
  });
});

describe('tilesParaBuscar', () => {
  it('não busca tile já conhecido e busca só os novos', () => {
    const status = { tiles: { concluidos: [tile(0, 0, 0, 1, 1), tile(1, 1, 0, 1, 1), tile(2, 2, 0, 1, 1)] } };
    expect(tilesParaBuscar(new Set([0, 1]), status)).toEqual([2]);
  });

  it('sem tiles (serviço antigo) não busca nada', () => {
    expect(tilesParaBuscar(new Set(), {})).toEqual([]);
  });

  it('não repete índice duplicado no próprio status', () => {
    const status = { tiles: { concluidos: [tile(3, 0, 0, 1, 1), tile(3, 0, 0, 1, 1)] } };
    expect(tilesParaBuscar(new Set(), status)).toEqual([3]);
  });
});

describe('tilesExpirados (timeout de 30 s com relógio injetado)', () => {
  it('um tile em buscando há mais de 30 s expira; exatamente 30 s não expira', () => {
    let agora = 1_000;
    const relogio = () => agora;
    const buscas = new Map<number, number>([[0, relogio()]]);

    agora = 1_000 + LIMITE_BUSCA_TILE_MS;
    expect(tilesExpirados(buscas, agora)).toEqual([]);

    agora = 1_000 + LIMITE_BUSCA_TILE_MS + 1;
    expect(tilesExpirados(buscas, agora)).toEqual([0]);
  });

  it('só expira quem está há mais tempo; tile recente segue buscando', () => {
    const buscas = new Map<number, number>([
      [0, 0],
      [1, 20_000],
    ]);
    expect(tilesExpirados(buscas, 31_000)).toEqual([0]);
    expect(tilesExpirados(buscas, 50_001)).toEqual([0, 1]);
  });
});

describe('criarLimitadorConcorrencia', () => {
  it('nunca passa de 4 tarefas simultâneas e devolve os resultados na ordem', async () => {
    const limitar = criarLimitadorConcorrencia(4);
    let ativos = 0;
    let pico = 0;
    const tarefa = (n: number) => () =>
      new Promise<number>((resolver) => {
        ativos++;
        pico = Math.max(pico, ativos);
        setTimeout(() => {
          ativos--;
          resolver(n);
        }, 2);
      });
    const resultados = await Promise.all(Array.from({ length: 10 }, (_, n) => limitar(tarefa(n))));
    expect(pico).toBe(4);
    expect(resultados).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('uma tarefa que rejeita não trava a fila', async () => {
    const limitar = criarLimitadorConcorrencia(1);
    const ruim = limitar(() => Promise.reject(new Error('falhou')));
    const boa = limitar(() => Promise.resolve(7));
    await expect(ruim).rejects.toThrow('falhou');
    await expect(boa).resolves.toBe(7);
  });
});
