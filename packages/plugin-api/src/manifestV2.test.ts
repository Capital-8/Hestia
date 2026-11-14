import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES, TEST_RENDERER_MANIFEST, ContributionRegistry, validateManifest, validateManifestAny, validateManifestV2,
  type ManifestV2Issue, type PluginManifestV2,
} from './index.ts';

/** Manifesto de script (exemplo 9.2 da especificação, com `hestiaApi` do host atual). */
const script = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  manifestVersion: 2, id: 'dev.exemplo.grade', name: 'Grade de pilares', version: '0.3.1', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
  capabilities: ['model.read', 'model.write', 'ui.commands', 'ui.ribbon', 'ui.dialogs'],
  limits: { timeoutMs: 3000, memoryMiB: 64, maxCommandsPerAction: 2000 },
  contributes: {
    dialogs: [{ id: 'params', title: 'Grade', fields: [{ key: 'nx', label: 'Colunas', type: 'number', default: 4, min: 1, max: 50 }], actions: [{ id: 'gerar', label: 'Gerar', run: { type: 'handler', ref: 'gerar' } }] }],
    commands: [{ id: 'abrir', title: 'Grade de pilares...', run: { type: 'dialog', ref: 'params' } }],
    ribbon: { panels: [{ id: 'p1', title: 'Estrutura', items: [{ command: 'abrir', size: 'large' }] }] },
  },
  ...over,
});

const decl = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  manifestVersion: 2, id: 'dev.exemplo.norma', name: 'Norma', version: '1.0.0', hestiaApi: '1.0', runtime: 'declarative',
  capabilities: ['model.read', 'checks.run', 'ui.commands', 'content.schedules'], ...over,
});

const issues = (r: ReturnType<typeof validateManifestAny>): ManifestV2Issue[] => (r.ok ? [] : r.issues);
const has = (r: ReturnType<typeof validateManifestAny>, code: string): boolean => issues(r).some((i) => i.code === code);

describe('manifesto 2.0: aceitação', () => {
  it('aceita o exemplo de script e normaliza (limites, dados padrão)', () => {
    const r = validateManifestAny(script());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.legacy).toBe(false);
    expect(r.manifest).toMatchObject({ manifestVersion: 2, runtime: 'script', entry: 'main.js', dataSchema: 1 });
    expect(r.manifest.contributes.commands?.[0]?.run).toEqual({ type: 'dialog', ref: 'params' });
  });

  it('aceita declarativo com checks e quantitativos (JSONLogic como dado)', () => {
    const r = validateManifestAny(decl({
      contributes: {
        checks: [{ id: 'altura', title: 'Altura', severity: 'warning', applyTo: 'guardaCorpo', rule: { '>=': [{ var: 'height' }, 1.05] }, message: { pt: 'Menor que 1,05 m', en: 'Below 1.05 m' } }],
        schedules: [{ id: 'resumo', title: 'Resumo', source: 'guardaCorpo', groupBy: ['levelName'], columns: [{ key: 'len', title: 'Comp.', expr: { var: 'length' }, unit: 'm', total: 'sum' }] }],
      },
    }));
    expect(issues(r)).toEqual([]);
  });

  it('o texto "%chave" é resolvido pelo i18n do manifesto', () => {
    const r = validateManifestAny(script({
      i18n: { pt: { abrir: 'Abrir grade' }, en: { abrir: 'Open grid' } },
      contributes: { commands: [{ id: 'abrir', title: '%abrir', run: { type: 'handler', ref: 'abrir' } }] },
    }));
    expect(r.ok && r.manifest.contributes.commands?.[0]?.title).toEqual({ pt: 'Abrir grade', en: 'Open grid' });
  });

  it('limites de script acima do teto são limitados, nunca ampliados', () => {
    const r = validateManifestAny(script({ limits: { timeoutMs: 999999, memoryMiB: 4096, maxCommandsPerAction: 9999999 } }));
    expect(r.ok && r.manifest.limits).toEqual({ timeoutMs: 30000, memoryMiB: 256, maxCommandsPerAction: 50000 });
  });

  it('campos desconhecidos são descartados, não repassados', () => {
    const r = validateManifestAny(script({ evil: 'x', contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'handler', ref: 'a' }, onload: 'alert(1)' }], hack: [1] } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.manifest)).not.toMatch(/evil|onload|hack/);
  });
});

