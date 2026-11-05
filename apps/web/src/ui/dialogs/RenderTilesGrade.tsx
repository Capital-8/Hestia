import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import type { TilesSessao } from './useRenderSession.ts';
import { posicionarTiles, type RetanguloPct } from './renderTiles.ts';

function estiloPct(r: RetanguloPct): CSSProperties {
  return { left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` };
}

/** Tile concluído: a URL do Blob vive só enquanto o tile está montado (revogada ao sair ou trocar). */
function TileImagem({ imagem, estilo }: { imagem: Blob; estilo: CSSProperties }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const novaUrl = URL.createObjectURL(imagem);
    setUrl(novaUrl);
    return () => URL.revokeObjectURL(novaUrl);
  }, [imagem]);
  if (url === null) return <div className="rt-tile rt-carregando" style={estilo} />;
  return <img className="rt-tile rt-concluido" src={url} alt="" style={estilo} />;
}

/**
 * Grade real do render GPU: tiles concluídos mostram o pedaço renderizado; pendentes são brancos;
 * o próximo (espiral) fica destacado. Não há animação: cada tile muda só quando o serviço o entrega.
 */
export function RenderTilesGrade({
  tiles,
  concluidosServico,
}: {
  tiles: TilesSessao;
  /** Contagem reportada pelo serviço (estado.concluidos); pode estar à frente dos PNGs já buscados. */
  concluidosServico: number;
}): ReactElement {
  const pos = posicionarTiles(tiles.largura, tiles.altura, tiles.concluidos, tiles.total);
  const porIndice = new Map(tiles.concluidos.map((t) => [t.i, t] as const));

  return (
    <div className="rt">
      <div className="rt-area" style={{ aspectRatio: `${tiles.largura} / ${tiles.altura}` }}>
        {pos.concluidos.map((p) => {
          const t = porIndice.get(p.i);
          if (!t) return null;
          const estilo = estiloPct(p);
          if (t.imagem) return <TileImagem key={`c${t.i}`} imagem={t.imagem} estilo={estilo} />;
          if (t.situacao === 'falhou') {
            return (
              <div key={`c${t.i}`} className="rt-tile rt-erro" style={estilo} title={`Tile ${t.i}`}>
                falha ao buscar tile
              </div>
            );
          }
          // Ainda buscando o PNG: pendente visualmente até o Blob chegar.
          return <div key={`c${t.i}`} className="rt-tile rt-pendente" style={estilo} />;
        })}
        {pos.pendentes.map((p) => (
          <div
            key={`p${p.i}`}
            className={`rt-tile ${p.i === pos.destaque ? 'rt-destaque' : 'rt-pendente'}`}
            style={estiloPct(p)}
          />
        ))}
      </div>
      <p className="rt-legenda">
        {concluidosServico} de {tiles.total} tiles
        {pos.divergente ? ' · plano do serviço não confere' : null}
      </p>
    </div>
  );
}
