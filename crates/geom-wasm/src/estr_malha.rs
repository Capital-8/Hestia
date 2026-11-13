//! Malha de pilares e vigas (docs/estrutura/PLANO.md, A.4.1; consulta 200 `estr_malha`; ficha K2). As fundações (A.4.2) estão em `estr_fundacao.rs` (ficha K3).
//!
//! Pilar: prisma vertical do perfil do tipo, de `base = cota(nível) + deslocamento_base` a `topo = cota(nível de topo) + deslocamento_topo` (ou
//! `base + altura`), com o X do perfil girado de `rotacao` em planta. Viga: prisma de `a` a `b`, com `z = cota(nível) + deslocamento_z` em cada ponta
//! (linear); a seção fica no plano perpendicular ao eixo, com o Y do perfil na vertical projetada nesse plano e o X à esquerda do eixo (`perp` de
//! `geo2d`); o alinhamento desloca a seção no seu Y (topo: o eixo no topo da seção; base: na base) e o giro `rotacao` roda a seção, já deslocada, em
//! torno do eixo. As cotas vêm da seção 19 `niveis`. Eixo com menos de 1 mm (inclusive pilar com topo abaixo da base), tipo ou nível ausente e perfil
//! inválido: `ENTRADA`. O pilar arquitetônico com `espessura_camadas > 0` ganha a parte 3: a casca entre o contorno do perfil e o seu offset em
//! esquadria (`ops::offset`), com o material do tipo; casca que não forma anéis válidos é omitida.
//!
//! LOD: muda só os lados dos círculos (`estr_perfil::lados_por_lod`: 24, 48 e 96, o contorno da A.2 no fino). A malha depende só da linha do
//! elemento, do tipo e do nível (A.4.8).

use std::collections::btree_map::Entry;
use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, NIVEL_TODOS};
use crate::estr_perfil::{contorno_do_tipo, lados_por_lod, orientados, validar_aneis, Contorno, P2};
use crate::estr_prisma::{extrudar, triangular, P3, Quadro3};
use crate::gc_malha::PecaMalha;
use crate::secoes_estr::{PerfilLinha, PilarLinha, VigaLinha, DISCIPLINA_ARQUITETONICO};

/// `categoria` dos grupos.
pub const CATEGORIA_PILAR: u32 = 0;
pub const CATEGORIA_VIGA: u32 = 1;
pub const CATEGORIA_FUNDACAO: u32 = 2;
/// `parte` dos grupos.
pub const PARTE_CORPO: u32 = 0;
pub const PARTE_BASE: u32 = 1;
pub const PARTE_PESCOCO: u32 = 2;
pub const PARTE_CAMADAS: u32 = 3;
/// Eixo mínimo (A.4.1).
pub const EIXO_MINIMO: f64 = 1e-3;
/// `alinhamento` da viga.
pub const ALINHA_TOPO: u8 = 0;
pub const ALINHA_CENTRO: u8 = 1;
pub const ALINHA_BASE: u8 = 2;
/// Espessura de camadas abaixo da qual a casca não sai (a grade do offset é de 1 µm).
const CAMADA_MINIMA: f64 = 1e-5;

/// Um grupo de `estr_malha`: `[elemento_num, categoria, parte, material_num, primeiro_indice, n_indices]`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GrupoEstr {
    pub elemento: u32,
    pub categoria: u32,
    pub parte: u32,
    pub material: u32,
    pub primeiro: u32,
    pub n: u32,
}

/// Malha de vários sólidos: vértices no mundo, índices absolutos (os grupos não compartilham vértices).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MalhaEstr {
    pub vertices: Vec<P3>,
    pub indices: Vec<u32>,
    pub grupos: Vec<GrupoEstr>,
}

impl MalhaEstr {
    /// Acrescenta a peça como um grupo. Mais de `u32::MAX` vértices ou índices: `LIMITE`.
    pub fn adicionar(&mut self, elemento: u32, categoria: u32, parte: u32, material: u32, peca: &PecaMalha) -> Result<(), u32> {
        let base = u32::try_from(self.vertices.len()).map_err(|_| LIMITE)?;
        let primeiro = u32::try_from(self.indices.len()).map_err(|_| LIMITE)?;
        let n = u32::try_from(peca.triangulos.len() * 3).map_err(|_| LIMITE)?;
        if u32::try_from(self.vertices.len() + peca.vertices.len()).is_err() || primeiro.checked_add(n).is_none() {
            return Err(LIMITE);
        }
        self.vertices.extend_from_slice(&peca.vertices);
        self.indices.extend(peca.triangulos.iter().flatten().map(|&k| base + k));
        self.grupos.push(GrupoEstr { elemento, categoria, parte, material, primeiro, n });
        Ok(())
    }

    /// Os triângulos de um grupo como peça avulsa (índices locais), para conferência.
    pub fn peca(&self, g: &GrupoEstr) -> PecaMalha {
        let idx = self.indices.get(g.primeiro as usize..(g.primeiro + g.n) as usize).unwrap_or(&[]);
        PecaMalha { vertices: self.vertices.clone(), triangulos: idx.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect() }
    }
}

