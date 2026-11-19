import { describe, expect, it } from 'vitest';
import { applySheetCommand, makeLevel, migrateProject, serializeProject, projectSheets, sheetOf, viewportIssue, type Id, type Project, type ProjectStore } from '@hestia/model';
import { exportSheetsPdf } from '@hestia/io';
import { buildBigProject, createSheets, drawIsFinite, drawOf, drawSummary, standardSheetPlans, type BigProjectSpec } from './pranchasFixture.ts';
import { duplicateSheetCommand, moveViewportAction, resizeViewportAction, setViewportScaleAction, sheetDrawLists, sheetsPdfOf } from './sheetActions.ts';
import { sheetDxf } from './dxfSheet.ts';

/**
 * Bateria de estabilidade das pranchas em projetos grandes. Usada por `pranchasEstabilidade.test.ts` (tamanho médio, no
 * `npm test`) e por `pranchasEstabilidade.perf.test.ts` (tamanho grande, com números impressos, em `npm run test:perf`).
 *
 * Os limites de tempo são folgados e RELATIVOS ao tamanho do projeto (ms por elemento), porque o tempo absoluto depende
 * da máquina; o que a bateria garante de verdade é: nenhuma exceção, nenhum NaN, determinismo, ida e volta do arquivo e
 * que editar o modelo atualiza as vistas.
 */
export interface Limits {
  /** Montar o projeto: ms por elemento. */
  buildMsPerElement: number;
  /** Desenhar TODAS as pranchas: ms por elemento. */
  drawAllMsPerElement: number;
  /** Crescimento máximo do heap (MB) ao desenhar todas as pranchas 3 vezes. */
  heapGrowthMb: number;
}

const mb = (n: number): number => Math.round((n / 1048576) * 10) / 10;
const log = (label: string, msg: string): void => console.log(`[pranchas:${label}] ${msg}`);