describe('manifesto 2.0: recusas', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['runtime declarativo com entry', decl({ entry: 'main.js' }), 'runtime_conflict'],
    ['runtime declarativo pedindo model.write', decl({ capabilities: ['model.read', 'model.write'] }), 'capability_not_allowed'],
    ['script sem entry', script({ entry: undefined }), 'bad_field'],
    ['entry com ..', script({ entry: '../fora.js' }), 'bad_field'],
    ['entry absoluto', script({ entry: '/etc/x.js' }), 'bad_field'],
    ['entry que não é .js', script({ entry: 'main.wasm' }), 'bad_field'],
    ['external sem objeto external', script({ runtime: 'external', entry: undefined, limits: undefined, contributes: {} }), 'bad_field'],
    ['permissão desconhecida', script({ capabilities: ['model.read', 'x.y'] }), 'unknown_capability'],
    ['net.fetch reservada', script({ capabilities: ['model.read', 'net.fetch'] }), 'capability_not_allowed'],
    ['permissão repetida', script({ capabilities: ['model.read', 'model.read'] }), 'bad_field'],
    ['model.write sem model.read', script({ capabilities: ['model.write'], contributes: {} }), 'missing_dependency'],
    ['ui.ribbon sem ui.commands', script({ capabilities: ['ui.ribbon'], contributes: {} }), 'missing_dependency'],
    ['contribuição sem a permissão pedida', script({ capabilities: ['model.read'] }), 'missing_capability'],
    ['id duplicado', script({ contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'handler', ref: 'x' } }, { id: 'a', title: 'B', run: { type: 'handler', ref: 'x' } }] } }), 'duplicate_id'],
    ['botão cujo comando não existe', script({ contributes: { commands: [], ribbon: { panels: [{ id: 'p', title: 'P', items: [{ command: 'nao-existe' }] }] } } }), 'unknown_ref'],
    ['ação aponta diálogo inexistente', script({ contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'dialog', ref: 'sumiu' } }] } }), 'unknown_ref'],
    ['declarativo com handler', decl({ capabilities: ['model.read', 'ui.commands'], contributes: { commands: [{ id: 'a', title: 'A', run: { type: 'handler', ref: 'x' } }] } }), 'runtime_conflict'],
    ['declarativo com tools', decl({ capabilities: ['model.read', 'ui.tools'], contributes: { tools: [] } }), 'capability_not_allowed'],
    ['versão da API incompatível', script({ hestiaApi: '9.0' }), 'api_incompatible'],
    ['manifestVersion desconhecido', script({ manifestVersion: 3 }), 'bad_manifest_version'],
    ['homepage não https', script({ homepage: 'http://x.com' }), 'bad_field'],
    ['texto "%chave" sem tradução', script({ contributes: { commands: [{ id: 'a', title: '%falta', run: { type: 'handler', ref: 'a' } }] } }), 'bad_field'],
    ['cor de material inválida', script({ capabilities: ['content.materials'], contributes: { materials: [{ id: 'm', name: 'M', color: 'vermelho' }] } }), 'bad_field'],
  ];
  it.each(cases)('%s', (_n, raw, code) => {
    expect(has(validateManifestAny(raw), code)).toBe(true);
  });

  it('mais de 200 entradas é recusado', () => {
    const commands = Array.from({ length: 201 }, (_, i) => ({ id: `c${i}`, title: 'C', run: { type: 'handler', ref: 'x' } }));
    expect(has(validateManifestAny(script({ contributes: { commands } })), 'too_many')).toBe(true);
  });

  it('manifesto acima de 256 KiB é recusado', () => {
    expect(has(validateManifestAny(script({ description: 'x', pad: 'y'.repeat(300 * 1024) })), 'manifest_too_large')).toBe(true);
  });

  it('JSON com função ou profundidade excessiva não passa', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = { a: deep };
    const mk = (rule: unknown): Record<string, unknown> => decl({ contributes: { checks: [{ id: 'c', title: 'C', severity: 'info', applyTo: 'wall', rule, message: 'm' }] } });
    expect(has(validateManifestAny(mk(deep)), 'bad_field')).toBe(true);
    expect(has(validateManifestAny(mk({ f: () => 1 })), 'bad_field')).toBe(true);
  });

  it('entrada que não é objeto', () => {
    expect(has(validateManifestAny(null), 'not_object')).toBe(true);
    expect(has(validateManifestAny([]), 'not_object')).toBe(true);
  });
});