/// Cota do nível pela seção 19 (a primeira linha com esse `nivel_num`, em ordem de `id_num`). Nível ausente: `ENTRADA`.
pub fn cota_do_nivel(cena: &Cena, nivel: u32) -> Result<f64, u32> {
    cena.b.niveis.values().find(|l| l.0 == nivel).map(|l| l.1).filter(|c| c.is_finite()).ok_or(ENTRADA)
}

/// Perfil pronto para extrudar: contorno, anéis e as tampas trianguladas.
pub struct PerfilMalha {
    pub contorno: Contorno,
    pub aneis: Vec<Vec<P2>>,
    pub tampas: Vec<[u32; 3]>,
}

impl PerfilMalha {
    pub fn de(contorno: Contorno) -> Result<PerfilMalha, u32> {
        let aneis: Vec<Vec<P2>> = contorno.aneis().cloned().collect();
        let tampas = triangular(&aneis)?;
        Ok(PerfilMalha { contorno, aneis, tampas })
    }

    pub fn extrudar(&self, q: &Quadro3) -> Result<PecaMalha, u32> {
        extrudar(&self.aneis, &self.tampas, q)
    }
}

/// Perfil de um tipo (paramétrico ou da seção 206) no LOD pedido.
pub fn perfil_malha(cena: &Cena, p: &PerfilLinha, lod: u32) -> Result<PerfilMalha, u32> {
    PerfilMalha::de(contorno_do_tipo(&cena.estr, p, lados_por_lod(lod))?)
}

/// Base e topo do pilar (A.3): `topo - base < EIXO_MINIMO` dá `ENTRADA`.
pub fn base_e_topo(cena: &Cena, l: &PilarLinha) -> Result<(f64, f64), u32> {
    let base = cota_do_nivel(cena, l.nivel)? + l.deslocamento_base;
    let topo = if l.nivel_topo == crate::esquema::ID_AUSENTE { base + l.altura } else { cota_do_nivel(cena, l.nivel_topo)? + l.deslocamento_topo };
    if topo - base >= EIXO_MINIMO {
        Ok((base, topo))
    } else {
        Err(ENTRADA)
    }
}

/// Quadro do pilar: perfil girado de `rotacao` em planta, eixo vertical de `base` a `topo`.
pub fn quadro_pilar(l: &PilarLinha, base: f64, topo: f64) -> Quadro3 {
    let (s, c) = l.rotacao.sin_cos();
    Quadro3 { origem: [l.pos[0], l.pos[1], base], ex: [c, s, 0.0], ey: [-s, c, 0.0], eixo: [0.0, 0.0, topo - base] }
}

