//! Consulta `junction_nivel` (sub-etapa B3 da fatia B, decisão 0050 §3): `levelCutterSet` (`junctionNet.ts`) e `junctionLevel` (`junctionLevel.ts`) de um
//! nível, com `winsOver`, `zOverlaps` e `resolveJunction` (`junctionPlanar.ts`).
//!
//! Cortadores: os pisos, as lajes e as faixas de parede do próprio nível (sempre) mais os de OUTROS níveis que tocam a faixa de cota do nível, marcados
//! `external` (só cortam, e só parede x piso/laje). Pisos e lajes vêm de `b1::calcular` com as paredes (B2) de cada nível.
//!
//! Faixas de parede (saída 3 da 0050, esquema v11): quando a seção `faixas_juncao` está definida, a partição vertical e a região de cada faixa vêm
//! do TypeScript (`pecas_das_faixas_juntadas`), já resolvidas depois do perfil superior e do de base; o Rust só executa os recortes. Sem a seção
//! (cena antiga, testes de unidade), as faixas saem do cálculo próprio de `resolver_nivel` (A3d) sobre a variante da JUNÇÃO (`paredes_z_juncao` e
//! `perfis_z_juncao`), que tem os pontos de quebra próprios e não reproduz a partição do TS (defeito conhecido, 0050). Os caches do TS (`WeakMap`,
//! LRU, assinatura `r6`) não migram: cada consulta recalcula.
//!
//! Junção: as peças com `meta` (laje inclinada e membrana ficam de fora) entram em `resolveJunction`; a camada perde, em cada faixa de cota, a região comum com
//! as que a vencem. `cut` = alguma camada perdeu volume (mais que área × `Z_EPS`); `region` = união das partes (só com `cut`). Peça externa só corta: não sai.
//!
//! Escala: as booleanas usam 1 nm (`ESCALA_FINA`), como a B1, a B2 e o pintor. Não migram: `cutVolume`, `coveredFaceArea`, `slabCoversFloor` e
//! `overlapVolume` (quantitativos, que precisam do `earcut` do TS para laje inclinada); a consulta devolve as partes de cada camada, de onde o volume sai.

use std::cell::Cell;
use std::rc::Rc;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::a2::{Codificador, OpcoesDePlanta};
use crate::a2::NivelPintado;
use crate::a3c::{resolver_nivel, GrupoResolvido, Inclinacao as InclinacaoDaFaixa, NivelResolvido, OpcoesDoCluster};
use crate::a3d::{aplicar_perfis, perfis_por_parede};
use crate::b1::calcular;
use crate::cena::Cena;
use crate::geo2d::arredonda_js;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::ops::{diferenca_de_preparadas, normalizar_na_grade, preparar_forma, uniao_com_escala, FormasPreparadas, ESCALA_FINA};
use crate::pintor::area_da_forma;
use crate::MultiPoligono;

/// `Z_EPS` de `junctionNet.ts` e de `junctionPlanar.ts`.
pub(crate) const Z_EPS: f64 = 1e-6;
/// Espessura (m) abaixo da qual a peça plana é descartada (`planarOf`: `z1 - z0 > 1e-9`).
const ESPESSURA_MINIMA: f64 = 1e-9;

/// Tipo do elemento (`JunctionKind`): o mesmo código de `cortadores` e `pecas` na saída.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Tipo {
    Parede = 0,
    Piso = 1,
    Laje = 2,
}

/// `TYPE_RANK`: laje corta piso e parede; piso corta parede.
fn ordem_do_tipo(t: Tipo) -> u8 {
    match t {
        Tipo::Parede => 1,
        Tipo::Piso => 2,
        Tipo::Laje => 3,
    }
}

/// `JunctionMeta`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MetaDeJuncao {
    pub tipo: Tipo,
    pub prioridade: f64,
    pub nucleo: bool,
    pub explicita: bool,
    /// Término por camada da parede (decisão 0054): a camada de piso ou de laje vence as de parede onde se cruzam.
    pub vence_parede: bool,
}

/// `winsOver(a, b)`: `Some(true)` se `a` corta `b`, `Some(false)` se `b` corta `a`, `None` se nenhuma corta.
pub fn vence(a: &MetaDeJuncao, b: &MetaDeJuncao) -> Option<bool> {
    // Camada com regra explícita (0025) decide a própria região com as paredes: nem é recortada por parede nem a recorta.
    // Término por camada da parede (0054): a camada vence a parede onde as duas se cruzam.
    if a.vence_parede && b.tipo == Tipo::Parede {
        return Some(true);
    }
    if b.vence_parede && a.tipo == Tipo::Parede {
        return Some(false);
    }
    if b.explicita && a.tipo == Tipo::Parede {
        return None;
    }
    if a.explicita && b.tipo == Tipo::Parede {
        return None;
    }
    if a.nucleo && !b.nucleo && b.prioridade < a.prioridade {
        return Some(true);
    }
    if b.nucleo && !a.nucleo && a.prioridade < b.prioridade {
        return Some(false);
    }
    if a.prioridade != b.prioridade {
        return Some(a.prioridade < b.prioridade);
    }
    if a.tipo == b.tipo {
        return None;
    }
    Some(ordem_do_tipo(a.tipo) > ordem_do_tipo(b.tipo))
}

/// `zOverlaps`: faixa de cota comum com espessura positiva.
pub fn z_se_cruzam(a: (f64, f64), b: (f64, f64)) -> bool {
    a.1.min(b.1) - a.0.max(b.0) > Z_EPS
}

/// `PlanarPiece`.
#[derive(Clone, Debug)]
pub struct PecaPlana {
    pub meta: MetaDeJuncao,
    pub poly: MultiPoligono,
    pub z0: f64,
    pub z1: f64,
    /// Elemento dono: as camadas de um mesmo elemento não se cortam.
    pub dono: Option<(Tipo, u32)>,
    pub externa: bool,
}

/// `ResolvedPrism`.
#[derive(Clone, Debug)]
pub struct Prisma {
    pub poly: MultiPoligono,
    pub z0: f64,
    pub z1: f64,
}

pub(crate) type Caixa = [f64; 4];

pub(crate) fn caixa_total(m: &MultiPoligono) -> Caixa {
    let mut c = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for p in m {
        for a in p {
            for q in a {
                c[0] = c[0].min(q[0]);
                c[1] = c[1].min(q[1]);
                c[2] = c[2].max(q[0]);
                c[3] = c[3].max(q[1]);
            }
        }
    }
    c
}

pub(crate) fn caixas_se_tocam(a: &Caixa, b: &Caixa) -> bool {
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/// Uma peça planar com o polígono emprestado: a junção só lê o polígono, então quem já o tem (a cena) não precisa clonar para resolver.
#[derive(Clone, Copy, Debug)]
pub struct PecaRef<'a> {
    pub meta: MetaDeJuncao,
    pub poly: &'a MultiPoligono,
    pub z0: f64,
    pub z1: f64,
    pub dono: Option<(Tipo, u32)>,
    pub externa: bool,
}

impl PecaPlana {
    pub fn como_ref(&self) -> PecaRef<'_> {
        PecaRef { meta: self.meta, poly: &self.poly, z0: self.z0, z1: self.z1, dono: self.dono, externa: self.externa }
    }
}

/// `pairCuts(c, t)`: camadas do mesmo elemento não se cortam, parede não corta parede, e entre níveis só parede x piso/laje.
fn par_corta_ref(c: &PecaRef, t: &PecaRef) -> bool {
    if c.externa || t.externa {
        return c.externa != t.externa && (c.meta.tipo == Tipo::Parede) != (t.meta.tipo == Tipo::Parede);
    }
    !(c.dono.is_some() && c.dono == t.dono) && !(c.meta.tipo == Tipo::Parede && t.meta.tipo == Tipo::Parede)
}

/// Passos da diferença de uma peça por suas vencedoras, feitos uma vez por peça (não por faixa de cota nem por peça que ela corta):
/// `como_o_polygon_clipping(na_grade(poly))` e depois a preparação (quantização a `ESCALA_FINA`) que `diferenca_com_escala` repetia a cada chamada.
/// A ordem dos passos (todas as conversões, depois todas as preparações) é a de antes, então o primeiro erro, se houver, é o mesmo.
struct PassosPorPeca {
    convertida: Vec<Option<MultiPoligono>>,
    preparada: Vec<Option<FormasPreparadas>>,
}

impl PassosPorPeca {
    fn novo(n: usize) -> PassosPorPeca {
        PassosPorPeca { convertida: (0..n).map(|_| None).collect(), preparada: (0..n).map(|_| None).collect() }
    }

    fn converter(&mut self, pecas: &[PecaRef], k: usize) -> Result<(), u32> {
        if self.convertida[k].is_none() {
            self.convertida[k] = Some(crate::b1::como_o_polygon_clipping(&na_grade(pecas[k].poly))?);
        }
        Ok(())
    }

    fn preparar(&mut self, k: usize) -> Result<(), u32> {
        if self.preparada[k].is_none() {
            let c = self.convertida[k].as_ref().ok_or(ENTRADA)?;
            self.preparada[k] = Some(preparar_forma(c, ESCALA_FINA)?);
        }
        Ok(())
    }
}

/// `resolveJunction`: a região resolvida de cada peça (na ordem de `pecas`; a externa sai vazia, só corta).
pub fn resolver_juncao(pecas: &[PecaPlana]) -> Result<Vec<Vec<Prisma>>, u32> {
    resolver_juncao_ref(&pecas.iter().map(PecaPlana::como_ref).collect::<Vec<_>>())
}

