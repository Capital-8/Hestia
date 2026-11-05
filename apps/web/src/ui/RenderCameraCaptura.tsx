import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { editor } from '../editor/controller.ts';
import { cancelarCapturaRenderAction, confirmarCapturaRenderAction, useRenderCameraUi, type CapturaRender } from '../editor/renderCameraActions.ts';
import { useUi } from '../editor/state.ts';
import { PROPORCOES_RENDER, retanguloDaPrevia } from './renderCameraCaptura.ts';
import './RenderCameraCaptura.css';

/**
 * Captura de câmera de render sobre a vista 3D: a moldura mostra a área que o render pegará (não captura imagem) e o
 * cartão pede nome e proporção. A camada não bloqueia o mouse: só o cartão recebe cliques, então dá para orbitar o 3D.
 */
export function RenderCameraCaptura({ host }: { host: RefObject<HTMLDivElement | null> }): ReactElement | null {
  const view = useUi((s) => s.view);
  const captura = useRenderCameraUi((s) => s.captura);
  // A captura só existe com o Modelo 3D aberto: sair dele cancela, para não reaparecer sem aviso ao voltar.
  useEffect(() => {
    if (captura && view !== '3d') cancelarCapturaRenderAction();
  }, [captura, view]);
  if (!captura || view !== '3d') return null;
  return <CapturaAberta host={host} captura={captura} />;
}

function CapturaAberta({ host, captura }: { host: RefObject<HTMLDivElement | null>; captura: CapturaRender }): ReactElement {
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const medir = (): void => setTamanho({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [host]);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const quadro = retanguloDaPrevia(tamanho.w, tamanho.h, captura.aspect.w / captura.aspect.h);
  const guardar = (): void => {
    const recusa = confirmarCapturaRenderAction(editor.store, captura.nome, captura.aspect);
    if (recusa) return setErro(recusa);
    setErro(null);
    useUi.setState({ status: 'Câmera de render guardada e selecionada.' });
  };
  const cancelar = (): void => {
    setErro(null);
    cancelarCapturaRenderAction();
  };
  return (
    <div className="rcap-camada">
      {quadro.w > 0 && (
        <div className="rcap-moldura" style={{ left: quadro.x, top: quadro.y, width: quadro.w, height: quadro.h }} aria-hidden="true" />
      )}
      <form
        className="rcap-cartao"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancelar();
        }}
      >
        <div className="rcap-titulo">Capturar câmera de render</div>
        <label className="rcap-campo">
          <span>Nome</span>
          <input
            ref={inputRef}
            className="input"
            value={captura.nome}
            onChange={(e) => useRenderCameraUi.setState({ captura: { ...captura, nome: e.target.value } })}
            aria-label="Nome da câmera de render"
          />
        </label>
        <label className="rcap-campo">
          <span>Proporção</span>
          <select
            className="input"
            value={`${captura.aspect.w}:${captura.aspect.h}`}
            onChange={(e) => {
              const p = PROPORCOES_RENDER.find((x) => x.rotulo === e.target.value);
              if (p) useRenderCameraUi.setState({ captura: { ...captura, aspect: p.aspect } });
            }}
            aria-label="Proporção do render"
          >
            {PROPORCOES_RENDER.map((p) => (
              <option key={p.rotulo} value={p.rotulo}>{p.rotulo}</option>
            ))}
          </select>
        </label>
        <p className="rcap-dica">Gire a vista 3D até o enquadramento. Guardar usa a câmera atual.</p>
        {erro && <p className="rcap-erro" role="alert">{erro}</p>}
        <div className="rcap-acoes">
          <button type="button" className="btn" onClick={cancelar}>Cancelar</button>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}
