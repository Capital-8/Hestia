//! Seções das sub-etapas B1 e B2 (esquema v9): `pisos`, `lajes`, `tipos_piso`, `tipos_laje`, `camadas_piso`, `camadas_laje`,
//! `contornos_estaticos`, `contornos_vinculados`, `furos_nivel` e `niveis`.
//!
//! Mesmo molde de `secoes_a3`: `BTreeMap` por chave (ordem canônica = id crescente), decodificação que valida antes de
//! tocar a cena (atômica): tamanho, chave ausente/duplicada, valores não finitos e enums fora do domínio.

use std::collections::BTreeMap;

use crate::cena::decodificar_colunas;
use crate::esquema::{
    ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_CAMADAS_LAJE, SECAO_CAMADAS_PISO, SECAO_CONTORNOS_ESTATICOS, SECAO_CONTORNOS_VINCULADOS, SECAO_FUROS_NIVEL,
    SECAO_LAJES, SECAO_NIVEIS, SECAO_PAREDES_Z_JUNCAO, SECAO_PERFIS_Z_JUNCAO, SECAO_PISOS, SECAO_TIPOS_LAJE, SECAO_TIPOS_PISO,
};
use crate::secoes_a1::{bool01, chaves_validas, f64s, finito, u32s, u8s, ParedeZ};
use crate::secoes_a3::{PontoDePerfil, LISTA_MAX};
use crate::a3c::Inclinacao as InclinacaoDaFaixa;
use crate::esquema::{SECAO_CAMADAS_FORRO, SECAO_FAIXAS_JUNCAO, SECAO_PONTOS_FAIXAS_JUNCAO, SECAO_PONTOS_FORRO};

/// Maior código de `modo` (`outlineSource.mode`): 0 sem origem, 1 walls-finish, 2 walls-core, 3 perimeter.
pub const MODO_MAX: u8 = 3;
pub const MODO_SEM_ORIGEM: u8 = 0;
pub const MODO_PAREDES_ACABAMENTO: u8 = 1;
pub const MODO_PAREDES_NUCLEO: u8 = 2;
pub const MODO_PERIMETRO: u8 = 3;
/// Maior código de `problema`: 0 nenhum, 1 aberto, 2 fora.
pub const PROBLEMA_MAX: u8 = 2;
/// Maior código de `funcao` (a mesma de `camadas`).
pub const FUNCAO_MAX: u8 = 5;
/// `funcao` membrana.
pub const FUNCAO_MEMBRANA: u8 = 3;
/// Códigos de `termino`.
pub const TERMINO_AUTO: u8 = 0;
pub const TERMINO_FACE: u8 = 1;
pub const TERMINO_NUCLEO: u8 = 2;
pub const TERMINO_PASSA: u8 = 3;
pub const TERMINO_ATE: u8 = 4;
pub const TERMINO_CM: u8 = 5;
/// `termino` = 6: `{ camada }` (decisão 0054); a referência vem em `termino_ref`.
pub const TERMINO_CAMADA: u8 = 6;
/// Maior `termino_ref` (6 `eixo` + 7 * (1 + 2 * 2) = 41).
pub const TERMINO_REF_MAX: u8 = 41;
/// Códigos de `limite_externo`.
pub const LIMITE_PAREDE: u8 = 1;
pub const LIMITE_NUCLEO: u8 = 2;
/// Códigos de `papel` de `contornos_vinculados`.
pub const PAPEL_CIRCUITO_ACABAMENTO: u8 = 0;
pub const PAPEL_CIRCUITO_NUCLEO: u8 = 1;
pub const PAPEL_PERIMETRO_ACABAMENTO: u8 = 2;
pub const PAPEL_PERIMETRO_NUCLEO: u8 = 3;
const PAPEL_MAX: u8 = 3;

/// `Slab.slope`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Inclinacao {
    pub origem: [f64; 2],
    pub direcao: [f64; 2],
    pub percentual: f64,
}

/// Linha de `pisos` ou de `lajes`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ElementoLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub ordem: f64,
    pub cota_nivel: f64,
    pub desloc: f64,
    pub modo: u8,
    pub vinculado: bool,
    pub tem_semente: bool,
    pub extend_nucleo: bool,
    pub problema: u8,
    pub inclinacao: Option<Inclinacao>,
}

