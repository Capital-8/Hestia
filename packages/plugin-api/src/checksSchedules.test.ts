import { describe, expect, it } from 'vitest';
import { ContributionRegistry, validateManifestAny, type PluginManifestV2 } from './index.ts';

const base = (contributes: Record<string, unknown>, caps = ['model.read', 'checks.run', 'content.schedules', 'ui.commands']): Record<string, unknown> => ({
  manifestVersion: 2, id: 'dev.t.norma', name: 'Norma', version: '1.0.0', hestiaApi: '1.0', runtime: 'declarative', capabilities: caps, contributes,
});

const check = { id: 'c1', title: 'C', severity: 'warning', applyTo: 'door', rule: { '>=': [{ var: 'width' }, 0.8] }, message: 'm' };
const schedule = { id: 's1', title: 'S', source: 'wall', columns: [{ key: 'a', title: 'A', expr: { var: 'length' } }] };

describe('ações check e schedule no manifesto', () => {
  it('aceitam referência existente, inclusive no runtime declarativo', () => {
    const r = validateManifestAny(base({
      checks: [check], schedules: [schedule],
      commands: [{ id: 'k', title: 'K', run: { type: 'check', ref: 'c1' } }, { id: 'q', title: 'Q', run: { type: 'schedule', ref: 's1' } }],
    }));
    expect(r.ok).toBe(true);
  });
  it('recusam referência inexistente', () => {
    const r = validateManifestAny(base({ checks: [check], commands: [{ id: 'q', title: 'Q', run: { type: 'schedule', ref: 'nao-existe' } }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.code === 'unknown_ref')).toBe(true);
  });
});

describe('registro: checks() e schedules() exigem a permissão concedida', () => {
  const r = validateManifestAny(base({ checks: [check], schedules: [schedule] }));
  const m = (r.ok ? r.manifest : null) as PluginManifestV2;
  it('lista com ids qualificados', () => {
    const reg = new ContributionRegistry();
    reg.register(m, ['model.read', 'checks.run', 'content.schedules']);
    expect(reg.checks().map((c) => c.qid)).toEqual(['dev.t.norma:c1']);
    expect(reg.schedules().map((s) => s.qid)).toEqual(['dev.t.norma:s1']);
    expect(reg.schedule('dev.t.norma:s1')?.pluginName).toBe('Norma');
  });
  it('sem a permissão, nada aparece', () => {
    const reg = new ContributionRegistry();
    reg.register(m, ['model.read']);
    expect(reg.checks()).toEqual([]);
    expect(reg.schedules()).toEqual([]);
  });
});