/// [`resolver_juncao`] sobre peças emprestadas. As candidatas a vencedoras de cada peça vêm de um índice espacial (as caixas que se tocam, em ordem
/// crescente de posição, como o filtro linear de antes), e a diferença de cada peça só é refeita quando o conjunto de vencedoras ativas da faixa muda.
pub fn resolver_juncao_ref(pecas: &[PecaRef]) -> Result<Vec<Vec<Prisma>>, u32> {
    let caixas: Vec<Option<Caixa>> = pecas.iter().map(|t| if t.poly.is_empty() { None } else { Some(caixa_total(t.poly)) }).collect();
    // Índice só das peças com polígono; `ids` leva a posição no índice de volta à posição em `pecas`.
    let mut ids: Vec<u32> = Vec::new();
    let mut para_indice: Vec<crate::indice::Caixa> = Vec::new();
    for (k, c) in caixas.iter().enumerate() {
        if let Some(c) = c {
            ids.push(k as u32);
            para_indice.push(crate::indice::Caixa { minx: c[0], miny: c[1], maxx: c[2], maxy: c[3] });
        }
    }
    let indice = crate::indice::Indice::construir(para_indice);
    let mut candidatas: Vec<u32> = Vec::new();
    let mut passos = PassosPorPeca::novo(pecas.len());
    let mut todos = Vec::new();
    let mut saida: Vec<Vec<Prisma>> = Vec::with_capacity(pecas.len());
    for (i, t) in pecas.iter().enumerate() {
        if t.externa {
            saida.push(Vec::new());
            continue;
        }
        let vencedoras: Vec<usize> = match &caixas[i] {
            None => Vec::new(),
            Some(bi) => {
                indice.buscar(&crate::indice::Caixa { minx: bi[0], miny: bi[1], maxx: bi[2], maxy: bi[3] }, &mut candidatas);
                candidatas
                    .iter()
                    .map(|&c| ids[c as usize] as usize)
                    .filter(|&j| {
                        let c = &pecas[j];
                        j != i && par_corta_ref(c, t) && z_se_cruzam((t.z0, t.z1), (c.z0, c.z1)) && vence(&c.meta, &t.meta) == Some(true)
                    })
                    .collect()
            }
        };
        if vencedoras.is_empty() {
            saida.push(vec![Prisma { poly: t.poly.clone(), z0: t.z0, z1: t.z1 }]);
            continue;
        }
        // Mesma grade de EPS_Z das alturas de parede (a3c.rs): alturas quase iguais não criam fatias minúsculas.
        let grade = |z: f64| arredonda_js(z / Z_EPS) * Z_EPS;
        let mut cortes: Vec<f64> = vec![grade(t.z0), grade(t.z1)];
        for &w in &vencedoras {
            cortes.push(grade(pecas[w].z0));
            cortes.push(grade(pecas[w].z1));
        }
        // `new Set(cortes.filter(...).map(clamp)).sort`: duplicatas exatas saem; a ordem é crescente.
        let mut limites: Vec<f64> = cortes.into_iter().filter(|&z| z >= t.z0 - Z_EPS && z <= t.z1 + Z_EPS).map(|z| t.z1.min(t.z0.max(z))).collect();
        limites.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        limites.dedup();
        let mut partes: Vec<Prisma> = Vec::new();
        // Diferença já calculada para o conjunto de vencedoras ativas (faixas vizinhas costumam repetir o conjunto).
        let mut memo: Vec<(Vec<usize>, MultiPoligono)> = Vec::new();
        for k in 0..limites.len().saturating_sub(1) {
            let (z0, z1) = (limites[k], limites[k + 1]);
            if z1 - z0 <= Z_EPS {
                continue;
            }
            let meio = (z0 + z1) / 2.0;
            let ativas: Vec<usize> = vencedoras.iter().copied().filter(|&w| pecas[w].z0 < meio && pecas[w].z1 > meio).collect();
            let poly = if ativas.is_empty() {
                t.poly.clone()
            } else if let Some((_, feito)) = memo.iter().find(|(c, _)| *c == ativas) {
                feito.clone()
            } else {
                passos.converter(pecas, i)?;
                for &w in &ativas {
                    passos.converter(pecas, w)?;
                }
                passos.preparar(i)?;
                for &w in &ativas {
                    passos.preparar(w)?;
                }
                let primeiro = passos.convertida[i].as_ref().ok_or(ENTRADA)?;
                let a = passos.preparada[i].as_ref().ok_or(ENTRADA)?;
                let subs: Vec<&FormasPreparadas> = ativas.iter().filter_map(|&w| passos.preparada[w].as_ref()).collect();
                let feito = diferenca_de_preparadas(primeiro, a, &subs, ESCALA_FINA, &mut todos)?;
                memo.push((ativas, feito.clone()));
                feito
            };
            if !poly.is_empty() {
                partes.push(Prisma { poly, z0, z1 });
            }
        }
        saida.push(partes);
    }
    Ok(saida)
}

/// Coordenadas na grade de `Z_EPS` (`Math.round(v / EPS_Z) * EPS_Z` do TS, `naGrade`): bordas que deveriam coincidir coincidem exatamente.
fn na_grade(m: &MultiPoligono) -> MultiPoligono {
    let g = |v: f64| arredonda_js(v / Z_EPS) * Z_EPS;
    m.iter().map(|poli| poli.iter().map(|anel| anel.iter().map(|p| [g(p[0]), g(p[1])]).collect()).collect()).collect()
}

/// Faixa de cota de uma peça (`SolidPiece.span`).
#[derive(Clone, Debug)]
pub enum Span {
    /// `flatPiece` (piso, e laje sem inclinação): `[z0, z1]`.
    Constante { z0: f64, z1: f64 },
    /// `slabLayerPiece`: `[z0 + subida, z1 + subida]`, com a subida `slabRiseAt`.
    Laje { z0: f64, z1: f64, origem: [f64; 2], direcao: [f64; 2], percentual: f64 },
    /// `bandPiece`: `[baseZ + z0, baseZ + bandTopAt]`.
    Faixa { base_z: f64, z0: f64, z1: f64, inclinacao: Option<InclinacaoDaFaixa> },
    /// Faixa com topo em perfil: `[base_z + z0, base_z + h(t)]`, `t = (q - o)·d`, `h` linear por trechos pelos pontos
    /// `(t, h)` (em ordem crescente de `t`; dois pontos no mesmo `t` formam um degrau, valendo o de cima à direita).
    /// Fora do primeiro e do último `t`, `h` é constante.
    Perfil { base_z: f64, z0: f64, o: [f64; 2], d: [f64; 2], pts: Vec<(f64, f64)> },
}

/// Altura `h` do perfil em `t`, usando o trecho que contém `t_ref` estendido em reta. Com `t_ref == t` é o perfil
/// por trechos comum. Sem pontos, zero.
fn altura_do_perfil(pts: &[(f64, f64)], t: f64, t_ref: f64) -> f64 {
    let (Some(&(t_ini, h_ini)), Some(&(t_fim, h_fim))) = (pts.first(), pts.last()) else {
        return 0.0;
    };
    if t_ref < t_ini {
        return h_ini;
    }
    if t_ref >= t_fim {
        return h_fim;
    }
    for w in pts.windows(2) {
        let ((ta, ha), (tb, hb)) = (w[0], w[1]);
        if ta <= t_ref && t_ref < tb {
            return ha + (hb - ha) * (t - ta) / (tb - ta);
        }
    }
    h_fim
}

impl Span {
    /// `span(q)`.
    pub fn em(&self, q: [f64; 2]) -> (f64, f64) {
        self.em_no_trecho(q, None)
    }

    /// Posição de `q` ao longo do perfil (`(q - o)·d`); `None` fora de `Perfil`.
    pub fn t_do_perfil(&self, q: [f64; 2]) -> Option<f64> {
        match self {
            Span::Perfil { o, d, .. } => Some((q[0] - o[0]) * d[0] + (q[1] - o[1]) * d[1]),
            _ => None,
        }
    }

    /// Como `em`, mas num `Perfil` usa o trecho que contém `t_ref` (estendido em reta além dele); `None` é o `t` de `q`.
    /// É a altura afim de uma fatia de planta entre duas quebras (`volume_por_trechos`). Nas demais faixas é `em`.
    pub fn em_no_trecho(&self, q: [f64; 2], t_ref: Option<f64>) -> (f64, f64) {
        match *self {
            Span::Perfil { base_z, z0, o, d, ref pts } => {
                let t = (q[0] - o[0]) * d[0] + (q[1] - o[1]) * d[1];
                (base_z + z0, base_z + altura_do_perfil(pts, t, t_ref.unwrap_or(t)))
            }
            Span::Constante { z0, z1 } => (z0, z1),
            Span::Laje { z0, z1, origem, direcao, percentual } => {
                let subida = (percentual / 100.0) * ((q[0] - origem[0]) * direcao[0] + (q[1] - origem[1]) * direcao[1]);
                (z0 + subida, z1 + subida)
            }
            Span::Faixa { base_z, z0, z1, inclinacao } => {
                let topo = match inclinacao {
                    None => z1,
                    Some(s) => {
                        let k = (((q[0] - s.o[0]) * s.d[0] + (q[1] - s.o[1]) * s.d[1]) - s.t0) / (s.t1 - s.t0);
                        s.h0 + (s.h1 - s.h0) * k
                    }
                };
                (base_z + z0, base_z + topo)
            }
        }
    }
}

/// `PieceMeta`: os atributos de junção mais o dono e as chaves da camada (e da faixa, só na parede).
#[derive(Clone, Copy, Debug)]
pub struct MetaDaPeca {
    pub juncao: MetaDeJuncao,
    pub dono: (Tipo, u32),
    pub camada: i64,
    pub banda: Option<u32>,
}

/// `SolidPiece`.
#[derive(Clone, Debug)]
pub struct PecaSolida {
    pub poly: MultiPoligono,
    pub span: Span,
    pub plana: bool,
    pub meta: Option<MetaDaPeca>,
    pub externa: bool,
}

/// `CutterSolid`.
#[derive(Clone, Debug)]
pub struct Cortador {
    pub tipo: Tipo,
    pub pecas: Vec<PecaSolida>,
}

/// `LevelCutters`.
#[derive(Clone, Debug, Default)]
pub struct Cortadores {
    pub pisos: Vec<Cortador>,
    pub lajes: Vec<Cortador>,
    pub paredes: Vec<Cortador>,
}