fn esc(a: P3, b: P3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn comb(a: P3, ka: f64, b: P3, kb: f64) -> P3 {
    [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]
}

/// Quadro da viga (A.4.1). `faixa_y`: `[ymin, ymax]` do perfil, para o alinhamento. Eixo com menos de 1 mm: `ENTRADA`.
pub fn quadro_viga(cena: &Cena, l: &VigaLinha, faixa_y: [f64; 2]) -> Result<Quadro3, u32> {
    let cota = cota_do_nivel(cena, l.nivel)?;
    let a = [l.a[0], l.a[1], cota + l.deslocamento_z[0]];
    let d = [l.b[0] - a[0], l.b[1] - a[1], cota + l.deslocamento_z[1] - a[2]];
    let comprimento = esc(d, d).sqrt();
    if comprimento.is_nan() || comprimento < EIXO_MINIMO {
        return Err(ENTRADA);
    }
    let u = comb(d, 1.0 / comprimento, d, 0.0);
    // Y: a vertical projetada no plano da seção (viga vertical: o Y do mundo).
    let y = comb([0.0, 0.0, 1.0], 1.0, u, -u[2]);
    let ny = esc(y, y).sqrt();
    let y = if ny > 1e-9 { comb(y, 1.0 / ny, y, 0.0) } else { [0.0, 1.0, 0.0] };
    let x = [y[1] * u[2] - y[2] * u[1], y[2] * u[0] - y[0] * u[2], y[0] * u[1] - y[1] * u[0]];
    let (s, c) = l.rotacao.sin_cos();
    let (ex, ey) = (comb(x, c, y, s), comb(x, -s, y, c));
    let dy = match l.alinhamento {
        ALINHA_TOPO => -faixa_y[1],
        ALINHA_BASE => -faixa_y[0],
        _ => 0.0,
    };
    Ok(Quadro3 { origem: comb(a, 1.0, ey, dy), ex, ey, eixo: d })
}

/// Casca das camadas de acabamento: offset em esquadria do anel externo por `espessura`, com o anel do perfil como furo. `None` se não sair
/// um conjunto de anéis válido.
pub fn casca_camadas(contorno: &Contorno, espessura: f64) -> Option<PerfilMalha> {
    if espessura.is_nan() || espessura < CAMADA_MINIMA {
        return None;
    }
    let mut res = crate::ops::offset(&vec![vec![contorno.anel.clone()]], espessura).ok()?;
    if res.len() != 1 {
        return None;
    }
    let mut aneis = res.pop()?;
    aneis.push(contorno.anel.clone());
    validar_aneis(&aneis).ok()?;
    PerfilMalha::de(orientados(&aneis, [0.0, 0.0]).ok()?).ok()
}

/// Monta a malha dos pilares e das vigas do nível (`NIVEL_TODOS` = todos), na ordem do contrato: categoria, elemento, parte.
pub fn montar(cena: &Cena, nivel: u32, lod: u32) -> Result<MalhaEstr, u32> {
    let estr = &cena.estr;
    let do_nivel = |n: u32| nivel == NIVEL_TODOS || n == nivel;
    let mut m = MalhaEstr::default();
    let mut perfis: BTreeMap<(u32, u32), PerfilMalha> = BTreeMap::new();
    for (&id, l) in estr.pilares.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let tipo = estr.tipos_pilar.get(&l.tipo).ok_or(ENTRADA)?;
        let perfil = match perfis.entry((CATEGORIA_PILAR, l.tipo)) {
            Entry::Occupied(e) => e.into_mut(),
            Entry::Vacant(e) => e.insert(perfil_malha(cena, &tipo.perfil, lod)?),
        };
        let (base, topo) = base_e_topo(cena, l)?;
        let q = quadro_pilar(l, base, topo);
        m.adicionar(id, CATEGORIA_PILAR, PARTE_CORPO, tipo.material, &perfil.extrudar(&q)?)?;
        if tipo.disciplina == DISCIPLINA_ARQUITETONICO {
            if let Some(casca) = casca_camadas(&perfil.contorno, tipo.espessura_camadas) {
                m.adicionar(id, CATEGORIA_PILAR, PARTE_CAMADAS, tipo.material, &casca.extrudar(&q)?)?;
            }
        }
    }
    for (&id, l) in estr.vigas.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let tipo = estr.tipos_viga.get(&l.tipo).ok_or(ENTRADA)?;
        let perfil = match perfis.entry((CATEGORIA_VIGA, l.tipo)) {
            Entry::Occupied(e) => e.into_mut(),
            Entry::Vacant(e) => e.insert(perfil_malha(cena, &tipo.perfil, lod)?),
        };
        let q = quadro_viga(cena, l, perfil.contorno.faixa_y())?;
        m.adicionar(id, CATEGORIA_VIGA, PARTE_CORPO, tipo.material, &perfil.extrudar(&q)?)?;
    }
    for (&id, l) in estr.fundacoes.iter().filter(|(_, l)| do_nivel(l.nivel)) {
        let tipo = estr.tipos_fundacao.get(&l.tipo).ok_or(ENTRADA)?;
        crate::estr_fundacao::adicionar_fundacao(&mut m, cena, id, l, tipo, lod)?;
    }
    Ok(m)
}

/// Saídas da consulta 200: `grupos`, `vertices`, `indices`.
pub fn achatar(m: &MalhaEstr) -> Vec<Saida> {
    let grupos = m.grupos.iter().flat_map(|g| [g.elemento, g.categoria, g.parte, g.material, g.primeiro, g.n]).collect();
    vec![Saida::U32(grupos), Saida::F64(m.vertices.iter().flatten().copied().collect()), Saida::U32(m.indices.clone())]
}

/// Consulta 200 `estr_malha` (`lod` de 0 a 2; acima, `ENTRADA`).
pub fn consulta_estr_malha(cena: &Cena, nivel: u32, lod: u32) -> Result<Vec<Saida>, u32> {
    if lod > 2 {
        return Err(ENTRADA);
    }
    Ok(achatar(&montar(cena, nivel, lod)?))
}

#[cfg(test)]
mod testes {
    use crate::cena::Cena;
    use crate::esquema::{SECAO_NIVEIS, SECAO_PILARES};

    #[test]
    fn escritas_da_estrutura_nao_esvaziam_caches() {
        let mut c = Cena::novo();
        c.cache_elementos.get_mut().insert((0, 0, false), std::rc::Rc::new(Vec::new()));
        assert_eq!(c.definir_secao(SECAO_PILARES, 0, &[]), Ok(()));
        assert_eq!(c.remover(SECAO_PILARES, &[1]), Ok(()));
        assert_eq!(c.cache_elementos.borrow().len(), 1, "seção da estrutura não toca os caches");
        let niveis = [1u32.to_le_bytes(), [0; 4], 0u32.to_le_bytes(), [0; 4]].concat();
        let b = [niveis, 0.0f64.to_le_bytes().to_vec()].concat();
        assert_eq!(c.definir_secao(SECAO_NIVEIS, 1, &b), Ok(()));
        assert!(c.cache_elementos.borrow().is_empty(), "a seção 19 continua esvaziando");
    }
}
