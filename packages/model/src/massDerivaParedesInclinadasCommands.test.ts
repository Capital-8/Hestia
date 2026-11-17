import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { aberturasDasParedesDaMassa, comandoDerivarParedes, type CadeiaDerivadaParedes } from './massDerivaCommands.ts';
import { makeLevel } from './level.ts';
import { makeMass, secaoCirculo } from './mass.ts';
import { createEmptyProject, isWall, ProjectStore, type Id, type Project, type Wall } from './index.ts';
import { makeWall } from './wall.ts';
import { CURTAIN_PRESET_ID, curtainPresetType } from './wallCurtainPresets.ts';
import { wallTiltIssue } from './wallTilt.ts';
import { t } from './i18n.ts';

const caixa: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 6 },
  { x: 10, y: 6 },
  { x: 10, y: 0 },
];
const paredes = (p: Project): Wall[] => Object.values(p.elements).filter(isWall);

function projeto(): { s: ProjectStore; terreo: Id; tipo: Id } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_a', name: 'A', elevation: 3 }) });
  const terreo = s.project.levels.find((l) => l.elevation === 0)!.id;
  s.exec({ type: 'addMass', mass: makeMass({ id: 'm1', levelId: terreo, name: 'Torre', secoes: [secaoCirculo(0, 5), secaoCirculo(9, 5)] }) });
  return { s, terreo, tipo: Object.keys(s.project.wallTypes)[0]! };
}

const passo = (nivelId: Id, extra: Partial<CadeiaDerivadaParedes>): CadeiaDerivadaParedes => ({ nivelId, pontos: caixa, topoNivelId: null, altura: 1.5, ...extra });

describe('paredes inclinadas da massa: comando', () => {
  it('cria as paredes com baseOffset, altura, tilt e linha de localização; zero não grava tilt', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], locationLine: 'finishExterior', cadeias: [passo(terreo, { baseOffset: 1.5, tilts: [2.5, -3, 0, 10] })] }));
    const ws = paredes(s.project).sort((a, b) => a.order - b.order);
    expect(ws.map((w) => w.tilt)).toEqual([2.5, -3, undefined, 10]);
    expect('tilt' in ws[2]!).toBe(false);
    for (const w of ws) {
      expect(w.baseOffset).toBe(1.5);
      expect(w.height).toBe(1.5);
      expect(w.topLevelId).toBeNull();
      expect(w.locationLine).toBe('finishExterior');
      expect(w.origemMassa).toEqual({ massaId: 'm1', nivelId: terreo });
    }
  });

  it('sem locationLine no comando a linha fica a padrão do modelo (comportamento de antes)', () => {
    const { s, terreo, tipo } = projeto();
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, {})] }));
    for (const w of paredes(s.project)) expect(w.locationLine).toBe('wallCenter');
  });

  it('tipos por face: cada parede usa o seu tipo; tipo inexistente recusa sem mudar o projeto', () => {
    const { s, terreo, tipo } = projeto();
    const outro = { ...s.project.wallTypes[tipo]!, id: 'wt_outro', name: 'Outro' };
    s.exec({ type: 'upsertWallType', wallType: outro });
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, { typeIds: [tipo, 'wt_outro', tipo, 'wt_outro'] })] }));
    expect(paredes(s.project).sort((a, b) => a.order - b.order).map((w) => w.typeId)).toEqual([tipo, 'wt_outro', tipo, 'wt_outro']);
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, { typeIds: ['wt_nao', tipo, tipo, tipo] })] })).toThrow();
  });

  it('inclinação além de 60° é recusada e nada muda', () => {
    const { s, terreo, tipo } = projeto();
    expect(() => comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, { tilts: [61, 0, 0, 0] })] })).toThrow();
    expect(paredes(s.project)).toHaveLength(0);
  });

  it('um desfazer remove todos os passos de uma vez e rodar de novo substitui (não duplica)', () => {
    const { s, terreo, tipo } = projeto();
    const args = { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, { tilts: [1, 1, 1, 1] }), passo(terreo, { baseOffset: 1.5, tilts: [2, 2, 2, 2] })] };
    s.exec(comandoDerivarParedes(s.project, args));
    expect(paredes(s.project)).toHaveLength(8);
    s.exec(comandoDerivarParedes(s.project, args));
    expect(paredes(s.project)).toHaveLength(8);
    s.undo();
    expect(paredes(s.project)).toHaveLength(8);
    s.undo();
    expect(paredes(s.project)).toHaveLength(0);
  });

  it('aberturas hospedadas nas paredes geradas: listadas antes e removidas junto na substituição', () => {
    const { s, terreo, tipo } = projeto();
    const args = { massaId: 'm1', typeId: tipo, niveis: [terreo], cadeias: [passo(terreo, { tilts: [1, 0, 0, 0] })] };
    s.exec(comandoDerivarParedes(s.project, args));
    const w = paredes(s.project)[0]!;
    const tipoAbertura = Object.keys(s.project.openingTypes)[0]!;
    s.exec({ type: 'addOpening', opening: { kind: 'door', id: 'porta1', typeId: tipoAbertura, hostId: w.id, offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(aberturasDasParedesDaMassa(s.project, 'm1', [terreo])).toEqual(['porta1']);
    expect(aberturasDasParedesDaMassa(s.project, 'm1', [])).toEqual([]);
    s.exec(comandoDerivarParedes(s.project, args));
    expect(s.project.elements['porta1']).toBeUndefined();
    s.undo();
    expect(s.project.elements['porta1']).toBeDefined();
  });

  it('cortina de vidro: aceita tilt em parede reta; arco com tilt é recusado (md_cmd_tilt_curtain_arc)', () => {
    const { s, terreo } = projeto();
    const tipo = curtainPresetType(CURTAIN_PRESET_ID.fachada)!;
    s.exec({ type: 'upsertWallType', wallType: tipo });
    s.exec(comandoDerivarParedes(s.project, { massaId: 'm1', typeId: tipo.id, niveis: [terreo], cadeias: [passo(terreo, { tilts: [10, 10, 10, 10] })] }));
    expect(paredes(s.project).every((w) => w.tilt === 10 && w.typeId === tipo.id)).toBe(true);
    const arco = makeWall({ id: 'arco', typeId: tipo.id, levelId: terreo, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 1 });
    expect(wallTiltIssue(s.project, arco, 10)).toBe(t('pt', 'md_cmd_tilt_curtain_arc'));
    expect(wallTiltIssue(s.project, { ...arco, sag: 0 }, 10)).toBeNull();
  });
});
