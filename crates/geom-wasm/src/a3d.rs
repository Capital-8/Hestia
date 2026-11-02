//! Consulta `resolver_nivel` (sub-etapa A3d da fatia A, decisão 0047 §7): `resolveLevel` completo (`ResolvedLevel`).
//!
//! Reúne o que A1 a A3c calculam (quadros, junções, grupos, camadas com `raw`/`fragment`/`cut`/faixas, regiões e silhueta;
//! `a3c::resolver_nivel`) e acrescenta o que falta: os campos de `ResolvedWall` (a, b, u, n, length, sHi, sLo, baseZ, height,
//! nominalZ0, nominalZ1), as membranas (`membranesOf`, `layerGeom.ts`) e os perfis de topo e de base (`withBottomProfile` e
//! `withProfile`, que recortam as faixas de cada camada: `clipBandsToBottom` e `clipBandsToProfile`, `profile.ts`).
//!
//! `wallZRange` (inclusive `profile` e `bottomProfile`) continua no JS e chega em `paredes_z` e `perfis_z`; o `topProfile` do
//! modelo (default de `withProfile` quando `wallZRange` não dá perfil de topo) chega em `perfis_z`, lista 2. O Rust copia os
//! perfis derivados para o resultado (`perfisDoResolvido`) e aplica o recorte só em parede reta com ao menos 2 pontos.
//!
//! Escala: a interseção das fatias do perfil com as faixas usa 1 nm (`ESCALA_FINA`), como o pintor.

use std::collections::BTreeMap;

use crate::a2::Codificador;
use crate::a3c::{resolver_nivel, FaixaVertical, Inclinacao, NivelResolvido, OpcoesDoCluster};
use crate::camadas::{ponto_no_corte, Borda};
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::ENTRADA;
use crate::ops::{interseccao_com_escala, ESCALA_FINA};
use crate::quadro::s_na_profundidade;
use crate::MultiPoligono;

/// `EPS` de `profile.ts` (faixas e trechos) e de `profile.ts` do modelo (`profileHeightAt`).
const EPS: f64 = 1e-7;
const EPS_MODELO: f64 = 1e-9;
/// Meia-largura (m) das tiras de recorte.
const METADE_DA_TIRA: f64 = 50.0;

/// `ProfilePoint`: `(t, h)`.
pub type Perfil = Vec<(f64, f64)>;

/// `profileHeightAt` (packages/model/src/profile.ts): degrau (dois pontos com o mesmo t) vale o valor à direita.
fn altura_no_perfil(pts: &[(f64, f64)], t: f64) -> f64 {
    let (Some(&primeiro), Some(&ultimo)) = (pts.first(), pts.last()) else { return 0.0 };
    if t < primeiro.0 {
        return primeiro.1;
    }
    if t >= ultimo.0 {
        return ultimo.1;
    }
    for i in 0..pts.len().saturating_sub(1) {
        let (a, b) = (pts[i], pts[i + 1]);
        if t >= a.0 && t < b.0 {
            return if b.0 - a.0 < EPS_MODELO { b.1 } else { a.1 + ((b.1 - a.1) * (t - a.0)) / (b.0 - a.0) };
        }
    }
    ultimo.1
}

/// Trecho linear do perfil (`Seg`).
struct Trecho {
    ta: f64,
    tb: f64,
    fa: f64,
    fb: f64,
}

fn ordena(v: &mut [f64]) {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
}

