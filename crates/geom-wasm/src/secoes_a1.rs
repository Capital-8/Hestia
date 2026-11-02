//! Seções da sub-etapa A1 (esquema v2): `paredes_quadro`, `tipos_parede` e `camadas`.
//!
//! Guardadas em `BTreeMap` por chave (ordem canônica = id crescente). Toda decodificação valida
//! antes de tocar a cena (atômica): tamanho, chave ausente/duplicada, valores não finitos ou fora de
//! faixa, enums fora do domínio. Nada daqui entra em panic por dado do JS.

use std::collections::BTreeMap;

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{
    ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_CAMADAS, SECAO_PAREDES_QUADRO, SECAO_TIPOS_PAREDE,
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
}

/// As três seções.
#[derive(Default)]
pub struct SecoesA1 {
    pub quadros: BTreeMap<u32, ParedeQuadro>,
    /// `tipo_num -> n_camadas`
    pub tipos: BTreeMap<u32, u32>,
    pub camadas: BTreeMap<u32, Camada>,
}

enum Lote {
    Quadros(Vec<(u32, ParedeQuadro)>),
    Tipos(Vec<(u32, u32)>),
    Camadas(Vec<(u32, Camada)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Quadros(v) => v.iter().map(|x| x.0).collect(),
            Lote::Tipos(v) => v.iter().map(|x| x.0).collect(),
            Lote::Camadas(v) => v.iter().map(|x| x.0).collect(),
        }
    }
}

fn u32s(c: Option<Coluna>) -> Result<Vec<u32>, u32> {
    match c {
        Some(Coluna::U32(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}
fn f64s(c: Option<Coluna>) -> Result<Vec<f64>, u32> {
    match c {
        Some(Coluna::F64(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}
fn u8s(c: Option<Coluna>) -> Result<Vec<u8>, u32> {
    match c {
        Some(Coluna::U8(v)) => Ok(v),
        _ => Err(INTERNO),
    }
}

fn finito(v: f64) -> bool {
    v.is_finite() && v.abs() <= COORD_MAX
}

fn bool01(v: u8) -> Result<bool, u32> {
    match v {
        0 => Ok(false),
        1 => Ok(true),
        _ => Err(ENTRADA),
    }
}

fn chaves_validas(ids: &[u32]) -> Result<(), u32> {
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
            chaves_validas(&id)?;
            Ok(Lote::Tipos(id.into_iter().zip(n).collect()))
        }
        SECAO_CAMADAS => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let indice = u32s(c.next())?;
            let esp = f64s(c.next())?;
            let fun = u8s(c.next())?;
            let tem = u8s(c.next())?;
            let pri = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&tp), Some(&ix), Some(&e), Some(&f), Some(&t), Some(&p)) =
                    (id.get(i), tipo.get(i), indice.get(i), esp.get(i), fun.get(i), tem.get(i), pri.get(i))
                else {
                    return Err(INTERNO);
                };
                if !finito(e) || e < 0.0 || !finito(p) || f > 5 {
                    return Err(ENTRADA);
                }
                let prioridade = if bool01(t)? { Some(p) } else { None };
                v.push((k, Camada { tipo: tp, indice: ix, espessura: e, funcao: f, prioridade }));
            }
            Ok(Lote::Camadas(v))
        }
        _ => Err(ENTRADA),
    }
}

impl SecoesA1 {
    /// `true` se a seção é uma das três daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(secao, SECAO_PAREDES_QUADRO | SECAO_TIPOS_PAREDE | SECAO_CAMADAS)
    }

    fn tamanho(&self, secao: u32) -> usize {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.len(),
            SECAO_TIPOS_PAREDE => self.tipos.len(),
            _ => self.camadas.len(),
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.contains_key(&k),
            SECAO_TIPOS_PAREDE => self.tipos.contains_key(&k),
            _ => self.camadas.contains_key(&k),
        }
    }

    fn limpar(&mut self, secao: u32) {
        match secao {
            SECAO_PAREDES_QUADRO => self.quadros.clear(),
            SECAO_TIPOS_PAREDE => self.tipos.clear(),
            _ => self.camadas.clear(),
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Quadros(v) => self.quadros.extend(v),
            Lote::Tipos(v) => self.tipos.extend(v),
            Lote::Camadas(v) => self.camadas.extend(v),
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
                _ => {
                    self.camadas.remove(k);
                }
            }
        }
    }

    /// Camadas de um tipo ordenadas por `indice`. `ENTRADA` se o tipo não existe, se `n_camadas` não bate
    /// ou se os índices não são exatamente `0..n`.
    pub fn camadas_do_tipo(&self, tipo: u32) -> Result<Vec<Camada>, u32> {
        let n = *self.tipos.get(&tipo).ok_or(ENTRADA)?;
        let mut v: Vec<Camada> = self.camadas.values().filter(|c| c.tipo == tipo).copied().collect();
        v.sort_by_key(|c| c.indice);
        if v.len() != n as usize || v.iter().enumerate().any(|(i, c)| c.indice as usize != i) {
            return Err(ENTRADA);
        }
        Ok(v)
    }
}