/// `spanRange`: a envolvente das cotas nos vértices; sem vértices, `None`. Num `Perfil` entram também as quebras do perfil
/// que caem dentro do intervalo de `t` da peça (o extremo de um perfil por trechos está numa quebra, não num vértice).
pub fn faixa_da_peca(p: &PecaSolida) -> Option<(f64, f64)> {
    let mut z0 = f64::INFINITY;
    let mut z1 = f64::NEG_INFINITY;
    for poly in &p.poly {
        for anel in poly {
            for v in anel {
                let (a, b) = p.span.em(*v);
                z0 = z0.min(a);
                z1 = z1.max(b);
            }
        }
    }
    if let Span::Perfil { base_z, z0: zb, pts, .. } = &p.span {
        let ts: Vec<f64> = p.poly.iter().flatten().flatten().filter_map(|q| p.span.t_do_perfil(*q)).collect();
        let lo = ts.iter().cloned().fold(f64::INFINITY, f64::min);
        let hi = ts.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        for &(t, h) in pts {
            if t >= lo && t <= hi {
                z0 = z0.min(base_z + zb);
                z1 = z1.max(base_z + h);
            }
        }
    }
    (z0 <= z1).then_some((z0, z1))
}

/// Liga a variante da junção (`paredes_z_juncao`, `perfis_z_juncao`) e a desliga ao sair, também em erro.
pub(crate) struct VarianteDaJuncao<'a>(&'a Cell<bool>, bool);

impl<'a> VarianteDaJuncao<'a> {
    pub(crate) fn ligar(cena: &'a Cena) -> VarianteDaJuncao<'a> {
        let anterior = cena.variante_juncao.replace(true);
        VarianteDaJuncao(&cena.variante_juncao, anterior)
    }
}

impl Drop for VarianteDaJuncao<'_> {
    fn drop(&mut self) {
        self.0.set(self.1);
    }
}

/// `resolver_nivel` com as opções padrão (`resolveLevel` sem corte, contorno nem aberturas de planta), guardado na cena por (nível, tolerância, variante
/// efetiva): o `Carregador` do B2 (contornos de camada de pisos e lajes) e a junção/quantidades de parede pedem o mesmo cálculo do mesmo nível.
pub(crate) fn nivel_resolvido(cena: &Cena, nivel: u32, tol: f64) -> Result<Rc<NivelResolvido>, u32> {
    let chave = (nivel, tol.to_bits(), cena.variante_efetiva());
    if let Some(c) = cena.cache_niveis.borrow().get(&chave) {
        return Ok(Rc::clone(c));
    }
    let opcoes = OpcoesDoCluster { planta: OpcoesDePlanta { corte_z: None, contorno: BTreeSet::new() }, aberturas_planta: None };
    let r = Rc::new(resolver_nivel(cena, nivel, tol, &opcoes)?);
    cena.cache_niveis.borrow_mut().insert(chave, Rc::clone(&r));
    Ok(r)
}

/// O nível resolvido na variante da junção com os perfis aplicados (`withBottomProfile`/`withProfile`). Sem perfil nenhum reaproveita o resolvido; com
/// perfis, só os grupos são copiados (a pintura é compartilhada).
pub(crate) struct NivelComPerfis {
    base: Rc<NivelResolvido>,
    grupos_com_perfis: Option<Vec<GrupoResolvido>>,
}

impl NivelComPerfis {
    pub(crate) fn pintado(&self) -> &NivelPintado {
        &self.base.pintado
    }
    pub(crate) fn grupos(&self) -> &[GrupoResolvido] {
        self.grupos_com_perfis.as_deref().unwrap_or(&self.base.grupos)
    }
}

pub(crate) fn nivel_resolvido_com_perfis(cena: &Cena, nivel: u32, tol: f64) -> Result<Rc<NivelComPerfis>, u32> {
    let chave = (nivel, tol.to_bits());
    if let Some(c) = cena.cache_niveis_perfis.borrow().get(&chave) {
        return Ok(Rc::clone(c));
    }
    let _variante = VarianteDaJuncao::ligar(cena);
    let perfis = perfis_por_parede(cena)?;
    let base = nivel_resolvido(cena, nivel, tol)?;
    let grupos_com_perfis = if perfis.is_empty() {
        None
    } else {
        let mut grupos = base.grupos.clone();
        aplicar_perfis(cena, &base.pintado, &mut grupos, &perfis)?;
        Some(grupos)
    };
    let r = Rc::new(NivelComPerfis { base, grupos_com_perfis });
    cena.cache_niveis_perfis.borrow_mut().insert(chave, Rc::clone(&r));
    Ok(r)
}

