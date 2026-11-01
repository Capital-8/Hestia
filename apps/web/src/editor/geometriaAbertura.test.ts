import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { projetoComPavimentos } from '@hestia/engine/src/worker/fixturePavimentos.ts';
import type { Id, Project } from '@hestia/model';
import { CacheGeometria, criarArmazenamentoMemoria, ehSerializavel, type ArmazenamentoGeometria } from './geometryCache.ts';
import { abrirComCache, chaveDoProjeto, chavesDosNiveis, limparCacheDeGeometria, restaurarDoCache, TETO_GEOMETRIA_BYTES, VERSAO_ESQUEMA_CACHE, VERSAO_MOTOR_GEOMETRIA, type PortasAbertura } from './geometriaAbertura.ts';

/** Espera o fim das gravações em segundo plano (o cache grava depois da abertura). */
async function esperar(condicao: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condicao(); i++) await new Promise((r) => setTimeout(r, 1));
}

/** Portas de uma abertura simulada: `prontos` é o que a resolução já calculou em segundo plano. */
function simular(cache: CacheGeometria, projetoAtual: () => Project, prontos: Map<Id, ResolvedLevel>) {
  const semeados: Id[] = [];
  const portas: PortasAbertura = {
    cache,
    atual: projetoAtual,
    lerNivel: (id) => prontos.get(id) ?? null,
    pendente: (id) => !prontos.has(id),
    semear: (id, valor) => {
      semeados.push(id);
      prontos.set(id, valor);
    },
    agendar: (tarefa, ms) => setTimeout(tarefa, ms),
  };
  return { portas, semeados };
}

/** Resultado direto do engine para cada nível, como a resolução o entregaria (sem o cache). */
function calculoDireto(p: Project): Map<Id, ResolvedLevel> {
  return new Map(p.levels.map((l) => [l.id, resolveLevel(p, l.id)] as const));
}

/** O que sai do cache ao voltar do armazenamento: a ida e volta por JSON, para comparar com igualdade. */
const ida = (v: ResolvedLevel): ResolvedLevel => JSON.parse(JSON.stringify(v)) as ResolvedLevel;

