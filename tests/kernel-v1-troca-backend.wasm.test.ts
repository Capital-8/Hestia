/**
 * Troca do backend do kernel v1 (Rust x TypeScript) no mesmo processo.
 *
 * Causa medida nos projetos reais (P8, junção de parede com 0,15 de diferença só quando um bloco com o v1 em Rust rodava antes): `pinturasPorItens`
 * (`resolveMemo.ts`) e o cache compartilhado de clusters (`resolve.ts`) são chaveados por CONTEÚDO e guardam o que o v1 devolveu. Uma resolução
 * com o backend TypeScript que chega depois, sobre um projeto novo com o mesmo conteúdo, reaproveita fragmentos gerados pelo Rust (vértices na grade
 * de 1 µm) e mistura os dois backends. Em produção só existe o Rust, então nada se mistura; o vazamento só aparece em quem alterna o backend
 * (harness de comparação e testes), que chama `limparCachesDeConteudo()` na troca. Este teste fixa as duas pontas.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ativarKernelExperimental, estadoKernel, exigirKernel } from '@hestia/geom';
import { migrateProject, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { limparCachesDeConteudo } from '../packages/engine/src/cachesDeConteudo.ts';
import { resolveLevelTs } from '../packages/engine/src/resolve.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { definirImplKernel, implKernel, type ImplKernel } from '../packages/geom/src/kernel/contrato.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let implRust: ImplKernel | null = null;

beforeAll(async () => {
  if (!bytes) return;
  await ativarKernelExperimental({ bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  implRust = implKernel();
});
afterAll(() => {
  exigirKernel(false);
  definirImplKernel(null);
  limparCachesDeConteudo();
});

const novo = (): Project => migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));

const comTs = (f: () => string): string => {
  exigirKernel(false);
  definirImplKernel(null);
  return f();
};
const comRust = (f: () => string): string => {
  definirImplKernel(implRust, { versaoAbi: 1 });
  exigirKernel(true);
  try {
    return f();
  } finally {
    exigirKernel(false);
    definirImplKernel(null);
  }
};
/** Todas as camadas e faixas resolvidas do nível, com os vértices na ordem em que o backend os entregou. */
const instantaneo = (p: Project): string => {
  const out: unknown[] = [];
  for (const l of p.levels) {
    const r = resolveLevelTs(p, l.id);
    for (const w of Object.values(r.walls)) for (const c of w.layers) out.push([w.wallId, c.layerIndex, c.fragment, c.bands.map((b) => b.poly)]);
  }
  return JSON.stringify(out);
};

describe.skipIf(!bytes)('troca do backend do v1 no mesmo processo', () => {
  it('o Rust e o TypeScript entregam vértices diferentes para o mesmo projeto (a premissa do vazamento)', () => {
    limparCachesDeConteudo();
    const ts = comTs(() => instantaneo(novo()));
    limparCachesDeConteudo();
    const rust = comRust(() => instantaneo(novo()));
    expect(rust).not.toBe(ts);
  });

  it('TS, depois Rust, depois TS com os caches limpos na troca: o TS volta idêntico ao TS frio', () => {
    limparCachesDeConteudo();
    const frio = comTs(() => instantaneo(novo()));
    limparCachesDeConteudo();
    comRust(() => instantaneo(novo()));
    limparCachesDeConteudo();
    expect(comTs(() => instantaneo(novo()))).toBe(frio);
  });

  it('sem limpar na troca, o TS reaproveita o que o Rust guardou (o vazamento que a limpeza evita)', () => {
    limparCachesDeConteudo();
    const frio = comTs(() => instantaneo(novo()));
    limparCachesDeConteudo();
    comRust(() => instantaneo(novo()));
    expect(estadoKernel().ativo).toBe(false);
    expect(comTs(() => instantaneo(novo()))).not.toBe(frio);
  });
});
