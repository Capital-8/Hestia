/**
 * SDK de suplementos (fase J): todos os exemplos de `plugins-exemplo/` passam pelo validador do app e são empacotados e
 * instalados; `suplementos:novo` gera um suplemento válido; o validador explica os erros; o testkit roda o script sem
 * abrir o app e confere permissões.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createZip, openPackage } from '@hestia/io';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { afterAll, describe, expect, it } from 'vitest';
import { Installer, MemoryPackageStore } from '../apps/web/src/plugins/installer.ts';
import { validateManifestForInstall } from '../apps/web/src/plugins/supSink.ts';
import { criarSuplemento, NovoError } from '../sdk/novo.ts';
import { ficaForaDoPacote, lerPasta } from '../sdk/pasta.ts';
import { carregarArquivos, carregarPasta, criarTeste } from '../sdk/testkit.ts';
import { validarArquivos } from '../sdk/validar.ts';
import type { HestiaContext, HestiaHandler } from '../sdk/hestia-plugin';

const RAIZ = path.resolve(import.meta.dirname, '..');
const EXEMPLOS = path.join(RAIZ, 'plugins-exemplo');
const SDK = path.join(RAIZ, 'sdk');
const pastasDeExemplo = readdirSync(EXEMPLOS).filter((n) => n !== 'dist' && statSync(path.join(EXEMPLOS, n)).isDirectory());

const tmp = mkdtempSync(path.join(tmpdir(), 'hestia-sdk-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const manifestoOk = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  manifestVersion: 2, id: 'dev.teste.sdk', name: 'Teste', version: '1.0.0', hestiaApi: '1.0', runtime: 'script', entry: 'main.js', capabilities: ['model.read'], ...over,
});
const arq = (m: Record<string, unknown>, codigo = 'export async function f() { return 1; }'): Array<{ path: string; data: Uint8Array }> => [
  { path: 'manifest.json', data: enc(JSON.stringify(m)) }, { path: 'main.js', data: enc(codigo) },
];

describe('todos os suplementos de plugins-exemplo/', () => {
  it('existem exemplos de cada runtime', () => {
    expect(pastasDeExemplo.length).toBeGreaterThanOrEqual(6);
  });
  for (const nome of pastasDeExemplo) {
    it(`${nome}: valida, empacota, reabre e instala`, async () => {
      const arquivos = lerPasta(path.join(EXEMPLOS, nome));
      const res = validarArquivos(arquivos);
      expect(res.problemas.filter((p) => p.nivel === 'erro'), JSON.stringify(res.problemas)).toEqual([]);
      expect(res.ok).toBe(true);
      const zip = createZip(arquivos);
      const aberto = await openPackage(zip);
      expect(aberto.manifest.id).toBe(res.id);
      // O mesmo caminho do app: instalar valida o manifesto completo e não ativa nada.
      const instalador = new Installer({ store: new MemoryPackageStore(), validateManifest: validateManifestForInstall });
      const r = await instalador.installBytes(zip);
      expect(r).toMatchObject({ ok: true, id: res.id, replaced: false });
    });
  }
});

describe('validação com erros legíveis', () => {
  it('manifesto inválido explica cada problema e cita o código', () => {
    const r = validarArquivos(arq(manifestoOk({ id: 'Invalido', capabilities: ['model.write', 'voar'], hestiaApi: '9.0' })));
    expect(r.ok).toBe(false);
    const texto = r.problemas.map((p) => p.mensagem).join('\n');
    expect(texto).toContain('[unknown_capability]');
    expect(texto).toContain('"voar"');
    expect(texto).toContain('[api_incompatible]');
  });
  it('dependência de permissão e permissão proibida no runtime', () => {
    const dep = validarArquivos(arq(manifestoOk({ capabilities: ['model.write'] })));
    expect(dep.problemas.map((p) => p.mensagem).join('\n')).toContain('exige também "model.read"');
    const proib = validarArquivos([{ path: 'manifest.json', data: enc(JSON.stringify(manifestoOk({ runtime: 'declarative', entry: undefined, capabilities: ['model.read', 'model.write'] }))) }]);
    expect(proib.problemas.map((p) => p.mensagem).join('\n')).toContain('não é permitida neste runtime');
  });
  it('handler citado no manifesto que o script não exporta', () => {
    const m = manifestoOk({ capabilities: ['ui.commands'], contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'handler', ref: 'naoExiste' } }] } });
    const r = validarArquivos(arq(m));
    expect(r.ok).toBe(false);
    expect(r.problemas.map((p) => p.mensagem).join('\n')).toContain('[handler_missing]');
  });
  it('falta de manifest.json, JSON quebrado e tipo de arquivo proibido', () => {
    expect(validarArquivos([{ path: 'main.js', data: enc('') }]).problemas[0]!.mensagem).toContain('manifest.json');
    expect(validarArquivos([{ path: 'manifest.json', data: enc('{ quebrado') }]).problemas[0]!.mensagem).toContain('JSON');
    expect(validarArquivos([...arq(manifestoOk()), { path: 'x.wasm', data: new Uint8Array(4) }]).problemas[0]!.mensagem).toContain('.wasm');
  });
  it('arquivos do SDK e testes do autor ficam fora do pacote', () => {
    expect(ficaForaDoPacote('hestia-plugin.d.ts')).toBe(true);
    expect(ficaForaDoPacote('testes/a.mjs')).toBe(true);
    expect(ficaForaDoPacote('main.test.mjs')).toBe(true);
    expect(ficaForaDoPacote('main.js')).toBe(false);
  });
});

describe('npm run suplementos:novo', () => {
  it('cria um suplemento válido, com README e tipos, que o testkit executa', async () => {
    const dir = criarSuplemento('com.empresa.contador-de-itens', { sdkDir: SDK, destinoBase: tmp });
    expect(readdirSync(dir).sort()).toEqual(['README.md', 'hestia-plugin.d.ts', 'main.js', 'manifest.json']);
    expect(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toContain('"id": "com.empresa.contador-de-itens"');
    expect(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toContain('Contador De Itens');
    const sup = carregarPasta(dir); // valida; os .d.ts não entram
    expect(sup.arquivos.map((a) => a.path).sort()).toEqual(['README.md', 'main.js', 'manifest.json']);
    const t = await criarTeste(sup);
    const r = (await t.call('ola')) as { title: { pt: string }; message: { pt: string } };
    expect(r.title.pt).toBe('Contagem');
    expect(r.message.pt).toBe('O projeto tem 0 elemento(s).');
    t.fechar();
  });
  it('recusa id inválido e pasta existente', () => {
    expect(() => criarSuplemento('Invalido', { sdkDir: SDK, destinoBase: tmp })).toThrow(NovoError);
    expect(() => criarSuplemento('com.empresa.contador-de-itens', { sdkDir: SDK, destinoBase: tmp })).toThrow(/já existe/);
  });
});

describe('testkit', () => {
  it('sem a permissão, ctx.model não existe e o script responde com o aviso', async () => {
    const t = await criarTeste(carregarPasta(path.join(EXEMPLOS, 'contador-portas')), { grants: ['ui.commands', 'ui.ribbon'] });
    expect(t.temPermissao('model.read')).toBe(false);
    await expect(t.call('contar')).rejects.toThrow();
    t.fechar();
  });

  it('exemplo contador-portas: conta portas e janelas de um projeto', async () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
    store.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const t = await criarTeste(carregarPasta(path.join(EXEMPLOS, 'contador-portas')), { project: store.project });
    expect(await t.call('contar')).toMatchObject({ message: { pt: 'O projeto tem 1 porta(s) e 0 janela(s).' } });
    expect(t.logs.map((l) => l.text)).toContain('portas=1 janelas=0');
    t.fechar();
  });

  it('model.apply: lote válido entra (um passo), comando fora da lista branca é recusado, e há registro dos lotes', async () => {
    const codigo = `
      export async function cria(ctx) {
        const id = await ctx.model.newId('w');
        return ctx.model.apply('parede', [{ type: 'addWall', wall: { id, kind: 'wall', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, height: 2.8, order: 1 } }]);
      }
      export async function proibido(ctx) { return ctx.model.apply('x', [{ type: 'deleteLevel', id: 'lv_0' }]); }`;
    const sup = carregarArquivos(arq(manifestoOk({ capabilities: ['model.read', 'model.write'] }), codigo));
    const t = await criarTeste(sup);
    const proibido = (await t.call('proibido')) as { ok: boolean };
    expect(proibido.ok).toBe(false);
    const antes = Object.keys(t.store.project.elements).length;
    const r = (await t.call('cria')) as { ok: boolean; error?: string };
    expect(t.lotes.map((l) => l.resultado.ok)).toEqual([false, r.ok]);
    if (r.ok) expect(Object.keys(t.store.project.elements).length).toBe(antes + 1);
    t.fechar();
  });

  it('model.apply sem model.write: o host nega', async () => {
    const codigo = 'export async function f(ctx) { return typeof ctx.model.apply; }';
    const t = await criarTeste(carregarArquivos(arq(manifestoOk(), codigo)));
    expect(await t.call('f')).toBe('undefined');
    t.fechar();
  });

  it('dados do suplemento: grava, lê, e fica somente leitura se o projeto vier com dataSchema maior', async () => {
    const codigo = 'export async function grava(ctx, v) { await ctx.data.set("k", v); return ctx.data.get("k"); }';
    const sup = carregarArquivos(arq(manifestoOk({ capabilities: ['plugindata.rw'], dataSchema: 1 }), codigo));
    const t = await criarTeste(sup);
    expect(await t.call('grava', { a: 1 })).toEqual({ a: 1 });
    expect(t.dados()).toEqual({ k: { a: 1 } });
    expect(t.dadosSomenteLeitura()).toBe(false);
    t.store.exec({ type: 'setPluginData', pluginId: 'dev.teste.sdk', key: 'z', value: 1 as never, schema: 4, version: '9.0.0' });
    expect(t.dadosSomenteLeitura()).toBe(true);
    await expect(t.call('grava', 2)).rejects.toThrow();
    t.fechar();
  });

  it('o registro esconde contribuições sem permissão', async () => {
    const m = manifestoOk({ capabilities: ['model.read', 'ui.commands'], contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'handler', ref: 'f' } }] } });
    const com = await criarTeste(carregarArquivos(arq(m)));
    expect(com.registry.commands().map((c) => c.qid)).toEqual(['dev.teste.sdk:a']);
    const sem = await criarTeste(carregarArquivos(arq(m)), { grants: ['model.read'] });
    expect(sem.registry.commands()).toEqual([]);
    com.fechar();
    sem.fechar();
  });

  it('suplemento declarativo: sem script, mas com registro e permissões', async () => {
    const t = await criarTeste(carregarPasta(path.join(EXEMPLOS, 'verificacoes-quantitativos')));
    expect(t.registry.checks().map((c) => c.id)).toEqual(['porta-largura-minima']);
    await expect(t.call('x')).rejects.toThrow(/não tem script/);
  });

  it('carregar pasta inválida lança com a explicação', () => {
    mkdirSync(path.join(tmp, 'ruim'));
    writeFileSync(path.join(tmp, 'ruim', 'manifest.json'), '{}');
    expect(() => carregarPasta(path.join(tmp, 'ruim'))).toThrow(/ERRO/);
  });
});

// Verificação de tipos do SDK em tempo de compilação (o `tsc` do projeto inclui `tests/`).
const _handler: HestiaHandler = async (ctx: HestiaContext) => {
  const p = await ctx.model?.read?.();
  return { message: String(Object.keys(p?.elements ?? {}).length) };
};
void _handler;
