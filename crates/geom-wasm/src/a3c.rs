//! Consulta `cluster_resolvido` (sub-etapa A3c da fatia A, decisão 0047 §7): `solveCluster` (`resolve.ts`) de cada grupo de
//! paredes de um nível, sem o cache `resolveMemo` (a equivalência é pela geometria, não pela identidade dos objetos).
//!
//! Porta `breakpoints`, as faixas verticais (pintor só entre os itens ativos na altura, furos dos vãos que atravessam a
//! altura, retornos do vão só nas faixas atravessadas, fusão de faixas contíguas de mesma assinatura `sigOf`), o `cut` da
//! planta (fragmento menos os vãos de planta mais os retornos de planta), o `fragment` de planta e de contorno, as regiões
//! por material (`closeGapsSafe(unionClipper(...))`) e a silhueta. `wallZRange` (cota e altura reais de cada parede) vem de
//! `paredes_z`; os vãos, de `aberturas_geom` (A3a); os retornos, de `retornos_do_nivel` (A3b); o pintor, de `pintor.rs` (A2).
//!
//! Escala: o pintor, os furos, o corte e o recorte dos retornos usam 1 nm (`ESCALA_FINA`), como a A2 e a A3b; a união das
//! regiões e da silhueta e o fechamento de frestas são os do Clipper do TS (1 µm).

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::rc::Rc;

use crate::a2::{pintar_nivel, Codificador, GrupoPintado, NivelPintado, OpcoesDePlanta};
use crate::a3::{furos_de, aberturas_do_nivel, retangulo_do_vao};
use crate::a3b::{recortar_retorno, retornos_do_nivel, RetornoDoNivel};
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::geo2d::arredonda_js;
use crate::itens::{Caixa4, Item, EPS_Z};
use crate::ops::{diferenca_com_escala, fechar_frestas_seguro, uniao, ESCALA_FINA};
use crate::pintor::pintar;
use crate::MultiPoligono;

/// `eps` e `maxLoss` padrão de `closeGapsSafe`.
const FRESTA_EPS: f64 = 3e-6;
const FRESTA_PERDA_MAXIMA: f64 = 2e-5;

/// Opções da consulta: as de planta da A2 mais `planOpenings` (`None`: todas as aberturas furam a planta).
pub struct OpcoesDoCluster {
    pub planta: OpcoesDePlanta,
    pub aberturas_planta: Option<BTreeSet<u32>>,
}

/// `ZRange`: cota absoluta da base e do topo de uma parede.
#[derive(Clone, Copy)]
struct FaixaZ {
    z0: f64,
    z1: f64,
}

/// Uma abertura do grupo, com a geometria já calculada (A3a).
struct VaoDoGrupo {
    id: u32,
    parede: u32,
    peitoril: f64,
    vao_altura: f64,
    retangulo: MultiPoligono,
}

/// Faixa vertical de uma camada (`LayerBand` sem inclinação): alturas relativas à base da parede.
pub struct FaixaVertical {
    pub z0: f64,
    pub z1: f64,
    pub poly: MultiPoligono,
}

/// `ResolvedLayer` de uma camada resolvida.
pub struct CamadaResolvida {
    pub item: usize,
    pub fragment: MultiPoligono,
    pub cut: MultiPoligono,
    pub faixas: Vec<FaixaVertical>,
}

/// `ClusterCore` de um grupo.
pub struct GrupoResolvido {
    /// Camadas por parede na ordem de `resolveLevel` (paredes na ordem de primeira aparição; em cada uma, por `layerIndex`).
    pub camadas: Vec<CamadaResolvida>,
    pub regioes: Vec<(u32, MultiPoligono)>,
    pub silhueta: MultiPoligono,
}

/// Pontos de quebra vertical (`breakpoints`): bases, topos, limites das faixas e dos vãos de todas as paredes do grupo.
fn pontos_de_quebra(itens: &[Item], zr: &BTreeMap<u32, FaixaZ>, vaos: &[VaoDoGrupo]) -> Vec<f64> {
    let mut zs: Vec<f64> = Vec::new();
    let mut add = |z: f64| zs.push(arredonda_js(z / EPS_Z) * EPS_Z);
    for r in zr.values() {
        add(r.z0);
        add(r.z1);
    }
    for i in itens {
        add(i.z0);
        add(i.z1);
    }
    for g in vaos {
        let Some(w) = zr.get(&g.parede) else { continue };
        for z in [w.z0 + g.peitoril, w.z0 + g.peitoril + g.vao_altura] {
            if z > w.z0 + EPS_Z && z < w.z1 - EPS_Z {
                add(z);
            }
        }
    }
    zs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    zs.dedup_by(|a, b| *a == *b);
    zs
}

