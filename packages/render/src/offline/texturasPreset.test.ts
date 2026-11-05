import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MaterialTexturePreset } from '@hestia/model';
import { arquivosDoPreset } from './texturasPreset.ts';

const PRESETS: Exclude<MaterialTexturePreset, 'nenhum'>[] = ['tijolo', 'reboco', 'madeira', 'telha', 'pedra', 'concreto', 'metal', 'piso'];
const BIBLIOTECA = fileURLToPath(new URL('../../../../apps/web/public/texturas-render/', import.meta.url));

describe('arquivosDoPreset', () => {
  it('cobre todos os presets com albedo, normal e rugosidade', () => {
    for (const preset of PRESETS) {
      const arquivos = arquivosDoPreset(preset);
      expect(arquivos, preset).not.toBeNull();
      expect(arquivos!.albedo.endsWith('_albedo.jpg')).toBe(true);
      expect(arquivos!.normal.endsWith('_normal.jpg')).toBe(true);
      expect(arquivos!.roughness.endsWith('_roughness.jpg')).toBe(true);
    }
  });

  it('mapeia cada preset ao conjunto de arquivos do brief', () => {
    expect(arquivosDoPreset('tijolo')).toEqual({ albedo: 'tijolo_vermelho_albedo.jpg', normal: 'tijolo_vermelho_normal.jpg', roughness: 'tijolo_vermelho_roughness.jpg' });
    expect(arquivosDoPreset('reboco')?.albedo).toBe('reboco_estuque_albedo.jpg');
    expect(arquivosDoPreset('madeira')?.albedo).toBe('madeira_tabua_albedo.jpg');
    expect(arquivosDoPreset('telha')?.albedo).toBe('telha_argila_albedo.jpg');
    expect(arquivosDoPreset('pedra')?.albedo).toBe('pedra_arenito_albedo.jpg');
    expect(arquivosDoPreset('concreto')?.albedo).toBe('concreto_parede_albedo.jpg');
    expect(arquivosDoPreset('piso')?.albedo).toBe('piso_ceramico_albedo.jpg');
  });

  it('só o metal tem mapa de metalicidade', () => {
    expect(arquivosDoPreset('metal')).toEqual({
      albedo: 'metal_chapa_albedo.jpg',
      normal: 'metal_chapa_normal.jpg',
      roughness: 'metal_chapa_roughness.jpg',
      metallic: 'metal_chapa_metalness.jpg',
    });
    for (const preset of PRESETS.filter((p) => p !== 'metal')) {
      expect(arquivosDoPreset(preset)?.metallic, preset).toBeUndefined();
    }
  });

  it('nenhum preset, ausência ou valor desconhecido devolvem null', () => {
    expect(arquivosDoPreset('nenhum')).toBeNull();
    expect(arquivosDoPreset(undefined)).toBeNull();
    expect(arquivosDoPreset('inexistente' as MaterialTexturePreset)).toBeNull();
  });

  it('todo arquivo mapeado existe na biblioteca publicada', () => {
    for (const preset of PRESETS) {
      const arquivos = arquivosDoPreset(preset)!;
      for (const caminho of [arquivos.albedo, arquivos.normal, arquivos.roughness, arquivos.metallic]) {
        if (caminho === undefined) continue;
        expect(existsSync(BIBLIOTECA + caminho), caminho).toBe(true);
      }
    }
  });
});
