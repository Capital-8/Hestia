import { describe, expect, it } from 'vitest';
import { lerLevantamentoDxf } from '@hestia/io';
import { createEmptyProject, isTerrain, ProjectStore, terrainIssue, type Terrain } from '@hestia/model';
import levantamento from '../../../../tests/fixtures/terreno/levantamento.dxf?raw';
import { destinosPadrao, fontesDoDxf, propostaLocalizacao, type FontesImportadas } from './importTerrenoModel.ts';
import { abrirImportTerreno, aplicarImportacaoTerreno, fecharImportTerreno, ImportacaoBloqueada, nomeDoTerreno, tipoDoArquivoTerreno, importTerrenoAberto } from './terrenoImport.ts';

const lev = lerLevantamentoDxf(levantamento, 'levantamento');
const fontes = fontesDoDxf(lev, destinosPadrao(lev.camadas), 0.05);
const terrenos = (s: ProjectStore): Terrain[] => Object.values(s.project.elements).filter(isTerrain);

/** As mesmas fontes em UTM de exemplo (leste 333 000, norte 7 394 000, cotas somadas a 740). */
function emUtm(f: FontesImportadas): FontesImportadas {
  const mover = (xy: number[]): number[] => xy.map((v, k) => v + (k % 2 === 0 ? 333000 : 7394000));
  return {
    pontos: f.pontos.map((v, k) => v + (k % 3 === 0 ? 333000 : k % 3 === 1 ? 7394000 : 740)),
    curvas: f.curvas.map((c) => ({ ...c, z: c.z + 740, xy: mover(c.xy) })),
    quebras: [],
  };
}

describe('aplicarImportacaoTerreno', () => {
  it('o levantamento.dxf gera um terreno válido e um desfazer o remove', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = aplicarImportacaoTerreno(s, { levelId: 'lv_0', nome: 'Levantamento', fontes });
    const [tn] = terrenos(s);
    expect(terrenos(s)).toHaveLength(1);
    expect(tn!.id).toBe(r.terrenoId);
    expect(tn!.name).toBe('Levantamento');
    expect(tn!.curvas).toHaveLength(12);
    expect(tn!.pontos).toHaveLength(120);
    expect(terrainIssue(tn!)).toBeNull();
    expect(r.vertices).toBe(tn!.pontos.length / 3 + tn!.curvas.reduce((a, c) => a + c.xy.length / 2, 0));
    expect(s.project.localizacao).toBeUndefined();
    s.undo();
    expect(terrenos(s)).toHaveLength(0);
  });

  it('com a proposta aceita grava a localização e leva as fontes para locais; um desfazer remove terreno e localização juntos', () => {
    const s = new ProjectStore(createEmptyProject());
    const utm = emUtm(fontes);
    const proposta = propostaLocalizacao(utm, s.project);
    expect(proposta).not.toBeNull();
    const passos = (s as unknown as { past: unknown[] }).past.length;
    aplicarImportacaoTerreno(s, { levelId: 'lv_0', nome: 'UTM', fontes: utm, proposta, aceitarProposta: true });
    expect((s as unknown as { past: unknown[] }).past.length).toBe(passos + 1);
    expect(s.project.localizacao).toEqual({ ...proposta, norteVerdadeiro: 0 });
    const [tn] = terrenos(s);
    expect(terrainIssue(tn!)).toBeNull();
    expect(Math.max(...tn!.pontos.filter((_, k) => k % 3 !== 2).map(Math.abs))).toBeLessThan(500);
    expect(Math.max(...tn!.curvas.map((c) => c.z))).toBeLessThan(30);
    s.undo();
    expect(terrenos(s)).toHaveLength(0);
    expect(s.project.localizacao).toBeUndefined();
    s.redo();
    expect(terrenos(s)).toHaveLength(1);
    expect(s.project.localizacao).toBeDefined();
  });

  it('sem aceitar a proposta, coordenadas grandes são bloqueadas e o projeto não muda', () => {
    const s = new ProjectStore(createEmptyProject());
    const utm = emUtm(fontes);
    const antes = s.project;
    expect(() => aplicarImportacaoTerreno(s, { levelId: 'lv_0', nome: 'x', fontes: utm, proposta: propostaLocalizacao(utm, s.project), aceitarProposta: false })).toThrow(ImportacaoBloqueada);
    expect(s.project).toBe(antes);
  });

  it('fontes vazias são bloqueadas com a mensagem de nada a importar', () => {
    const s = new ProjectStore(createEmptyProject());
    try {
      aplicarImportacaoTerreno(s, { levelId: 'lv_0', nome: 'x', fontes: { pontos: [], curvas: [], quebras: [] } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ImportacaoBloqueada);
      expect((e as ImportacaoBloqueada).bloqueio.chave).toBe('ui_tn_imp_vazio');
    }
  });

  it('nível inexistente é recusado pelo modelo e nada é gravado', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => aplicarImportacaoTerreno(s, { levelId: 'nao-existe', nome: 'x', fontes })).toThrow();
    expect(terrenos(s)).toHaveLength(0);
  });
});

describe('abertura do diálogo e nomes', () => {
  it('abrirImportTerreno abre e fecharImportTerreno fecha', () => {
    fecharImportTerreno();
    expect(importTerrenoAberto()).toBe(false);
    abrirImportTerreno();
    expect(importTerrenoAberto()).toBe(true);
    fecharImportTerreno();
    expect(importTerrenoAberto()).toBe(false);
  });

  it('reconhece .dxf e .csv por extensão, sem diferenciar maiúsculas', () => {
    expect(tipoDoArquivoTerreno('Lote.DXF')).toBe('dxf');
    expect(tipoDoArquivoTerreno('pontos.csv')).toBe('csv');
    expect(tipoDoArquivoTerreno('mapa.dwg')).toBeNull();
    expect(tipoDoArquivoTerreno('semextensao')).toBeNull();
  });

  it('o nome do terreno vem do arquivo, sem extensão', () => {
    expect(nomeDoTerreno('lote 7.dxf')).toBe('lote 7');
    expect(nomeDoTerreno('.csv')).toBe('Terreno');
    expect(nomeDoTerreno('  ')).toBe('Terreno');
  });
});