/// `wallBandPieces`: os pedaços de cada faixa de parede do nível (`resolveLevel` padrão, sem `flatAttach`), na ordem de `Object.values(r.walls)`.
fn pecas_das_paredes(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<PecaSolida>, u32> {
    let _variante = VarianteDaJuncao::ligar(cena);
    let resolvido = nivel_resolvido_com_perfis(cena, nivel, tol)?;
    let (pintado, grupos) = (resolvido.pintado(), resolvido.grupos());
    let mut pecas: Vec<PecaSolida> = Vec::new();
    for (gi, g) in pintado.grupos.iter().enumerate() {
        for &mi in &g.membros {
            let q = &pintado.quadros[mi];
            let base_z = cena.parede_z(q.id).ok_or(ENTRADA)?.z0;
            for c in grupos[gi].camadas.iter().filter(|c| g.itens[c.item].parede == q.id) {
                let it = &g.itens[c.item];
                for (banda, f) in c.faixas.iter().enumerate() {
                    pecas.push(PecaSolida {
                        poly: f.poly.clone(),
                        span: Span::Faixa { base_z, z0: f.z0, z1: f.z1, inclinacao: f.inclinacao },
                        plana: f.inclinacao.is_none(),
                        meta: Some(MetaDaPeca {
                            juncao: MetaDeJuncao { tipo: Tipo::Parede, prioridade: it.prioridade, nucleo: it.nucleo, explicita: false, vence_parede: false },
                            dono: (Tipo::Parede, q.id),
                            camada: it.camada(),
                            banda: Some(banda as u32),
                        }),
                        externa: false,
                    });
                }
            }
        }
    }
    Ok(pecas)
}

/// `floorLayerPiece` e `slabLayerPiece`: a peça de uma camada de piso ou de laje (a laje inclinada leva a subida na faixa de cota).
pub(crate) fn peca_da_camada(e: &crate::b1::ElementoResolvido, l: &crate::b1::CamadaResolvida) -> PecaSolida {
    let tipo = if e.laje { Tipo::Laje } else { Tipo::Piso };
    let span = match (e.laje, e.inclinacao) {
        (true, Some(s)) => Span::Laje { z0: l.z0, z1: l.z1, origem: s.origem, direcao: s.direcao, percentual: s.percentual },
        _ => Span::Constante { z0: l.z0, z1: l.z1 },
    };
    PecaSolida {
        poly: l.poligono.clone(),
        span,
        plana: !(e.laje && e.inclinacao.is_some()),
        meta: Some(MetaDaPeca { juncao: MetaDeJuncao { tipo, prioridade: l.prioridade, nucleo: l.nucleo, explicita: l.explicita, vence_parede: l.vence_parede }, dono: (tipo, e.id), camada: l.indice as i64, banda: None }),
        externa: false,
    }
}

/// O cortador de um piso ou de uma laje: uma peça por camada.
pub(crate) fn cortador_do_elemento(e: &crate::b1::ElementoResolvido) -> Cortador {
    Cortador { tipo: if e.laje { Tipo::Laje } else { Tipo::Piso }, pecas: e.camadas.iter().map(|l| peca_da_camada(e, l)).collect() }
}

/// `levelCutters(p, nivel)`: pisos e lajes camada a camada (`floorLayerPiece`, `slabLayerPiece`) e as faixas de parede do próprio nível.
fn cortadores_do_nivel(cena: &Cena, nivel: u32, tol: f64) -> Result<Rc<Cortadores>, u32> {
    let chave = (false, nivel, tol.to_bits(), cena.variante_efetiva());
    if let Some(c) = cena.cache_cortadores.borrow().get(&chave) {
        return Ok(Rc::clone(c));
    }
    let c = Rc::new(cortadores_do_nivel_sem_cache(cena, nivel, tol)?);
    cena.cache_cortadores.borrow_mut().insert(chave, Rc::clone(&c));
    Ok(c)
}

fn cortadores_do_nivel_sem_cache(cena: &Cena, nivel: u32, tol: f64) -> Result<Cortadores, u32> {
    let mut out = Cortadores::default();
    for e in calcular(cena, nivel, Some(tol))?.iter() {
        let c = cortador_do_elemento(e);
        if e.laje {
            out.lajes.push(c);
        } else {
            out.pisos.push(c);
        }
    }
    let pecas = if cena.b.faixas_juncao_definidas() { pecas_das_faixas_juntadas(cena, nivel)? } else { pecas_das_paredes(cena, nivel, tol)? };
    out.paredes.push(Cortador { tipo: Tipo::Parede, pecas });
    Ok(out)
}

/// Faixas de parede do nível vindas de `faixas_juncao` (saída 3 da 0050): a partição (z0, z1, topo) e a região de cada faixa como o TypeScript
/// as resolveu depois do perfil superior e do de base, na ordem da seção. Não há pontos de quebra nem perfil a recalcular aqui: a peça sai como
/// está, e só os recortes de piso e laje (`juncao_do_nivel`) são executados. Recusa (ENTRADA) faixa de parede inexistente, vértice de faixa que não
/// existe, polígono, anel ou índice com lacuna ou repetição, e vértice de região vazia.
fn pecas_das_faixas_juntadas(cena: &Cena, nivel: u32) -> Result<Vec<PecaSolida>, u32> {
    // Vértices de cada faixa: polígono -> anel -> (índice, ponto). Sem repetir índice e sem lacuna (0..n-1), em todos os níveis.
    let mut por_faixa: HashMap<u32, BTreeMap<u32, BTreeMap<u32, BTreeMap<u32, [f64; 2]>>>> = HashMap::new();
    for p in cena.b.pontos_faixas.values() {
        if !cena.b.faixas_juncao.contains_key(&p.faixa) {
            return Err(ENTRADA);
        }
        let anel = por_faixa.entry(p.faixa).or_default().entry(p.poligono).or_default().entry(p.anel).or_default();
        if anel.insert(p.indice, [p.x, p.y]).is_some() {
            return Err(ENTRADA);
        }
    }
    let mut pecas: Vec<PecaSolida> = Vec::new();
    for (id, f) in cena.b.faixas_juncao.iter().filter(|(_, f)| f.nivel == nivel) {
        if cena.paredes.obter(f.parede).is_none() {
            return Err(ENTRADA);
        }
        let mut poly: MultiPoligono = Vec::new();
        if let Some(poligonos) = por_faixa.get(id) {
            for (k, (pol, aneis)) in poligonos.iter().enumerate() {
                if *pol != k as u32 {
                    return Err(ENTRADA);
                }
                let mut forma = Vec::new();
                for (j, (anel, pts)) in aneis.iter().enumerate() {
                    if *anel != j as u32 || pts.is_empty() || pts.keys().enumerate().any(|(i, ix)| *ix != i as u32) {
                        return Err(ENTRADA);
                    }
                    forma.push(pts.values().copied().collect::<Vec<[f64; 2]>>());
                }
                poly.push(forma);
            }
        }
        // A região vem do TypeScript em ponto flutuante: à grade e em anéis simples, como a saída de qualquer operação do Rust.
        let poly = normalizar_na_grade(&poly, ESCALA_FINA)?;
        pecas.push(PecaSolida {
            poly,
            span: Span::Faixa { base_z: f.base_z, z0: f.z0, z1: f.z1, inclinacao: f.inclinacao },
            plana: f.inclinacao.is_none(),
            meta: Some(MetaDaPeca {
                juncao: MetaDeJuncao { tipo: Tipo::Parede, prioridade: f.prioridade, nucleo: f.nucleo, explicita: false, vence_parede: false },
                dono: (Tipo::Parede, f.parede),
                camada: i64::from(f.camada),
                banda: Some(f.banda),
            }),
            externa: false,
        });
    }
    Ok(pecas)
}

/// Os `nivel_num` da seção `niveis`, em ordem crescente (a ordem de `p.levels`).
fn niveis_do_projeto(cena: &Cena) -> Vec<u32> {
    let mut v: Vec<u32> = cena.b.niveis.values().map(|&(n, _)| n).collect();
    v.sort_unstable();
    v.dedup();
    v
}

/// `levelCutterSet`: os cortadores do nível mais os dos OUTROS níveis que tocam a faixa de cota dele (peças `external`).
pub fn conjunto_de_cortadores(cena: &Cena, nivel: u32, tol: f64) -> Result<Rc<Cortadores>, u32> {
    let chave = (true, nivel, tol.to_bits(), cena.variante_efetiva());
    if let Some(c) = cena.cache_cortadores.borrow().get(&chave) {
        return Ok(Rc::clone(c));
    }
    let c = Rc::new(conjunto_de_cortadores_sem_cache(cena, nivel, tol)?);
    cena.cache_cortadores.borrow_mut().insert(chave, Rc::clone(&c));
    Ok(c)
}

fn conjunto_de_cortadores_sem_cache(cena: &Cena, nivel: u32, tol: f64) -> Result<Cortadores, u32> {
    let proprio = cortadores_do_nivel(cena, nivel, tol)?;
    let faixas: Vec<(f64, f64)> = proprio.pisos.iter().chain(&proprio.lajes).chain(&proprio.paredes).flat_map(|c| c.pecas.iter()).filter_map(faixa_da_peca).collect();
    if faixas.is_empty() {
        return Ok((*proprio).clone());
    }
    let lo = faixas.iter().fold(f64::INFINITY, |m, r| m.min(r.0));
    let hi = faixas.iter().fold(f64::NEG_INFINITY, |m, r| m.max(r.1));
    let alcanca = |p: &PecaSolida| faixa_da_peca(p).is_some_and(|r| r.1 > lo + Z_EPS && r.0 < hi - Z_EPS);
    let mut out = (*proprio).clone();
    for outro in niveis_do_projeto(cena) {
        if outro == nivel {
            continue;
        }
        let c = cortadores_do_nivel(cena, outro, tol)?;
        let guarda = |solidos: &[Cortador]| -> Vec<Cortador> {
            solidos
                .iter()
                .map(|s| Cortador { tipo: s.tipo, pecas: s.pecas.iter().filter(|p| alcanca(p)).map(|p| PecaSolida { externa: true, ..p.clone() }).collect() })
                .filter(|s| !s.pecas.is_empty())
                .collect()
        };
        out.pisos.extend(guarda(&c.pisos));
        out.lajes.extend(guarda(&c.lajes));
        out.paredes.extend(guarda(&c.paredes));
    }
    Ok(out)
}

/// Partes de uma camada de elemento depois da junção.
#[derive(Clone, Debug)]
pub struct CamadaJuntada {
    pub camada: i64,
    pub partes: Vec<Prisma>,
}

/// `ElementJunction`.
#[derive(Clone, Debug)]
pub struct ElementoJuntado {
    pub dono: (Tipo, u32),
    pub corte: bool,
    pub camadas: Vec<CamadaJuntada>,
    pub regiao: MultiPoligono,
}

/// Uma faixa de parede depois da junção (a chave `camada/faixa`).
#[derive(Clone, Debug)]
pub struct FaixaJuntada {
    pub camada: i64,
    pub banda: u32,
    pub partes: Vec<Prisma>,
}

/// `WallJunction`.
#[derive(Clone, Debug)]
pub struct ParedeJuntada {
    pub parede: u32,
    pub corte: bool,
    pub faixas: Vec<FaixaJuntada>,
}

/// `JunctionLevel`.
#[derive(Clone, Debug, Default)]
pub struct Juncao {
    pub elementos: Vec<ElementoJuntado>,
    pub paredes: Vec<ParedeJuntada>,
}

/// `planarOf`: a faixa de cota é a envolvente dos vértices; membrana (espessura zero) e peça sem `meta` ficam de fora.
fn peca_plana(sp: &PecaSolida) -> Option<PecaRef<'_>> {
    let meta = sp.meta?;
    if sp.poly.is_empty() {
        return None;
    }
    let (z0, z1) = faixa_da_peca(sp).unwrap_or((f64::INFINITY, f64::NEG_INFINITY));
    if !(z1 - z0 > ESPESSURA_MINIMA) {
        return None;
    }
    Some(PecaRef { meta: MetaDeJuncao { ..meta.juncao }, poly: &sp.poly, z0, z1, dono: Some(meta.dono), externa: sp.externa })
}

fn volume_das_partes(partes: &[Prisma]) -> f64 {
    partes.iter().fold(0.0, |s, x| s + area_da_forma(&x.poly) * (x.z1 - x.z0))
}

/// `lostVolume`: a camada perdeu volume. Só conta como perda o que passa da resolução da grade sobre a área da faixa
/// (área × `Z_EPS`: uma camada de 1 µm); menos que isso é ruído de ponto flutuante, abaixo da resolução do próprio Rust.
fn perdeu_volume(t: &PecaRef, partes: &[Prisma]) -> bool {
    let area = area_da_forma(t.poly);
    (area * (t.z1 - t.z0) - volume_das_partes(partes)).abs() > area * Z_EPS
}

/// `junctionLevel`: a junção do nível a partir dos cortadores.
pub fn juncao_do_nivel(cortadores: &Cortadores) -> Result<Juncao, u32> {
    struct Marcada<'a> {
        peca: PecaRef<'a>,
        camada: i64,
        banda: Option<u32>,
        plana: bool,
    }
    let mut marcadas: Vec<Marcada> = Vec::new();
    for sp in cortadores.pisos.iter().chain(&cortadores.lajes).chain(&cortadores.paredes).flat_map(|c| c.pecas.iter()) {
        let Some(meta) = sp.meta else { continue };
        // Laje com caimento fica fora da junção: a faixa inclinada não se recorta por aproximação plana.
        if meta.juncao.tipo == Tipo::Laje && !sp.plana {
            continue;
        }
        let Some(peca) = peca_plana(sp) else { continue };
        marcadas.push(Marcada { peca, camada: meta.camada, banda: meta.banda, plana: sp.plana });
    }
    let resolvidas = resolver_juncao_ref(&marcadas.iter().map(|m| m.peca).collect::<Vec<_>>())?;
    let mut juncao = Juncao::default();
    let mut indice_el: HashMap<(Tipo, u32), usize> = HashMap::new();
    let mut indice_pa: HashMap<u32, usize> = HashMap::new();
    for (m, partes) in marcadas.iter().zip(resolvidas) {
        // Peça de outro nível só corta: não faz parte do desenho deste nível.
        if m.peca.externa {
            continue;
        }
        let intacta = !perdeu_volume(&m.peca, &partes);
        let dono = m.peca.dono.ok_or(ENTRADA)?;
        if m.peca.meta.tipo == Tipo::Parede {
            let k = *indice_pa.entry(dono.1).or_insert_with(|| {
                juncao.paredes.push(ParedeJuntada { parede: dono.1, corte: false, faixas: Vec::new() });
                juncao.paredes.len() - 1
            });
            if m.plana {
                let w = &mut juncao.paredes[k];
                if !intacta {
                    w.corte = true;
                }
                let banda = m.banda.unwrap_or(0);
                match w.faixas.iter_mut().find(|f| f.camada == m.camada && f.banda == banda) {
                    Some(f) => f.partes = partes,
                    None => w.faixas.push(FaixaJuntada { camada: m.camada, banda, partes }),
                }
            }
            continue;
        }
        let k = *indice_el.entry(dono).or_insert_with(|| {
            juncao.elementos.push(ElementoJuntado { dono, corte: false, camadas: Vec::new(), regiao: Vec::new() });
            juncao.elementos.len() - 1
        });
        let el = &mut juncao.elementos[k];
        if !intacta {
            el.corte = true;
        }
        el.camadas.push(CamadaJuntada { camada: m.camada, partes });
    }
    for el in juncao.elementos.iter_mut().filter(|e| e.corte) {
        let mut args: Vec<MultiPoligono> = Vec::new();
        for c in &el.camadas {
            for x in &c.partes {
                args.push(crate::b1::como_o_polygon_clipping(&x.poly)?);
            }
        }
        el.regiao = uniao_com_escala(&args, ESCALA_FINA)?;
    }
    Ok(juncao)
}

