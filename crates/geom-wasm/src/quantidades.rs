//! Quantidades por camada (decisão do dono: só o Rust calcula a geometria das quantidades). Porta de `junctionNet.ts` (`cuts`, `cutVolume`,
//! `coveredFaceArea`, `slabCoversFloor`, `cutterPlan`) e de `quantities.ts`, `floorQuantities.ts`, `slabQuantities.ts` e `ceilingQuantities.ts`.
//!
//! Consultas `quant_paredes`, `quant_pisos`, `quant_lajes` e `quant_forros` (`nivel_num`, `tol_juncao`). Saída: uma linha por camada
//! (`linhas`: dono_id, indice_camada, n_faixas, flags; `valores`: bruto, cortado, liquido, area_de_face, altura).
//!
//! - `liquido = max(0, bruto - cortado)`, com o zero aplicado UMA vez por camada (a soma de cortes por faixa pode passar do bruto de uma faixa fina).
//! - `indice_camada` é o `layerIndex` do TS (negativo nas faixas verticais da parede), em complemento de dois.
//! - `flags`: bit 0 = membrana (espessura zero: área de face, volume zero); bit 1 = linha de parede sem camada (só a altura vale).
//! - Parede: `bruto` = soma de `volume_faixa`; `cortado` = soma do volume de cada faixa dentro de piso e laje (par a par, `cuts`); `area_de_face` =
//!   `liquido / espessura`; `altura` = altura média da parede com os perfis (`quantifyLevel`).
//! - Piso e laje: `bruto` = área da camada × espessura (0 na membrana). Piso: laje que cobre o piso inteiro no mesmo nível não corta (`slabCoversFloor`).
//! - Forro: área × espessura; ninguém corta forro.
//!
//! Não há aproximação: `overlap_volume` é exato (ou devolve `ENTRADA`), e qualquer falha sai como código de erro.

use std::collections::{BTreeMap, BTreeSet};

use crate::a3c::{resolver_nivel, NivelResolvido, OpcoesDoCluster};
use crate::a3d::{aplicar_perfis, perfis_por_parede};
use crate::b1::{calcular, CamadaResolvida, ElementoResolvido};
use crate::b3::{conjunto_de_cortadores, faixa_da_peca, peca_da_camada, vence, Cortador, MetaDaPeca, MetaDeJuncao, PecaSolida, Span, Tipo, VarianteDaJuncao, Z_EPS};
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::ops::{interseccao, interseccao_com_escala, uniao, uniao_com_escala, ESCALA_FINA};
use crate::perfil_quant::{perfil_media, volume_faixa, Inclinacao as InclinacaoDoVolume};
use crate::pintor::area_da_forma;
use crate::geo2d::V;
use crate::volume_sobreposicao::{ajustar_afim, overlap_volume, recortar_multi, Afim};
use crate::MultiPoligono;

/// Tolerância (m²) para considerar que um cortador cobre a forma inteira em planta (`AREA_EPS`).
const AREA_EPS: f64 = 1e-6;

pub const FLAG_MEMBRANA: u32 = 1;
pub const FLAG_SEM_CAMADA: u32 = 2;

/// Uma linha de saída: a camada e seus cinco valores.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaQuant {
    pub dono: u32,
    pub camada: i32,
    pub n_faixas: u32,
    pub flags: u32,
    pub bruto: f64,
    pub cortado: f64,
    pub liquido: f64,
    pub area_de_face: f64,
    pub altura: f64,
}

/// `CUTTERS[kind].includes(c.kind)`: quem corta um elemento sem atributos de camada (padrão por tipo).
fn corta_por_tipo(cortador: Tipo, peca: Tipo) -> bool {
    match peca {
        Tipo::Parede => matches!(cortador, Tipo::Piso | Tipo::Laje),
        Tipo::Piso => cortador == Tipo::Laje,
        Tipo::Laje => false,
    }
}

/// `cuts(c, cp, piece, kind)`: o cortador `c` (com a peça `cp`) corta a peça `peca` do tipo `tipo`?
pub fn corta(c: &Cortador, cp: &PecaSolida, peca: &PecaSolida, tipo: Tipo) -> bool {
    if peca.externa {
        return false;
    }
    let e_parede = |m: &Option<MetaDaPeca>| m.map(|x| x.juncao.tipo == Tipo::Parede);
    if cp.externa && e_parede(&cp.meta) == e_parede(&peca.meta) {
        return false;
    }
    if let (Some(a), Some(b)) = (cp.meta, peca.meta) {
        if a.dono == b.dono {
            return false;
        }
        return vence(&a.juncao, &b.juncao) == Some(true);
    }
    corta_por_tipo(c.tipo, tipo)
}