/// `segments`: quebra o perfil em trechos lineares entre `lo` e `hi`, também onde ele cruza as alturas `zs`.
fn trechos(pts: &[(f64, f64)], lo: f64, hi: f64, zs: &[f64]) -> Vec<Trecho> {
    let mut ts: Vec<f64> = vec![lo, hi];
    ts.extend(pts.iter().map(|q| hi.min(lo.max(q.0))));
    ordena(&mut ts);
    ts.dedup();
    let mut out: Vec<Trecho> = Vec::new();
    for i in 0..ts.len().saturating_sub(1) {
        let (ta, tb) = (ts[i], ts[i + 1]);
        if tb - ta < EPS {
            continue;
        }
        let fa = altura_no_perfil(pts, ta);
        let fb = altura_no_perfil(pts, tb - EPS * 1e-3);
        let mut cortes: Vec<f64> = zs.iter().copied().filter(|&z| (fa - z) * (fb - z) < 0.0).map(|z| ta + ((z - fa) / (fb - fa)) * (tb - ta)).collect();
        ordena(&mut cortes);
        let mut bordas = vec![ta];
        bordas.extend(cortes);
        bordas.push(tb);
        for j in 0..bordas.len() - 1 {
            let (sa, sb) = (bordas[j], bordas[j + 1]);
            let f = |t: f64| if tb - ta < EPS { fa } else { fa + ((fb - fa) * (t - ta)) / (tb - ta) };
            out.push(Trecho { ta: sa, tb: sb, fa: f(sa), fb: f(sb) });
        }
    }
    out
}

/// `strip(ta, tb)`: tira perpendicular ao eixo entre `ta` e `tb` (`orientedRect`).
fn tira(a: [f64; 2], u: [f64; 2], ta: f64, tb: f64) -> MultiPoligono {
    let meio = (ta + tb) / 2.0;
    let (cx, cy) = (a[0] + u[0] * meio, a[1] + u[1] * meio);
    let (ux, uy) = (u[0], u[1]);
    let (vx, vy) = (-uy, ux);
    let ao_longo = (tb - ta) / 2.0;
    let de_lado = METADE_DA_TIRA;
    vec![vec![vec![
        [cx - ux * ao_longo - vx * de_lado, cy - uy * ao_longo - vy * de_lado],
        [cx + ux * ao_longo - vx * de_lado, cy + uy * ao_longo - vy * de_lado],
        [cx + ux * ao_longo + vx * de_lado, cy + uy * ao_longo + vy * de_lado],
        [cx - ux * ao_longo + vx * de_lado, cy - uy * ao_longo + vy * de_lado],
    ]]]
}

/// Faixa agrupada à espera de ser descarregada (`group` de `clipBandsToProfile`/`clipBandsToBottom`).
struct Grupo {
    ta: f64,
    tb: f64,
    z: f64,
}

fn faixa_nova(z0: f64, z1: f64, poly: MultiPoligono, inclinacao: Option<Inclinacao>) -> FaixaVertical {
    FaixaVertical { z0, z1, poly, inclinacao }
}

/// `clipBandsToProfile`: corta as faixas de uma parede reta pelo perfil superior.
pub fn recortar_pelo_topo(faixas: &[FaixaVertical], a: [f64; 2], u: [f64; 2], length: f64, pts: &[(f64, f64)]) -> Result<Vec<FaixaVertical>, u32> {
    let lo = pts.iter().fold(-1.0f64, |m, q| m.min(q.0));
    let hi = pts.iter().fold(length + 1.0, |m, q| m.max(q.0));
    let mut out: Vec<FaixaVertical> = Vec::new();
    for band in faixas {
        let segs = trechos(pts, lo, hi, &[band.z0, band.z1]);
        let mut grupo: Option<Grupo> = None;
        let descarrega = |grupo: &mut Option<Grupo>, out: &mut Vec<FaixaVertical>| -> Result<(), u32> {
            if let Some(g) = grupo.take() {
                let poly = interseccao_com_escala(&band.poly, &tira(a, u, g.ta, g.tb), ESCALA_FINA)?;
                if !poly.is_empty() {
                    out.push(faixa_nova(band.z0, g.z, poly, None));
                }
            }
            Ok(())
        };
        for s in &segs {
            let mn = s.fa.min(s.fb);
            let mx = s.fa.max(s.fb);
            if mn >= band.z1 - EPS {
                match grupo.as_mut() {
                    Some(g) if (g.z - band.z1).abs() < EPS && (g.tb - s.ta).abs() < EPS => g.tb = s.tb,
                    _ => {
                        descarrega(&mut grupo, &mut out)?;
                        grupo = Some(Grupo { ta: s.ta, tb: s.tb, z: band.z1 });
                    }
                }
            } else if mx <= band.z0 + EPS {
                descarrega(&mut grupo, &mut out)?;
            } else if mx - mn < EPS {
                match grupo.as_mut() {
                    Some(g) if (g.z - mn).abs() < EPS && (g.tb - s.ta).abs() < EPS => g.tb = s.tb,
                    _ => {
                        descarrega(&mut grupo, &mut out)?;
                        grupo = Some(Grupo { ta: s.ta, tb: s.tb, z: mn });
                    }
                }
            } else {
                descarrega(&mut grupo, &mut out)?;
                let poly = interseccao_com_escala(&band.poly, &tira(a, u, s.ta, s.tb), ESCALA_FINA)?;
                if !poly.is_empty() {
                    out.push(faixa_nova(band.z0, mx, poly, Some(Inclinacao { o: a, d: u, t0: s.ta, t1: s.tb, h0: s.fa, h1: s.fb })));
                }
            }
        }
        descarrega(&mut grupo, &mut out)?;
    }
    Ok(out)
}