/// Executa `junction_nivel(nivel_num, tol_juncao)`.
pub fn junction_nivel(cena: &Cena, nivel: u32, tol: f64) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let cortadores = conjunto_de_cortadores(cena, nivel, tol)?;
    let juncao = juncao_do_nivel(&cortadores)?;
    codificar(&cortadores, &juncao)
}

fn codificar(c: &Cortadores, j: &Juncao) -> Result<Vec<Saida>, u32> {
    let mut cod = Codificador::default();
    let (mut cortadores, mut pecas, mut pecas_num) = (Vec::new(), Vec::new(), Vec::new());
    for s in c.pisos.iter().chain(&c.lajes).chain(&c.paredes) {
        cortadores.extend([s.tipo as u32, s.pecas.len() as u32, (pecas.len() / 11) as u32]);
        for p in &s.pecas {
            let (pi, pn) = cod.forma(&p.poly);
            let (tem_meta, kind, dono, explicita, nucleo) = match p.meta {
                Some(m) => (1, m.juncao.tipo as u32, m.dono.1, (m.juncao.explicita as u32 + m.juncao.vence_parede as u32), m.juncao.nucleo as u32),
                None => (0, 0, 0, 0, 0),
            };
            let (tem_banda, banda) = match p.meta.and_then(|m| m.banda) {
                Some(b) => (1, b),
                None => (0, 0),
            };
            pecas.extend([tem_meta, kind, dono, explicita, nucleo, p.externa as u32, p.plana as u32, tem_banda, banda, pi, pn]);
            let (camada, prioridade) = p.meta.map_or((0.0, 0.0), |m| (m.camada as f64, m.juncao.prioridade));
            let faixa = faixa_da_peca(p).unwrap_or((f64::INFINITY, f64::NEG_INFINITY));
            let mut v = [0.0f64; 16];
            v[0] = camada;
            v[1] = prioridade;
            match p.span.clone() {
                Span::Constante { z0, z1 } => {
                    v[3] = z0;
                    v[4] = z1;
                }
                Span::Laje { z0, z1, origem, direcao, percentual } => {
                    v[2] = 1.0;
                    v[3] = z0;
                    v[4] = z1;
                    v[6..10].copy_from_slice(&[origem[0], origem[1], direcao[0], direcao[1]]);
                    v[10] = percentual;
                }
                Span::Faixa { base_z, z0, z1, inclinacao } => {
                    v[2] = 2.0;
                    v[3] = z0;
                    v[4] = z1;
                    v[5] = base_z;
                    if let Some(s) = inclinacao {
                        v[6..16].copy_from_slice(&[s.o[0], s.o[1], s.d[0], s.d[1], s.t0, s.t1, s.h0, s.h1, 0.0, 0.0]);
                    }
                }
                // O formato de saída (esquema v11) não tem perfil por trechos; nenhuma consulta produz essa faixa ainda.
                Span::Perfil { .. } => return Err(ENTRADA),
            }
            v[14] = faixa.0;
            v[15] = faixa.1;
            pecas_num.extend(v);
        }
    }
    let (mut partes, mut partes_z) = (Vec::new(), Vec::new());
    let mut forma_de_partes = |lista: &[Prisma], cod: &mut Codificador| -> (u32, u32) {
        let ini = (partes.len() / 2) as u32;
        for x in lista {
            let (pi, pn) = cod.forma(&x.poly);
            partes.extend([pi, pn]);
            partes_z.extend([x.z0, x.z1]);
        }
        (ini, lista.len() as u32)
    };
    let (mut elementos, mut camadas, mut camadas_indice) = (Vec::new(), Vec::new(), Vec::new());
    for e in &j.elementos {
        let ini = (camadas.len() / 2) as u32;
        for l in &e.camadas {
            let (pi, pn) = forma_de_partes(&l.partes, &mut cod);
            camadas.extend([pi, pn]);
            camadas_indice.push(l.camada as f64);
        }
        let (ri, rn) = cod.forma(&e.regiao);
        elementos.extend([e.dono.0 as u32, e.dono.1, e.corte as u32, ini, e.camadas.len() as u32, ri, rn]);
    }
    let (mut paredes, mut faixas, mut faixas_camada) = (Vec::new(), Vec::new(), Vec::new());
    for w in &j.paredes {
        let ini = (faixas.len() / 3) as u32;
        for f in &w.faixas {
            let (pi, pn) = forma_de_partes(&f.partes, &mut cod);
            faixas.extend([pi, pn, f.banda]);
            faixas_camada.push(f.camada as f64);
        }
        paredes.extend([w.parede, w.corte as u32, ini, w.faixas.len() as u32]);
    }
    Ok(vec![
        Saida::U32(cortadores),
        Saida::U32(pecas),
        Saida::F64(pecas_num),
        Saida::U32(elementos),
        Saida::U32(camadas),
        Saida::F64(camadas_indice),
        Saida::U32(paredes),
        Saida::U32(faixas),
        Saida::F64(faixas_camada),
        Saida::U32(partes),
        Saida::F64(partes_z),
        Saida::U32(cod.poligonos),
        Saida::U32(cod.aneis),
        Saida::F64(cod.pontos),
    ])
}

