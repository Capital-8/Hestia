//! Seções da sub-etapa A3a (esquema v4; v5 acrescenta as colunas de retorno em `tipos_abertura`): `tipos_abertura` e `aberturas`;
//! e da A3d (esquema v7): `perfis_z`.
//!
//! Mesmo molde de `secoes_a1`: `BTreeMap` por chave (ordem canônica = id crescente), decodificação que valida
//! antes de tocar a cena (atômica): tamanho, chave ausente/duplicada, valores não finitos e enums fora do domínio.

use std::collections::BTreeMap;

use crate::cena::decodificar_colunas;
use crate::esquema::{ENTRADA, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_ABERTURAS, SECAO_PERFIS_Z, SECAO_TIPOS_ABERTURA};
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
    /// `OpeningType.kind` do TIPO (A3b): `true` = window.
    pub janela: bool,
    /// `OpeningType.closure` (A3b): 0 none, 1 exterior, 2 interior, 3 both, 4 inherit.
    pub fechamento: u8,
    /// `openingCasing(t)` ou casing da composição: força o fechamento efetivo a none (A3b).
    pub tem_alizar: bool,
    /// `openingFrameStyle` (A3b): 0 rebate, 1 simple, 2 aduela, 3 block.
    pub estilo_batente: u8,
    /// `frameDepthMode` (A3b): 0 wall, 1 core, 2 fixed.
    pub modo_prof: u8,
    /// Profundidade pedida no modo fixed (A3b).
    pub prof_pedida: f64,
    /// `openingFrame(t).frameWidth` (A3b).
    pub larg_batente: f64,
    /// `openingFrame(t).leafThickness` (A3b).
    pub esp_folha: f64,
}

/// `closure` = inherit.
pub const FECHAMENTO_HERDA: u8 = 4;
/// Maior código de `estilo_batente`.
pub const ESTILO_MAX: u8 = 3;
/// Maior código de `modo_prof`.
pub const MODO_PROF_MAX: u8 = 2;

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

/// Maior código de `lista` de `perfis_z`: 0 topo derivado de `wallZRange`, 1 base derivada, 2 `Wall.topProfile` do modelo.
pub const LISTA_MAX: u8 = 2;

/// Linha de `perfis_z` (A3d): um ponto de perfil (`ProfilePoint`) de uma parede.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PontoDePerfil {
    pub parede: u32,
    pub lista: u8,
    pub indice: u32,
    pub t: f64,
    pub h: f64,
}

#[derive(Default)]
pub struct SecoesA3 {
    pub tipos: BTreeMap<u32, TipoAbertura>,
    pub aberturas: BTreeMap<u32, Abertura>,
    pub perfis: BTreeMap<u32, PontoDePerfil>,
}

enum Lote {
    Tipos(Vec<(u32, TipoAbertura)>),
    Aberturas(Vec<(u32, Abertura)>),
    Perfis(Vec<(u32, PontoDePerfil)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Tipos(v) => v.iter().map(|x| x.0).collect(),
            Lote::Aberturas(v) => v.iter().map(|x| x.0).collect(),
            Lote::Perfis(v) => v.iter().map(|x| x.0).collect(),
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
            let janela = u8s(c.next())?;
            let fecha = u8s(c.next())?;
            let alizar = u8s(c.next())?;
            let estilo = u8s(c.next())?;
            let modo = u8s(c.next())?;
            let pedida = f64s(c.next())?;
            let lb = f64s(c.next())?;
            let ef = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
                let g = |o: Option<&u8>| o.copied().ok_or(INTERNO);
                let (Some(&k), Some(&l), Some(&a), Some(&p), Some(&w), Some(&h), Some(&f), Some(&pl)) =
                    (id.get(i), larg.get(i), alt.get(i), peit.get(i), fw.get(i), fh.get(i), folhas.get(i), plano.get(i))
                else {
                    return Err(INTERNO);
                };
                let (Some(&pd), Some(&wb), Some(&ep)) = (pedida.get(i), lb.get(i), ef.get(i)) else {
                    return Err(INTERNO);
                };
                let (fc, es, mp) = (g(fecha.get(i))?, g(estilo.get(i))?, g(modo.get(i))?);
                if !(finito(l) && finito(a) && finito(p) && finito(w) && finito(h) && finito(pd) && finito(wb) && finito(ep))
                    || f > FOLHAS_MAX
                    || pl > PLANO_MAX
                    || fc > FECHAMENTO_HERDA
                    || es > ESTILO_MAX
                    || mp > MODO_PROF_MAX
                {
                    return Err(ENTRADA);
                }
                v.push((
                    k,
                    TipoAbertura {
                        largura: l,
                        altura: a,
                        peitoril: p,
                        folga_w: w,
                        folga_h: h,
                        folhas: f,
                        plano: pl,
                        janela: bool01(g(janela.get(i))?)?,
                        fechamento: fc,
                        tem_alizar: bool01(g(alizar.get(i))?)?,
                        estilo_batente: es,
                        modo_prof: mp,
                        prof_pedida: pd,
                        larg_batente: wb,
                        esp_folha: ep,
                    },
                ));
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
        SECAO_PERFIS_Z => {
            let id = u32s(c.next())?;
            let parede = u32s(c.next())?;
            let lista = u8s(c.next())?;
            let indice = u32s(c.next())?;
            let t = f64s(c.next())?;
            let h = f64s(c.next())?;
            chaves_validas(&id)?;
            let mut v = Vec::with_capacity(id.len());
            for i in 0..id.len() {
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
        _ => Err(ENTRADA),
    }
}

impl SecoesA3 {
    /// `true` se a seção é uma das duas daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(secao, SECAO_TIPOS_ABERTURA | SECAO_ABERTURAS | SECAO_PERFIS_Z)
    }

    fn tamanho(&self, secao: u32) -> usize {
        match secao {
            SECAO_TIPOS_ABERTURA => self.tipos.len(),
            SECAO_ABERTURAS => self.aberturas.len(),
            _ => self.perfis.len(),
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        match secao {
            SECAO_TIPOS_ABERTURA => self.tipos.contains_key(&k),
            SECAO_ABERTURAS => self.aberturas.contains_key(&k),
            _ => self.perfis.contains_key(&k),
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Tipos(v) => self.tipos.extend(v),
            Lote::Aberturas(v) => self.aberturas.extend(v),
            Lote::Perfis(v) => self.perfis.extend(v),
        }
    }

    /// Substitui todas as linhas da seção (atômico).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        match secao {
            SECAO_TIPOS_ABERTURA => self.tipos.clear(),
            SECAO_ABERTURAS => self.aberturas.clear(),
            _ => self.perfis.clear(),
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
                SECAO_TIPOS_ABERTURA => {
                    self.tipos.remove(k);
                }
                SECAO_ABERTURAS => {
                    self.aberturas.remove(k);
                }
                _ => {
                    self.perfis.remove(k);
                }
            }
        }
    }
}