/// `Math.round(n * 1e6) / 1e6` de `geomSig.ts`.
fn arred_assinatura(v: f64) -> f64 {
    arredonda_js(v * 1e6) / 1e6
}

/// `sigOf(a) === sigOf(b)`: mesma forma com os vértices arredondados a 1e-6 m (mesma ordem de polígonos, anéis e pontos).
fn mesma_assinatura(a: &MultiPoligono, b: &MultiPoligono) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|(pa, pb)| {
            pa.len() == pb.len()
                && pa.iter().zip(pb).all(|(ra, rb)| {
                    ra.len() == rb.len() && ra.iter().zip(rb).all(|(p, q)| arred_assinatura(p[0]) == arred_assinatura(q[0]) && arred_assinatura(p[1]) == arred_assinatura(q[1]))
                })
        })
}

/// `solveCluster(items, opens, zr, returns, planOpen)`.
fn resolver_grupo(
    g: &GrupoPintado,
    zr: &BTreeMap<u32, FaixaZ>,
    vaos: &[VaoDoGrupo],
    retornos: &BTreeMap<(u32, i64), Vec<(u32, MultiPoligono)>>,
    aberturas_planta: &Option<BTreeSet<u32>>,
) -> Result<GrupoResolvido, u32> {
    let itens = &g.itens;
    let abre_na_planta = |id: u32| aberturas_planta.as_ref().map_or(true, |s| s.contains(&id));

    // `paintFor(active)`: pintura só entre os itens ativos (cache por conjunto ativo; o `plan` é o do pintor da A2).
    let mut cache: HashMap<Vec<usize>, Rc<Vec<MultiPoligono>>> = HashMap::new();
    let em_planta: Vec<usize> = (0..itens.len()).filter(|&k| itens[k].em_planta).collect();
    cache.insert(em_planta.clone(), Rc::new(em_planta.iter().map(|&k| g.fragmentos[k].clone()).collect()));
    // Retorno de acabamento não invade paredes vizinhas (`makeReturnClipper`): vizinhos = itens do grupo; só os ativos têm pintura.
    let recortar = |poly: &MultiPoligono, parede: u32, ativos: &[usize], pintado: &[MultiPoligono]| -> Result<MultiPoligono, u32> {
        let mut pos: HashMap<usize, usize> = HashMap::new();
        for (p, &k) in ativos.iter().enumerate() {
            pos.insert(k, p);
        }
        let vizinhos: Vec<(u32, Caixa4, Option<&MultiPoligono>)> = itens.iter().enumerate().map(|(k, it)| (it.parede, it.caixa, pos.get(&k).map(|&q| &pintado[q]))).collect();
        recortar_retorno(poly, parede, &vizinhos)
    };

    let mut por_item: Vec<Vec<FaixaVertical>> = (0..itens.len()).map(|_| Vec::new()).collect();
    let zs = pontos_de_quebra(itens, zr, vaos);
    for k in 0..zs.len().saturating_sub(1) {
        let za = zs[k];
        let zb = zs[k + 1];
        if zb - za < EPS_Z {
            continue;
        }
        let meio = (za + zb) / 2.0;
        let ativos: Vec<usize> = (0..itens.len()).filter(|&i| itens[i].z0 <= za + EPS_Z && itens[i].z1 >= zb - EPS_Z).collect();
        if ativos.is_empty() {
            continue;
        }
        let pintado = match cache.get(&ativos) {
            Some(p) => Rc::clone(p),
            None => {
                let refs: Vec<&Item> = ativos.iter().map(|&i| &itens[i]).collect();
                let p = Rc::new(pintar(&refs)?);
                cache.insert(ativos.clone(), Rc::clone(&p));
                p
            }
        };
        for (pos, &ii) in ativos.iter().enumerate() {
            let frag = &pintado[pos];
            if frag.is_empty() {
                continue;
            }
            let it = &itens[ii];
            let w = zr.get(&it.parede).ok_or(ENTRADA)?;
            let atravessa = |v: &VaoDoGrupo| meio > w.z0 + v.peitoril && meio < w.z0 + v.peitoril + v.vao_altura;
            let furos: Vec<MultiPoligono> = vaos.iter().filter(|v| v.parede == it.parede && atravessa(v)).map(|v| v.retangulo.clone()).collect();
            let mut poly = if furos.is_empty() { frag.clone() } else { furos_de(frag, &furos)? };
            // Retorno do acabamento no vão: só nas faixas de altura que o vão atravessa.
            if let Some(lista) = retornos.get(&(it.parede, it.camada())) {
                for (aberta, rpoly) in lista {
                    if let Some(v) = vaos.iter().find(|x| x.id == *aberta) {
                        if meio > w.z0 + v.peitoril && meio < w.z0 + v.peitoril + v.vao_altura {
                            poly.extend(recortar(rpoly, it.parede, &ativos, &pintado)?);
                        }
                    }
                }
            }
            if poly.is_empty() {
                continue;
            }
            let rel0 = za - w.z0;
            let rel1 = zb - w.z0;
            let lista = &mut por_item[ii];
            match lista.last_mut() {
                Some(prev) if (prev.z1 - rel0).abs() < EPS_Z && mesma_assinatura(&prev.poly, &poly) => prev.z1 = rel1,
                _ => lista.push(FaixaVertical { z0: rel0, z1: rel1, poly }),
            }
        }
    }

    // Camadas: fragmento, corte da planta e faixas.
    let plano_vizinhos: Vec<(u32, Caixa4, Option<&MultiPoligono>)> =
        itens.iter().enumerate().map(|(k, it)| (it.parede, it.caixa, if it.em_planta { Some(&g.fragmentos[k]) } else { None })).collect();
    let mut resolvidas: Vec<CamadaResolvida> = Vec::new();
    let mut ordem_paredes: Vec<u32> = Vec::new();
    let mut por_material: Vec<(u32, Vec<MultiPoligono>)> = Vec::new();
    for (k, it) in itens.iter().enumerate() {
        let fragment: MultiPoligono = g.fragmentos[k].clone();
        if it.em_planta && fragment.is_empty() {
            continue;
        }
        let mut cut = fragment.clone();
        if it.em_planta && !fragment.is_empty() {
            // Só as aberturas que furam a parede na planta; o retorno do vão sai junto com o seu vão.
            let rects: Vec<MultiPoligono> = vaos.iter().filter(|v| v.parede == it.parede && abre_na_planta(v.id)).map(|v| v.retangulo.clone()).collect();
            if !rects.is_empty() {
                let mut args: Vec<MultiPoligono> = Vec::with_capacity(rects.len() + 1);
                args.push(fragment.clone());
                args.extend(rects);
                cut = diferenca_com_escala(&args, ESCALA_FINA)?;
            }
            if let Some(lista) = retornos.get(&(it.parede, it.camada())) {
                for (aberta, rpoly) in lista {
                    if abre_na_planta(*aberta) {
                        cut.extend(recortar_retorno(rpoly, it.parede, &plano_vizinhos)?);
                    }
                }
            }
        }
        if it.contorno {
            cut = Vec::new();
        }
        let faixas = std::mem::take(&mut por_item[k]);
        if fragment.is_empty() && faixas.is_empty() {
            continue;
        }
        if !ordem_paredes.contains(&it.parede) {
            ordem_paredes.push(it.parede);
        }
        if !cut.is_empty() {
            match por_material.iter_mut().find(|(m, _)| *m == it.material) {
                Some((_, partes)) => partes.push(cut.clone()),
                None => por_material.push((it.material, vec![cut.clone()])),
            }
        }
        resolvidas.push(CamadaResolvida { item: k, fragment, cut, faixas });
    }
    let mut regioes: Vec<(u32, MultiPoligono)> = Vec::with_capacity(por_material.len());
    for (material, partes) in &por_material {
        regioes.push((*material, fechar_frestas_seguro(&uniao(partes)?, FRESTA_EPS, FRESTA_PERDA_MAXIMA)?));
    }
    // Silhueta pela união das regiões por material (ver o comentário em `solveCluster`).
    let polis: Vec<MultiPoligono> = regioes.iter().map(|(_, p)| p.clone()).collect();
    let silhueta = fechar_frestas_seguro(&uniao(&polis)?, FRESTA_EPS, FRESTA_PERDA_MAXIMA)?;
    // Ordem de `resolveLevel`: por parede (primeira aparição) e, em cada uma, `layerIndex` crescente (ordenação estável).
    let mut camadas: Vec<CamadaResolvida> = Vec::with_capacity(resolvidas.len());
    let mut restantes: Vec<Option<CamadaResolvida>> = resolvidas.into_iter().map(Some).collect();
    for parede in &ordem_paredes {
        let mut da_parede: Vec<CamadaResolvida> = Vec::new();
        for slot in restantes.iter_mut() {
            if slot.as_ref().is_some_and(|c| itens[c.item].parede == *parede) {
                da_parede.push(slot.take().expect("camada presente"));
            }
        }
        da_parede.sort_by_key(|c| itens[c.item].camada());
        camadas.extend(da_parede);
    }
    Ok(GrupoResolvido { camadas, regioes, silhueta })
}

