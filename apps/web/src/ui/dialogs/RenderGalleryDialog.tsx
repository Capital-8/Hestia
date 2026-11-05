/**
 * Galeria de renderização (imagem e vídeo).
 *
 * Lê os metadados de `editor/renderGallery.ts`, que guarda os bytes no IndexedDB e cai para a
 * memória quando o navegador não libera o banco. A galeria é global por navegador: o nome do
 * projeto vem nos metadados, não filtra a lista.
 *
 * Os botões do cartão carregam o blob só quando o usuário pede (abrir/baixar); na grade, a prévia
 * usa a `thumbnail` salva e, quando ela falta, carrega o blob da imagem apenas para cartões visíveis.
 * Vídeo sem miniatura fica com o rótulo do formato para não decodificar todos os arquivos de uma vez.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  deleteRender,
  getRenderBlob,
  listRenders,
  type RenderAsset,
} from '../../editor/renderGallery.ts';
import { saveBytes } from '../../editor/saveBytes.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import './renderGallery.css';

export type FiltroGaleria = 'todos' | 'image' | 'video';

/** Tamanho máximo para gerar prévia de imagem na grade (bytes). Acima disso fica o rótulo. */
const LIMITE_PREVIA_BYTES = 48 * 1024 * 1024;

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

/** Data e hora locais no formato da interface (dd/mm/aaaa hh:mm). */
export function formatarData(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

/** Duração do vídeo em m:ss (ou h:mm:ss quando passa de uma hora). */
export function formatarDuracao(segundos: number | undefined): string {
  if (segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return '—';
  const total = Math.round(segundos);
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  if (horas > 0) return `${horas}:${doisDigitos(minutos)}:${doisDigitos(total % 60)}`;
  return `${minutos}:${doisDigitos(total % 60)}`;
}

/** Resolução como "1920×1080"; valores inválidos não inventam medida. */
export function formatarResolucao(asset: Pick<RenderAsset, 'width' | 'height'>): string {
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) return '—';
  return `${Math.round(asset.width)}×${Math.round(asset.height)}`;
}

/** Extensão de reserva quando o nome salvo não trouxe nenhuma. */
export function extensaoPadrao(asset: Pick<RenderAsset, 'kind' | 'mime'>): string {
  const mime = asset.mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return EXTENSAO_POR_MIME[mime] ?? (asset.kind === 'video' ? '.mp4' : '.png');
}

/** Nome para download: preserva a extensão salva e só completa quando o nome não tem uma. */
export function nomeDoArquivo(asset: Pick<RenderAsset, 'name' | 'kind' | 'mime'>): string {
  const nome = asset.name.trim() || 'render';
  return /\.[A-Za-z0-9]+$/.test(nome) ? nome : nome + extensaoPadrao(asset);
}

export function filtrarRenders(itens: readonly RenderAsset[], filtro: FiltroGaleria): RenderAsset[] {
  return filtro === 'todos' ? [...itens] : itens.filter((item) => item.kind === filtro);
}

/** Rótulo do formato mostrado no lugar da miniatura (PNG, MP4, WEBM…). */
function rotuloDoFormato(asset: RenderAsset): string {
  const extensao = nomeDoArquivo(asset).split('.').pop() ?? asset.kind;
  return extensao.toUpperCase();
}

function rotuloDoFiltro(filtro: FiltroGaleria): string {
  if (filtro === 'image') return 'Imagens';
  if (filtro === 'video') return 'Vídeos';
  return 'Todos';
}

interface MiniaturaProps {
  asset: RenderAsset;
}

/**
 * Prévia do cartão. Usa a miniatura quando existe; sem ela, carrega o blob da imagem só depois
 * que o cartão entra na área visível. Vídeo sem miniatura não é decodificado na grade.
 */
function Miniatura({ asset }: MiniaturaProps): ReactElement {
  const alvo = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const temMiniatura = Boolean(asset.thumbnail);

  useEffect(() => {
    if (temMiniatura || asset.kind !== 'image') return;
    let vivo = true;
    let objeto: string | null = null;

    const carregar = async (): Promise<void> => {
      try {
        const blob = await getRenderBlob(asset.id);
        if (!vivo || !blob || blob.size > LIMITE_PREVIA_BYTES) return;
        objeto = URL.createObjectURL(blob);
        setUrl(objeto);
      } catch {
        /* sem prévia: o cartão mantém o rótulo do formato */
      }
    };

    const elemento = alvo.current;
    let observador: IntersectionObserver | null = null;
    if (elemento && typeof IntersectionObserver !== 'undefined') {
      observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((entrada) => entrada.isIntersecting)) {
            observador?.disconnect();
            observador = null;
            void carregar();
          }
        },
        { rootMargin: '160px' },
      );
      observador.observe(elemento);
    } else {
      void carregar();
    }

    return () => {
      vivo = false;
      observador?.disconnect();
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [asset.id, asset.kind, temMiniatura]);

  const src = asset.thumbnail || url;
  return (
    <span ref={alvo} className="rg-thumb-img">
      <span className="rg-formato" aria-hidden="true">{rotuloDoFormato(asset)}</span>
      {src ? <img src={src} alt="" loading="lazy" /> : null}
    </span>
  );
}

