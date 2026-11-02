import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularHashDasFontes, hashDeFontes, listarFontes } from '../scripts/hash-fontes.mjs';

const raiz = join(import.meta.dirname, '..');

describe('hash das fontes do kernel Rust', () => {
  const a = { caminho: 'crates/geom-wasm/src/lib.rs', conteudo: 'fn a() {}\nfn b() {}\n' };
  const b = { caminho: 'crates/geom-wasm/Cargo.toml', conteudo: '[package]\nname = "x"\n' };

  it('não depende de CRLF/LF nem da ordem de entrada', () => {
    const base = hashDeFontes([a, b]);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    const crlf = { ...a, conteudo: a.conteudo.replace(/\n/g, '\r\n') };
    expect(hashDeFontes([crlf, b])).toBe(base);
    expect(hashDeFontes([b, a])).toBe(base);
    expect(hashDeFontes([{ ...a, conteudo: new TextEncoder().encode(crlf.conteudo) }, b])).toBe(base);
  });

  it('muda quando o conteúdo ou o caminho muda', () => {
    const base = hashDeFontes([a, b]);
    expect(hashDeFontes([{ ...a, conteudo: a.conteudo + ' ' }, b])).not.toBe(base);
    expect(hashDeFontes([{ ...a, caminho: 'crates/geom-wasm/src/outro.rs' }, b])).not.toBe(base);
    expect(hashDeFontes([a])).not.toBe(base);
  });

  it('lista as fontes esperadas do repositório, em ordem estável, incluindo o toolchain', () => {
    const lista = listarFontes(raiz);
    expect(lista).toContain('rust-toolchain.toml');
    expect(lista).toContain('crates/geom-wasm/schema/cena-v1.json');
    expect(lista).toContain('crates/geom-wasm/Cargo.toml');
    expect(lista).toEqual([...lista].sort());
  });

  it('verificar-wasm.mjs falha quando o hash gravado diverge e passa quando bate', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'hestia-fonte-'));
    try {
      const arq = join(pasta, 'fonte.sha256');
      const rodar = (): number | null =>
        spawnSync(process.execPath, [join(raiz, 'scripts', 'verificar-wasm.mjs'), '--estrito'], {
          cwd: raiz,
          env: { ...process.env, FONTE_SHA256_ARQUIVO: arq },
        }).status;
      expect(rodar()).toBe(1); // ausente + estrito
      writeFileSync(arq, `${'0'.repeat(64)}\n`);
      expect(rodar()).toBe(1);
      writeFileSync(arq, `${calcularHashDasFontes(raiz)}\n`);
      expect(rodar()).toBe(0);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