describe('compatibilidade com o manifesto 1.x', () => {
  it('manifesto sem manifestVersion passa pelo validador atual e vira external 2.0, sem perda', () => {
    const v1 = validateManifest(TEST_RENDERER_MANIFEST);
    const r = validateManifestAny(TEST_RENDERER_MANIFEST);
    expect(v1.ok && r.ok).toBe(true);
    if (!r.ok || !v1.ok) return;
    expect(r.legacy).toBe(true);
    expect(r.v1).toEqual(v1.manifest);
    expect(r.manifest).toMatchObject({ manifestVersion: 1, runtime: 'external', external: { kind: v1.manifest.kind }, contributes: {} });
    expect(r.manifest.capabilities).toEqual(v1.manifest.capabilities);
  });

  it('1.x inválido devolve os mesmos problemas do validador atual', () => {
    const bad = { ...TEST_RENDERER_MANIFEST, capabilities: ['model.write'] };
    const v1 = validateManifest(bad);
    expect(validateManifestAny(bad)).toEqual(v1);
  });

  it('1.x NÃO enxerga as permissões novas (tabela CAPABILITIES intacta)', () => {
    expect(Object.keys(CAPABILITIES).sort()).toEqual(['camera.read', 'camera.write', 'events.subscribe', 'overrides.write', 'scene.read']);
    expect(validateManifest({ ...TEST_RENDERER_MANIFEST, capabilities: ['scene.read', 'model.read'] }).ok).toBe(false);
  });

  it('validateManifestV2 recusa manifesto sem manifestVersion 2', () => {
    expect(has(validateManifestV2(TEST_RENDERER_MANIFEST), 'bad_manifest_version')).toBe(true);
  });
});

describe('registro de contribuições', () => {
  const manifest = (over: Record<string, unknown> = {}): PluginManifestV2 => {
    const r = validateManifestAny(script(over));
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.manifest;
  };

  it('só entra o que o usuário concedeu; ids qualificados <pluginId>:<id>', () => {
    const reg = new ContributionRegistry();
    reg.register(manifest(), ['ui.commands']);
    expect(reg.commands().map((c) => c.qid)).toEqual(['dev.exemplo.grade:abrir']);
    expect(reg.ribbonPanels()).toEqual([]); // ui.ribbon não concedida
    expect(reg.dialogs()).toEqual([]);
    reg.setGrants('dev.exemplo.grade', ['ui.commands', 'ui.ribbon', 'ui.dialogs']);
    expect(reg.ribbonPanels()).toHaveLength(1);
    expect(reg.ribbonPanels()[0]).toMatchObject({ qid: 'dev.exemplo.grade:p1', pluginName: 'Grade de pilares', items: [{ commandQid: 'dev.exemplo.grade:abrir', size: 'large' }] });
    expect(reg.dialog('dev.exemplo.grade:params')?.fields).toHaveLength(1);
  });

  it('desregistrar retira tudo e avisa os assinantes; assinante com defeito não derruba os outros', () => {
    const reg = new ContributionRegistry();
    let n = 0;
    reg.subscribe(() => { throw new Error('boom'); });
    reg.subscribe(() => { n++; });
    const v0 = reg.version();
    reg.register(manifest(), ['ui.commands', 'ui.ribbon']);
    reg.unregister('dev.exemplo.grade');
    reg.unregister('dev.exemplo.grade'); // idempotente, sem aviso extra
    expect(reg.commands()).toEqual([]);
    expect(n).toBe(2);
    expect(reg.version()).toBe(v0 + 2);
  });

  it('dois suplementos com o mesmo id de comando não colidem', () => {
    const reg = new ContributionRegistry();
    reg.register(manifest(), ['ui.commands']);
    reg.register(manifest({ id: 'dev.outro.grade' }), ['ui.commands']);
    expect(reg.commands().map((c) => c.qid).sort()).toEqual(['dev.exemplo.grade:abrir', 'dev.outro.grade:abrir']);
  });
});