/// Linha de `camadas_piso` ou de `camadas_laje`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CamadaLinha {
    pub tipo: u32,
    pub indice: u32,
    pub espessura: f64,
    pub funcao: u8,
    pub prioridade: Option<f64>,
    pub material: u32,
    pub termino: u8,
    pub termino_valor: f64,
    pub limite_externo: u8,
    /// `funcao + 7 * (lado + 2 * face)` do término por camada (decisão 0054); 0 nos demais.
    pub termino_ref: u8,
}

/// Linha de `contornos_estaticos`, `contornos_vinculados` ou `furos_nivel`: um vértice.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PontoLinha {
    /// 0 piso, 1 laje.
    pub tipo_el: u8,
    pub elemento: u32,
    /// Só em `contornos_vinculados` (0 nas demais).
    pub papel: u8,
    /// Só em `furos_nivel` (0 nas demais).
    pub poligono: u32,
    pub anel: u32,
    pub indice: u32,
    pub x: f64,
    pub y: f64,
}

/// Linha de `faixas_juncao` (B3, saída 3, esquema v11): uma faixa vertical de parede como o TypeScript a devolve na junção (já recortada
/// pelo perfil superior e pelo de base). `base_z` é a cota absoluta da base; `z0` e `z1`, relativas a ela. `inclinacao` só existe com topo inclinado.
#[derive(Clone, Debug, PartialEq)]
pub struct FaixaJuntadaLinha {
    pub nivel: u32,
    pub parede: u32,
    pub camada: u32,
    pub banda: u32,
    pub prioridade: f64,
    pub nucleo: bool,
    pub base_z: f64,
    pub z0: f64,
    pub z1: f64,
    pub inclinacao: Option<InclinacaoDaFaixa>,
}

/// Linha de `pontos_faixas_juncao`: um vértice da região de uma faixa (`faixa` é o id da linha de `faixas_juncao`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PontoDeFaixa {
    pub faixa: u32,
    pub poligono: u32,
    pub anel: u32,
    pub indice: u32,
    pub x: f64,
    pub y: f64,
}

/// Linha de `camadas_forro` (quantidades, esquema v12): uma camada de um forro, com a espessura já resolvida pelo JS.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CamadaForroLinha {
    pub forro: u32,
    pub nivel: u32,
    pub indice: u32,
    pub espessura: f64,
}

/// Linha de `pontos_forro`: um vértice do contorno de um forro (`forro` é o `forro_num`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PontoForroLinha {
    pub forro: u32,
    pub poligono: u32,
    pub anel: u32,
    pub indice: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Default)]
pub struct SecoesB {
    pub pisos: BTreeMap<u32, ElementoLinha>,
    pub lajes: BTreeMap<u32, ElementoLinha>,
    pub tipos_piso: BTreeMap<u32, u32>,
    pub tipos_laje: BTreeMap<u32, u32>,
    pub camadas_piso: BTreeMap<u32, CamadaLinha>,
    pub camadas_laje: BTreeMap<u32, CamadaLinha>,
    pub estaticos: BTreeMap<u32, PontoLinha>,
    pub vinculados: BTreeMap<u32, PontoLinha>,
    pub furos: BTreeMap<u32, PontoLinha>,
    /// `niveis` (B2): chave `id_num` -> (`nivel_num`, cota).
    pub niveis: BTreeMap<u32, (u32, f64)>,
    /// `paredes_z_juncao` (B3): a cota da parede na variante da junção (sem `flatAttach`), chave = id da parede.
    pub paredes_z_juncao: BTreeMap<u32, ParedeZ>,
    /// `perfis_z_juncao` (B3): os pontos de perfil dessa variante.
    pub perfis_juncao: BTreeMap<u32, PontoDePerfil>,
    /// `faixas_juncao` (B3, saída 3): as faixas de parede da junção, com a cota e o topo já resolvidos pelo JS.
    pub faixas_juncao: BTreeMap<u32, FaixaJuntadaLinha>,
    /// `pontos_faixas_juncao`: a região de cada faixa, um vértice por linha.
    pub pontos_faixas: BTreeMap<u32, PontoDeFaixa>,
    /// `camadas_forro` (quantidades, v12): as camadas de cada forro.
    pub camadas_forro: BTreeMap<u32, CamadaForroLinha>,
    /// `pontos_forro`: o contorno de cada forro, um vértice por linha.
    pub pontos_forro: BTreeMap<u32, PontoForroLinha>,
}

