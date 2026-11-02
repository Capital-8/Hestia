//! Seções das sub-etapas A1 e A2 (esquema v3): `paredes_quadro`, `tipos_parede`, `camadas`, `faixas` e `paredes_z`.
//!
//! Guardadas em `BTreeMap` por chave (ordem canônica = id crescente). Toda decodificação valida
//! antes de tocar a cena (atômica): tamanho, chave ausente/duplicada, valores não finitos ou fora de
//! faixa, enums fora do domínio. Nada daqui entra em panic por dado do JS.

use std::collections::BTreeMap;

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{
    ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_CAMADAS, SECAO_FAIXAS, SECAO_PAREDES_Z, SECAO_PAREDES_QUADRO,
    SECAO_TIPOS_PAREDE,
};

/// Linha de `paredes_quadro` (o que o `Wall` tem além de a, b e nível).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParedeQuadro {
    pub tipo: u32,
    pub ordem: f64,
    /// 0 wallCenter, 1 coreCenter, 2 finishExterior, 3 finishInterior, 4 coreExterior, 5 coreInterior.
    pub linha_loc: u8,
    pub invertida: bool,
    /// `[a, b]`
    pub sem_junta: [bool; 2],
    /// `[a, b]`: `(miter?, inverte)`; `miter = false` é butt.
    pub junta: [(bool, bool); 2],
    pub sag: f64,
    pub z0: f64,
    pub topo: f64,
}

/// Linha de `camadas`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camada {
    pub tipo: u32,
    pub indice: u32,
    pub espessura: f64,
    /// 0 structure, 1 substrate, 2 thermal, 3 membrane, 4 finish1, 5 finish2.
    pub funcao: u8,
    pub prioridade: Option<f64>,
    /// A2: material da camada (só identidade).
    pub material: u32,
    /// A2: `Layer.wraps`.
    pub envolve: bool,
}

/// Linha de `tipos_parede`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoLinha {
    pub n_camadas: u32,
    /// A2: `WallType.wrapEnds`: 0 none, 1 exterior, 2 interior, 3 both.
    pub wrap_ends: u8,
    /// A2: nº de linhas de `faixas` do tipo.
    pub n_faixas: u32,
}

/// Linha de `faixas` (A2): `WallType.strips[indice]`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FaixaLinha {
    pub tipo: u32,
    pub indice: u32,
    /// `true` = interior.
    pub interior: bool,
    pub material: u32,
    pub espessura: f64,
    pub z0: f64,
    pub z1: f64,
}

/// Linha de `paredes_z` (A2): cota real da base e altura (`wallZRange`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParedeZ {
    pub z0: f64,
    pub altura: f64,
}

/// As seções.
#[derive(Default)]
pub struct SecoesA1 {
    pub quadros: BTreeMap<u32, ParedeQuadro>,
    pub tipos: BTreeMap<u32, TipoLinha>,
    pub camadas: BTreeMap<u32, Camada>,
    pub faixas: BTreeMap<u32, FaixaLinha>,
    pub paredes_z: BTreeMap<u32, ParedeZ>,
}

enum Lote {
    Quadros(Vec<(u32, ParedeQuadro)>),
    Tipos(Vec<(u32, TipoLinha)>),
    Camadas(Vec<(u32, Camada)>),
    Faixas(Vec<(u32, FaixaLinha)>),
    ParedesZ(Vec<(u32, ParedeZ)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Quadros(v) => v.iter().map(|x| x.0).collect(),
            Lote::Tipos(v) => v.iter().map(|x| x.0).collect(),
            Lote::Camadas(v) => v.iter().map(|x| x.0).collect(),
            Lote::Faixas(v) => v.iter().map(|x| x.0).collect(),
            Lote::ParedesZ(v) => v.iter().map(|x| x.0).collect(),
        }
    }
}