interface CartaoProps {
  asset: RenderAsset;
  ocupado: boolean;
  confirmando: boolean;
  onAbrir: (asset: RenderAsset) => void;
  onBaixar: (asset: RenderAsset) => void;
  onExcluir: (asset: RenderAsset) => void;
  onConfirmar: (id: string) => void;
  onCancelar: () => void;
}

function Cartao({ asset, ocupado, confirmando, onAbrir, onBaixar, onExcluir, onConfirmar, onCancelar }: CartaoProps): ReactElement {
  const video = asset.kind === 'video';
  return (
    <article className="rg-card" data-confirmando={confirmando ? 'true' : undefined}>
      <button
        className="rg-thumb"
        onClick={() => onAbrir(asset)}
        title={`Abrir ${asset.name}`}
        aria-label={`Abrir ${asset.name}`}
      >
        <Miniatura asset={asset} />
        <span className="rg-selo">{video ? 'Vídeo' : 'Imagem'}</span>
        {video ? <span className="rg-play" aria-hidden="true" /> : null}
        {video ? <span className="rg-dur">{formatarDuracao(asset.duration)}</span> : null}
      </button>
      <div className="rg-info">
        <div className="rg-nome" title={asset.name}>{asset.name}</div>
        <div className="rg-meta">
          <span>{formatarData(asset.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatarResolucao(asset)}</span>
          {video && asset.fps ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{Math.round(asset.fps)} fps</span>
            </>
          ) : null}
        </div>
        <div className="rg-meta rg-meta-projeto">
          <span className="rg-projeto" title={asset.projectName}>{asset.projectName || 'Sem projeto'}</span>
        </div>
        <div className="rg-acoes">
          {confirmando ? (
            <>
              <button className="btn small danger" disabled={ocupado} onClick={() => onExcluir(asset)}>Confirmar</button>
              <button className="btn small" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn small" disabled={ocupado} onClick={() => onAbrir(asset)}>Abrir</button>
              <button className="btn small" disabled={ocupado} onClick={() => onBaixar(asset)}>
                {ocupado ? 'Aguarde…' : 'Baixar'}
              </button>
              <button className="btn small danger" disabled={ocupado} onClick={() => onConfirmar(asset.id)}>Excluir</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

interface Aviso {
  texto: string;
  erro?: boolean;
}

/** Galeria de imagem e vídeo. Preenchida pela tarefa T4. */
export function RenderGalleryDialog(): ReactElement {
  const [itens, setItens] = useState<RenderAsset[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<FiltroGaleria>('todos');
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // O renderGallery.ts cai para a memória quando o IndexedDB não existe; aqui só avisamos o usuário.
  // A leitura é protegida porque um iframe sem mesma origem pode negar o acesso à propriedade.
  const [semIdb] = useState(() => {
    try {
      return typeof indexedDB === 'undefined' || indexedDB === null;
    } catch {
      return true;
    }
  });

  const close = useCallback((): void => useUi.setState({ dialog: null, dialogArg: null }), []);
  const informar = useCallback((texto: string, erroNoAviso = false): void => {
    setAviso({ texto, erro: erroNoAviso });
  }, []);

  const carregar = useCallback(async (): Promise<void> => {
    setCarregando(true);
    setErro('');
    try {
      const lista = await listRenders();
      setItens(lista);
    } catch {
      setItens([]);
      setErro('Não foi possível ler a galeria deste navegador.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Um render feito em outra aba (ou pelo estúdio) aparece ao voltar o foco para a janela.
  useEffect(() => {
    const aoFocar = (): void => {
      void carregar();
    };
    window.addEventListener('focus', aoFocar);
    return () => window.removeEventListener('focus', aoFocar);
  }, [carregar]);

  const visiveis = useMemo(() => filtrarRenders(itens ?? [], filtro), [itens, filtro]);
  const total = itens?.length ?? 0;
  const totalImagens = itens?.filter((item) => item.kind === 'image').length ?? 0;
  const totalVideos = total - totalImagens;

  const abrir = async (asset: RenderAsset): Promise<void> => {
    if (ocupadoId) return;
    setOcupadoId(asset.id);
    setAviso(null);
    // A janela é aberta ainda dentro do gesto do clique; o blob chega depois e preenche o endereço.
    let janela: Window | null = null;
    try {
      janela = window.open('', '_blank');
    } catch {
      janela = null;
    }
    if (!janela) {
      setOcupadoId(null);
      informar('O navegador bloqueou a nova aba. Use “Baixar” para salvar o arquivo.', true);
      return;
    }
    try {
      janela.opener = null;
      const blob = await getRenderBlob(asset.id);
      if (!blob) {
        janela.close();
        informar('O arquivo não está mais disponível neste navegador.', true);
        return;
      }
      const url = URL.createObjectURL(blob);
      janela.location.href = url;
      // Folga para o navegador carregar o arquivo antes de liberar o endereço. Vídeo demora mais
      // (buffer e busca na linha do tempo), então o endereço fica vivo por mais tempo.
      window.setTimeout(() => URL.revokeObjectURL(url), asset.kind === 'video' ? 10 * 60_000 : 60_000);
    } catch {
      janela.close();
      informar('Não foi possível abrir o arquivo.', true);
    } finally {
      setOcupadoId(null);
    }
  };

  const baixar = async (asset: RenderAsset): Promise<void> => {
    if (ocupadoId) return;
    setOcupadoId(asset.id);
    setAviso(null);
    try {
      const blob = await getRenderBlob(asset.id);
      if (!blob) {
        informar('O arquivo não está mais disponível neste navegador.', true);
        return;
      }
      // `saveBytes` mantém o nome/extensão e usa a mesma entrega dos demais arquivos do app.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      informar(await saveBytes(nomeDoArquivo(asset), bytes));
    } catch {
      informar('Não foi possível baixar o arquivo.', true);
    } finally {
      setOcupadoId(null);
    }
  };

  const excluir = async (asset: RenderAsset): Promise<void> => {
    setConfirmando(null);
    setOcupadoId(asset.id);
    setAviso(null);
    try {
      await deleteRender(asset.id);
      setItens((lista) => (lista ?? []).filter((item) => item.id !== asset.id));
      informar(`“${asset.name}” foi excluído da galeria.`);
    } catch {
      informar('Não foi possível excluir o render.', true);
      await carregar();
    } finally {
      setOcupadoId(null);
    }
  };

  const vazioPorFiltro = total > 0 && visiveis.length === 0;
  const contagem = (f: FiltroGaleria): number => (f === 'todos' ? total : f === 'image' ? totalImagens : totalVideos);

  return (
    <Dialog
      title="Galeria de renderização"
      sub="Imagens e vídeos deste navegador"
      onClose={close}
      size="wide"
      footer={
        <>
          <span className="rg-aviso" data-erro={aviso?.erro ? 'true' : undefined} role="status">{aviso?.texto ?? ''}</span>
          <button className="btn" onClick={close}>Fechar</button>
        </>
      }
    >
      <div className="rg-toolbar">
        <div className="rg-filtro" role="group" aria-label="Filtrar renders">
          {(['todos', 'image', 'video'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
            >
              {rotuloDoFiltro(f)} <span className="rg-contagem">{contagem(f)}</span>
            </button>
          ))}
        </div>
        <span className="rg-toolbar-info">
          {total === 0 ? 'Nenhum render' : `${total} ${total === 1 ? 'render' : 'renders'}`}
        </span>
        <button className="btn small" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {semIdb ? (
        <p className="rg-dica">
          Este navegador não liberou o IndexedDB. Os renders desta sessão ficam só na memória e somem ao recarregar a página.
        </p>
      ) : null}

      {erro ? (
        <div className="rg-erro" role="alert">
          <span>{erro}</span>
          <button className="btn small" onClick={() => void carregar()}>Tentar de novo</button>
        </div>
      ) : carregando && itens === null ? (
        <p className="rg-carregando">Carregando galeria…</p>
      ) : visiveis.length === 0 ? (
        <div className="rg-vazio">
          <span className="rg-vazio-marca" aria-hidden="true">
            {filtro === 'video' ? 'MP4' : filtro === 'image' ? 'PNG' : 'GAL'}
          </span>
          <p className="rg-vazio-titulo">
            {vazioPorFiltro ? `Nenhum ${filtro === 'video' ? 'vídeo' : 'imagem'} na galeria.` : 'Nenhum render ainda.'}
          </p>
          {vazioPorFiltro ? (
            <button className="btn small" onClick={() => setFiltro('todos')}>Mostrar todos</button>
          ) : (
            <p className="rg-vazio-dica">
              Use <b>Vista › Apresentação › Animação…</b> para renderizar um vídeo ou <b>Imagem…</b> para salvar uma imagem.
            </p>
          )}
        </div>
      ) : (
        <div className="rg-grid">
          {visiveis.map((asset) => (
            <Cartao
              key={asset.id}
              asset={asset}
              ocupado={ocupadoId === asset.id}
              confirmando={confirmando === asset.id}
              onAbrir={(a) => void abrir(a)}
              onBaixar={(a) => void baixar(a)}
              onExcluir={(a) => void excluir(a)}
              onConfirmar={setConfirmando}
              onCancelar={() => setConfirmando(null)}
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}