enum Lote {
    Elementos(bool, Vec<(u32, ElementoLinha)>),
    Tipos(bool, Vec<(u32, u32)>),
    Camadas(bool, Vec<(u32, CamadaLinha)>),
    Pontos(u32, Vec<(u32, PontoLinha)>),
    Niveis(Vec<(u32, (u32, f64))>),
    ParedesZ(Vec<(u32, ParedeZ)>),
    Perfis(Vec<(u32, PontoDePerfil)>),
    Faixas(Vec<(u32, FaixaJuntadaLinha)>),
    PontosFaixas(Vec<(u32, PontoDeFaixa)>),
    CamadasForro(Vec<(u32, CamadaForroLinha)>),
    PontosForro(Vec<(u32, PontoForroLinha)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Elementos(_, v) => v.iter().map(|x| x.0).collect(),
            Lote::Tipos(_, v) => v.iter().map(|x| x.0).collect(),
            Lote::Camadas(_, v) => v.iter().map(|x| x.0).collect(),
            Lote::Pontos(_, v) => v.iter().map(|x| x.0).collect(),
            Lote::Niveis(v) => v.iter().map(|x| x.0).collect(),
            Lote::ParedesZ(v) => v.iter().map(|x| x.0).collect(),
            Lote::Perfis(v) => v.iter().map(|x| x.0).collect(),
            Lote::Faixas(v) => v.iter().map(|x| x.0).collect(),
            Lote::PontosFaixas(v) => v.iter().map(|x| x.0).collect(),
            Lote::CamadasForro(v) => v.iter().map(|x| x.0).collect(),
            Lote::PontosForro(v) => v.iter().map(|x| x.0).collect(),
        }
    }
}