pub(crate) fn u32s(c: Option<Coluna>) -> Result<Vec<u32>, u32> {
    match c {
        Some(Coluna::U32(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}
pub(crate) fn f64s(c: Option<Coluna>) -> Result<Vec<f64>, u32> {
    match c {
        Some(Coluna::F64(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}
pub(crate) fn u8s(c: Option<Coluna>) -> Result<Vec<u8>, u32> {
    match c {
        Some(Coluna::U8(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}

pub(crate) fn finito(v: f64) -> bool {
    v.is_finite() && v.abs() <= COORD_MAX
}

pub(crate) fn bool01(v: u8) -> Result<bool, u32> {
    match v {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(ENTRADA),
    }
}

pub(crate) fn chaves_validas(ids: &[u32]) -> Result<(), u32> {
    if ids.contains(&ID_AUSENTE) {
        return Err(ENTRADA);
    }
    let mut o = ids.to_vec();
    o.sort_unstable();
    if o.windows(2).any(|w| w[0] == w[1]) {
        return Err(ENTRADA);
    }
    Ok(())
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let mut c = decodificar_colunas(secao, n_linhas, bytes)?.into_iter();
    match secao {
        SECAO_PAREDES_QUADRO => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let ordem = f64s(c.next())?;
            let loc = u8s(c.next())?;
            let inv = u8s(c.next())?;
            let sja = u8s(c.next())?;
            let sjb = u8s(c.next())?;
            let jat = u8s(c.next())?;
            let jai = u8s(c.next())?;
            let jbt = u8s(c.next())?;
            let jbi = u8s(c.next())?;
            let sag = f64s(c.next())?;
            let z0 = f64s(c.next())?;
            let topo = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let g = |o: Option<&u8>| o.copied().ok_or(INTERNO);
                let (Some(&k), Some(&tp), Some(&od), Some(&sg), Some(&z), Some(&tp2)) =
                    (id.get(i), tipo.get(i), ordem.get(i), sag.get(i), z0.get(i), topo.get(i))
                else {
                    return Err(INTERNO);
                };
                if !finito(od) || !finito(sg) || !finito(z) || !finito(tp2) {
                    return Err(ENTRADA);
                }
                let l = g(loc.get(i))?;
                if l > 5 {
                    return Err(ENTRADA);
                }
                v.push((
                    k,
                    ParedeQuadro {
                        tipo: tp,
                        ordem: od,
                        linha_loc: l,
                        invertida: bool01(g(inv.get(i))?)?,
                        sem_junta: [bool01(g(sja.get(i))?)?, bool01(g(sjb.get(i))?)?],
                        junta: [
                            (bool01(g(jat.get(i))?)?, bool01(g(jai.get(i))?)?),
                            (bool01(g(jbt.get(i))?)?, bool01(g(jbi.get(i))?)?),
                        ],
                        sag: sg,
                        z0: z,
                        topo: tp2,
                    },
                ));
            }
            Ok(Lote::Quadros(v))
        }
        SECAO_TIPOS_PAREDE => {
            let id = u32s(c.next())?;
            let n = u32s(c.next())?;
            let wrap = u8s(c.next())?;
            let nf = u32s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&nc), Some(&w), Some(&f)) = (id.get(i), n.get(i), wrap.get(i), nf.get(i)) else {
                    return Err(INTERNO);
                };
                if w > 3 {
                    return Err(ENTRADA);
                }
                v.push((k, TipoLinha { n_camadas: nc, wrap_ends: w, n_faixas: f }));
            }
            Ok(Lote::Tipos(v))
        }
        SECAO_CAMADAS => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let esp = f64s(c.next())?;
            let fun = u8s(c.next())?;
            let tem = u8s(c.next())?;
            let pri = f64s(c.next())?;
            let mat = u32s(c.next())?;
            let env = u8s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&tp), Some(&ix), Some(&e), Some(&f), Some(&t), Some(&p), Some(&m), Some(&ev)) =
                    (id.get(i), tipo.get(i), indice.get(i), esp.get(i), fun.get(i), tem.get(i), pri.get(i), mat.get(i), env.get(i))
                else {
                    return Err(INTERNO);
                };
                if !finito(e) || e < 0.0 || !finito(p) || f > 5 {
                    return Err(ENTRADA);
                }
                let prioridade = if bool01(t)? { Some(p) } else { None };
                v.push((k, Camada { tipo: tp, indice: ix, espessura: e, funcao: f, prioridade, material: m, envolve: bool01(ev)? }));
            }
            Ok(Lote::Camadas(v))
        }
        SECAO_FAIXAS => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let lado = u8s(c.next())?;
            let mat = u32s(c.next())?;
            let esp = f64s(c.next())?;
            let z0 = f64s(c.next())?;
            let z1 = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&tp), Some(&ix), Some(&l), Some(&m), Some(&e), Some(&a), Some(&b)) =
                    (id.get(i), tipo.get(i), indice.get(i), lado.get(i), mat.get(i), esp.get(i), z0.get(i), z1.get(i))
                else {
                    return Err(INTERNO);
                };
                if !finito(e) || e < 0.0 || !finito(a) || !finito(b) {
                    return Err(ENTRADA);
                }
                v.push((k, FaixaLinha { tipo: tp, indice: ix, interior: bool01(l)?, material: m, espessura: e, z0: a, z1: b }));
            }
            Ok(Lote::Faixas(v))
        }
        SECAO_PAREDES_Z => {
            let id = u32s(c.next())?;
            let z0 = f64s(c.next())?;
            let alt = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&z), Some(&h)) = (id.get(i), z0.get(i), alt.get(i)) else {
                    return Err(INTERNO);
                };
                if !finito(z) || !finito(h) {
                    return Err(ENTRADA);
                }
                v.push((k, ParedeZ { z0: z, altura: h }));
            }
            Ok(Lote::ParedesZ(v))
        }
        _ => Err(ENTRADA),
    }
}