/// `clipBandsToBottom`: corta as faixas de uma parede reta pela base (perfil inferior em degraus).
pub fn recortar_pela_base(faixas: &[FaixaVertical], a: [f64; 2], u: [f64; 2], length: f64, pts: &[(f64, f64)]) -> Result<Vec<FaixaVertical>, u32> {
    let lo = pts.iter().fold(-1.0f64, |m, q| m.min(q.0));
    let hi = pts.iter().fold(length + 1.0, |m, q| m.max(q.0));
    let mut cortes: Vec<f64> = vec![lo, hi];
    cortes.extend(pts.iter().map(|q| hi.min(lo.max(q.0))));
    ordena(&mut cortes);
    cortes.dedup();
    let mut out: Vec<FaixaVertical> = Vec::new();
    for band in faixas {
        let mut grupo: Option<Grupo> = None;
        let descarrega = |grupo: &mut Option<Grupo>, out: &mut Vec<FaixaVertical>| -> Result<(), u32> {
            if let Some(g) = grupo.take() {
                let poly = interseccao_com_escala(&band.poly, &tira(a, u, g.ta, g.tb), ESCALA_FINA)?;
                if !poly.is_empty() {
                    out.push(faixa_nova(g.z, band.z1, poly, band.inclinacao));
                }
            }
            Ok(())
        };
        for i in 0..cortes.len().saturating_sub(1) {
            let (ta, tb) = (cortes[i], cortes[i + 1]);
            if tb - ta < EPS {
                continue;
            }
            let h = altura_no_perfil(pts, (ta + tb) / 2.0);
            if h >= band.z1 - EPS {
                descarrega(&mut grupo, &mut out)?;
                continue;
            }
            let z0 = band.z0.max(h);
            match grupo.as_mut() {
                Some(g) if (g.z - z0).abs() < EPS && (g.tb - ta).abs() < EPS => g.tb = tb,
                _ => {
                    descarrega(&mut grupo, &mut out)?;
                    grupo = Some(Grupo { ta, tb, z: z0 });
                }
            }
        }
        descarrega(&mut grupo, &mut out)?;
    }
    Ok(out)
}

/// Perfis de uma parede (`perfis_z`): topo e base derivados de `wallZRange`, e o `topProfile` do modelo.
#[derive(Default, Clone)]
struct PerfisDaParede {
    topo: Option<Perfil>,
    base: Option<Perfil>,
    modelo: Option<Perfil>,
}