fn elementos(laje: bool, n_linhas: u32, c: &mut std::vec::IntoIter<crate::cena::Coluna>) -> Result<Lote, u32> {
    let id = u32s(c.next())?;
    let nivel = u32s(c.next())?;
    let tipo = u32s(c.next())?;
    let ordem = f64s(c.next())?;
    let cota = f64s(c.next())?;
    let desloc = f64s(c.next())?;
    let modo = u8s(c.next())?;
    let vinculado = u8s(c.next())?;
    let semente = u8s(c.next())?;
    let extend = u8s(c.next())?;
    let problema = u8s(c.next())?;
    let (tem_inc, ox, oy, dx, dy, pct) = if laje {
        (u8s(c.next())?, f64s(c.next())?, f64s(c.next())?, f64s(c.next())?, f64s(c.next())?, f64s(c.next())?)
    } else {
        (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new())
    };
    chaves_validas(&id)?;
    let n = n_linhas as usize;
    let mut v = Vec::with_capacity(n);
    for i in 0..n {
        let g = |o: Option<&u8>| o.copied().ok_or(INTERNO);
        let (Some(&k), Some(&nv), Some(&tp), Some(&od), Some(&ct), Some(&ds)) = (id.get(i), nivel.get(i), tipo.get(i), ordem.get(i), cota.get(i), desloc.get(i)) else {
            return Err(INTERNO);
        };
        let (md, pb) = (g(modo.get(i))?, g(problema.get(i))?);
        if nv == ID_AUSENTE || !(finito(od) && finito(ct) && finito(ds)) || md > MODO_MAX || pb > PROBLEMA_MAX {
            return Err(ENTRADA);
        }
        let inclinacao = if laje && bool01(g(tem_inc.get(i))?)? {
            let (Some(&a), Some(&b), Some(&c1), Some(&d), Some(&p)) = (ox.get(i), oy.get(i), dx.get(i), dy.get(i), pct.get(i)) else {
                return Err(INTERNO);
            };
            if !(finito(a) && finito(b) && finito(c1) && finito(d) && finito(p)) {
                return Err(ENTRADA);
            }
            Some(Inclinacao { origem: [a, b], direcao: [c1, d], percentual: p })
        } else {
            None
        };
        v.push((
            k,
            ElementoLinha {
                nivel: nv,
                tipo: tp,
                ordem: od,
                cota_nivel: ct,
                desloc: ds,
                modo: md,
                vinculado: bool01(g(vinculado.get(i))?)?,
                tem_semente: bool01(g(semente.get(i))?)?,
                extend_nucleo: bool01(g(extend.get(i))?)?,
                problema: pb,
                inclinacao,
            },
        ));
    }
    Ok(Lote::Elementos(laje, v))
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let mut c = decodificar_colunas(secao, n_linhas, bytes)?.into_iter();
    let n = n_linhas as usize;
    match secao {
        SECAO_PISOS => elementos(false, n_linhas, &mut c),
        SECAO_LAJES => elementos(true, n_linhas, &mut c),
        SECAO_TIPOS_PISO | SECAO_TIPOS_LAJE => {
            let id = u32s(c.next())?;
            let nc = u32s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (Some(&k), Some(&m)) = (id.get(i), nc.get(i)) else { return Err(INTERNO) };
                v.push((k, m));
            }
            Ok(Lote::Tipos(secao == SECAO_TIPOS_LAJE, v))
        }
        SECAO_CAMADAS_PISO | SECAO_CAMADAS_LAJE => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let esp = f64s(c.next())?;
            let funcao = u8s(c.next())?;
            let tem_p = u8s(c.next())?;
            let prio = f64s(c.next())?;
            let mat = u32s(c.next())?;
            let term = u8s(c.next())?;
            let term_v = f64s(c.next())?;
            let lim = u8s(c.next())?;
            let term_ref = u8s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let g = |o: Option<&u8>| o.copied().ok_or(INTERNO);
                let (Some(&k), Some(&t), Some(&ix), Some(&e), Some(&p), Some(&m), Some(&tv)) = (id.get(i), tipo.get(i), indice.get(i), esp.get(i), prio.get(i), mat.get(i), term_v.get(i)) else {
                    return Err(INTERNO);
                };
                let (fn_, tm, lm, tr) = (g(funcao.get(i))?, g(term.get(i))?, g(lim.get(i))?, g(term_ref.get(i))?);
                if !(finito(e) && finito(p) && finito(tv)) || fn_ > FUNCAO_MAX || tm > TERMINO_CAMADA || lm > LIMITE_NUCLEO || tr > TERMINO_REF_MAX || (tr != 0 && tm != TERMINO_CAMADA) {
                    return Err(ENTRADA);
                }
                v.push((
                    k,
                    CamadaLinha {
                        tipo: t,
                        indice: ix,
                        espessura: e,
                        funcao: fn_,
                        prioridade: if bool01(g(tem_p.get(i))?)? { Some(p) } else { None },
                        material: m,
                        termino: tm,
                        termino_valor: tv,
                        limite_externo: lm,
                        termino_ref: tr,
                    },
                ));
            }
            Ok(Lote::Camadas(secao == SECAO_CAMADAS_LAJE, v))
        }
        SECAO_CONTORNOS_ESTATICOS | SECAO_CONTORNOS_VINCULADOS | SECAO_FUROS_NIVEL => {
            let id = u32s(c.next())?;
            let tipo_el = u8s(c.next())?;
            let elem = u32s(c.next())?;
            let papel = if secao == SECAO_CONTORNOS_VINCULADOS { u8s(c.next())? } else { Vec::new() };
            let poligono = if secao == SECAO_FUROS_NIVEL { u32s(c.next())? } else { Vec::new() };
            let anel = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let x = f64s(c.next())?;
            let y = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (Some(&k), Some(&te), Some(&el), Some(&an), Some(&ix), Some(&px), Some(&py)) = (id.get(i), tipo_el.get(i), elem.get(i), anel.get(i), indice.get(i), x.get(i), y.get(i)) else {
                    return Err(INTERNO);
                };
                let pp = if secao == SECAO_CONTORNOS_VINCULADOS { papel.get(i).copied().ok_or(INTERNO)? } else { 0 };
                let pl = if secao == SECAO_FUROS_NIVEL { poligono.get(i).copied().ok_or(INTERNO)? } else { 0 };
                if te > 1 || pp > PAPEL_MAX || !(finito(px) && finito(py)) {
                    return Err(ENTRADA);
                }
                v.push((k, PontoLinha { tipo_el: te, elemento: el, papel: pp, poligono: pl, anel: an, indice: ix, x: px, y: py }));
            }
            Ok(Lote::Pontos(secao, v))
        }
        SECAO_NIVEIS => {
            let id = u32s(c.next())?;
            let nivel = u32s(c.next())?;
            let cota = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (Some(&k), Some(&nv), Some(&ct)) = (id.get(i), nivel.get(i), cota.get(i)) else { return Err(INTERNO) };
                if nv == ID_AUSENTE || !finito(ct) {
                    return Err(ENTRADA);
                }
                v.push((k, (nv, ct)));
            }
            Ok(Lote::Niveis(v))
        }
        SECAO_PAREDES_Z_JUNCAO => {
            let id = u32s(c.next())?;
            let z0 = f64s(c.next())?;
            let alt = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (Some(&k), Some(&z), Some(&h)) = (id.get(i), z0.get(i), alt.get(i)) else { return Err(INTERNO) };
                if !finito(z) || !finito(h) {
                    return Err(ENTRADA);
                }
                v.push((k, ParedeZ { z0: z, altura: h }));
            }
            Ok(Lote::ParedesZ(v))
        }
        SECAO_PERFIS_Z_JUNCAO => {
            let id = u32s(c.next())?;
            let parede = u32s(c.next())?;
            let lista = u8s(c.next())?;
            let indice = u32s(c.next())?;
            let t = f64s(c.next())?;
            let h = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (Some(&k), Some(&pa), Some(&l), Some(&ix), Some(&tt), Some(&hh)) = (id.get(i), parede.get(i), lista.get(i), indice.get(i), t.get(i), h.get(i)) else {
                    return Err(INTERNO);
                };
                if !(finito(tt) && finito(hh)) || l > LISTA_MAX {
                    return Err(ENTRADA);
                }
                v.push((k, PontoDePerfil { parede: pa, lista: l, indice: ix, t: tt, h: hh }));
            }
            Ok(Lote::Perfis(v))
        }
        SECAO_FAIXAS_JUNCAO => {
            let id = u32s(c.next())?;
            let nivel = u32s(c.next())?;
            let parede = u32s(c.next())?;
            let camada = u32s(c.next())?;
            let banda = u32s(c.next())?;
            let prioridade = f64s(c.next())?;
            let nucleo = u8s(c.next())?;
            let base = f64s(c.next())?;
            let z0 = f64s(c.next())?;
            let z1 = f64s(c.next())?;
            let inclinada = u8s(c.next())?;
            let mut sl: Vec<Vec<f64>> = Vec::with_capacity(8);
            for _ in 0..8 {
                sl.push(f64s(c.next())?);
            }
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let k = ao(&id, i)?;
                let (nv, pa, ca, ba) = (ao(&nivel, i)?, ao(&parede, i)?, ao(&camada, i)?, ao(&banda, i)?);
                let (pr, bz, a0, a1) = (ao(&prioridade, i)?, ao(&base, i)?, ao(&z0, i)?, ao(&z1, i)?);
                let (nu, inc) = (ao(&nucleo, i)?, ao(&inclinada, i)?);
                let mut s = [0.0f64; 8];
                for (j, col) in sl.iter().enumerate() {
                    s[j] = ao(col, i)?;
                }
                let finitos = [pr, bz, a0, a1].iter().chain(s.iter()).all(|&x| finito(x));
                if nu > 1 || inc > 1 || !finitos || !(a1 > a0) {
                    return Err(ENTRADA);
                }
                if inc == 1 && s[5] == s[4] {
                    return Err(ENTRADA);
                }
                let inclinacao = (inc == 1).then_some(InclinacaoDaFaixa { o: [s[0], s[1]], d: [s[2], s[3]], t0: s[4], t1: s[5], h0: s[6], h1: s[7] });
                v.push((k, FaixaJuntadaLinha { nivel: nv, parede: pa, camada: ca, banda: ba, prioridade: pr, nucleo: nu == 1, base_z: bz, z0: a0, z1: a1, inclinacao }));
            }
            Ok(Lote::Faixas(v))
        }
        SECAO_PONTOS_FAIXAS_JUNCAO => {
            let id = u32s(c.next())?;
            let faixa = u32s(c.next())?;
            let poligono = u32s(c.next())?;
            let anel = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let x = f64s(c.next())?;
            let y = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (px, py) = (ao(&x, i)?, ao(&y, i)?);
                if !(finito(px) && finito(py)) {
                    return Err(ENTRADA);
                }
                let linha = PontoDeFaixa { faixa: ao(&faixa, i)?, poligono: ao(&poligono, i)?, anel: ao(&anel, i)?, indice: ao(&indice, i)?, x: px, y: py };
                v.push((ao(&id, i)?, linha));
            }
            Ok(Lote::PontosFaixas(v))
        }
        SECAO_CAMADAS_FORRO => {
            let id = u32s(c.next())?;
            let forro = u32s(c.next())?;
            let nivel = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let espessura = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let e = ao(&espessura, i)?;
                if !(finito(e) && e >= 0.0) {
                    return Err(ENTRADA);
                }
                v.push((ao(&id, i)?, CamadaForroLinha { forro: ao(&forro, i)?, nivel: ao(&nivel, i)?, indice: ao(&indice, i)?, espessura: e }));
            }
            Ok(Lote::CamadasForro(v))
        }
        SECAO_PONTOS_FORRO => {
            let id = u32s(c.next())?;
            let forro = u32s(c.next())?;
            let poligono = u32s(c.next())?;
            let anel = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let x = f64s(c.next())?;
            let y = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                let (px, py) = (ao(&x, i)?, ao(&y, i)?);
                if !(finito(px) && finito(py)) {
                    return Err(ENTRADA);
                }
                v.push((ao(&id, i)?, PontoForroLinha { forro: ao(&forro, i)?, poligono: ao(&poligono, i)?, anel: ao(&anel, i)?, indice: ao(&indice, i)?, x: px, y: py }));
            }
            Ok(Lote::PontosForro(v))
        }
        _ => Err(ENTRADA),
    }
}