export function pranchasEstabilidadeSuite(label: string, spec: BigProjectSpec, limits: Limits): void {
  describe(`pranchas · estabilidade · ${label}`, () => {
    const t0 = performance.now();
    const store: ProjectStore = buildBigProject(spec);
    const buildMs = performance.now() - t0;
    const elements = Object.keys(store.project.elements).length;
    const plans = standardSheetPlans(store.project);
    const made = createSheets(store, plans);
    const sheetIds = made.ids;
    const sheetOk = (p: Project): void => {
      for (const s of projectSheets(p)) for (const v of s.viewports) expect(viewportIssue(s, v)).toBeNull();
    };

    it('monta o projeto grande no tempo esperado', () => {
      // units-ok: texto de log do diagnóstico de estabilidade (não é exibido ao usuário)
      log(label, `${spec.levels} níveis · ${elements} elementos · ${store.project.levels.length} pavimentos · montagem ${buildMs.toFixed(0)} ms (${(buildMs / elements).toFixed(2)} ms/elemento)`);
      expect(elements).toBeGreaterThan(spec.levels * spec.rooms * spec.rooms);
      expect(buildMs / elements).toBeLessThan(limits.buildMsPerElement);
      expect(sheetIds).toHaveLength(plans.length);
    });

    it('cada prancha tem as vistas esperadas e todas cabem na folha', () => {
      const counts = sheetIds.map((id) => sheetOf(store.project, id)!.viewports.length);
      log(label, `vistas por prancha: ${counts.join(', ')} (recusadas por não caber: ${made.refused})`);
      expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(plans.length);
      sheetOk(store.project);
    });

    it('desenha todas as pranchas sem exceção, sem NaN e de forma determinística (2 execuções iguais)', () => {
      const t = performance.now();
      const a = sheetIds.map((id) => drawOf(store.project, id));
      const ms = performance.now() - t;
      const b = sheetIds.map((id) => drawOf(store.project, id));
      for (const d of a) {
        expect(d).not.toBeNull();
        expect(drawIsFinite(d!)).toBe(true);
      }
      expect(a.map(drawSummary)).toEqual(b.map(drawSummary));
      // units-ok: texto de log do diagnóstico de estabilidade (não é exibido ao usuário)
      log(label, `desenho de ${sheetIds.length} pranchas: ${ms.toFixed(0)} ms (${(ms / elements).toFixed(2)} ms/elemento) · ${a.map(drawSummary).map((s) => s.split('/')[1]).join(' ')} traços`);
      expect(ms / elements).toBeLessThan(limits.drawAllMsPerElement);
    }, 600000);

    it('memória estável: desenhar tudo 3 vezes não faz o heap crescer sem controle', () => {
      const gc = (globalThis as { gc?: () => void }).gc;
      gc?.();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 3; i++) sheetDrawLists(store.project, 'pt');
      gc?.();
      const after = process.memoryUsage().heapUsed;
      const growth = mb(after - before);
      log(label, `heap antes ${mb(before)} MB · depois ${mb(after)} MB · crescimento ${growth} MB${gc ? '' : ' (sem --expose-gc: inclui lixo ainda não coletado)'}`);
      expect(growth).toBeLessThan(limits.heapGrowthMb);
    }, 600000);

    it('editar o modelo atualiza as vistas da prancha (e desfazer volta ao desenho original)', () => {
      const plansSheet = sheetIds[0]!;
      const before = drawSummary(drawOf(store.project, plansSheet));
      const wallId = Object.keys(store.project.elements).find((k) => store.project.elements[k]!.kind === 'wall')!;
      const t = performance.now();
      store.exec({ type: 'transform', ids: [wallId], transform: { kind: 'translate', d: { x: 0, y: 0.7 } } });
      const after = drawSummary(drawOf(store.project, plansSheet));
      const ms = performance.now() - t;
      expect(after).not.toBe(before);
      // units-ok: texto de log do diagnóstico de estabilidade (não é exibido ao usuário)
      log(label, `editar 1 parede e redesenhar a prancha de plantas: ${ms.toFixed(0)} ms`);
      store.undo();
      expect(drawSummary(drawOf(store.project, plansSheet))).toBe(before);
    }, 600000);

    it('PDF e DXF das pranchas saem íntegros', () => {
      const t = performance.now();
      const pdf = sheetsPdfOf(store.project, 'pt');
      const pdfMs = performance.now() - t;
      expect(pdf).not.toBeNull();
      const head = String.fromCharCode(...pdf!.slice(0, 8));
      const tail = String.fromCharCode(...pdf!.slice(-8));
      expect(head.startsWith('%PDF-1.4')).toBe(true);
      expect(tail).toContain('%%EOF');
      const t2 = performance.now();
      const dxfs = sheetIds.map((id) => sheetDxf(store.project, id, { units: 'mm' }));
      const dxfMs = performance.now() - t2;
      for (const d of dxfs) {
        expect(d).toContain('EOF');
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('Infinity');
      }
      // units-ok: texto de log do diagnóstico de estabilidade (não é exibido ao usuário)
      log(label, `PDF ${(pdf!.length / 1024).toFixed(0)} KB em ${pdfMs.toFixed(0)} ms · DXF ${dxfs.map((d) => (d.length / 1024).toFixed(0)).join('/')} KB em ${dxfMs.toFixed(0)} ms`);
      expect(typeof exportSheetsPdf).toBe('function');
    }, 600000);

    it('apagar, duplicar, mover, redimensionar e remover vistas — com desfazer', () => {
      const id = sheetIds[0]!;
      const vps = () => sheetOf(store.project, id)!.viewports;
      const n0 = vps().length;
      const vp = vps()[0]!;
      // mover e redimensionar
      expect(moveViewportAction(store, id, vp.id, { x: vp.at.x + 5, y: vp.at.y + 5 })).toBeNull();
      expect(resizeViewportAction(store, id, vp.id, { x: vp.at.x, y: vp.at.y, w: vp.size.w * 0.8, h: vp.size.h * 0.8 })).toBeNull();
      expect(setViewportScaleAction(store, id, vp.id, vp.scale * 2)).toBeNull();
      sheetOk(store.project);
      // remover vista e desfazer
      store.exec({ type: 'removeViewport', sheetId: id, id: vp.id });
      expect(vps()).toHaveLength(n0 - 1);
      store.undo();
      expect(vps()).toHaveLength(n0);
      // duplicar prancha
      const cmd = duplicateSheetCommand(store.project, id)!;
      const total = projectSheets(store.project).length;
      store.exec(cmd);
      expect(projectSheets(store.project)).toHaveLength(total + 1);
      const copy = projectSheets(store.project).at(-1)!;
      expect(copy.id).not.toBe(id);
      expect(new Set(copy.viewports.map((v) => v.id)).size).toBe(copy.viewports.length);
      expect(drawSummary(drawOf(store.project, copy.id))).toBe(drawSummary(drawOf(store.project, id)));
      // apagar a cópia e a original; vista de prancha inexistente
      store.exec({ type: 'removeSheet', id: copy.id });
      expect(drawOf(store.project, copy.id)).toBeNull();
      expect(() => applySheetCommand(store.project, { type: 'removeViewport', sheetId: copy.id, id: vp.id })).toThrow();
      store.exec({ type: 'removeSheet', id });
      expect(projectSheets(store.project)).toHaveLength(total - 1);
      store.undo();
      store.undo();
      store.undo();
      expect(projectSheets(store.project)).toHaveLength(total);
    }, 600000);

    it('vista cuja origem foi apagada (nível, corte, planta de área) some da prancha sem quebrar o desenho', () => {
      // Nível vazio (sem elementos, apagável) com a planta dele numa prancha, ao lado do corte e da planta de área.
      store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_vazio', name: 'Vazio', elevation: 99 }) });
      const host = sheetIds[3]!;
      const sheetHost = sheetOf(store.project, host)!;
      store.exec({ type: 'addViewport', sheetId: host, viewport: { id: 'vp_vazio', view: { kind: 'plan', levelId: 'lv_vazio' }, at: { x: sheetHost.margin + 1, y: sheetHost.margin + 1 }, size: { w: 30, h: 30 }, scale: 100 } });
      const lastLevel = 'lv_vazio';
      const idsWith = (pred: (v: ReturnType<typeof sheetOf>) => boolean): Id[] => sheetIds.filter((s) => pred(sheetOf(store.project, s)));
      const nBefore = projectSheets(store.project).reduce((a, s) => a + s.viewports.length, 0);
      store.exec({ type: 'deleteView', id: 'sec_a' });
      store.exec({ type: 'removeAreaPlan', id: 'ap_0' });
      store.exec({ type: 'deleteLevel', id: lastLevel });
      const nAfter = projectSheets(store.project).reduce((a, s) => a + s.viewports.length, 0);
      expect(nAfter).toBeLessThan(nBefore);
      for (const s of projectSheets(store.project)) {
        const d = drawOf(store.project, s.id);
        expect(d).not.toBeNull();
        expect(drawIsFinite(d!)).toBe(true);
      }
      expect(idsWith(() => true).length).toBeGreaterThan(0);
      sheetOk(store.project);
      store.undo();
      store.undo();
      store.undo();
      expect(projectSheets(store.project).reduce((a, s) => a + s.viewports.length, 0)).toBe(nBefore);
    }, 600000);

    it('projeto carregado com vista de origem inexistente (arquivo corrompido/antigo) não derruba o desenho', () => {
      const p = structuredClone(store.project) as Project;
      const s0 = p.sheets![0]!;
      s0.viewports.push({ ...s0.viewports[0]!, id: 'vp_orfa1', view: { kind: 'plan', levelId: 'lv_fantasma' } });
      s0.viewports.push({ ...s0.viewports[0]!, id: 'vp_orfa2', view: { kind: 'section', sectionId: 'sec_fantasma' } });
      s0.viewports.push({ ...s0.viewports[0]!, id: 'vp_orfa3', view: { kind: 'areaPlan', planId: 'ap_fantasma' } });
      s0.viewports.push({ ...s0.viewports[0]!, id: 'vp_orfa4', view: { kind: '3d', pointId: 'pt_fantasma' } });
      const d = drawOf(p, s0.id);
      expect(d).not.toBeNull();
      expect(drawIsFinite(d!)).toBe(true);
      expect(() => sheetsPdfOf(p, 'pt')).not.toThrow();
      expect(() => sheetDxf(p, s0.id, { units: 'mm' })).not.toThrow();
    }, 600000);

    it('salvar e abrir: ida e volta (serialize + migrate) preserva pranchas e desenho', () => {
      const t = performance.now();
      const json = serializeProject(store.project);
      const ser = performance.now() - t;
      const t2 = performance.now();
      const back = migrateProject(JSON.parse(json));
      const mig = performance.now() - t2;
      // units-ok: texto de log do diagnóstico de estabilidade (não é exibido ao usuário)
      log(label, `salvar ${(json.length / 1048576).toFixed(2)} MB em ${ser.toFixed(0)} ms · abrir (parse+migrate) ${mig.toFixed(0)} ms`);
      expect(back.sheets).toEqual(store.project.sheets);
      for (const id of sheetIds) expect(drawSummary(drawOf(back, id))).toBe(drawSummary(drawOf(store.project, id)));
      // Sem o campo `sheets` (arquivo antigo) abre sem pranchas.
      const old = JSON.parse(json) as Record<string, unknown>;
      delete old.sheets;
      expect(projectSheets(migrateProject(old))).toHaveLength(0);
    }, 600000);
  });
}