describe('abrirComCache: o cache devolve a geometria igual ao cálculo direto', () => {
  for (const pavimentos of [1, 20]) {
    it(`${pavimentos} nível(is): a primeira abertura grava; a segunda restaura, e cada nível é igual ao cálculo direto`, async () => {
      const p = projetoComPavimentos(pavimentos);
      const cache = new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES, armazenamento: criarArmazenamentoMemoria() });

      // Primeira abertura: nada no cache; os níveis ficam prontos e o cache grava na abertura.
      const primeira = simular(cache, () => p, calculoDireto(p));
      await abrirComCache(primeira.portas, p);
      expect(primeira.semeados).toEqual([]);
      await esperar(() => cache.quantidade === pavimentos);
      expect(cache.quantidade).toBe(pavimentos);

      // Segunda abertura (mesmo conteúdo): restaura do cache, sem nada pronto de antemão.
      const segunda = simular(cache, () => p, new Map());
      await abrirComCache(segunda.portas, p);
      expect(segunda.semeados).toEqual(p.levels.map((l) => l.id));
      const direto = calculoDireto(p);
      for (const l of p.levels) {
        const restaurado = segunda.portas.lerNivel(l.id);
        expect(restaurado).toEqual(ida(direto.get(l.id)!));
      }
    });
  }

  it('o resultado de resolveLevel é serializável sem perda (senão o cache nunca guardaria nada)', () => {
    const p = projetoComPavimentos(1);
    for (const nivel of calculoDireto(p).values()) expect(ehSerializavel(nivel)).toBe(true);
  });

  it('projeto com outro conteúdo tem outra chave: o cache não devolve a geometria antiga', async () => {
    const p = projetoComPavimentos(2);
    const outro = projetoComPavimentos(3);
    expect(chaveDoProjeto(outro)).not.toBe(chaveDoProjeto(p));

    const cache = new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES, armazenamento: criarArmazenamentoMemoria() });
    const gravado = simular(cache, () => p, calculoDireto(p));
    await abrirComCache(gravado.portas, p);
    await esperar(() => cache.quantidade === 2);

    const aberto = simular(cache, () => outro, new Map());
    await abrirComCache(aberto.portas, outro);
    expect(aberto.semeados).toEqual([]);
  });

  it('o projeto mudou antes da restauração: nada é semeado (a abertura não age sobre um projeto que saiu)', async () => {
    const p = projetoComPavimentos(2);
    const cache = new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES, armazenamento: criarArmazenamentoMemoria() });
    const gravado = simular(cache, () => p, calculoDireto(p));
    await abrirComCache(gravado.portas, p);
    await esperar(() => cache.quantidade === 2);

    const depois = projetoComPavimentos(2);
    const aberto = simular(cache, () => depois, new Map());
    await abrirComCache(aberto.portas, p);
    expect(aberto.semeados).toEqual([]);
  });

  it('armazenamento que falha em tudo: a abertura não lança e segue pelo cálculo (fallback)', async () => {
    const quebrado: ArmazenamentoGeometria = {
      ler: async () => {
        throw new Error('disco indisponível');
      },
      gravar: async () => {
        throw new Error('disco indisponível');
      },
      apagar: async () => {
        throw new Error('disco indisponível');
      },
    };
    const p = projetoComPavimentos(3);
    const cache = new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES, armazenamento: quebrado });
    const aberto = simular(cache, () => p, calculoDireto(p));
    await expect(abrirComCache(aberto.portas, p)).resolves.toBeUndefined();
    expect(aberto.semeados).toEqual([]);
  });

  it('a chave é por conteúdo: não depende de nome, e editar um pavimento não muda as chaves dos distantes', () => {
    const p = projetoComPavimentos(6);
    const renomeado = { ...p, name: 'outro nome' };
    expect([...chavesDosNiveis(renomeado)]).toEqual([...chavesDosNiveis(p)]);
    const antes = chavesDosNiveis(p);
    const id = p.levels[0]!.id;
    const alvo = Object.values(p.elements).find((e) => 'levelId' in e && e.levelId === id && e.kind === 'wall');
    if (!alvo || alvo.kind !== 'wall') return; // fixture sem parede no primeiro nível: nada a editar
    const editado: Project = { ...p, elements: { ...p.elements, [alvo.id]: { ...alvo, b: { x: alvo.b.x + 1, y: alvo.b.y } } } };
    const depois = chavesDosNiveis(editado);
    expect(depois.get(id)).not.toBe(antes.get(id));
    const distante = p.levels[p.levels.length - 1]!.id;
    expect(depois.get(distante)).toBe(antes.get(distante));
  });

  it('as chaves levam as versões do esquema e do motor (subir a versão invalida o cache)', () => {
    const p = projetoComPavimentos(1);
    for (const c of chavesDosNiveis(p).values()) expect(c.startsWith(`v${VERSAO_ESQUEMA_CACHE}.${VERSAO_MOTOR_GEOMETRIA}|`)).toBe(true);
  });

  it('restaurarDoCache devolve os níveis do cache iguais ao cálculo fresco e limpar esvazia', async () => {
    const p = projetoComPavimentos(3);
    const cache = new CacheGeometria({ tetoBytes: TETO_GEOMETRIA_BYTES, armazenamento: criarArmazenamentoMemoria() });
    const gravado = simular(cache, () => p, calculoDireto(p));
    await abrirComCache(gravado.portas, p);
    await esperar(() => cache.quantidade === 3);
    const r = await restaurarDoCache(gravado.portas, p);
    expect(r.faltam).toEqual([]);
    const fresco = calculoDireto(p);
    for (const l of p.levels) expect(r.semeados.get(l.id)).toEqual(ida(fresco.get(l.id)!));
    await limparCacheDeGeometria(gravado.portas);
    expect(cache.quantidade).toBe(0);
    expect((await restaurarDoCache(gravado.portas, p)).semeados.size).toBe(0);
  });

  it('teto de bytes: despeja o menos usado (LRU) e nunca passa do teto', async () => {
    const p = projetoComPavimentos(3);
    const um = JSON.stringify(calculoDireto(p).get(p.levels[0]!.id)).length;
    const cache = new CacheGeometria({ tetoBytes: um * 2 + 10, armazenamento: criarArmazenamentoMemoria() });
    const gravado = simular(cache, () => p, calculoDireto(p));
    await abrirComCache(gravado.portas, p);
    await esperar(() => cache.quantidade >= 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.bytesOcupados).toBeLessThanOrEqual(um * 2 + 10);
  });
});

