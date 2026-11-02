//! Seções da sub-etapa A3a (esquema v4): `tipos_abertura` e `aberturas`.
//!
//! Mesmo molde de `secoes_a1`: `BTreeMap` por chave (ordem canônica = id crescente), decodificação que valida
//! antes de tocar a cena (atômica): tamanho, chave ausente/duplicada, valores não finitos e enums fora do domínio.

use std::collections::BTreeMap;

use crate::cena::decodificar_colunas;
use crate::esquema::{ENTRADA, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_ABERTURAS, SECAO_TIPOS_ABERTURA};
use crate::secoes_a1::{bool01, chaves_validas, f64s, finito, u32s, u8s};

/// Maior código de `plano` (`PlanSymbol`, ver o esquema): `louver`.
pub const PLANO_MAX: u8 = 15;
/// Maior número de folhas (`OpeningLeaves`).
pub const FOLHAS_MAX: u8 = 4;

/// Linha de `tipos_abertura`: o tipo já normalizado para o vão (`openingType`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoAbertura {
    pub largura: f64,
    pub altura: f64,
    pub peitoril: f64,
    /// `roughOversize.w` e `.h` como o JS os leu (0 se ausentes); valor negativo vale 0 (`nonNeg`).
    pub folga_w: f64,
    pub folga_h: f64,
    pub folhas: u8,
    pub plano: u8,
}

/// Linha de `aberturas`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Abertura {
    pub tipo: u32,
    pub parede: u32,
    /// `Opening.kind`: `true` = window.
    pub janela: bool,
    pub deslocamento: f64,
    pub flip_mao: bool,
    pub flip_frente: bool,
    /// `sillOverride`.
    pub peitoril: Option<f64>,
    /// `heightOverride` (o Rust só o usa se for > 0, como `openingHeight`).
    pub altura: Option<f64>,
}

#[derive(Default)]
pub struct SecoesA3 {
    pub tipos: BTreeMap<u32, TipoAbertura>,
    pub aberturas: BTreeMap<u32, Abertura>,
}

enum Lote {
    Tipos(Vec<(u32, TipoAbertura)>),
    Aberturas(Vec<(u32, Abertura)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Tipos(v) => v.iter().map(|x| x.0).collect(),
            Lote::Aberturas(v) => v.iter().map(|x| x.0).collect(),
        }
    }
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let mut c = decodificar_colunas(secao, n_linhas, bytes)?.into_iter();
    match secao {
        SECAO_TIPOS_ABERTURA => {
            let id = u32s(c.next())?;
            let larg = f64s(c.next())?;
            let alt = f64s(c.next())?;
            let peit = f64s(c.next())?;
            let fw = f64s(c.next())?;
            let fh = f64s(c.next())?;
            let folhas = u8s(c.next())?;
            let plano = u8s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let (Some(&k), Some(&l), Some(&a), Some(&p), Some(&w), Some(&h), Some(&f), Some(&pl)) =
                    (id.get(i), larg.get(i), alt.get(i), peit.get(i), fw.get(i), fh.get(i), folhas.get(i), plano.get(i))
                else {
                    return Err(INTERNO);
                };
                if !(finito(l) && finito(a) && finito(p) && finito(w) && finito(h)) || f > FOLHAS_MAX || pl > PLANO_MAX {
                    return Err(ENTRADA);
                }
                v.push((k, TipoAbertura { largura: l, altura: a, peitoril: p, folga_w: w, folga_h: h, folhas: f, plano: pl }));
            }
            Ok(Lote::Tipos(v))
        }
        SECAO_ABERTURAS => {
            let id = u32s(c.next())?;
            let tipo = u32s(c.next())?;
            let parede = u32s(c.next())?;
            let kind = u8s(c.next())?;
            let desl = f64s(c.next())?;
            let fm = u8s(c.next())?;
            let ff = u8s(c.next())?;
            let tp = u8s(c.next())?;
            let peit = f64s(c.next())?;
            let ta = u8s(c.next())?;
            let alt = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let g = |o: Option<&u8>| o.copied().ok_or(INTERNO);
                let (Some(&k), Some(&t), Some(&pa), Some(&d), Some(&p), Some(&a)) = (id.get(i), tipo.get(i), parede.get(i), desl.get(i), peit.get(i), alt.get(i)) else {
                    return Err(INTERNO);
                };
                if !(finito(d) && finito(p) && finito(a)) {
                    return Err(ENTRADA);
                }
                v.push((
                    k,
                    Abertura {
                        tipo: t,
                        parede: pa,
                        janela: bool01(g(kind.get(i))?)?,
                        deslocamento: d,
                        flip_mao: bool01(g(fm.get(i))?)?,
                        flip_frente: bool01(g(ff.get(i))?)?,
                        peitoril: if bool01(g(tp.get(i))?)? { Some(p) } else { None },
                        altura: if bool01(g(ta.get(i))?)? { Some(a) } else { None },
                    },
                ));
            }
            Ok(Lote::Aberturas(v))
        }
        _ => Err(ENTRADA),
    }
}

impl SecoesA3 {
    /// `true` se a seção é uma das duas daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(secao, SECAO_TIPOS_ABERTURA | SECAO_ABERTURAS)
    }

    fn tamanho(&self, secao: u32) -> usize {
        if secao == SECAO_TIPOS_ABERTURA {
            self.tipos.len()
        } else {
            self.aberturas.len()
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        if secao == SECAO_TIPOS_ABERTURA {
            self.tipos.contains_key(&k)
        } else {
            self.aberturas.contains_key(&k)
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Tipos(v) => self.tipos.extend(v),
            Lote::Aberturas(v) => self.aberturas.extend(v),
        }
    }

    /// Substitui todas as linhas da seção (atômico).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        if secao == SECAO_TIPOS_ABERTURA {
            self.tipos.clear();
        } else {
            self.aberturas.clear();
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
            if secao == SECAO_TIPOS_ABERTURA {
                self.tipos.remove(k);
            } else {
                self.aberturas.remove(k);
            }
        }
    }
}