/// `cutVolume`: volume (m³) da peça que cai dentro dos elementos que a cortam. `pular`: índices de `cortadores` que não entram.
pub fn volume_cortado(peca: &PecaSolida, tipo: Tipo, cortadores: &[&Cortador], pular: &BTreeSet<usize>) -> Result<f64, u32> {
    let mut corte = 0.0;
    for (i, c) in cortadores.iter().enumerate() {
        if pular.contains(&i) {
            continue;
        }
        for cp in &c.pecas {
            if corta(c, cp, peca, tipo) {
                corte += overlap_volume(peca, cp)?;
            }
        }
    }
    Ok(corte)
}

/// `coveredFaceArea`: área (m²) de uma face de espessura zero que está dentro da faixa de cota de um cortador. O TypeScript avaliava a cota no primeiro
/// vértice da interseção (uma amostra só); com cortador inclinado isso dependia de qual vértice vinha primeiro. Aqui a condição vale em cada ponto:
/// a região da interseção em que `z_base >= base_do_cortador - Z_EPS` e `z_topo <= topo_do_cortador + Z_EPS`, recortada exatamente pelas retas onde as alturas
/// afins se igualam. A área é a da UNIÃO das regiões cobertas (o TypeScript somava a interseção inteira de cada cortador, contando em dobro onde eles se sobrepõem). Altura que não seja afim na interseção (perfil por trechos) é `ENTRADA`: nunca se aproxima.
pub fn area_coberta(peca: &PecaSolida, tipo: Tipo, cortadores: &[&Cortador], pular: &BTreeSet<usize>) -> Result<f64, u32> {
    // Regiões cobertas por cada peça cortadora; a face some onde QUALQUER uma cobre, então a área é a da união (cortadores que se sobrepõem não contam duas vezes).
    let mut cobertas: Vec<MultiPoligono> = Vec::new();
    for (i, c) in cortadores.iter().enumerate() {
        if pular.contains(&i) {
            continue;
        }
        for cp in &c.pecas {
            if !corta(c, cp, peca, tipo) {
                continue;
            }
            let comum = interseccao(&peca.poly, &cp.poly)?;
            if comum.is_empty() {
                continue;
            }
            let altura = |s: &Span, k: usize| {
                let s = s.clone();
                move |q: V| {
                    let (a, b) = s.em([q.x, q.y]);
                    if k == 0 {
                        a
                    } else {
                        b
                    }
                }
            };
            let (p0, p1) = (altura(&peca.span, 0), altura(&peca.span, 1));
            let (c0, c1) = (altura(&cp.span, 0), altura(&cp.span, 1));
            let (Some(p0), Some(p1), Some(c0), Some(c1)) = (ajustar_afim(&p0, &comum), ajustar_afim(&p1, &comum), ajustar_afim(&c0, &comum), ajustar_afim(&c1, &comum)) else {
                return Err(ENTRADA);
            };
            let base = Afim { gx: p0.gx - c0.gx, gy: p0.gy - c0.gy, gc: p0.gc - c0.gc + Z_EPS };
            let topo = Afim { gx: c1.gx - p1.gx, gy: c1.gy - p1.gy, gc: c1.gc - p1.gc + Z_EPS };
            let coberta = recortar_multi(&comum, &[(base, 1), (topo, 1)]);
            if !coberta.is_empty() {
                cobertas.push(coberta);
            }
        }
    }
    Ok(if cobertas.is_empty() { 0.0 } else { area_da_forma(&uniao(&cobertas)?) })
}

/// `slabCoversFloor`: a laje é plana, do próprio nível, tem a mesma face superior do piso, contém a faixa de cota dele e cobre todas as camadas em planta.
pub(crate) fn laje_cobre_piso(c: &Cortador, piso: &ElementoResolvido) -> Result<bool, u32> {
    if c.tipo != Tipo::Laje || c.pecas.is_empty() {
        return Ok(false);
    }
    let (mut z0, mut z1) = (f64::INFINITY, f64::NEG_INFINITY);
    for p in &c.pecas {
        if !p.plana || p.externa {
            return Ok(false);
        }
        let Some(r) = faixa_da_peca(p) else { return Ok(false) };
        z0 = z0.min(r.0);
        z1 = z1.max(r.1);
    }
    if (z1 - piso.topo_z).abs() > Z_EPS || z0 > piso.base_z + Z_EPS {
        return Ok(false);
    }
    // `cutterPlan`: união em planta das camadas do cortador. A comparação de áreas usa 1e-6 m² (AREA_EPS): na grade de 1 µm o recorte de um contorno
    // de dezenas de metros já desloca a área mais que isso, então aqui a grade é a de 1 nm (como o pintor).
    let planta = uniao_com_escala(&c.pecas.iter().map(|p| p.poly.clone()).collect::<Vec<_>>(), ESCALA_FINA)?;
    for l in &piso.camadas {
        let comum = interseccao_com_escala(&planta, &l.poligono, ESCALA_FINA)?;
        if (area_da_forma(&comum) - area_da_forma(&l.poligono)).abs() > AREA_EPS {
            return Ok(false);
        }
    }
    Ok(true)
}