#[cfg(test)]
pub(crate) mod testes {
    use super::*;
    use crate::a1::testes_util::{bytes_camadas as camadas_de_parede, bytes_paredes, bytes_quadros, bytes_tipos as tipos_de_parede, c32, c64, c8, f64s, tipo_simples, u32s, Par};
    use crate::b1::testes::{com_niveis, el, montar, simples, Cam, Montada};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_JUNCTION_NIVEL as Q, SECAO_CAMADAS, SECAO_FAIXAS_JUNCAO, SECAO_PAREDES, SECAO_PAREDES_QUADRO, SECAO_PAREDES_Z, SECAO_PAREDES_Z_JUNCAO, SECAO_PONTOS_FAIXAS_JUNCAO, SECAO_TIPOS_PAREDE};

    fn ret(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    fn meta(tipo: Tipo, prioridade: f64, nucleo: bool) -> MetaDeJuncao {
        MetaDeJuncao { tipo, prioridade, nucleo, explicita: false, vence_parede: false }
    }

    fn peca(tipo: Tipo, prioridade: f64, nucleo: bool, poly: MultiPoligono, z0: f64, z1: f64, dono: u32) -> PecaPlana {
        PecaPlana { meta: meta(tipo, prioridade, nucleo), poly, z0, z1, dono: Some((tipo, dono)), externa: false }
    }

    fn volume(partes: &[Prisma]) -> f64 {
        volume_das_partes(partes)
    }

    #[test]
    fn perda_de_volume_so_conta_acima_da_resolucao_da_grade() {
        // faixa plana de 4 x 0,2 m (área 0,8 m²): o limiar é 0,8 x 1e-6 = 8e-7 m³
        let t = peca(Tipo::Parede, 1.0, true, ret(0.0, 0.0, 4.0, 0.2), 0.0, 2.7, 1);
        let com_perda = |perda: f64| vec![Prisma { poly: t.poly.clone(), z0: t.z0, z1: t.z1 - perda / 0.8 }];
        assert!(!perdeu_volume(&t.como_ref(), &com_perda(1e-8)), "ruído de 1e-8 m³ está abaixo de área x Z_EPS: não é perda");
        assert!(perdeu_volume(&t.como_ref(), &com_perda(1e-3)), "perda real de 1e-3 m³ continua sendo perda");
    }

    #[test]
    fn vence_segue_a_ordem_nucleo_prioridade_tipo_e_explicita() {
        let m = meta;
        // núcleo: a camada de núcleo atravessa a de prioridade maior (número menor) fora do núcleo, em qualquer ordem dos tipos
        assert_eq!(vence(&m(Tipo::Parede, 3.0, true), &m(Tipo::Piso, 1.0, false)), Some(true));
        assert_eq!(vence(&m(Tipo::Piso, 1.0, false), &m(Tipo::Parede, 3.0, true)), Some(false));
        // fora desse caso (a de fora do núcleo tem prioridade pior), vale a prioridade
        assert_eq!(vence(&m(Tipo::Parede, 1.0, true), &m(Tipo::Piso, 3.0, false)), Some(true));
        // prioridade menor vence
        assert_eq!(vence(&m(Tipo::Piso, 1.0, true), &m(Tipo::Parede, 2.0, true)), Some(true));
        assert_eq!(vence(&m(Tipo::Piso, 3.0, false), &m(Tipo::Parede, 2.0, false)), Some(false));
        // empate: laje > piso > parede; mesmo tipo e mesma prioridade, ninguém vence
        assert_eq!(vence(&m(Tipo::Laje, 1.0, true), &m(Tipo::Piso, 1.0, true)), Some(true));
        assert_eq!(vence(&m(Tipo::Piso, 1.0, true), &m(Tipo::Laje, 1.0, true)), Some(false));
        assert_eq!(vence(&m(Tipo::Piso, 1.0, true), &m(Tipo::Parede, 1.0, true)), Some(true));
        assert_eq!(vence(&m(Tipo::Parede, 1.0, true), &m(Tipo::Parede, 1.0, true)), None);
        // explícita: nem corta nem é cortada por parede, mas corta piso e laje
        let explicita = MetaDeJuncao { explicita: true, ..m(Tipo::Piso, 1.0, true) };
        assert_eq!(vence(&explicita, &m(Tipo::Parede, 5.0, true)), None);
        assert_eq!(vence(&m(Tipo::Parede, 5.0, true), &explicita), None);
        assert_eq!(vence(&explicita, &m(Tipo::Piso, 5.0, true)), Some(true));
    }

    #[test]
    fn z_se_cruzam_exige_espessura_acima_de_1e_6() {
        assert!(z_se_cruzam((0.0, 1.0), (0.5, 2.0)));
        assert!(!z_se_cruzam((0.0, 1.0), (1.0, 2.0)), "faces que só se encostam");
        assert!(!z_se_cruzam((0.0, 1.0), (1.0 - 5e-7, 2.0)), "abaixo de 1e-6 não passa");
        assert!(z_se_cruzam((0.0, 1.0), (1.0 - 2e-6, 2.0)));
    }

    #[test]
    fn peca_sem_sobreposicao_fica_inteira_e_a_vencida_perde_a_regiao_comum_por_faixa() {
        let parede = peca(Tipo::Parede, 1.0, true, ret(0.0, 0.0, 4.0, 0.2), 0.0, 2.8, 1);
        let longe = peca(Tipo::Laje, 1.0, true, ret(10.0, 10.0, 12.0, 12.0), 2.6, 2.8, 2);
        let r = resolver_juncao(&[parede.clone(), longe]).expect("juncao");
        assert_eq!(r[0].len(), 1);
        assert_eq!((r[0][0].z0, r[0][0].z1), (0.0, 2.8));
        // laje sobre o meio da parede (x de 1 a 2), cota 2,6 a 2,8: a parede ganha 2 faixas, só a de cima perde a região comum
        let laje = peca(Tipo::Laje, 1.0, true, ret(1.0, -1.0, 2.0, 1.0), 2.6, 2.8, 2);
        let r = resolver_juncao(&[parede.clone(), laje.clone()]).expect("juncao");
        assert_eq!(r[0].len(), 2);
        assert_eq!((r[0][0].z0, r[0][0].z1), (0.0, 2.6));
        assert_eq!((r[0][1].z0, r[0][1].z1), (2.6, 2.8));
        assert!((area_da_forma(&r[0][0].poly) - 0.8).abs() < 1e-9);
        assert!((area_da_forma(&r[0][1].poly) - 0.6).abs() < 1e-9);
        // volume conservado: parede - (interseção em planta x sobreposição de cota)
        assert!((volume(&r[0]) - (0.8 * 2.8 - 0.2 * 0.2)).abs() < 1e-9);
        // a laje não é cortada pela parede (a laje vence)
        assert!((volume(&r[1]) - area_da_forma(&laje.poly) * 0.2).abs() < 1e-9);
        let mesma = PecaPlana { dono: parede.dono, ..laje.clone() };
        let r = resolver_juncao(&[parede, mesma]).expect("juncao");
        assert_eq!(r[0].len(), 1, "mesmo dono: nada corta");
    }

    #[test]
    fn peca_externa_so_corta_e_so_parede_com_piso_ou_laje() {
        let parede = peca(Tipo::Parede, 1.0, true, ret(0.0, 0.0, 4.0, 0.2), 0.0, 2.8, 1);
        let externa_laje = PecaPlana { externa: true, ..peca(Tipo::Laje, 1.0, true, ret(1.0, -1.0, 2.0, 1.0), 2.6, 2.8, 2) };
        let r = resolver_juncao(&[parede.clone(), externa_laje.clone()]).expect("juncao");
        assert_eq!(r[0].len(), 2, "a laje de outro nível corta a parede");
        assert!(r[1].is_empty(), "a peça externa sai vazia");
        // piso x laje externa: não se cortam entre níveis
        let piso = peca(Tipo::Piso, 5.0, false, ret(0.0, 0.0, 4.0, 4.0), 2.6, 2.8, 3);
        let r = resolver_juncao(&[piso, externa_laje]).expect("juncao");
        assert_eq!(r[0].len(), 1);
        assert_eq!(area_da_forma(&r[0][0].poly), 16.0);
        // parede externa x parede: não
        let externa_parede = PecaPlana { externa: true, ..parede.clone() };
        let outra = peca(Tipo::Parede, 1.0, true, ret(0.0, 0.0, 4.0, 0.2), 0.0, 2.8, 9);
        assert_eq!(resolver_juncao(&[outra, externa_parede]).expect("juncao")[0].len(), 1);
    }

    #[test]
    fn camada_totalmente_coberta_some() {
        let piso = peca(Tipo::Piso, 5.0, false, ret(0.0, 0.0, 2.0, 2.0), 0.0, 0.1, 1);
        let laje = peca(Tipo::Laje, 1.0, true, ret(-1.0, -1.0, 3.0, 3.0), 0.0, 0.1, 2);
        let r = resolver_juncao(&[piso, laje]).expect("juncao");
        assert!(r[0].is_empty(), "a laje cobre o piso inteiro: a camada perde tudo");
        assert_eq!(r[1].len(), 1);
    }

    // ---- cena: um nível com parede e piso, o de cima com laje que atravessa a parede ----

    pub(crate) fn com_paredes(m: &mut Montada, ps: &[Par]) {
        let n = ps.len() as u32;
        m.cena.definir_secao(SECAO_PAREDES, n, &bytes_paredes(ps)).expect("paredes");
        m.cena.definir_secao(SECAO_PAREDES_QUADRO, n, &bytes_quadros(ps)).expect("quadros");
        let ts = [tipo_simples()];
        m.cena.definir_secao(SECAO_TIPOS_PAREDE, 1, &tipos_de_parede(&ts)).expect("tipos");
        let (nc, bc) = camadas_de_parede(&ts);
        m.cena.definir_secao(SECAO_CAMADAS, nc, &bc).expect("camadas");
        let ids: Vec<u32> = ps.iter().map(|p| p.id).collect();
        let bz = [c32(&ids), c64(&ps.iter().map(|p| p.z0).collect::<Vec<_>>()), c64(&ps.iter().map(|p| p.topo - p.z0).collect::<Vec<_>>())].concat();
        m.cena.definir_secao(SECAO_PAREDES_Z, n, &bz).expect("paredes_z");
    }

    /// Nível 0 com a parede (x = 3, de y = -1 a 5, de 0 a 2,8 m) e um piso; nível 1 (cota 2,8) com uma laje de 6 x 4 (camada estrutural de 0,15 m).
    pub(crate) fn cena_de_dois_niveis() -> Montada {
        let mut piso = el(1);
        piso.cota = 0.0;
        let mut laje = el(1);
        laje.nivel = 1;
        laje.cota = 2.8;
        let anel = vec![[0.0, 0.0], [6.0, 0.0], [6.0, 4.0], [0.0, 4.0]];
        let est = vec![(0u8, 1u32, 0u32, 0u32, anel.clone()), (1u8, 1u32, 0u32, 0u32, anel)];
        let tp: Vec<Cam> = vec![simples(0.01, 4), simples(0.12, 0)];
        let tl: Vec<Cam> = vec![simples(0.15, 0)];
        let mut m = montar(&[piso], &tp, &[laje], &tl, &est, &[], &[]);
        com_paredes(&mut m, &[Par::nova(1, (3.0, -1.0), (3.0, 5.0))]);
        com_niveis(&mut m, &[(0, 0.0), (1, 2.8)]);
        m
    }

    fn consulta(m: &mut Montada, nivel: f64) -> Vec<Saida> {
        executar(&mut m.cena, Q, &[nivel, 0.02]).expect("junction_nivel")
    }

    fn area_do_poligono(s: &[Saida], ini: u32, n: u32) -> f64 {
        let (pol, aneis, pts) = (u32s(&s[11]), u32s(&s[12]), f64s(&s[13]));
        let forma: MultiPoligono = (ini..ini + n)
            .map(|p| {
                let (ai, an) = (pol[2 * p as usize], pol[2 * p as usize + 1]);
                (ai..ai + an)
                    .map(|a| {
                        let (pi, pn) = (aneis[2 * a as usize], aneis[2 * a as usize + 1]);
                        (pi..pi + pn).map(|q| [pts[2 * q as usize], pts[2 * q as usize + 1]]).collect()
                    })
                    .collect()
            })
            .collect();
        area_da_forma(&forma)
    }

    /// Volume das partes da faixa `k` de `faixas`.
    fn volume_da_faixa(s: &[Saida], k: usize) -> f64 {
        let (faixas, partes, pz) = (u32s(&s[7]), u32s(&s[9]), f64s(&s[10]));
        let (pi, pn) = (faixas[3 * k] as usize, faixas[3 * k + 1] as usize);
        (pi..pi + pn).map(|q| area_do_poligono(s, partes[2 * q], partes[2 * q + 1]) * (pz[2 * q + 1] - pz[2 * q])).sum()
    }

    #[test]
    fn laje_do_nivel_de_cima_corta_a_parede_do_nivel_de_baixo_e_o_volume_se_conserva() {
        let mut m = cena_de_dois_niveis();
        let s = consulta(&mut m, 0.0);
        // cortadores: 1 piso (2 camadas), 1 laje (a de cima, externa, 1 camada) e 1 cortador de parede (o do próprio nível, sempre um só)
        let cort = u32s(&s[0]);
        assert_eq!(cort.chunks(3).map(|c| (c[0], c[1])).collect::<Vec<_>>(), [(1, 2), (2, 1), (0, 1)]);
        let pecas = u32s(&s[1]);
        let externas: Vec<u32> = pecas.chunks(11).map(|c| c[5]).collect();
        assert_eq!(externas, [0, 0, 1, 0], "só a camada da laje de cima é externa");
        // a parede: uma faixa, recortada (cut) pela laje: perde 0,2 x 4 x 0,15 m3
        let par = u32s(&s[6]);
        assert_eq!(par, [1, 1, 0, 1]);
        let esperado = 0.2 * 6.0 * 2.8 - 0.2 * 4.0 * 0.15;
        assert!((volume_da_faixa(&s, 0) - esperado).abs() < 1e-9, "volume {} em vez de {esperado}", volume_da_faixa(&s, 0));
        // a laje externa não aparece nos elementos da junção; o piso sim, intacto (não cortado)
        let el = u32s(&s[3]);
        assert_eq!(el.chunks(7).map(|c| (c[0], c[1], c[2])).collect::<Vec<_>>(), [(1, 1, 0)]);
    }

    #[test]
    fn o_nivel_de_cima_enxerga_a_parede_de_baixo_como_externa() {
        let mut m = cena_de_dois_niveis();
        let s = consulta(&mut m, 1.0);
        // nível 1: a laje é do próprio nível; a parede do nível 0 (0 a 2,8) alcança a faixa da laje (2,65 a 2,8): cortador de parede externo
        let pecas = u32s(&s[1]);
        assert!(pecas.chunks(11).any(|c| c[1] == 0 && c[5] == 1), "parede de baixo entra como externa");
        // a laje vence a parede (empate de prioridade, tipo laje > parede): a laje não perde nada e não está cortada
        let el = u32s(&s[3]);
        assert_eq!(el.chunks(7).map(|c| (c[0], c[1], c[2])).collect::<Vec<_>>(), [(2, 1, 0)]);
        // sem a seção niveis o nível de cima fica sozinho (só as peças do próprio nível)
        m.cena.remover(crate::esquema::SECAO_NIVEIS, &[1, 2]).expect("remover");
        let sozinho = consulta(&mut m, 1.0);
        assert!(u32s(&sozinho[1]).chunks(11).all(|c| c[5] == 0));
    }

    #[test]
    fn variante_da_juncao_troca_a_cota_da_parede_so_na_consulta_e_nao_vaza() {
        let mut m = cena_de_dois_niveis();
        // parede de 0 a 2,0 m na variante da junção: não chega à laje (2,65), então a parede fica intacta
        let bz = [c32(&[1]), c64(&[0.0]), c64(&[2.0])].concat();
        m.cena.definir_secao(SECAO_PAREDES_Z_JUNCAO, 1, &bz).expect("variante");
        let s = consulta(&mut m, 0.0);
        assert_eq!(u32s(&s[6]), [1, 0, 0, 1], "sem corte");
        assert!((volume_da_faixa(&s, 0) - 0.2 * 6.0 * 2.0).abs() < 1e-9);
        assert!(!m.cena.variante_juncao.get(), "a variante é desligada ao sair");
        // sem a variante a parede tem 2,8 m e a laje a corta
        let mut m2 = cena_de_dois_niveis();
        let sem = consulta(&mut m2, 0.0);
        assert_eq!(u32s(&sem[6]), [1, 1, 0, 1]);
        // remover a variante devolve o resultado original
        m.cena.remover(SECAO_PAREDES_Z_JUNCAO, &[1]).expect("remover");
        assert_eq!(consulta(&mut m, 0.0), sem);
    }

    /// Bytes de `faixas_juncao` e `pontos_faixas_juncao` para faixas planas da parede (camada 0, prioridade 1 = `PRIORIDADE_DA_FUNCAO` da estrutura, base 0): `linhas` é
    /// (nível, parede, z0, z1, região). `nucleo` e `inclinada` vão como estão (para os testes de erro); a inclinação, quando há, é o plano
    /// `h = z1 * (x - o_x)` com `t0`/`t1` dados.
    fn bytes_faixas(linhas: &[(u32, u32, f64, f64, MultiPoligono)], nucleo: u8, inclinada: u8, t1: f64) -> [(u32, Vec<u8>); 2] {
        let n = linhas.len();
        let ids: Vec<u32> = (1..=n as u32).collect();
        let nivel: Vec<u32> = linhas.iter().map(|l| l.0).collect();
        let parede: Vec<u32> = linhas.iter().map(|l| l.1).collect();
        let z0: Vec<f64> = linhas.iter().map(|l| l.2).collect();
        let z1: Vec<f64> = linhas.iter().map(|l| l.3).collect();
        let zeros = vec![0.0f64; n];
        let faixas = [
            c32(&ids),
            c32(&nivel),
            c32(&parede),
            c32(&vec![0u32; n]),
            c32(&vec![0u32; n]),
            c64(&vec![1.0f64; n]),
            c8(&vec![nucleo; n]),
            c64(&zeros),
            c64(&z0),
            c64(&z1),
            c8(&vec![inclinada; n]),
            c64(&zeros),
            c64(&zeros),
            c64(&vec![1.0f64; n]),
            c64(&zeros),
            c64(&zeros),
            c64(&vec![t1; n]),
            c64(&zeros),
            c64(&vec![1.0f64; n]),
        ]
        .concat();
        let (mut pid, mut faixa, mut poli, mut anel, mut ind, mut x, mut y) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
        let mut k = 0u32;
        for (f, l) in linhas.iter().enumerate() {
            for (pi, p) in l.4.iter().enumerate() {
                for (ai, a) in p.iter().enumerate() {
                    for (ii, q) in a.iter().enumerate() {
                        k += 1;
                        pid.push(k);
                        faixa.push(f as u32 + 1);
                        poli.push(pi as u32);
                        anel.push(ai as u32);
                        ind.push(ii as u32);
                        x.push(q[0]);
                        y.push(q[1]);
                    }
                }
            }
        }
        let pontos = [c32(&pid), c32(&faixa), c32(&poli), c32(&anel), c32(&ind), c64(&x), c64(&y)].concat();
        [(n as u32, faixas), (k, pontos)]
    }

    /// Define as duas seções de faixas na cena (uma carga completa, como o adaptador TypeScript manda).
    fn com_faixas(m: &mut Montada, linhas: &[(u32, u32, f64, f64, MultiPoligono)]) {
        for (secao, (n, bytes)) in [(SECAO_FAIXAS_JUNCAO, bytes_faixas(linhas, 1, 0, 1.0)[0].clone()), (SECAO_PONTOS_FAIXAS_JUNCAO, bytes_faixas(linhas, 1, 0, 1.0)[1].clone())] {
            m.cena.definir_secao(secao, n, &bytes).expect("faixas_juncao");
        }
    }

    #[test]
    fn faixas_juncao_definem_a_particao_da_parede_no_lugar_do_calculo_do_rust() {
        // a parede 1 (x de 2,9 a 3,1; de y = -1 a 5; de 0 a 2,8 m) como o TS a devolveria no fixture: uma faixa só, de 0 a 2,8 m
        let mut m = cena_de_dois_niveis();
        com_faixas(&mut m, &[(0, 1, 0.0, 2.8, ret(2.9, -1.0, 3.1, 5.0))]);
        let s = consulta(&mut m, 0.0);
        assert_eq!(u32s(&s[6]), [1, 1, 0, 1], "a laje de cima corta a faixa");
        assert!((volume_da_faixa(&s, 0) - (0.2 * 6.0 * 2.8 - 0.2 * 4.0 * 0.15)).abs() < 1e-9);
        // a seção manda: uma faixa de 0 a 2,0 m não chega à laje (2,65 m), mesmo com a parede de 2,8 m no cálculo do Rust
        let mut m2 = cena_de_dois_niveis();
        com_faixas(&mut m2, &[(0, 1, 0.0, 2.0, ret(2.9, -1.0, 3.1, 5.0))]);
        let s2 = consulta(&mut m2, 0.0);
        assert_eq!(u32s(&s2[6]), [1, 0, 0, 1], "sem corte: a faixa define a partição");
        assert!((volume_da_faixa(&s2, 0) - 0.2 * 6.0 * 2.0).abs() < 1e-9);
        // a faixa com o nível de outro pavimento não entra no cortador deste nível
        let s3 = consulta(&mut m, 1.0);
        assert!(u32s(&s3[1]).chunks(11).any(|c| c[1] == 0 && c[5] == 1), "a faixa de nível 0 vira cortador externo no nível 1");
    }

    #[test]
    fn faixas_juncao_vazia_ou_removida_vale_o_calculo_anterior() {
        let mut m = cena_de_dois_niveis();
        let sem = consulta(&mut m, 0.0);
        com_faixas(&mut m, &[]);
        assert_eq!(consulta(&mut m, 0.0), sem, "sem linhas a seção não manda: vale o cálculo anterior");
        com_faixas(&mut m, &[(0, 1, 0.0, 2.0, ret(2.9, -1.0, 3.1, 5.0))]);
        assert_ne!(consulta(&mut m, 0.0), sem, "com a faixa, a seção manda");
        m.cena.remover(SECAO_FAIXAS_JUNCAO, &[1]).expect("remover faixa");
        m.cena.remover(SECAO_PONTOS_FAIXAS_JUNCAO, &[1, 2, 3, 4]).expect("remover pontos");
        assert_eq!(consulta(&mut m, 0.0), sem, "removidas as linhas, volta ao cálculo anterior");
    }

    /// Algum anel da saída repete vértice fora de sequência (critério do invariante I3 do teste de TS: repetições seguidas e o fechamento são aresta
    /// de comprimento zero; fora isso, dois vértices no mesmo ponto a 1e-9 m).
    fn algum_anel_toca_a_si_mesmo(s: &[Saida]) -> bool {
        let (aneis, pts) = (u32s(&s[12]), f64s(&s[13]));
        (0..aneis.len() / 2).any(|a| {
            let (pi, pn) = (aneis[2 * a] as usize, aneis[2 * a + 1] as usize);
            let mut c: Vec<[f64; 2]> = Vec::new();
            for q in pi..pi + pn {
                let p = [pts[2 * q], pts[2 * q + 1]];
                if c.last().map_or(true, |u| (p[0] - u[0]).hypot(p[1] - u[1]) > 1e-12) {
                    c.push(p);
                }
            }
            while c.len() > 1 && (c[0][0] - c[c.len() - 1][0]).hypot(c[0][1] - c[c.len() - 1][1]) <= 1e-12 {
                c.pop();
            }
            let mut chaves: Vec<(i64, i64)> = c.iter().map(|p| ((p[0] * 1e9).round() as i64, (p[1] * 1e9).round() as i64)).collect();
            chaves.sort_unstable();
            chaves.dedup();
            chaves.len() != c.len()
        })
    }

    #[test]
    fn faixa_de_juncao_com_vertices_a_menos_de_1e_9_nao_sai_com_anel_que_toca_a_si_mesmo() {
        // A faixa chega do TypeScript com dois vértices a 3e-10 m um do outro (o mesmo ponto na grade de 1e-9 m): o anel tocaria a si mesmo.
        // Sem corte (faixa de 0 a 2 m, abaixo da laje) a parte sai da própria peça, sem passar por booleana, e com corte passa pela diferença.
        for topo in [2.0, 2.8] {
            let mut m = cena_de_dois_niveis();
            let anel = vec![[2.9, -1.0], [2.9 + 3e-10, -1.0], [3.1, -1.0], [3.1, 5.0], [2.9, 5.0]];
            com_faixas(&mut m, &[(0, 1, 0.0, topo, vec![vec![anel]])]);
            let s = consulta(&mut m, 0.0);
            assert!(!algum_anel_toca_a_si_mesmo(&s), "topo {topo}: anel que toca a si mesmo na saída");
            assert!(volume_da_faixa(&s, 0) > 0.0, "topo {topo}: a faixa não pode sumir");
        }
    }

    #[test]
    fn faixas_juncao_inconsistentes_viram_entrada_na_consulta() {
        let linhas = [(0u32, 1u32, 0.0, 2.0, ret(2.9, -1.0, 3.1, 5.0))];
        // parede que não existe na cena
        let mut m = cena_de_dois_niveis();
        com_faixas(&mut m, &[(0, 99, 0.0, 2.0, ret(2.9, -1.0, 3.1, 5.0))]);
        assert_eq!(executar(&mut m.cena, Q, &[0.0, 0.02]).err(), Some(ENTRADA), "parede inexistente");
        // lacuna de índice: o vértice de índice 1 some (ids dos pontos são 1..4, na ordem do anel)
        let mut m = cena_de_dois_niveis();
        com_faixas(&mut m, &linhas);
        m.cena.remover(SECAO_PONTOS_FAIXAS_JUNCAO, &[2]).expect("remover vértice");
        assert_eq!(executar(&mut m.cena, Q, &[0.0, 0.02]).err(), Some(ENTRADA), "lacuna de índice");
        // faixa órfã: os vértices da faixa 1 ficam sem faixa; a faixa 2 mantém a seção no modo novo
        let mut m = cena_de_dois_niveis();
        com_faixas(&mut m, &[linhas[0].clone(), (0, 1, 0.0, 1.0, ret(2.9, -1.0, 3.1, 5.0))]);
        m.cena.remover(SECAO_FAIXAS_JUNCAO, &[1]).expect("remover faixa");
        assert_eq!(executar(&mut m.cena, Q, &[0.0, 0.02]).err(), Some(ENTRADA), "vértice de faixa inexistente");
    }

    #[test]
    fn faixas_juncao_com_valores_fora_do_contrato_viram_entrada() {
        let linhas = [(0u32, 1u32, 0.0, 2.8, ret(2.9, -1.0, 3.1, 5.0))];
        let mut m = cena_de_dois_niveis();
        let [(n, f), (np, p)] = bytes_faixas(&linhas, 2, 0, 1.0);
        assert_eq!(m.cena.definir_secao(SECAO_FAIXAS_JUNCAO, n, &f), Err(ENTRADA), "núcleo fora de 0/1");
        let [(n, f), _] = bytes_faixas(&linhas, 1, 1, 0.0);
        assert_eq!(m.cena.definir_secao(SECAO_FAIXAS_JUNCAO, n, &f), Err(ENTRADA), "topo inclinado com t0 = t1");
        let [(n, f), (_, _)] = bytes_faixas(&linhas, 1, 0, 1.0);
        m.cena.definir_secao(SECAO_FAIXAS_JUNCAO, n, &f).expect("faixas válidas");
        let mut pontos_ruins = p.clone();
        // 5 colunas u32 (20 bytes por vértice) e depois x: o primeiro x começa em 20 * k
        let x_ini = 20 * (p.len() / 36);
        pontos_ruins[x_ini..x_ini + 8].copy_from_slice(&f64::NAN.to_le_bytes());
        assert_eq!(m.cena.definir_secao(SECAO_PONTOS_FAIXAS_JUNCAO, np, &pontos_ruins), Err(ENTRADA), "vértice não finito");
        assert_eq!(m.cena.definir_secao(SECAO_PONTOS_FAIXAS_JUNCAO, np, &p[..p.len() - 1]), Err(ENTRADA), "coluna curta");
    }

    #[test]
    fn entradas_invalidas_e_saida_deterministica() {
        let mut m = cena_de_dois_niveis();
        assert_eq!(executar(&mut m.cena, Q, &[f64::from(u32::MAX), 0.02]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut m.cena, Q, &[0.0, -0.01]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut m.cena, Q, &[0.0, f64::NAN]).err(), Some(ENTRADA));
        let a = consulta(&mut m, 0.0);
        assert_eq!(a, consulta(&mut m, 0.0));
        // nível sem nada: só o cortador de parede, vazio
        let s = consulta(&mut m, 7.0);
        assert_eq!(u32s(&s[0]), [0, 0, 0]);
    }

    /// Cena de estresse da junção: grade de salas com paredes altas, pisos e lajes que as cortam, peças de outros níveis e lajes parciais.
    fn cena_de_estresse(n: usize) -> Vec<PecaPlana> {
        let mut r = crate::teste_util::Xorshift::novo(7);
        let mut v: Vec<PecaPlana> = Vec::new();
        let mut dono = 0u32;
        let lado = 4.0;
        // Parede = 4 camadas (tiras de 5 cm) x 3 faixas de cota, como as paredes reais por camada e faixa.
        let parede = |v: &mut Vec<PecaPlana>, r: &mut crate::teste_util::Xorshift, dono: &mut u32, horizontal: bool, a: f64, b: f64| {
            *dono += 1;
            let h = 2.6 + (r.proximo() % 3) as f64 * 0.1;
            let prio = 1.0 + (r.proximo() % 3) as f64;
            for camada in 0..4 {
                let (e0, e1) = (a - 0.1 + camada as f64 * 0.05, a - 0.05 + camada as f64 * 0.05);
                let poly = if horizontal { ret(b, e0, b + lado, e1) } else { ret(e0, b, e1, b + lado) };
                for (z0, z1) in [(0.0, 1.0), (1.0, 2.0), (2.0, h)] {
                    v.push(peca(Tipo::Parede, prio + camada as f64 * 0.5, camada == 1, poly.clone(), z0, z1, *dono));
                }
            }
        };
        for i in 0..=n {
            for j in 0..n {
                let (a, b) = (i as f64 * lado, j as f64 * lado);
                parede(&mut v, &mut r, &mut dono, false, a, b);
                parede(&mut v, &mut r, &mut dono, true, a, b);
            }
        }
        for i in 0..n {
            for j in 0..n {
                let (a, b) = (i as f64 * lado, j as f64 * lado);
                dono += 1;
                for k in 0..4 {
                    let z = k as f64 * 0.025;
                    v.push(peca(Tipo::Piso, 2.0 + k as f64, k == 0, ret(a + 0.05, b + 0.05, a + lado - 0.05, b + lado - 0.05), z, z + 0.025, dono));
                }
                dono += 1;
                for k in 0..3 {
                    let z = 2.8 + k as f64 * 0.05;
                    v.push(peca(Tipo::Laje, 1.0 + k as f64, k == 1, ret(a - 0.3, b - 0.3, a + lado + 0.3, b + lado + 0.3), z, z + 0.05, dono));
                }
                if (i + j) % 3 == 0 {
                    dono += 1;
                    v.push(PecaPlana { externa: true, ..peca(Tipo::Laje, 1.0, false, ret(a + 1.0, b + 1.0, a + 2.5, b + 2.5), 2.5, 2.9, dono) });
                }
            }
        }
        v
    }

    fn resumo_bitwise(r: &[Vec<Prisma>]) -> u64 {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        let mut mistura = |x: u64| {
            h ^= x;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        };
        for partes in r {
            mistura(partes.len() as u64);
            for p in partes {
                mistura(p.z0.to_bits());
                mistura(p.z1.to_bits());
                for poli in &p.poly {
                    mistura(poli.len() as u64);
                    for anel in poli {
                        mistura(anel.len() as u64);
                        for q in anel {
                            mistura(q[0].to_bits());
                            mistura(q[1].to_bits());
                        }
                    }
                }
            }
        }
        h
    }

    /// Micro-benchmark da junção (`cargo test --release bench_resolver_juncao -- --ignored --nocapture`). `B3_BENCH_N` (lado da grade, padrão 12) e
    /// `B3_BENCH_RODADAS` (padrão 7). Imprime a mediana e o resumo bit a bit da saída, para comparar versões.
    #[test]
    #[ignore]
    fn bench_resolver_juncao() {
        let n: usize = std::env::var("B3_BENCH_N").ok().and_then(|s| s.parse().ok()).unwrap_or(12);
        let rodadas: usize = std::env::var("B3_BENCH_RODADAS").ok().and_then(|s| s.parse().ok()).unwrap_or(7);
        let pecas = cena_de_estresse(n);
        let mut tempos: Vec<f64> = Vec::new();
        let mut hash = 0;
        for _ in 0..rodadas {
            let t0 = std::time::Instant::now();
            let r = resolver_juncao(&pecas).expect("juncao");
            tempos.push(t0.elapsed().as_secs_f64() * 1000.0);
            hash = resumo_bitwise(&r);
        }
        tempos.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!("BENCH pecas={} mediana_ms={:.2} min_ms={:.2} hash={:016x}", pecas.len(), tempos[tempos.len() / 2], tempos[0], hash);
    }
}