impl SecoesA1 {
    /// `true` se a seção é uma das três daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(secao, SECAO_PAREDES_QUADRO | SECAO_TIPOS_PAREDE | SECAO_CAMADAS | SECAO_FAIXAS | SECAO_PAREDES_Z)
    }

    fn tamanho(&self, secao: u32) -> usize {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.len(),
            SECAO_TIPOS_PAREDE => self.tipos.len(),
            SECAO_FAIXAS => self.faixas.len(),
            SECAO_PAREDES_Z => self.paredes_z.len(),
            _ => self.camadas.len(),
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.contains_key(&k),
            SECAO_TIPOS_PAREDE => self.tipos.contains_key(&k),
            SECAO_FAIXAS => self.faixas.contains_key(&k),
            SECAO_PAREDES_Z => self.paredes_z.contains_key(&k),
            _ => self.camadas.contains_key(&k),
        }
    }

    fn limpar(&mut self, secao: u32) {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.clear(),
            SECAO_TIPOS_PAREDE => self.tipos.clear(),
            SECAO_FAIXAS => self.faixas.clear(),
            SECAO_PAREDES_Z => self.paredes_z.clear(),
            _ => self.camadas.clear(),
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Quadros(v) => self.quadros.extend(v),
            Lote::Tipos(v) => self.tipos.extend(v),
            Lote::Camadas(v) => self.camadas.extend(v),
            Lote::Faixas(v) => self.faixas.extend(v),
            Lote::ParedesZ(v) => self.paredes_z.extend(v),
        }
    }

    /// Substitui todas as linhas da seção (atômico).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        self.limpar(secao);
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
                SECAO_PAREDES_QUADRO => {
                    self.quadros.remove(k);
                }
                SECAO_TIPOS_PAREDE => {
                    self.tipos.remove(k);
                }
                SECAO_FAIXAS => {
                    self.faixas.remove(k);
                }
                SECAO_PAREDES_Z => {
                    self.paredes_z.remove(k);
                }
                _ => {
                    self.camadas.remove(k);
                }
            }
        }
    }

    /// Camadas de um tipo ordenadas por `indice`. `ENTRADA` se o tipo não existe, se `n_camadas` não bate
    /// ou se os índices não são exatamente `0..n`.
    pub fn camadas_do_tipo(&self, tipo: u32) -> Result<Vec<Camada>, u32> {
        let n = self.tipos.get(&tipo).ok_or(ENTRADA)?.n_camadas;
        let mut v: Vec<Camada> = self.camadas.values().filter(|c| c.tipo == tipo).copied().collect();
        v.sort_by_key(|c| c.indice);
        if v.len() != n as usize || v.iter().enumerate().any(|(i, c)| c.indice as usize != i) {
            return Err(ENTRADA);
        }
        Ok(v)
    }
}

impl SecoesA1 {
    /// Faixas verticais de um tipo ordenadas por `indice` (A2). `ENTRADA` se o tipo não existe, se `n_faixas` não
    /// bate ou se os índices não são exatamente `0..n`.
    pub fn faixas_do_tipo(&self, tipo: u32) -> Result<Vec<FaixaLinha>, u32> {
        let n = self.tipos.get(&tipo).ok_or(ENTRADA)?.n_faixas;
        let mut v: Vec<FaixaLinha> = self.faixas.values().filter(|c| c.tipo == tipo).copied().collect();
        v.sort_by_key(|c| c.indice);
        if v.len() != n as usize || v.iter().enumerate().any(|(i, c)| c.indice as usize != i) {
            return Err(ENTRADA);
        }
        Ok(v)
    }
}
