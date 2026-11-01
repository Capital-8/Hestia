import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { dimensionValue, formatQuantity } from '@hestia/model';
import { worldToScreen } from '@hestia/render';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { currentUnits } from '../useUnits.ts';
import { INVALID_FLASH_MS } from './dimsActions.ts';
import { larguraDoCampo } from './dimsBox.ts';
import { dimTextPoint, findEditDim, resolveDimEditInput } from './dimEditModel.ts';

const DANGER = 'var(--danger, #d33)';
const BOX: CSSProperties = { position: 'absolute', height: 22, padding: 0, textAlign: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--panel)', border: '1px solid var(--accent)', outline: 'none', color: 'var(--accent)', zIndex: 14, pointerEvents: 'auto', transform: 'translate(-50%, -50%)' };

/** Campo de valor da cota dirigida (duplo clique numa cota permanente): Enter aplica, Esc ou clique fora fecha. */
export function DimValueEditor(): ReactElement | null {
  const id = useUi((s) => s.dimEditId);
  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  const areaPlanId = useUi((s) => s.areaPlanId);
  const planKind = useUi((s) => s.planKind);
  const sectionId = useUi((s) => s.sectionId);
  useUi((s) => s.previewTick);
  const [text, setText] = useState('');
  const [fixed, setFixed] = useState<'a' | 'b' | undefined>(undefined);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = (): void => useUi.setState({ dimEditId: null });

  const project = editor.project;
  const found = id ? findEditDim(project, { view, levelId, areaPlanId, planKind, sectionId }, id) : null;
  const foundId = found?.dim.id;
  useEffect(() => {
    if (!found) return;
    const v = found.dim.angular ? 0 : dimensionValue(project, found.dim);
    setText(formatQuantity(currentUnits(), 'length', v, { trim: true }));
    setFixed(undefined);
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundId]);
  useEffect(() => {
    if (foundId) { input.current?.focus(); input.current?.select(); }
  }, [foundId]);
  useEffect(() => {
    if (!invalid) return undefined;
    const t = setTimeout(() => setInvalid(false), INVALID_FLASH_MS);
    return () => clearTimeout(t);
  }, [invalid]);
  useEffect(() => {
    if (!foundId) return undefined;
    const away = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement | null)?.closest?.('[data-dim-editor]')) useUi.setState({ dimEditId: null });
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [foundId]);

  const vp = editor.viewport();
  if (!found || !vp) return null;
  const at = worldToScreen(vp, dimTextPoint(project, found.dim, found.scale));
  const apply = (): void => {
    const r = resolveDimEditInput(project, found.dim, text, currentUnits(), { ...(fixed ? { fixed } : {}), inSection: found.inSection });
    if (!r.ok) {
      useUi.setState({ status: r.reason });
      setInvalid(true);
      return;
    }
    if (r.commands.length > 0) {
      const applied = editor.applyCommands('Alterar cota', r.commands);
      if (applied.status === 'pending') {
        useUi.setState({ status: 'Confirme o diálogo para aplicar a cota.' });
        return;
      }
      if (applied.status !== 'cancelled') useUi.setState({ status: 'Cota atualizada.' });
    }
    close();
  };
  return (
    <div data-dim-editor style={{ position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none' }}>
      <input
        ref={input}
        className="input num"
        aria-label="Valor da cota"
        style={{ ...BOX, left: at.x, top: at.y, width: larguraDoCampo(text), ...(invalid ? { color: DANGER, borderColor: DANGER } : {}) }}
        value={text}
        onChange={(e) => { setText(e.target.value); setInvalid(false); }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') apply();
          else if (e.key === 'Escape') close();
        }}
      />
      <button
        type="button"
        className="btn"
        title="Ponta que fica parada: automático, A ou B"
        style={{ position: 'absolute', left: at.x, top: at.y + 16, transform: 'translateX(-50%)', fontSize: 10, padding: '0 6px', pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setFixed(fixed === undefined ? 'a' : fixed === 'a' ? 'b' : undefined)}
      >
        {fixed ? `fixar ${fixed.toUpperCase()}` : 'automático'}
      </button>
    </div>
  );
}