/// Resultado de um nível: o pintado (A2) e os grupos resolvidos.
pub struct NivelResolvido {
    pub pintado: NivelPintado,
    pub grupos: Vec<GrupoResolvido>,
}

/// `solveCluster` de cada grupo de um nível (a orquestração de `resolveLevel` até as regiões e a silhueta).
pub fn resolver_nivel(cena: &Cena, nivel: u32, tol: f64, opcoes: &OpcoesDoCluster) -> Result<NivelResolvido, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let pintado = pintar_nivel(cena, nivel, tol, &opcoes.planta)?;
    let aberturas = aberturas_do_nivel(cena, nivel)?;
    let todos_retornos: Vec<RetornoDoNivel> = retornos_do_nivel(cena, &pintado)?;
    let mut grupos: Vec<GrupoResolvido> = Vec::with_capacity(pintado.grupos.len());
    for (gi, g) in pintado.grupos.iter().enumerate() {
        let paredes: BTreeSet<u32> = g.membros.iter().map(|&i| pintado.quadros[i].id).collect();
        let mut zr: BTreeMap<u32, FaixaZ> = BTreeMap::new();
        for &p in &paredes {
            let z = cena.a1.paredes_z.get(&p).ok_or(ENTRADA)?;
            zr.insert(p, FaixaZ { z0: z.z0, z1: z.z0 + z.altura });
        }
        let vaos: Vec<VaoDoGrupo> = aberturas
            .iter()
            .filter(|(_, a, _, _)| paredes.contains(&a.parede))
            .map(|(id, a, _, geo)| VaoDoGrupo { id: *id, parede: a.parede, peitoril: geo.peitoril, vao_altura: geo.vao_altura, retangulo: retangulo_do_vao(geo) })
            .collect();
        let mut retornos: BTreeMap<(u32, i64), Vec<(u32, MultiPoligono)>> = BTreeMap::new();
        for r in todos_retornos.iter().filter(|r| r.grupo as usize == gi) {
            retornos.entry((r.parede, r.camada as i64)).or_default().push((r.abertura, r.poly.clone()));
        }
        grupos.push(resolver_grupo(g, &zr, &vaos, &retornos, &opcoes.aberturas_planta)?);
    }
    Ok(NivelResolvido { pintado, grupos })
}

