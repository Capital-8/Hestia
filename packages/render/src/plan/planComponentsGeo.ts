import { ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { projetarCorposPlanta, type DetalhePlanta, type PecaResolvida, type ResolucaoFamilia } from '@hestia/engine';
import { MAPA_ACABAMENTOS, materialDoAcabamento, resolverMaterialVisualPeca, type Component, type PapelPeca } from '@hestia/model';
import { MATERIAIS_DE_COMPONENTE } from '../model3d/componentSolids.ts';

/** Cor (hex) do acabamento que o 3D usa para o papel da peça: overrides `acabCorpo/acabPorta/acabTampo`, material especial ou padrão do papel. */
export function corDoPapel(c: Component, papel: PapelPeca, materialPeca?: string): string | undefined {
  const id = resolverMaterialVisualPeca(c, papel, materialPeca);
  return MATERIAIS_DE_COMPONENTE[id]?.color ?? (MAPA_ACABAMENTOS[id] ? materialDoAcabamento(MAPA_ACABAMENTOS[id]!).color : undefined);
}

/** Peça de vidro: material da peça com "vidro" ou acabamento resolvido do grupo vidro. */
export function pecaDeVidro(c: Component, q: PecaResolvida): boolean {
  if (q.material !== null && /vidro/i.test(q.material)) return true;
  return MAPA_ACABAMENTOS[resolverMaterialVisualPeca(c, q.papel, q.material ?? undefined)]?.grupo === 'vidro';
}

/** Ponto local do móvel (espelhado em x quando `mirrored`, depois girado) no mundo. */
export function pontoNoMundo(c: Component, lx: number, ly: number): Vec2 {
  const cos = Math.cos(c.rotation);
  const sen = Math.sin(c.rotation);
  const sx = c.mirrored ? -lx : lx;
  return { x: c.x + sx * cos - ly * sen, y: c.y + sx * sen + ly * cos };
}

export function anelRetangulo(c: Component, x0: number, y0: number, x1: number, y1: number): Ring {
  const ring = [pontoNoMundo(c, x0, y0), pontoNoMundo(c, x1, y0), pontoNoMundo(c, x1, y1), pontoNoMundo(c, x0, y1)];
  if (ringArea(ring) < 0) ring.reverse();
  return ring;
}

/** Contorno da peça vista de cima: polígono real (eixo z) ou o retângulo da projeção (`extensao` x × y, qualquer eixo). */
export function anelDaPecaEmPlanta(c: Component, peca: PecaResolvida): Ring {
  const [ox, oy] = peca.origem;
  if (peca.eixo === 'z' && peca.contorno !== null && peca.contorno.length >= 6) {
    const ring: Ring = [];
    for (let i = 0; i + 1 < peca.contorno.length; i += 2) ring.push(pontoNoMundo(c, ox + peca.contorno[i]!, oy + peca.contorno[i + 1]!));
    if (ringArea(ring) < 0) ring.reverse();
    return ring;
  }
  const [ex, ey] = peca.extensao;
  return anelRetangulo(c, ox, oy, ox + ex, oy + ey);
}

/** Silhueta (mundo) dos corpos da família na planta, um anel anti-horário por contorno; `[]` sem corpos ou no nível grosseiro (B3). */
export function aneisDosCorpos(c: Component, res: Pick<ResolucaoFamilia, 'corpos'>, detalhe: DetalhePlanta): Ring[] {
  const corpos = res.corpos ?? [];
  if (corpos.length === 0) return [];
  const aneis: Ring[] = [];
  for (const poly of projetarCorposPlanta(corpos, detalhe)) {
    const ring: Ring = [];
    for (let i = 0; i + 1 < poly.length; i += 2) ring.push(pontoNoMundo(c, poly[i]!, poly[i + 1]!));
    if (ring.length < 3) continue;
    if (ringArea(ring) < 0) ring.reverse();
    aneis.push(ring);
  }
  return aneis;
}
