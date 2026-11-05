import { useState, type ReactElement } from 'react';
import type { AnimationMode, AnimationSequence } from '@hestia/render';
import { useAnimationStore } from '../../editor/animationStore.ts';
import type { SheetView3DCamera } from '@hestia/model';

interface Props {
  /** Câmera viva da prévia (null antes do canvas montar). */
  cameraAtual: () => SheetView3DCamera | null;
}

const graus = (rad: number): number => Math.round((rad * 180) / Math.PI);
const rad = (g: number): number => (g * Math.PI) / 180;
const idKf = (): string => `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const MODOS: Array<{ id: AnimationMode; label: string; hint: string }> = [
  { id: 'turntable', label: 'Turntable', hint: 'Uma volta em torno do alvo, sem keyframes.' },
  { id: 'keyframes', label: 'Keyframes', hint: 'Câmera interpolada entre pontos capturados.' },
  { id: 'solar', label: 'Estudo solar', hint: 'Em breve: sol ao longo do dia.' },
];

const RESOLUCOES: Array<{ label: string; w: number; h: number }> = [
  { label: '640 × 360 (rascunho)', w: 640, h: 360 },
  { label: '1280 × 720 (HD)', w: 1280, h: 720 },
  { label: '1920 × 1080 (Full HD)', w: 1920, h: 1080 },
  { label: '3840 × 2160 (4K)', w: 3840, h: 2160 },
];

/** Painel direito do Estúdio: sequência, câmera, luz e saída. */
export function StudioInspector({ cameraAtual }: Props): ReactElement | null {
  const seq = useAnimationStore((s) => (s.activeId ? s.sequences[s.activeId] : undefined));
  const playhead = useAnimationStore((s) => s.playhead);
  const selecionado = useAnimationStore((s) => s.selectedKeyframe);
  const update = useAnimationStore((s) => s.update);
  const addKeyframe = useAnimationStore((s) => s.addKeyframe);
  const updateKeyframe = useAnimationStore((s) => s.updateKeyframe);
  const removeKeyframe = useAnimationStore((s) => s.removeKeyframe);
  const selectKeyframe = useAnimationStore((s) => s.selectKeyframe);
  const [nome, setNome] = useState(seq?.name ?? '');

  if (!seq) return null;
  const set = (patch: Partial<AnimationSequence>): void => update(seq.id, patch);
  const turntable = seq.turntable;
  const kf = selecionado ? seq.keyframes.find((k) => k.id === selecionado) ?? null : null;

  const capturar = (): void => {
    const cam = cameraAtual();
    if (!cam) return;
    addKeyframe({ id: idKf(), t: playhead, camera: { ...cam, target: { ...cam.target } }, easing: 'smooth' });
  };
  const atualizarKf = (): void => {
    const cam = cameraAtual();
    if (!cam || !kf) return;
    updateKeyframe(kf.id, { camera: { ...cam, target: { ...cam.target } } });
  };

  return (
    <aside className="anim-inspector" aria-label="Configurações da animação">
      <section className="anim-sec">
        <h3>Sequência</h3>
        <label className="anim-field">
          Nome
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => { if (nome.trim()) set({ name: nome.trim() }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <div className="anim-seg" role="group" aria-label="Modo da animação">
          {MODOS.map((m) => (
            <button
              key={m.id}
              className={seq.mode === m.id ? 'on' : ''}
              title={m.hint}
              onClick={() => set({ mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="anim-grid2">
          <label className="anim-field">
            Duração (s)
            <input
              className="input"
              type="number"
              min={1}
              max={120}
              step={0.5}
              value={seq.duration}
              onChange={(e) => set({ duration: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label className="anim-field">
            FPS
            <select className="select" value={seq.fps} onChange={(e) => set({ fps: Number(e.target.value) })}>
              {[15, 24, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="anim-sec">
        <h3>Câmera</h3>
        {seq.mode === 'solar' && seq.solar ? (
          <>
            <label className="anim-field">
              Data
              <input
                className="input"
                type="date"
                value={seq.solar.date}
                onChange={(e) => set({ solar: { ...seq.solar!, date: e.target.value } })}
              />
            </label>
            <div className="anim-grid2">
              <label className="anim-field">
                Latitude
                <input
                  className="input"
                  type="number"
                  step={0.01}
                  value={seq.solar.latitude}
                  onChange={(e) => set({ solar: { ...seq.solar!, latitude: Number(e.target.value) || 0 } })}
                />
              </label>
              <label className="anim-field">
                Longitude
                <input
                  className="input"
                  type="number"
                  step={0.01}
                  value={seq.solar.longitude}
                  onChange={(e) => set({ solar: { ...seq.solar!, longitude: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
            <div className="anim-grid2">
              <label className="anim-field">
                Início (h)
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={seq.solar.startHour}
                  onChange={(e) => set({ solar: { ...seq.solar!, startHour: Number(e.target.value) || 0 } })}
                />
              </label>
              <label className="anim-field">
                Fim (h)
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={seq.solar.endHour}
                  onChange={(e) => set({ solar: { ...seq.solar!, endHour: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
            <label className="anim-field">
              Fuso horário (h em relação a UTC)
              <input
                className="input"
                type="number"
                min={-12}
                max={14}
                step={0.5}
                value={seq.solar.timezone ?? 0}
                onChange={(e) => set({ solar: { ...seq.solar!, timezone: Number(e.target.value) || 0 } })}
              />
            </label>
            <div className="anim-row">
              <button className="btn small" onClick={() => { const c = cameraAtual(); if (c) set({ solarCamera: { ...c, target: { ...c.target } } }); }}>
                Capturar câmera atual
              </button>
              <span className="anim-hint">Câmera fixa</span>
            </div>
            <p className="anim-hint">O sol percorre o intervalo escolhido; a câmera fica parada.</p>
          </>
        ) : seq.mode === 'turntable' && turntable ? (
          <>
            <div className="anim-grid2">
              <label className="anim-field">
                Distância (m)
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={0.5}
                  value={turntable.distance}
                  onChange={(e) => set({ turntable: { ...turntable, distance: Math.max(1, Number(e.target.value) || 1) } })}
                />
              </label>
              <label className="anim-field">
                Elevação (°)
                <input
                  className="input"
                  type="number"
                  min={-89}
                  max={89}
                  value={graus(turntable.elevation)}
                  onChange={(e) => set({ turntable: { ...turntable, elevation: rad(Number(e.target.value) || 0) } })}
                />
              </label>
            </div>
            <div className="anim-grid2">
              <label className="anim-field">
                Ângulo inicial (°)
                <input
                  className="input"
                  type="number"
                  value={graus(turntable.startAzimuth)}
                  onChange={(e) => set({ turntable: { ...turntable, startAzimuth: rad(Number(e.target.value) || 0) } })}
                />
              </label>
              <label className="anim-field">
                Voltas
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={turntable.turns ?? 1}
                  onChange={(e) => set({ turntable: { ...turntable, turns: Math.max(1, Number(e.target.value) || 1) } })}
                />
              </label>
            </div>
            <p className="anim-hint">A câmera gira em torno do alvo atual. Use “Capturar câmera atual” para trocar o alvo.</p>
          </>
        ) : (
          <>
            <div className="anim-row">
              <button className="btn small" onClick={capturar} title="Tecla K">Capturar câmera atual</button>
              <span className="anim-hint">{seq.keyframes.length} keyframe(s)</span>
            </div>
            {seq.keyframes.length > 0 ? (
              <div className="anim-kf-list" role="list">
                {seq.keyframes.map((k, i) => (
                  <div key={k.id} className={`anim-kf${selecionado === k.id ? ' on' : ''}`} role="listitem">
                    <button className="anim-kf-main" onClick={() => selectKeyframe(k.id)}>
                      {/* units-ok: tempo de keyframe em segundos, não é medida do modelo. */}
                      <b>#{i + 1}</b> {k.t.toFixed(1)} s
                    </button>
                    <button className="ibtn" aria-label={`Excluir keyframe ${i + 1}`} title="Excluir" onClick={() => removeKeyframe(k.id)}>×</button>
                  </div>
                ))}
              </div>
            ) : <p className="anim-hint">Sem keyframes. Capture a câmera para começar.</p>}
            {kf ? (
              <button className="btn small" onClick={atualizarKf}>Atualizar keyframe com a câmera atual</button>
            ) : null}
          </>
        )}
      </section>

      <section className="anim-sec">
        <h3>Luz e fundo</h3>
        <label className="anim-field">
          Exposição
          <input
            className="input"
            type="range"
            min={-2}
            max={2}
            step={0.1}
            value={seq.exposure}
            onChange={(e) => set({ exposure: Number(e.target.value) })}
          />
        </label>
        <label className="anim-field anim-check">
          <input
            type="checkbox"
            checked={seq.background === null}
            onChange={(e) => set({ background: e.target.checked ? null : '#dfe7ee' })}
          />
          Fundo do tema
        </label>
        {seq.background !== null ? (
          <label className="anim-field">
            Cor de fundo
            <input type="color" value={seq.background} onChange={(e) => set({ background: e.target.value })} />
          </label>
        ) : null}
        <p className="anim-hint">
          {seq.mode === 'solar'
            ? 'No estudo solar, a luz segue a data, a hora e a localização.'
            : 'O sol segue a vista 3D do projeto (Gerenciar › Vista 3D).'}
        </p>
      </section>

      <section className="anim-sec">
        <h3>Saída</h3>
        <label className="anim-field">
          Resolução
          <select
            className="select"
            value={`${seq.resolution.w}x${seq.resolution.h}`}
            onChange={(e) => {
              const r = RESOLUCOES.find((x) => `${x.w}x${x.h}` === e.target.value);
              if (r) set({ resolution: { w: r.w, h: r.h } });
            }}
          >
            {RESOLUCOES.map((r) => <option key={r.label} value={`${r.w}x${r.h}`}>{r.label}</option>)}
          </select>
        </label>
        <label className="anim-field">
          Qualidade
          <select className="select" value={seq.quality} onChange={(e) => set({ quality: e.target.value as AnimationSequence['quality'] })}>
            <option value="draft">Rascunho (rápido)</option>
            <option value="medium">Média</option>
            <option value="final">Final (Rust/WASM)</option>
            <option value="gpu">GPU nativo (render-service)</option>
          </select>
        </label>
        <label className="anim-field">
          Formato
          <select className="select" value={seq.format} onChange={(e) => set({ format: e.target.value as AnimationSequence['format'] })}>
            <option value="webm">WebM (rascunho)</option>
            <option value="mp4">MP4 (quando disponível)</option>
          </select>
        </label>
        <p className="anim-hint">Rascunho grava a prévia; Final usa Rust/WASM no navegador; GPU nativo usa o render-service local com wgpu.</p>
      </section>
    </aside>
  );
}