/// Executa `cluster_resolvido(nivel_num, tol_juncao, opcoes)`.
pub fn cluster_resolvido(cena: &Cena, nivel: u32, tol: f64, opcoes: &OpcoesDoCluster) -> Result<Vec<Saida>, u32> {
    let r = resolver_nivel(cena, nivel, tol, opcoes)?;
    let mut cod = Codificador::default();
    let mut camadas: Vec<u32> = Vec::new();
    let mut prioridades: Vec<f64> = Vec::new();
    let mut formas: Vec<u32> = Vec::new();
    let mut faixas: Vec<f64> = Vec::new();
    let mut faixas_forma: Vec<u32> = Vec::new();
    let mut regioes: Vec<u32> = Vec::new();
    let mut silhuetas: Vec<u32> = Vec::new();
    for (gi, (g, res)) in r.pintado.grupos.iter().zip(&r.grupos).enumerate() {
        for c in &res.camadas {
            let it = &g.itens[c.item];
            camadas.extend([it.parede, gi as u32, it.faixa as u32, it.indice, it.material, it.nucleo as u32]);
            prioridades.push(it.prioridade);
            let (bi, bn) = cod.forma(&it.forma);
            let (fi, fn_) = cod.forma(&c.fragment);
            let (ci, cn) = cod.forma(&c.cut);
            let ini_faixas = (faixas.len() / 2) as u32;
            for f in &c.faixas {
                faixas.extend([f.z0, f.z1]);
                let (pi, pn) = cod.forma(&f.poly);
                faixas_forma.extend([pi, pn]);
            }
            formas.extend([bi, bn, fi, fn_, ci, cn, ini_faixas, c.faixas.len() as u32]);
        }
        for (material, poly) in &res.regioes {
            let (ri, rn) = cod.forma(poly);
            regioes.extend([gi as u32, *material, ri, rn]);
        }
        let (si, sn) = cod.forma(&res.silhueta);
        silhuetas.extend([gi as u32, si, sn]);
    }
    Ok(vec![
        Saida::U32(camadas),
        Saida::F64(prioridades),
        Saida::U32(formas),
        Saida::F64(faixas),
        Saida::U32(faixas_forma),
        Saida::U32(regioes),
        Saida::U32(silhuetas),
        Saida::U32(cod.poligonos),
        Saida::U32(cod.aneis),
        Saida::F64(cod.pontos),
    ])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, cena_com, f64s, tipo_simples, u32s, Par};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_CLUSTER_RESOLVIDO as Q, SECAO_PAREDES_Z};
    use crate::pintor::area_da_forma;

    fn forma_de(s: &[Saida], ini: u32, n: u32) -> MultiPoligono {
        let pol = u32s(&s[7]);
        let an = u32s(&s[8]);
        let pt = f64s(&s[9]);
        let mut m = Vec::new();
        for k in ini..ini + n {
            let (ia, na) = (pol[2 * k as usize], pol[2 * k as usize + 1]);
            let mut p = Vec::new();
            for a in ia..ia + na {
                let (ip, np) = (an[2 * a as usize], an[2 * a as usize + 1]);
                p.push((ip..ip + np).map(|q| [pt[2 * q as usize], pt[2 * q as usize + 1]]).collect());
            }
            m.push(p);
        }
        m
    }

    fn com_z(ps: &[Par]) -> Cena {
        let mut c = cena_com(ps, &[tipo_simples()]);
        let ids: Vec<u32> = ps.iter().map(|p| p.id).collect();
        let bz = [c32(&ids), c64(&ids.iter().map(|_| 0.0).collect::<Vec<_>>()), c64(&ids.iter().map(|_| 2.8).collect::<Vec<_>>())].concat();
        c.definir_secao(SECAO_PAREDES_Z, ids.len() as u32, &bz).expect("paredes_z");
        c
    }

    #[test]
    fn parede_reta_sem_vaos_uma_faixa_do_chao_ao_topo() {
        let mut c = com_z(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))]);
        let s = executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).expect("consulta");
        let camadas = u32s(&s[0]);
        assert_eq!(camadas.len() % 6, 0);
        assert!(!camadas.is_empty());
        let formas = u32s(&s[2]);
        let faixas = f64s(&s[3]);
        // cada camada: uma faixa só, de 0 a 2,8, com a área do fragmento
        for k in 0..camadas.len() / 6 {
            assert_eq!(formas[8 * k + 7], 1, "uma faixa");
            let f0 = formas[8 * k + 6] as usize;
            assert_eq!((faixas[2 * f0], faixas[2 * f0 + 1]), (0.0, 2.8));
            let frag = forma_de(&s, formas[8 * k + 2], formas[8 * k + 3]);
            let cut = forma_de(&s, formas[8 * k + 4], formas[8 * k + 5]);
            assert!((area_da_forma(&frag) - area_da_forma(&cut)).abs() < 1e-9, "sem vãos o corte é o fragmento");
        }
        // uma silhueta de área 6 x 0,2 (o tipo simples tem 0,2 m)
        let sil = u32s(&s[6]);
        assert_eq!(sil.len(), 3);
        assert!((area_da_forma(&forma_de(&s, sil[1], sil[2])) - 1.2).abs() < 1e-4);
    }

    #[test]
    fn argumentos_variaveis_sao_validados() {
        let mut c = com_z(&[Par::nova(1, (0.0, 0.0), (4.0, 0.0))]);
        assert!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).is_ok());
        // aberturas de planta: a lista vazia é válida (nenhuma fura); contagem inconsistente é ENTRADA
        assert!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 1.0, 0.0]).is_ok());
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 1.0, 2.0, 5.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 1.0, 5.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 2.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 1.0, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[f64::from(0xffff_ffffu32), 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
        // contorno e abertura de planta juntos: 1 id de contorno, depois 1 id de abertura
        assert!(executar(&mut c, Q, &[0.0, 0.02, 1.0, 5.0, 1.0, 1.0, 1.0, 1.0, 9.0]).is_ok());
        // sem paredes_z => ENTRADA
        c.remover(SECAO_PAREDES_Z, &[1]).expect("remover");
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
    }

    #[test]
    fn assinatura_arredonda_a_1e_6() {
        let a: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]]];
        let b: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0 + 4e-7, 0.0], [1.0, 1.0]]]];
        let c: MultiPoligono = vec![vec![vec![[0.0, 0.0], [1.0 + 6e-7, 0.0], [1.0, 1.0]]]];
        assert!(mesma_assinatura(&a, &b));
        assert!(!mesma_assinatura(&a, &c));
        assert!(!mesma_assinatura(&a, &vec![]));
    }
}