/// Agrupa `perfis_z` por parede. `ENTRADA` se o índice de uma lista repete ou deixa lacuna.
fn perfis_por_parede(cena: &Cena) -> Result<BTreeMap<u32, PerfisDaParede>, u32> {
    let mut listas: BTreeMap<(u32, u8), Vec<(u32, f64, f64)>> = BTreeMap::new();
    for p in cena.a3.perfis.values() {
        listas.entry((p.parede, p.lista)).or_default().push((p.indice, p.t, p.h));
    }
    let mut out: BTreeMap<u32, PerfisDaParede> = BTreeMap::new();
    for ((parede, lista), mut pts) in listas {
        pts.sort_by_key(|p| p.0);
        if pts.iter().enumerate().any(|(i, p)| p.0 as usize != i) {
            return Err(ENTRADA);
        }
        let perfil: Perfil = pts.iter().map(|p| (p.1, p.2)).collect();
        let e = out.entry(parede).or_default();
        match lista {
            0 => e.topo = Some(perfil),
            1 => e.base = Some(perfil),
            _ => e.modelo = Some(perfil),
        }
    }
    Ok(out)
}

/// Executa `resolver_nivel(nivel_num, tol_juncao, opcoes)`.
pub fn resolver_nivel_completo(cena: &Cena, nivel: u32, tol: f64, opcoes: &OpcoesDoCluster) -> Result<Vec<Saida>, u32> {
    let perfis = perfis_por_parede(cena)?;
    let NivelResolvido { pintado, mut grupos } = resolver_nivel(cena, nivel, tol, opcoes)?;

    let mut cod = Codificador::default();
    let mut paredes: Vec<u32> = Vec::new();
    let mut paredes_num: Vec<f64> = Vec::new();
    let mut perfis_saida: Vec<f64> = Vec::new();
    let mut membranas: Vec<u32> = Vec::new();
    let mut membranas_pts: Vec<f64> = Vec::new();
    let mut camadas: Vec<u32> = Vec::new();
    let mut prioridades: Vec<f64> = Vec::new();
    let mut formas: Vec<u32> = Vec::new();
    let mut faixas: Vec<f64> = Vec::new();
    let mut faixas_forma: Vec<u32> = Vec::new();
    let mut regioes: Vec<u32> = Vec::new();
    let mut silhuetas: Vec<u32> = Vec::new();

    for (gi, g) in pintado.grupos.iter().enumerate() {
        // Paredes do grupo (`ResolvedCluster.wallIds`) e seus campos.
        for &mi in &g.membros {
            let q = &pintado.quadros[mi];
            let z = cena.a1.paredes_z.get(&q.id).ok_or(ENTRADA)?;
            let linha = cena.a1.quadros.get(&q.id).ok_or(ENTRADA)?;
            let p = perfis.get(&q.id).cloned().unwrap_or_default();
            // perfis derivados copiados (`perfisDoResolvido`)
            let copia = |l: &Option<Perfil>, saida: &mut Vec<f64>| -> (u32, u32, u32) {
                match l {
                    Some(pts) => {
                        let ini = (saida.len() / 2) as u32;
                        for q in pts {
                            saida.push(q.0);
                            saida.push(q.1);
                        }
                        (1, ini, pts.len() as u32)
                    }
                    None => (0, 0, 0),
                }
            };
            let (tt, ti, tn) = copia(&p.topo, &mut perfis_saida);
            let (bt, bi, bn) = copia(&p.base, &mut perfis_saida);
            paredes.extend([q.id, gi as u32, tt, ti, tn, bt, bi, bn]);
            paredes_num.extend([q.a.x, q.a.y, q.b.x, q.b.y, q.u.x, q.u.y, q.n.x, q.n.y, q.length, q.s_hi, q.s_lo, z.z0, z.altura, q.z0, q.topo]);

            // `membranesOf`: camadas de espessura zero como linhas entre as extremidades já esquadrejadas (parede curva não desenha).
            if q.arc.is_none() {
                let camadas_do_tipo = cena.a1.camadas_do_tipo(linha.tipo)?;
                let fim = &pintado.pontas[mi];
                for (i, c) in q.tipo.camadas.iter().enumerate() {
                    if c.espessura >= 1e-6 {
                        continue;
                    }
                    let s = s_na_profundidade(q, c.de);
                    let pa = ponto_no_corte(q, 0, &fim[0], s, Borda::Baixa);
                    let pb = ponto_no_corte(q, 1, &fim[1], s, Borda::Baixa);
                    let material = camadas_do_tipo.get(i).map(|x| x.material).ok_or(ENTRADA)?;
                    membranas.extend([q.id, i as u32, material]);
                    membranas_pts.extend([pa.x, pa.y, pb.x, pb.y]);
                }
            }

            // Perfis: base primeiro, depois o topo (o do `wallZRange` ou, na falta dele, o `topProfile` do modelo).
            if linha.sag == 0.0 {
                let a = [q.a.x, q.a.y];
                let u = [q.u.x, q.u.y];
                let topo = p.topo.as_ref().or(p.modelo.as_ref());
                for c in grupos[gi].camadas.iter_mut() {
                    if pintado.grupos[gi].itens[c.item].parede != q.id {
                        continue;
                    }
                    if let Some(b) = p.base.as_ref().filter(|b| b.len() >= 2) {
                        c.faixas = recortar_pela_base(&c.faixas, a, u, q.length, b)?;
                    }
                    if let Some(t) = topo.filter(|t| t.len() >= 2) {
                        c.faixas = recortar_pelo_topo(&c.faixas, a, u, q.length, t)?;
                    }
                }
            }
        }
        // Camadas, regiões e silhueta (as de `cluster_resolvido`, com a inclinação nas faixas).
        let res = &grupos[gi];
        for c in &res.camadas {
            let it = &g.itens[c.item];
            camadas.extend([it.parede, gi as u32, it.faixa as u32, it.indice, it.material, it.nucleo as u32]);
            prioridades.push(it.prioridade);
            let (bi, bn) = cod.forma(&it.forma);
            let (fi, fn_) = cod.forma(&c.fragment);
            let (ci, cn) = cod.forma(&c.cut);
            let ini_faixas = (faixas.len() / 11) as u32;
            for f in &c.faixas {
                match &f.inclinacao {
                    Some(s) => faixas.extend([f.z0, f.z1, 1.0, s.o[0], s.o[1], s.d[0], s.d[1], s.t0, s.t1, s.h0, s.h1]),
                    None => faixas.extend([f.z0, f.z1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
                }
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
        Saida::U32(paredes),
        Saida::F64(paredes_num),
        Saida::F64(perfis_saida),
        Saida::U32(membranas),
        Saida::F64(membranas_pts),
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
    use crate::a1::testes_util::{c32, c64, c8, cena_com, f64s, tipo_simples, u32s, Par, TipoT};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_CLUSTER_RESOLVIDO, CONSULTA_RESOLVER_NIVEL as Q, SECAO_PAREDES_Z, SECAO_PERFIS_Z};
    use crate::pintor::area_da_forma;

    fn retangulo(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    fn faixa(z0: f64, z1: f64, poly: MultiPoligono) -> FaixaVertical {
        FaixaVertical { z0, z1, poly, inclinacao: None }
    }

    #[test]
    fn altura_no_perfil_degrau_vale_o_valor_a_direita() {
        let p = [(0.0, 1.0), (2.0, 1.0), (2.0, 3.0), (4.0, 3.0)];
        assert_eq!(altura_no_perfil(&p, -5.0), 1.0);
        assert_eq!(altura_no_perfil(&p, 1.0), 1.0);
        assert_eq!(altura_no_perfil(&p, 2.0), 3.0);
        assert_eq!(altura_no_perfil(&p, 9.0), 3.0);
        let rampa = [(0.0, 0.0), (4.0, 2.0)];
        assert_eq!(altura_no_perfil(&rampa, 1.0), 0.5);
    }

    #[test]
    fn topo_em_rampa_corta_a_faixa_com_inclinacao() {
        // parede de 0 a 4 ao longo de x, faixa [0, 3]; perfil de 1 a 2 m: duas faixas inclinadas não, uma só (de t 0 a 4)
        let f = faixa(0.0, 3.0, retangulo(0.0, -0.1, 4.0, 0.1));
        let r = recortar_pelo_topo(&[f], [0.0, 0.0], [1.0, 0.0], 4.0, &[(0.0, 1.0), (4.0, 2.0)]).expect("ok");
        let inclinadas: Vec<_> = r.iter().filter(|x| x.inclinacao.is_some()).collect();
        assert_eq!(inclinadas.len(), 1);
        let s = inclinadas[0].inclinacao.expect("slope");
        assert_eq!(s.h0, 1.0);
        assert!((s.h1 - 2.0).abs() < 1e-9, "h1 é a altura em tb - 1e-10, como no TS");
        assert!((inclinadas[0].z1 - 2.0).abs() < 1e-9, "z1 é a maior altura");
        assert!((area_da_forma(&inclinadas[0].poly) - 0.8).abs() < 1e-6);
    }

    #[test]
    fn topo_em_degrau_divide_em_tramos_planos() {
        let f = faixa(0.0, 3.0, retangulo(0.0, -0.1, 4.0, 0.1));
        let r = recortar_pelo_topo(&[f], [0.0, 0.0], [1.0, 0.0], 4.0, &[(0.0, 1.0), (2.0, 1.0), (2.0, 2.0), (4.0, 2.0)]).expect("ok");
        assert_eq!(r.len(), 2);
        assert!(r.iter().all(|x| x.inclinacao.is_none()));
        assert_eq!((r[0].z0, r[0].z1), (0.0, 1.0));
        assert_eq!((r[1].z0, r[1].z1), (0.0, 2.0));
        assert!((area_da_forma(&r[0].poly) - 0.4).abs() < 1e-6);
    }

    #[test]
    fn base_em_degrau_levanta_o_z0_por_trecho() {
        let f = faixa(0.0, 3.0, retangulo(0.0, -0.1, 4.0, 0.1));
        let r = recortar_pela_base(&[f], [0.0, 0.0], [1.0, 0.0], 4.0, &[(0.0, 0.0), (2.0, 0.0), (2.0, 0.5), (4.0, 0.5)]).expect("ok");
        assert_eq!(r.len(), 2);
        assert_eq!((r[0].z0, r[0].z1), (0.0, 3.0));
        assert_eq!((r[1].z0, r[1].z1), (0.5, 3.0));
    }

    fn cena_de_uma_parede(tipo: TipoT, sag: f64) -> Cena {
        let mut p = Par::nova(1, (0.0, 0.0), (4.0, 0.0));
        p.sag = sag;
        let mut c = cena_com(&[p], &[tipo]);
        let bz = [c32(&[1]), c64(&[0.5]), c64(&[2.8])].concat();
        c.definir_secao(SECAO_PAREDES_Z, 1, &bz).expect("paredes_z");
        c
    }

    fn perfis_z(linhas: &[(u32, u32, u8, u32, f64, f64)]) -> Vec<u8> {
        [
            c32(&linhas.iter().map(|l| l.0).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.1).collect::<Vec<_>>()),
            c8(&linhas.iter().map(|l| l.2).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.3).collect::<Vec<_>>()),
            c64(&linhas.iter().map(|l| l.4).collect::<Vec<_>>()),
            c64(&linhas.iter().map(|l| l.5).collect::<Vec<_>>()),
        ]
        .concat()
    }

    const ARGS: [f64; 7] = [0.0, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0];

    #[test]
    fn sem_perfis_equivale_ao_cluster_resolvido_e_traz_os_campos_da_parede() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.0);
        let s = executar(&mut c, Q, &ARGS).expect("resolver_nivel");
        let d = executar(&mut c, CONSULTA_CLUSTER_RESOLVIDO, &ARGS).expect("cluster_resolvido");
        // paredes: 1 linha; sem perfil
        assert_eq!(u32s(&s[0]), &[1, 0, 0, 0, 0, 0, 0, 0]);
        let n = f64s(&s[1]);
        assert_eq!(n.len(), 15);
        assert_eq!((n[0], n[1], n[2], n[3]), (0.0, 0.0, 4.0, 0.0));
        assert_eq!((n[4], n[5], n[6], n[7]), (1.0, 0.0, 0.0, 1.0));
        assert_eq!((n[8], n[11], n[12], n[13], n[14]), (4.0, 0.5, 2.8, 0.0, 2.8));
        // as camadas (identidade e prioridade) coincidem com as de cluster_resolvido
        assert_eq!(u32s(&s[5]), u32s(&d[0]));
        assert_eq!(f64s(&s[6]), f64s(&d[1]));
        // sem perfil uma faixa de 0 a 2,8 sem inclinação (11 valores)
        let faixas = f64s(&s[8]);
        assert_eq!(faixas.len() % 11, 0);
        assert_eq!((faixas[0], faixas[1], faixas[2]), (0.0, 2.8, 0.0));
        assert!(s[3].is_empty() && s[4].is_empty(), "o tipo simples não tem membrana");
    }

    #[test]
    fn membrana_so_em_parede_reta() {
        let membrana: TipoT = (1, vec![(0.1, 0, None), (0.0, 3, None), (0.1, 0, None)]);
        let mut c = cena_de_uma_parede(membrana.clone(), 0.0);
        let s = executar(&mut c, Q, &ARGS).expect("resolver_nivel");
        assert_eq!(u32s(&s[3]).len(), 3);
        assert_eq!(u32s(&s[3])[..2], [1, 1]);
        let pts = f64s(&s[4]);
        // a linha da membrana está a meia espessura (0,1 de 0,2) e vai de x = 0 a x = 4
        assert_eq!((pts[0], pts[2]), (0.0, 4.0));
        assert!((pts[1] - pts[3]).abs() < 1e-12);
        let mut curva = cena_de_uma_parede(membrana, 0.5);
        let sc = executar(&mut curva, Q, &ARGS).expect("resolver_nivel");
        assert!(sc[3].is_empty(), "parede curva não desenha membrana");
    }

    #[test]
    fn perfil_de_topo_e_de_base_sao_copiados_e_recortam_as_faixas() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.0);
        let linhas = [
            (1, 1, 0, 0, 0.0, 1.0),
            (2, 1, 0, 1, 4.0, 2.0),
            (3, 1, 1, 0, 0.0, 0.0),
            (4, 1, 1, 1, 2.0, 0.0),
            (5, 1, 1, 2, 2.0, 0.3),
            (6, 1, 1, 3, 4.0, 0.3),
        ];
        c.definir_secao(SECAO_PERFIS_Z, 6, &perfis_z(&linhas)).expect("perfis_z");
        let s = executar(&mut c, Q, &ARGS).expect("resolver_nivel");
        let p = u32s(&s[0]);
        assert_eq!(p, &[1, 0, 1, 0, 2, 1, 2, 4]);
        assert_eq!(f64s(&s[2]), &[0.0, 1.0, 4.0, 2.0, 0.0, 0.0, 2.0, 0.0, 2.0, 0.3, 4.0, 0.3]);
        let faixas = f64s(&s[8]);
        // cada camada: algum tramo inclinado (o topo vai de 1 a 2 m) e a base levantada em 0,3 no 2º trecho
        assert!(faixas.chunks(11).any(|f| f[2] == 1.0), "faixa inclinada");
        assert!(faixas.chunks(11).any(|f| (f[0] - 0.3).abs() < 1e-12), "base levantada");
    }

    #[test]
    fn perfil_do_modelo_so_vale_sem_perfil_derivado_e_nao_e_copiado() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.0);
        c.definir_secao(SECAO_PERFIS_Z, 2, &perfis_z(&[(1, 1, 2, 0, 0.0, 1.0), (2, 1, 2, 1, 4.0, 2.0)])).expect("perfis_z");
        let s = executar(&mut c, Q, &ARGS).expect("resolver_nivel");
        assert_eq!(u32s(&s[0]), &[1, 0, 0, 0, 0, 0, 0, 0], "o topProfile do modelo não vira profileTop");
        assert!(f64s(&s[8]).chunks(11).any(|f| f[2] == 1.0), "mas recorta as faixas");
        // com perfil derivado, o do modelo é ignorado
        let mut d = cena_de_uma_parede(tipo_simples(), 0.0);
        d.definir_secao(SECAO_PERFIS_Z, 4, &perfis_z(&[(1, 1, 2, 0, 0.0, 1.0), (2, 1, 2, 1, 4.0, 2.0), (3, 1, 0, 0, 0.0, 2.0), (4, 1, 0, 1, 4.0, 2.0)])).expect("perfis_z");
        let sd = executar(&mut d, Q, &ARGS).expect("resolver_nivel");
        assert!(!f64s(&sd[8]).chunks(11).any(|f| f[2] == 1.0), "topo plano em 2 m");
        assert!(f64s(&sd[8]).chunks(11).any(|f| f[1] == 2.0));
    }

    #[test]
    fn parede_curva_copia_o_perfil_mas_nao_recorta() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.5);
        c.definir_secao(SECAO_PERFIS_Z, 2, &perfis_z(&[(1, 1, 0, 0, 0.0, 1.0), (2, 1, 0, 1, 4.0, 2.0)])).expect("perfis_z");
        let s = executar(&mut c, Q, &ARGS).expect("resolver_nivel");
        assert_eq!(u32s(&s[0])[2..5], [1, 0, 2]);
        assert!(f64s(&s[8]).chunks(11).all(|f| f[2] == 0.0 && f[1] == 2.8), "faixas inteiras");
    }

    #[test]
    fn perfis_z_invalidos_viram_entrada_e_a_remocao_vale() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.0);
        // índice com lacuna (0 e 2) e índice repetido
        c.definir_secao(SECAO_PERFIS_Z, 2, &perfis_z(&[(1, 1, 0, 0, 0.0, 1.0), (2, 1, 0, 2, 4.0, 2.0)])).expect("decodifica");
        assert_eq!(executar(&mut c, Q, &ARGS).err(), Some(ENTRADA));
        c.definir_secao(SECAO_PERFIS_Z, 2, &perfis_z(&[(1, 1, 0, 0, 0.0, 1.0), (2, 1, 0, 0, 4.0, 2.0)])).expect("decodifica");
        assert_eq!(executar(&mut c, Q, &ARGS).err(), Some(ENTRADA));
        // lista fora do domínio e valores não finitos recusados já na seção
        assert_eq!(c.definir_secao(SECAO_PERFIS_Z, 1, &perfis_z(&[(1, 1, 3, 0, 0.0, 1.0)])).err(), Some(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_PERFIS_Z, 1, &perfis_z(&[(1, 1, 0, 0, f64::NAN, 1.0)])).err(), Some(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_PERFIS_Z, 1, &perfis_z(&[(u32::MAX, 1, 0, 0, 0.0, 1.0)])).err(), Some(ENTRADA));
        // upsert + remoção
        c.remover(SECAO_PERFIS_Z, &[1, 2]).expect("remover");
        assert!(executar(&mut c, Q, &ARGS).is_ok());
        c.upsert(SECAO_PERFIS_Z, 2, &perfis_z(&[(7, 1, 0, 0, 0.0, 1.0), (8, 1, 0, 1, 4.0, 2.0)])).expect("upsert");
        let s = executar(&mut c, Q, &ARGS).expect("ok");
        assert_eq!(u32s(&s[0])[2], 1);
        c.remover(SECAO_PERFIS_Z, &[7, 8]).expect("remover");
        assert_eq!(u32s(&executar(&mut c, Q, &ARGS).expect("ok")[0])[2], 0);
    }

    #[test]
    fn argumentos_e_nivel_invalidos() {
        let mut c = cena_de_uma_parede(tipo_simples(), 0.0);
        assert_eq!(executar(&mut c, Q, &[f64::from(0xffff_ffffu32), 0.02, 0.0, 0.0, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 1.0, 0.0, 0.0]).err(), Some(ENTRADA));
        c.remover(SECAO_PAREDES_Z, &[1]).expect("remover");
        assert_eq!(executar(&mut c, Q, &ARGS).err(), Some(ENTRADA));
    }
}