fn liquido_de(bruto: f64, cortado: f64) -> f64 {
    0.0f64.max(bruto - cortado)
}

fn nivel_valido(nivel: u32) -> Result<(), u32> {
    if nivel == NIVEL_TODOS {
        Err(ENTRADA)
    } else {
        Ok(())
    }
}

/// `quantifyLevel`: volume bruto e cortado de cada camada de cada parede do nível, e a altura média de cada parede.
pub fn quantidades_paredes(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<LinhaQuant>, u32> {
    nivel_valido(nivel)?;
    let c = conjunto_de_cortadores(cena, nivel, tol)?;
    // `[...floorCutters, ...slabCutters]`
    let cortadores: Vec<&Cortador> = c.pisos.iter().chain(c.lajes.iter()).collect();
    let nenhum = BTreeSet::new();
    let _variante = VarianteDaJuncao::ligar(cena);
    let perfis = perfis_por_parede(cena)?;
    let opcoes = OpcoesDoCluster { planta: crate::a2::OpcoesDePlanta { corte_z: None, contorno: BTreeSet::new() }, aberturas_planta: None };
    let NivelResolvido { pintado, mut grupos } = resolver_nivel(cena, nivel, tol, &opcoes)?;
    aplicar_perfis(cena, &pintado, &mut grupos, &perfis)?;
    let mut saida: Vec<LinhaQuant> = Vec::new();
    for (gi, g) in pintado.grupos.iter().enumerate() {
        for &mi in &g.membros {
            let q = &pintado.quadros[mi];
            let z = cena.parede_z(q.id).ok_or(ENTRADA)?;
            let linha = cena.a1.quadros.get(&q.id).ok_or(ENTRADA)?;
            // Altura: o topo do modelo (parede reta) ou a altura resolvida; com base em perfil, o topo médio menos a base média.
            let p = perfis.get(&q.id).cloned().unwrap_or_default();
            let modelo = if linha.sag == 0.0 { p.modelo.as_ref() } else { None };
            let h0 = modelo.map_or(z.altura, |m| perfil_media(m, q.length));
            let altura = match p.base.as_ref() {
                Some(b) => p.topo.as_ref().map_or(h0, |t| perfil_media(t, q.length)) - perfil_media(b, q.length),
                None => h0,
            };
            let mut tem_camada = false;
            for cam in grupos[gi].camadas.iter().filter(|cam| g.itens[cam.item].parede == q.id) {
                tem_camada = true;
                let it = &g.itens[cam.item];
                let (mut bruto, mut cortado) = (0.0, 0.0);
                for (banda, f) in cam.faixas.iter().enumerate() {
                    let inc = f.inclinacao.map(|s| InclinacaoDoVolume { o: s.o, d: s.d, t0: s.t0, t1: s.t1, h0: s.h0, h1: s.h1 });
                    bruto += volume_faixa(&f.poly, f.z0, f.z1, inc.as_ref());
                    let peca = PecaSolida {
                        poly: f.poly.clone(),
                        span: Span::Faixa { base_z: z.z0, z0: f.z0, z1: f.z1, inclinacao: f.inclinacao },
                        plana: f.inclinacao.is_none(),
                        meta: Some(MetaDaPeca {
                            juncao: MetaDeJuncao { tipo: Tipo::Parede, prioridade: it.prioridade, nucleo: it.nucleo, explicita: false },
                            dono: (Tipo::Parede, q.id),
                            camada: it.camada(),
                            banda: Some(banda as u32),
                        }),
                        externa: false,
                    };
                    cortado += volume_cortado(&peca, Tipo::Parede, &cortadores, &nenhum)?;
                }
                let liquido = liquido_de(bruto, cortado);
                let area_de_face = if it.espessura > 0.0 { liquido / it.espessura } else { 0.0 };
                saida.push(LinhaQuant { dono: q.id, camada: it.camada() as i32, n_faixas: cam.faixas.len() as u32, flags: 0, bruto, cortado, liquido, area_de_face, altura });
            }
            if !tem_camada {
                saida.push(LinhaQuant { dono: q.id, camada: 0, n_faixas: 0, flags: FLAG_SEM_CAMADA, bruto: 0.0, cortado: 0.0, liquido: 0.0, area_de_face: 0.0, altura });
            }
        }
    }
    Ok(saida)
}

/// Fator da área real sobre a planta de um plano com esse percentual: `1 / cos(atan(|percentual| / 100))`.
fn fator_de_inclinacao(percentual: f64) -> f64 {
    1.0 / (percentual.abs() / 100.0).atan().cos()
}

fn linha_de_camada(e: &ElementoResolvido, l: &CamadaResolvida, bruto: f64, cortado: f64, area_de_face: f64) -> LinhaQuant {
    LinhaQuant {
        dono: e.id,
        camada: l.indice as i32,
        n_faixas: 1,
        flags: if l.membrana { FLAG_MEMBRANA } else { 0 },
        bruto,
        cortado,
        liquido: liquido_de(bruto, cortado),
        area_de_face,
        altura: 0.0,
    }
}

/// `quantifyFloors`: cortadores = lajes, pisos e paredes; a laje que cobre o piso inteiro no mesmo nível não entra na conta.
pub fn quantidades_pisos(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<LinhaQuant>, u32> {
    nivel_valido(nivel)?;
    let elementos = calcular(cena, nivel, Some(tol))?;
    let c = conjunto_de_cortadores(cena, nivel, tol)?;
    let cortadores: Vec<&Cortador> = c.lajes.iter().chain(c.pisos.iter()).chain(c.paredes.iter()).collect();
    let mut saida = Vec::new();
    for e in elementos.iter().filter(|e| !e.laje) {
        let mut pular = BTreeSet::new();
        for (i, laje) in c.lajes.iter().enumerate() {
            if laje_cobre_piso(laje, e)? {
                pular.insert(i);
            }
        }
        for l in &e.camadas {
            let peca = peca_da_camada(e, l);
            let esp = l.z1 - l.z0;
            let area = area_da_forma(&l.poligono);
            let bruto = if l.membrana { 0.0 } else { area * esp };
            let cortado = if l.membrana { 0.0 } else { volume_cortado(&peca, Tipo::Piso, &cortadores, &pular)? };
            let liquido = liquido_de(bruto, cortado);
            let face = if l.membrana {
                0.0f64.max(area - area_coberta(&peca, Tipo::Piso, &cortadores, &pular)?)
            } else if esp > 0.0 {
                liquido / esp
            } else {
                area
            };
            saida.push(linha_de_camada(e, l, bruto, cortado, face));
        }
    }
    Ok(saida)
}

/// `quantifySlabs`: cortadores = pisos, lajes e paredes. A área de face leva o fator de inclinação.
pub fn quantidades_lajes(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<LinhaQuant>, u32> {
    nivel_valido(nivel)?;
    let elementos = calcular(cena, nivel, Some(tol))?;
    let c = conjunto_de_cortadores(cena, nivel, tol)?;
    let cortadores: Vec<&Cortador> = c.pisos.iter().chain(c.lajes.iter()).chain(c.paredes.iter()).collect();
    let nenhum = BTreeSet::new();
    let mut saida = Vec::new();
    for e in elementos.iter().filter(|e| e.laje) {
        let fator = fator_de_inclinacao(e.inclinacao.map_or(0.0, |s| s.percentual));
        for l in &e.camadas {
            let peca = peca_da_camada(e, l);
            let esp = l.z1 - l.z0;
            let planta = area_da_forma(&l.poligono);
            let face_bruta = planta * fator;
            let bruto = if l.membrana { 0.0 } else { planta * esp };
            let cortado = if l.membrana { 0.0 } else { volume_cortado(&peca, Tipo::Laje, &cortadores, &nenhum)? };
            let liquido = liquido_de(bruto, cortado);
            let face = if l.membrana {
                0.0f64.max(face_bruta - area_coberta(&peca, Tipo::Laje, &cortadores, &nenhum)?)
            } else if bruto > 0.0 {
                face_bruta * (liquido / bruto)
            } else {
                face_bruta
            };
            saida.push(linha_de_camada(e, l, bruto, cortado, face));
        }
    }
    Ok(saida)
}

/// `quantifyCeilings`: área do contorno (`pontos_forro`) × espessura de cada camada (`camadas_forro`); ninguém corta forro.
pub fn quantidades_forros(cena: &Cena, nivel: u32) -> Result<Vec<LinhaQuant>, u32> {
    nivel_valido(nivel)?;
    // Contorno de cada forro: polígono -> anel -> (índice, ponto), sem repetir índice e sem lacuna.
    let mut por_forro: BTreeMap<u32, BTreeMap<u32, BTreeMap<u32, BTreeMap<u32, [f64; 2]>>>> = BTreeMap::new();
    for p in cena.b.pontos_forro.values() {
        let anel = por_forro.entry(p.forro).or_default().entry(p.poligono).or_default().entry(p.anel).or_default();
        if anel.insert(p.indice, [p.x, p.y]).is_some() {
            return Err(ENTRADA);
        }
    }
    let mut formas: BTreeMap<u32, MultiPoligono> = BTreeMap::new();
    for (forro, poligonos) in &por_forro {
        let mut forma: MultiPoligono = Vec::new();
        for (k, (pol, aneis)) in poligonos.iter().enumerate() {
            if *pol != k as u32 {
                return Err(ENTRADA);
            }
            let mut poligono = Vec::new();
            for (j, (anel, pts)) in aneis.iter().enumerate() {
                if *anel != j as u32 || pts.keys().enumerate().any(|(i, ix)| *ix != i as u32) {
                    return Err(ENTRADA);
                }
                poligono.push(pts.values().copied().collect::<Vec<[f64; 2]>>());
            }
            forma.push(poligono);
        }
        formas.insert(*forro, forma);
    }
    let mut camadas: Vec<&crate::secoes_b::CamadaForroLinha> = cena.b.camadas_forro.values().filter(|c| c.nivel == nivel).collect();
    camadas.sort_by_key(|c| (c.forro, c.indice));
    let mut saida = Vec::new();
    for c in camadas {
        let area = formas.get(&c.forro).map_or(0.0, area_da_forma);
        let bruto = area * c.espessura;
        saida.push(LinhaQuant { dono: c.forro, camada: c.indice as i32, n_faixas: 1, flags: 0, bruto, cortado: 0.0, liquido: bruto, area_de_face: area, altura: 0.0 });
    }
    Ok(saida)
}

/// Codifica as linhas nas duas saídas (`linhas` U32 de 4 e `valores` F64 de 5).
pub fn codificar(linhas: &[LinhaQuant]) -> Vec<Saida> {
    let mut u = Vec::with_capacity(linhas.len() * 4);
    let mut f = Vec::with_capacity(linhas.len() * 5);
    for l in linhas {
        u.extend([l.dono, l.camada as u32, l.n_faixas, l.flags]);
        f.extend([l.bruto, l.cortado, l.liquido, l.area_de_face, l.altura]);
    }
    vec![Saida::U32(u), Saida::F64(f)]
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, f64s, u32s};
    use crate::b3::testes::cena_de_dois_niveis;
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_QUANT_FORROS, CONSULTA_QUANT_LAJES, CONSULTA_QUANT_PAREDES, CONSULTA_QUANT_PISOS, SECAO_CAMADAS_FORRO, SECAO_PONTOS_FORRO};

    const TOL: f64 = 0.02;

    fn linhas(m: &mut crate::b1::testes::Montada, consulta: u32, nivel: f64) -> Vec<LinhaQuant> {
        let s = executar(&mut m.cena, consulta, &[nivel, TOL]).expect("consulta de quantidades");
        let (u, f) = (u32s(&s[0]), f64s(&s[1]));
        assert_eq!(u.len() / 4, f.len() / 5, "uma linha de números por linha de chaves");
        u.chunks(4)
            .zip(f.chunks(5))
            .map(|(a, b)| LinhaQuant { dono: a[0], camada: a[1] as i32, n_faixas: a[2], flags: a[3], bruto: b[0], cortado: b[1], liquido: b[2], area_de_face: b[3], altura: b[4] })
            .collect()
    }

    fn conserva(ls: &[LinhaQuant]) {
        for l in ls {
            assert!(l.cortado >= -1e-12, "corte negativo {l:?}");
            assert!(l.liquido >= 0.0, "líquido negativo {l:?}");
            if l.flags & FLAG_SEM_CAMADA == 0 {
                assert!(l.liquido <= l.bruto + 1e-12, "líquido acima do bruto {l:?}");
                if l.cortado <= l.bruto {
                    assert!((l.liquido - (l.bruto - l.cortado)).abs() < 1e-12, "bruto = líquido + cortado {l:?}");
                } else {
                    assert_eq!(l.liquido, 0.0, "corte maior que o bruto: o zero vale uma vez por camada {l:?}");
                }
            }
        }
    }

    #[test]
    fn parede_do_nivel_de_baixo_perde_o_que_a_laje_de_cima_ocupa_e_conserva_o_volume() {
        let mut m = cena_de_dois_niveis();
        let ls = linhas(&mut m, CONSULTA_QUANT_PAREDES, 0.0);
        conserva(&ls);
        assert_eq!(ls.len(), 1, "uma parede, uma camada");
        let l = &ls[0];
        let bruto = 0.2 * 6.0 * 2.8;
        let cortado = 0.2 * 4.0 * 0.15;
        assert!((l.bruto - bruto).abs() < 1e-9, "bruto {}", l.bruto);
        assert!((l.cortado - cortado).abs() < 1e-9, "cortado {}", l.cortado);
        assert!((l.liquido - (bruto - cortado)).abs() < 1e-9);
        assert!((l.area_de_face - l.liquido / 0.2).abs() < 1e-9, "área de face = volume / espessura");
        assert!((l.altura - 2.8).abs() < 1e-12, "altura {}", l.altura);
        assert_eq!(l.camada, 0);
    }

    #[test]
    fn piso_e_laje_conservam_e_a_laje_inteira_nao_e_cortada() {
        let mut m = cena_de_dois_niveis();
        let pisos = linhas(&mut m, CONSULTA_QUANT_PISOS, 0.0);
        conserva(&pisos);
        assert!(!pisos.is_empty());
        for l in &pisos {
            // piso de 6 x 4 m: bruto = 24 x espessura; a parede (x = 3) atravessa o piso mas a laje de cima não o toca
            let esp = if l.camada == 0 { 0.01 } else { 0.12 };
            if l.flags & FLAG_MEMBRANA == 0 {
                assert!((l.bruto - 24.0 * esp).abs() < 1e-9, "bruto {l:?}");
                assert!(l.cortado <= l.bruto);
            }
        }
        let lajes = linhas(&mut m, CONSULTA_QUANT_LAJES, 1.0);
        conserva(&lajes);
        assert_eq!(lajes.len(), 1);
        assert!((lajes[0].bruto - 24.0 * 0.15).abs() < 1e-9);
        assert!((lajes[0].area_de_face - 24.0 * lajes[0].liquido / lajes[0].bruto).abs() < 1e-9, "sem inclinação a face é a planta líquida");
    }


    fn peca_de(tipo: Tipo, dono: u32, poly: MultiPoligono, span: Span, plana: bool) -> PecaSolida {
        PecaSolida {
            poly,
            span,
            plana,
            meta: Some(MetaDaPeca { juncao: MetaDeJuncao { tipo, prioridade: 1.0, nucleo: true, explicita: false }, dono: (tipo, dono), camada: 0, banda: None }),
            externa: false,
        }
    }

    #[test]
    fn membrana_sob_laje_inclinada_cobre_exatamente_a_faixa_onde_a_cota_cabe() {
        // laje inclinada (25 % em x) com faixa de 0 a 0,4 m acima da subida; membrana a 0,5 m sobre 3 x 1 m.
        // Coberta onde 0,25 x <= 0,5 e 0,5 <= 0,4 + 0,25 x: x entre 0,4 e 2 -> 1,6 m2 (mais a folga de Z_EPS), qualquer que seja o vértice por onde a interseção comece.
        let retangulo = vec![vec![vec![[0.0, 0.0], [3.0, 0.0], [3.0, 1.0], [0.0, 1.0]]]];
        let laje = Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 1, retangulo.clone(), Span::Laje { z0: 0.0, z1: 0.4, origem: [0.0, 0.0], direcao: [1.0, 0.0], percentual: 25.0 }, false)] };
        let membrana = peca_de(Tipo::Piso, 2, retangulo.clone(), Span::Constante { z0: 0.5, z1: 0.5 }, true);
        let area = area_coberta(&membrana, Tipo::Piso, &[&laje], &BTreeSet::new()).expect("area_coberta");
        assert!((area - 1.6).abs() < 2e-5, "área coberta {area}");
        // a mesma conta com o anel girado (outro vértice inicial) dá o mesmo resultado
        let girado = vec![vec![vec![[3.0, 1.0], [0.0, 1.0], [0.0, 0.0], [3.0, 0.0]]]];
        let membrana2 = peca_de(Tipo::Piso, 2, girado, Span::Constante { z0: 0.5, z1: 0.5 }, true);
        let area2 = area_coberta(&membrana2, Tipo::Piso, &[&laje], &BTreeSet::new()).expect("area_coberta");
        assert!((area2 - area).abs() < 1e-9, "{area2} x {area}");
        // laje plana que contém a cota cobre tudo; que não contém, nada
        let plana = |z0, z1| Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 1, retangulo.clone(), Span::Constante { z0, z1 }, true)] };
        assert!((area_coberta(&membrana, Tipo::Piso, &[&plana(0.3, 0.5)], &BTreeSet::new()).unwrap() - 3.0).abs() < 1e-9);
        assert_eq!(area_coberta(&membrana, Tipo::Piso, &[&plana(0.0, 0.4)], &BTreeSet::new()).unwrap(), 0.0);
    }

    #[test]
    fn corte_maior_que_o_bruto_zera_o_liquido_uma_vez_e_nao_cria_volume() {
        // peça de parede de 1 x 1 x 1 m dentro de uma laje de 2 x 2 x 1 m: corta 1 m3 (tudo)
        let quadrado = |l: f64| vec![vec![vec![[0.0, 0.0], [l, 0.0], [l, l], [0.0, l]]]];
        let laje = Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 1, quadrado(2.0), Span::Constante { z0: 0.0, z1: 1.0 }, true)] };
        let parede = peca_de(Tipo::Parede, 2, quadrado(1.0), Span::Faixa { base_z: 0.0, z0: 0.0, z1: 1.0, inclinacao: None }, true);
        let cortado = volume_cortado(&parede, Tipo::Parede, &[&laje], &BTreeSet::new()).unwrap();
        assert!((cortado - 1.0).abs() < 1e-9);
        assert_eq!(liquido_de(1.0, cortado + 0.3), 0.0, "o zero vale uma vez por camada");
        assert!((liquido_de(1.0, cortado) - 0.0).abs() < 1e-9);
        // cortador de outro nível (externo) de laje sobre parede conta; laje sobre laje externa não
        let mut externa = laje.clone();
        for p in &mut externa.pecas {
            p.externa = true;
        }
        assert!((volume_cortado(&parede, Tipo::Parede, &[&externa], &BTreeSet::new()).unwrap() - 1.0).abs() < 1e-9);
        let outra_laje = peca_de(Tipo::Laje, 3, quadrado(1.0), Span::Constante { z0: 0.0, z1: 1.0 }, true);
        assert_eq!(volume_cortado(&outra_laje, Tipo::Laje, &[&externa], &BTreeSet::new()).unwrap(), 0.0);
    }

    #[test]
    fn cortadores_que_se_sobrepoem_nao_contam_a_area_coberta_duas_vezes() {
        let retangulo = vec![vec![vec![[0.0, 0.0], [3.0, 0.0], [3.0, 1.0], [0.0, 1.0]]]];
        let metade = vec![vec![vec![[1.0, 0.0], [4.0, 0.0], [4.0, 1.0], [1.0, 1.0]]]];
        let membrana = peca_de(Tipo::Piso, 9, retangulo.clone(), Span::Constante { z0: 0.5, z1: 0.5 }, true);
        let a = Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 1, retangulo, Span::Constante { z0: 0.0, z1: 1.0 }, true)] };
        let b = Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 2, metade, Span::Constante { z0: 0.0, z1: 1.0 }, true)] };
        // a cobre x em [0, 3]; b cobre [1, 4] (a interseção com a membrana é [1, 3]); a união cobre [0, 3] = 3 m2, não 3 + 2.
        let area = area_coberta(&membrana, Tipo::Piso, &[&a, &b], &BTreeSet::new()).unwrap();
        assert!((area - 3.0).abs() < 1e-9, "área coberta {area}");
    }


    /// Amostragem em grade fina: área da membrana não coberta por nenhuma peça (a referência independente do recorte exato).
    fn area_coberta_por_amostragem(membrana: &PecaSolida, cortadores: &[&Cortador], n: usize) -> f64 {
        let caixa = crate::b3::caixa_total(&membrana.poly);
        let (dx, dy) = ((caixa[2] - caixa[0]) / n as f64, (caixa[3] - caixa[1]) / n as f64);
        let mut cobertos = 0usize;
        for i in 0..n {
            for j in 0..n {
                let q = [caixa[0] + (i as f64 + 0.5) * dx, caixa[1] + (j as f64 + 0.5) * dy];
                let (z, z_topo) = membrana.span.em(q);
                let dentro = |poly: &MultiPoligono| poly.iter().any(|p| p.iter().enumerate().fold(0i32, |s, (k, anel)| s + if crate::quantidades::testes::ponto_em_anel(q, anel) { if k == 0 { 1 } else { -1 } } else { 0 }) > 0);
                if !dentro(&membrana.poly) {
                    continue;
                }
                let coberto = cortadores.iter().any(|c| c.pecas.iter().any(|cp| {
                    let (c0, c1) = cp.span.em(q);
                    dentro(&cp.poly) && z >= c0 - Z_EPS && z_topo <= c1 + Z_EPS
                }));
                if coberto {
                    cobertos += 1;
                }
            }
        }
        cobertos as f64 * dx * dy
    }

    pub(crate) fn ponto_em_anel(q: [f64; 2], anel: &[[f64; 2]]) -> bool {
        let mut dentro = false;
        for k in 0..anel.len() {
            let (a, b) = (anel[k], anel[(k + 1) % anel.len()]);
            if (a[1] > q[1]) != (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0] {
                dentro = !dentro;
            }
        }
        dentro
    }

    #[test]
    fn area_coberta_exata_confere_com_amostragem_em_cortadores_aleatorios_inclinados() {
        let mut r = crate::teste_util::Xorshift::novo(7);
        for caso in 0..16 {
            let membrana_poly = vec![vec![vec![[0.0, 0.0], [6.0, 0.0], [6.0, 4.0], [3.0, 5.0], [0.0, 4.0]], vec![[2.0, 1.0], [2.0, 2.0], [3.0, 2.0], [3.0, 1.0]]]];
            let z = r.intervalo(0.2, 0.8);
            let membrana = peca_de(Tipo::Piso, 99, membrana_poly, Span::Constante { z0: z, z1: z }, true);
            let mut cortadores: Vec<Cortador> = Vec::new();
            for k in 0..5u32 {
                let (x0, y0) = (r.intervalo(-1.0, 4.0), r.intervalo(-1.0, 3.0));
                let (x1, y1) = (x0 + r.intervalo(1.0, 4.0), y0 + r.intervalo(1.0, 3.0));
                let mut poly = vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]];
                if (caso + k) % 3 == 0 {
                    let (hx, hy) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0);
                    poly[0].push(vec![[hx - 0.3, hy - 0.3], [hx - 0.3, hy + 0.3], [hx + 0.3, hy + 0.3], [hx + 0.3, hy - 0.3]]);
                }
                let (esp, base) = (r.intervalo(0.1, 0.6), r.intervalo(0.0, 0.5));
                let inclinada = (caso + k) % 2 == 0;
                let span = if inclinada {
                    Span::Laje { z0: base, z1: base + esp, origem: [x0, y0], direcao: [0.6, 0.8], percentual: r.intervalo(-20.0, 20.0) }
                } else {
                    Span::Constante { z0: base, z1: base + esp }
                };
                cortadores.push(Cortador { tipo: Tipo::Laje, pecas: vec![peca_de(Tipo::Laje, 1 + k, poly, span, !inclinada)] });
            }
            let refs: Vec<&Cortador> = cortadores.iter().collect();
            let exata = area_coberta(&membrana, Tipo::Piso, &refs, &BTreeSet::new()).unwrap();
            let amostra = area_coberta_por_amostragem(&membrana, &refs, 300);
            assert!((exata - amostra).abs() < 0.06, "caso {caso}: exata {exata} x amostragem {amostra}");
        }
    }

    #[test]
    fn nivel_todos_e_tolerancia_negativa_viram_entrada() {
        let mut m = cena_de_dois_niveis();
        for q in [CONSULTA_QUANT_PAREDES, CONSULTA_QUANT_PISOS, CONSULTA_QUANT_LAJES, CONSULTA_QUANT_FORROS] {
            assert_eq!(executar(&mut m.cena, q, &[NIVEL_TODOS as f64, TOL]).err(), Some(ENTRADA));
            assert_eq!(executar(&mut m.cena, q, &[0.0, -1.0]).err(), Some(ENTRADA));
        }
    }

    /// Forro de 5 x 4 m com um furo de 1 x 1 m e duas camadas (1 cm e 2 cm).
    fn com_forro(m: &mut crate::b1::testes::Montada) {
        let anel = |pts: &[[f64; 2]]| pts.to_vec();
        let externo = anel(&[[0.0, 0.0], [5.0, 0.0], [5.0, 4.0], [0.0, 4.0]]);
        let furo = anel(&[[1.0, 1.0], [1.0, 2.0], [2.0, 2.0], [2.0, 1.0]]);
        let mut linhas: Vec<(u32, u32, u32, u32, f64, f64)> = Vec::new();
        for (a, anel) in [externo, furo].iter().enumerate() {
            for (i, p) in anel.iter().enumerate() {
                linhas.push((7, 0, a as u32, i as u32, p[0], p[1]));
            }
        }
        let n = linhas.len() as u32;
        let b = [
            c32(&(1..=n).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.0).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.1).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.2).collect::<Vec<_>>()),
            c32(&linhas.iter().map(|l| l.3).collect::<Vec<_>>()),
            c64(&linhas.iter().map(|l| l.4).collect::<Vec<_>>()),
            c64(&linhas.iter().map(|l| l.5).collect::<Vec<_>>()),
        ]
        .concat();
        m.cena.definir_secao(SECAO_PONTOS_FORRO, n, &b).expect("pontos_forro");
        let c = [c32(&[1, 2]), c32(&[7, 7]), c32(&[0, 0]), c32(&[0, 1]), c64(&[0.01, 0.02])].concat();
        m.cena.definir_secao(SECAO_CAMADAS_FORRO, 2, &c).expect("camadas_forro");
    }

    #[test]
    fn forro_e_area_do_contorno_menos_o_furo_vezes_a_espessura() {
        let mut m = cena_de_dois_niveis();
        com_forro(&mut m);
        let ls = linhas(&mut m, CONSULTA_QUANT_FORROS, 0.0);
        conserva(&ls);
        assert_eq!(ls.len(), 2);
        for (l, esp) in ls.iter().zip([0.01, 0.02]) {
            assert_eq!(l.dono, 7);
            assert!((l.area_de_face - 19.0).abs() < 1e-12, "5 x 4 menos o furo de 1 m²");
            assert!((l.bruto - 19.0 * esp).abs() < 1e-12);
            assert_eq!(l.cortado, 0.0, "ninguém corta forro");
            assert_eq!(l.liquido, l.bruto);
        }
        // outro nível: nenhum forro
        assert!(linhas(&mut m, CONSULTA_QUANT_FORROS, 1.0).is_empty());
    }

    #[test]
    fn forro_com_vertice_repetido_ou_lacuna_vira_entrada() {
        let mut m = cena_de_dois_niveis();
        let b = [c32(&[1, 2, 3]), c32(&[7, 7, 7]), c32(&[0, 0, 0]), c32(&[0, 0, 0]), c32(&[0, 0, 2]), c64(&[0.0, 1.0, 1.0]), c64(&[0.0, 0.0, 1.0])].concat();
        m.cena.definir_secao(SECAO_PONTOS_FORRO, 3, &b).expect("pontos_forro");
        let c = [c32(&[1]), c32(&[7]), c32(&[0]), c32(&[0]), c64(&[0.01])].concat();
        m.cena.definir_secao(SECAO_CAMADAS_FORRO, 1, &c).expect("camadas_forro");
        assert_eq!(executar(&mut m.cena, CONSULTA_QUANT_FORROS, &[0.0, TOL]).err(), Some(ENTRADA), "índice de vértice com lacuna");
    }
}
