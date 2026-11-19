import * as THREE from 'three';
import { mapasDaTextura, type MapaResolvido } from '@hestia/io';
import { prepararMapa, type MapasTextura3D, type TexturasProvedor3D } from '@hestia/render';
import { aoCarregarCatalogo, baseAtual, carregarCatalogo, catalogoEmCache, itemDoCatalogo } from './texturasOnline.ts';
import { obterTexturaProcedural } from './texturasProcedurais3d.ts';

/** Prefixo de textura básica empacotada localmente em `/texturas-basicas/<id>.webp`. */
export const PREFIXO_BASICA = 'basica:';

type Estado = { fase: 'carregando' } | { fase: 'erro' } | { fase: 'ok'; mapas: MapasTextura3D };

/** Quantos mapas baixam ao mesmo tempo (cada um chega a vários MB). */
const SIMULTANEOS = 3;

/**
 * Provedor de texturas do catálogo online para a vista 3D. Baixa cada mapa em tamanho original, uma vez por sessão, só
 * quando um material em uso o pede. Sem rede o material fica como estava (sem textura). A `versao` sobe quando uma textura
 * termina de carregar; a vista 3D refaz os materiais.
 */
export class TexturasApp3D implements TexturasProvedor3D {
  versao = 0;
  private estados = new Map<string, Estado>();
  private ouvintes = new Set<() => void>();
  private fila: Array<() => void> = [];
  private ativos = 0;
  private catalogoPedido = false;

  constructor(
    private readonly carregarImagem: (uri: string) => Promise<THREE.Texture> = (uri) => new THREE.TextureLoader().setCrossOrigin('anonymous').loadAsync(uri),
  ) {
    // Catálogo chegou depois do pedido: os pedidos pendentes são refeitos pela vista (ela relê `obter`).
    aoCarregarCatalogo(() => this.avisar());
  }

  obter(imagemId: string): MapasTextura3D | undefined {
    if (imagemId.startsWith('proc:')) return obterTexturaProcedural(imagemId);
    if (imagemId.startsWith(PREFIXO_BASICA)) {
      const e = this.estados.get(imagemId);
      if (e) return e.fase === 'ok' ? e.mapas : undefined;
      const id = imagemId.slice(PREFIXO_BASICA.length);
      if (!id) return undefined;
      this.estados.set(imagemId, { fase: 'carregando' });
      const baseUrl = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
      const uri = `${baseUrl.replace(/\/+$/, '')}/texturas-basicas/${id}.webp`;
      this.baixar(imagemId, [{ slot: 'color', textureId: `${id}:color`, caminho: uri, uri, mime: 'image/jpeg', hash: id }]);
      return undefined;
    }
    const e = this.estados.get(imagemId);
    if (e) return e.fase === 'ok' ? e.mapas : undefined;
    const base = baseAtual();
    const catalogo = catalogoEmCache(base);
    if (!catalogo) {
      if (!this.catalogoPedido) {
        this.catalogoPedido = true;
        carregarCatalogo(fetch, base).catch(() => { this.catalogoPedido = false; });
      }
      return undefined;
    }
    const item = itemDoCatalogo(imagemId, catalogo);
    if (!item) return undefined;
    this.estados.set(imagemId, { fase: 'carregando' });
    this.baixar(imagemId, mapasDaTextura(item, base));
    return undefined;
  }

  aoMudar(cb: () => void): () => void {
    this.ouvintes.add(cb);
    return () => { this.ouvintes.delete(cb); };
  }

  private avisar(): void {
    for (const cb of [...this.ouvintes]) cb();
  }

  private baixar(imagemId: string, mapas: MapaResolvido[]): void {
    const pronto: MapasTextura3D = {};
    let faltam = mapas.length;
    let falhou = false;
    const fim = (): void => {
      if (--faltam > 0) return;
      if (falhou || !pronto.cor) this.estados.set(imagemId, { fase: 'erro' });
      else {
        this.estados.set(imagemId, { fase: 'ok', mapas: pronto });
        this.versao++;
      }
      this.avisar();
    };
    for (const m of mapas) {
      this.enfileirar(async () => {
        try {
          const tex = await this.carregarImagem(m.uri);
          const slot = m.slot === 'color' ? 'cor' : m.slot === 'normal' ? 'normal' : 'rugosidade';
          pronto[slot] = prepararMapa(tex, slot === 'cor');
        } catch {
          falhou = true;
        }
        fim();
      });
    }
  }

  private enfileirar(tarefa: () => Promise<void>): void {
    this.fila.push(() => { void tarefa().finally(() => { this.ativos--; this.proxima(); }); });
    this.proxima();
  }

  private proxima(): void {
    while (this.ativos < SIMULTANEOS && this.fila.length) {
      this.ativos++;
      this.fila.shift()!();
    }
  }
}

/** Provedor único do app. */
export const texturas3d = new TexturasApp3D();