/// Valor da linha `i` de uma coluna (`INTERNO` se a coluna é mais curta que `n_linhas`).
fn ao<T: Copy>(v: &[T], i: usize) -> Result<T, u32> {
    v.get(i).copied().ok_or(INTERNO)
}

impl SecoesB {
    /// `true` se há faixas de `faixas_juncao`: então a junção usa essas faixas, não o cálculo do Rust. Sem linhas (seção vazia ou removida), vale o cálculo anterior.
    pub fn faixas_juncao_definidas(&self) -> bool {
        !self.faixas_juncao.is_empty()
    }

    /// `true` se a seção é uma das daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(
            secao,
            SECAO_PISOS | SECAO_LAJES | SECAO_TIPOS_PISO | SECAO_TIPOS_LAJE | SECAO_CAMADAS_PISO | SECAO_CAMADAS_LAJE | SECAO_CONTORNOS_ESTATICOS | SECAO_CONTORNOS_VINCULADOS | SECAO_FUROS_NIVEL | SECAO_NIVEIS | SECAO_PAREDES_Z_JUNCAO | SECAO_PERFIS_Z_JUNCAO | SECAO_FAIXAS_JUNCAO | SECAO_PONTOS_FAIXAS_JUNCAO | SECAO_CAMADAS_FORRO | SECAO_PONTOS_FORRO
        )
    }

    fn tamanho(&self, secao: u32) -> usize {
        match secao {
            SECAO_PISOS => self.pisos.len(),
            SECAO_LAJES => self.lajes.len(),
            SECAO_TIPOS_PISO => self.tipos_piso.len(),
            SECAO_TIPOS_LAJE => self.tipos_laje.len(),
            SECAO_CAMADAS_PISO => self.camadas_piso.len(),
            SECAO_CAMADAS_LAJE => self.camadas_laje.len(),
            SECAO_CONTORNOS_ESTATICOS => self.estaticos.len(),
            SECAO_CONTORNOS_VINCULADOS => self.vinculados.len(),
            SECAO_NIVEIS => self.niveis.len(),
            SECAO_PAREDES_Z_JUNCAO => self.paredes_z_juncao.len(),
            SECAO_PERFIS_Z_JUNCAO => self.perfis_juncao.len(),
            SECAO_FAIXAS_JUNCAO => self.faixas_juncao.len(),
            SECAO_PONTOS_FAIXAS_JUNCAO => self.pontos_faixas.len(),
            SECAO_CAMADAS_FORRO => self.camadas_forro.len(),
            SECAO_PONTOS_FORRO => self.pontos_forro.len(),
            _ => self.furos.len(),
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        match secao {
            SECAO_PISOS => self.pisos.contains_key(&k),
            SECAO_LAJES => self.lajes.contains_key(&k),
            SECAO_TIPOS_PISO => self.tipos_piso.contains_key(&k),
            SECAO_TIPOS_LAJE => self.tipos_laje.contains_key(&k),
            SECAO_CAMADAS_PISO => self.camadas_piso.contains_key(&k),
            SECAO_CAMADAS_LAJE => self.camadas_laje.contains_key(&k),
            SECAO_CONTORNOS_ESTATICOS => self.estaticos.contains_key(&k),
            SECAO_CONTORNOS_VINCULADOS => self.vinculados.contains_key(&k),
            SECAO_NIVEIS => self.niveis.contains_key(&k),
            SECAO_PAREDES_Z_JUNCAO => self.paredes_z_juncao.contains_key(&k),
            SECAO_PERFIS_Z_JUNCAO => self.perfis_juncao.contains_key(&k),
            SECAO_FAIXAS_JUNCAO => self.faixas_juncao.contains_key(&k),
            SECAO_PONTOS_FAIXAS_JUNCAO => self.pontos_faixas.contains_key(&k),
            SECAO_CAMADAS_FORRO => self.camadas_forro.contains_key(&k),
            SECAO_PONTOS_FORRO => self.pontos_forro.contains_key(&k),
            _ => self.furos.contains_key(&k),
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Elementos(false, v) => self.pisos.extend(v),
            Lote::Elementos(true, v) => self.lajes.extend(v),
            Lote::Tipos(false, v) => self.tipos_piso.extend(v),
            Lote::Tipos(true, v) => self.tipos_laje.extend(v),
            Lote::Camadas(false, v) => self.camadas_piso.extend(v),
            Lote::Camadas(true, v) => self.camadas_laje.extend(v),
            Lote::Pontos(SECAO_CONTORNOS_ESTATICOS, v) => self.estaticos.extend(v),
            Lote::Pontos(SECAO_CONTORNOS_VINCULADOS, v) => self.vinculados.extend(v),
            Lote::Pontos(_, v) => self.furos.extend(v),
            Lote::Niveis(v) => self.niveis.extend(v),
            Lote::ParedesZ(v) => self.paredes_z_juncao.extend(v),
            Lote::Perfis(v) => self.perfis_juncao.extend(v),
            Lote::Faixas(v) => self.faixas_juncao.extend(v),
            Lote::PontosFaixas(v) => self.pontos_faixas.extend(v),
            Lote::CamadasForro(v) => self.camadas_forro.extend(v),
            Lote::PontosForro(v) => self.pontos_forro.extend(v),
        }
    }

    /// Substitui todas as linhas da seção (atômico).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        match secao {
            SECAO_PISOS => self.pisos.clear(),
            SECAO_LAJES => self.lajes.clear(),
            SECAO_TIPOS_PISO => self.tipos_piso.clear(),
            SECAO_TIPOS_LAJE => self.tipos_laje.clear(),
            SECAO_CAMADAS_PISO => self.camadas_piso.clear(),
            SECAO_CAMADAS_LAJE => self.camadas_laje.clear(),
            SECAO_CONTORNOS_ESTATICOS => self.estaticos.clear(),
            SECAO_CONTORNOS_VINCULADOS => self.vinculados.clear(),
            SECAO_NIVEIS => self.niveis.clear(),
            SECAO_PAREDES_Z_JUNCAO => self.paredes_z_juncao.clear(),
            SECAO_PERFIS_Z_JUNCAO => self.perfis_juncao.clear(),
            SECAO_FAIXAS_JUNCAO => self.faixas_juncao.clear(),
            SECAO_PONTOS_FAIXAS_JUNCAO => self.pontos_faixas.clear(),
            SECAO_CAMADAS_FORRO => self.camadas_forro.clear(),
            SECAO_PONTOS_FORRO => self.pontos_forro.clear(),
            _ => self.furos.clear(),
        }
        self.aplicar(lote);
        Ok(())
    }

    /// Insere ou substitui pela chave (atômico). `LIMITE` se passar do máximo de linhas.
    pub fn upsert(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        let novas = lote.chaves().into_iter().filter(|&k| !self.contem(secao, k)).count();
        if self.tamanho(secao).saturating_add(novas) > LIMITE_LINHAS_POR_SECAO as usize {
            return Err(LIMITE);
        }
        self.aplicar(lote);
        Ok(())
    }

    /// Remove pelas chaves (ausentes são ignoradas).
    pub fn remover(&mut self, secao: u32, ids: &[u32]) {
        for k in ids {
            match secao {
                SECAO_PISOS => {
                    self.pisos.remove(k);
                }
                SECAO_LAJES => {
                    self.lajes.remove(k);
                }
                SECAO_TIPOS_PISO => {
                    self.tipos_piso.remove(k);
                }
                SECAO_TIPOS_LAJE => {
                    self.tipos_laje.remove(k);
                }
                SECAO_CAMADAS_PISO => {
                    self.camadas_piso.remove(k);
                }
                SECAO_CAMADAS_LAJE => {
                    self.camadas_laje.remove(k);
                }
                SECAO_CONTORNOS_ESTATICOS => {
                    self.estaticos.remove(k);
                }
                SECAO_CONTORNOS_VINCULADOS => {
                    self.vinculados.remove(k);
                }
                SECAO_NIVEIS => {
                    self.niveis.remove(k);
                }
                SECAO_PAREDES_Z_JUNCAO => {
                    self.paredes_z_juncao.remove(k);
                }
                SECAO_PERFIS_Z_JUNCAO => {
                    self.perfis_juncao.remove(k);
                }
                SECAO_FAIXAS_JUNCAO => {
                    self.faixas_juncao.remove(k);
                }
                SECAO_PONTOS_FAIXAS_JUNCAO => {
                    self.pontos_faixas.remove(k);
                }
                SECAO_CAMADAS_FORRO => {
                    self.camadas_forro.remove(k);
                }
                SECAO_PONTOS_FORRO => {
                    self.pontos_forro.remove(k);
                }
                _ => {
                    self.furos.remove(k);
                }
            }
        }
    }

    /// Camadas de um tipo de piso (`laje = false`) ou de laje ordenadas por `indice`. `ENTRADA` se o tipo não existe, se `n_camadas`
    /// não bate ou se os índices não são exatamente `0..n`.
    pub fn camadas_do_tipo(&self, laje: bool, tipo: u32) -> Result<Vec<CamadaLinha>, u32> {
        let (tipos, camadas) = if laje { (&self.tipos_laje, &self.camadas_laje) } else { (&self.tipos_piso, &self.camadas_piso) };
        let n = *tipos.get(&tipo).ok_or(ENTRADA)?;
        let mut v: Vec<CamadaLinha> = camadas.values().filter(|c| c.tipo == tipo).copied().collect();
        v.sort_by_key(|c| c.indice);
        if v.len() != n as usize || v.iter().enumerate().any(|(i, c)| c.indice as usize != i) {
            return Err(ENTRADA);
        }
        Ok(v)
    }
}
