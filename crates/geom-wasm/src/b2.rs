//! Sub-etapa B2 da fatia B (decisão 0050 §3): a zona bloqueada de cada parede para o término por camada (`terminoBlock.ts`) e as paredes
//! resolvidas do nível que `layerOutlines` consulta (`wallsOfLevel`).
//!
//! `wallsOfLevel` é `resolveLevel(p, nivel, undefined, { flatAttach: true })`: aqui é `resolver_nivel` (A3d) sobre as seções de parede da cena,
//! sem corte, sem paredes de contorno e com todas as aberturas furando a planta. O `flatAttach` só muda as cotas de `paredes_z` (o JS as monta
//! com a cota do término por camada); o Rust usa as que recebeu. Nenhuma ida e volta ao JS: quadros, itens, camadas (`raw`, núcleo, prioridade) e
//! portas (`aberturas_do_nivel`) vêm da cena.
//!
//! O que se porta de `terminoBlock.ts`: `blockedLayerIndexes` (os índices são os da lista de camadas RESOLVIDAS da parede, não o `layerIndex`),
//! `wallBlockedZone`, `doorRectsReaching` (retângulo do vão da porta, largura x espessura + 5 mm por face, só portas cuja soleira chega ao topo
//! da camada, com `Z_TOL`), `wallZoneAt`, `wallTouchesZone` (faixa REAL da parede, ± `Z_TOL`, e por trecho do eixo quando há perfil: decisão 0054),
//! `regionMinusWalls` e `regionPlusWalls`, mais o término por camada da parede (`regionCamada`, decisão 0054).
//! Escala das booleanas: 1 nm (`ESCALA_FINA`), como o corte dos furos da B1 (o `polygon-clipping` do TS não quantiza).

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::a3::aberturas_do_nivel;
use crate::a3d::{perfis_por_parede, Perfil};
use crate::b1::como_o_polygon_clipping;
use crate::cena::Cena;
use crate::esquema::ENTRADA;
use crate::ops::{diferenca_com_escala, interseccao_com_escala, uniao_com_escala, ESCALA_FINA};
use crate::pintor::area_do_poligono;
use crate::quadro::{para_local, ponto_em, s_na_profundidade, Quadro};
use crate::{Anel, MultiPoligono};

/// Tolerância (m) para cotas: parede que encosta na camada conta como tocando (decisão 0025). `Z_TOL` de `terminoBlock.ts`.
pub const Z_TOL: f64 = 1e-3;

/// Margem (m) de cada face do retângulo do vão de porta (`doorRect`: `thickness / 2 + 0.005`).
const MARGEM_DA_PORTA: f64 = 0.005;

/// `BlockRule`: a regra de parede que define a zona bloqueada (o `passa` não tem zona).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Regra {
    Face,
    Nucleo,
    /// `{ kind: 'ate', prioridade }`.
    Ate(f64),
}

impl Regra {
    fn chave(&self) -> (u8, u64) {
        match self {
            Regra::Face => (0, 0),
            Regra::Nucleo => (1, 0),
            Regra::Ate(p) => (2, p.to_bits()),
        }
    }
}

/// Uma camada RESOLVIDA da parede (`ResolvedLayer`): só o que o término lê.
pub struct CamadaDaParede {
    pub nucleo: bool,
    pub prioridade: f64,
    /// `raw`: a forma do item da camada.
    pub bruta: MultiPoligono,
}

/// Porta da parede (`kind === 'door'`): a soleira e o retângulo do vão em planta.
pub struct Porta {
    pub peitoril: f64,
    pub retangulo: MultiPoligono,
}

/// `ResolvedWall`, só com o que `terminoBlock.ts` lê.
pub struct ParedeDoNivel {
    pub base_z: f64,
    /// `ResolvedWall.height`: a altura máxima (a cota real, com o anexo de topo e de base já aplicado).
    pub altura: f64,
    /// O quadro da parede (`WallFrame`): eixo, normal, arco e o tipo (função e posição de cada camada).
    pub quadro: Quadro,
    /// Perfil de topo (`profileTop`, ou o `topProfile` do modelo) e de base (`profileBottom`), relativos a `base_z`; só em parede reta com ao menos 2 pontos.
    pub perfil_topo: Option<Perfil>,
    pub perfil_base: Option<Perfil>,
    pub camadas: Vec<CamadaDaParede>,
    pub portas: Vec<Porta>,
    /// Zona bloqueada por regra (a união das camadas bloqueadas, sem portas): não depende da cota da camada.
    zonas: RefCell<HashMap<(u8, u64), Rc<MultiPoligono>>>,
}

/// Alcance (m) dos cantos da faixa de um trecho de perfil, para os dois lados do eixo (`ALCANCE_TRECHO`).
const ALCANCE_TRECHO: f64 = 100.0;

/// `alturaDoPerfil`: interpola o perfil (pares `(t, h)`) em `t`; `dir` escolhe o valor à direita ou à esquerda de um degrau.
fn altura_do_perfil(pts: &[(f64, f64)], t: f64, dir: bool) -> f64 {
    let n = pts.len();
    for i in 0..n - 1 {
        let (a, b) = (pts[i], pts[i + 1]);
        let dentro = if dir { a.0 <= t && t < b.0 } else { a.0 < t && t <= b.0 };
        if !dentro {
            continue;
        }
        return a.1 + ((b.1 - a.1) * (t - a.0)) / (b.0 - a.0);
    }
    if t <= pts[0].0 {
        pts[0].1
    } else {
        pts[n - 1].1
    }
}

impl ParedeDoNivel {
    #[allow(clippy::too_many_arguments)]
    pub fn nova(base_z: f64, altura: f64, quadro: Quadro, perfil_topo: Option<Perfil>, perfil_base: Option<Perfil>, camadas: Vec<CamadaDaParede>, portas: Vec<Porta>) -> ParedeDoNivel {
        ParedeDoNivel { base_z, altura, quadro, perfil_topo, perfil_base, camadas, portas, zonas: RefCell::new(HashMap::new()) }
    }

    /// `wallTouchesZone(rw, z0, z1)`: a faixa REAL da parede (base até base mais altura), com `Z_TOL`.
    pub fn toca(&self, z0: f64, z1: f64) -> bool {
        self.base_z <= z1 + Z_TOL && self.base_z + self.altura >= z0 - Z_TOL
    }

    /// `trechosReais(p, rw, z0, z1)`: `None` = a parede inteira toca; `Some(vazio)` = não toca; senão os trechos do eixo em que a parede real toca a
    /// faixa (perfil de topo e de base, linear entre os pontos).
    pub fn trechos_reais(&self, z0: f64, z1: f64) -> Option<Vec<(f64, f64)>> {
        let alto = self.base_z + self.altura;
        if !(self.base_z <= z1 + Z_TOL && alto >= z0 - Z_TOL) {
            return Some(Vec::new());
        }
        let (topo, base) = (self.perfil_topo.as_deref(), self.perfil_base.as_deref());
        if topo.is_none() && base.is_none() {
            return None;
        }
        let l = self.quadro.length;
        let mut cortes: Vec<f64> = vec![0.0, l];
        for q in topo.into_iter().flatten().chain(base.into_iter().flatten()) {
            if q.0 > 0.0 && q.0 < l {
                cortes.push(q.0);
            }
        }
        cortes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        cortes.dedup();
        let topo_em = |t: f64, dir: bool| -> f64 { topo.map(|p| self.base_z + altura_do_perfil(p, t, dir)).unwrap_or(alto) };
        let base_em = |t: f64, dir: bool| -> f64 { base.map(|p| self.base_z + altura_do_perfil(p, t, dir)).unwrap_or(self.base_z) };
        let mut out: Vec<(f64, f64)> = Vec::new();
        for k in 0..cortes.len() - 1 {
            let (ta, tb) = (cortes[k], cortes[k + 1]);
            let (mut l0, mut l1) = (0.0f64, 1.0f64);
            let mut vazio = false;
            let mut restringe = |a: f64, b: f64, c: f64, maior: bool| {
                if b == a {
                    let ok = if maior { a >= c } else { a <= c };
                    if !ok {
                        vazio = true;
                    }
                    return;
                }
                let raiz = (c - a) / (b - a);
                if (b > a) == maior {
                    l0 = l0.max(raiz);
                } else {
                    l1 = l1.min(raiz);
                }
            };
            restringe(topo_em(ta, true), topo_em(tb, false), z0 - Z_TOL, true);
            restringe(base_em(ta, true), base_em(tb, false), z1 + Z_TOL, false);
            if vazio || l0 > l1 {
                continue;
            }
            let t0 = if l0 == 0.0 { ta } else { ta + (tb - ta) * l0 };
            let t1 = if l1 == 1.0 { tb } else { ta + (tb - ta) * l1 };
            if t1 <= t0 {
                continue;
            }
            match out.last_mut() {
                Some(u) if u.1 >= t0 => u.1 = t1,
                _ => out.push((t0, t1)),
            }
        }
        if out.len() == 1 && out[0].0 <= 0.0 && out[0].1 >= l {
            return None;
        }
        Some(out)
    }

    /// `restringirAosTrechos(rw, zona, trechos)`: a zona só nos trechos do eixo em que a parede real toca a camada (`None` = a parede inteira).
    pub fn restringir(&self, zona: &MultiPoligono, trechos: &Option<Vec<(f64, f64)>>) -> Result<MultiPoligono, u32> {
        let Some(t) = trechos else { return Ok(zona.clone()) };
        if zona.is_empty() {
            return Ok(zona.clone());
        }
        let (a, u, n) = (self.quadro.a, self.quadro.u, self.quadro.n);
        let em = |t: f64, s: f64| -> [f64; 2] { [a.x + u.x * t + n.x * s, a.y + u.y * t + n.y * s] };
        let faixas: MultiPoligono = t.iter().map(|&(t0, t1)| vec![vec![em(t0, -ALCANCE_TRECHO), em(t1, -ALCANCE_TRECHO), em(t1, ALCANCE_TRECHO), em(t0, ALCANCE_TRECHO)]]).collect();
        interseccao_com_escala(zona, &faixas, ESCALA_FINA)
    }

    /// `doorRectsReaching(p, rw, z1)`: os vãos de porta cuja soleira chega ao topo `z1` da camada.
    fn portas_ate(&self, z1: f64) -> Vec<MultiPoligono> {
        self.portas.iter().filter(|p| !(self.base_z + p.peitoril > z1 + Z_TOL)).map(|p| p.retangulo.clone()).collect()
    }

    /// `blockedLayerIndexes(rw, rule)`: faixa contígua entre o menor e o maior índice no caso `ate`.
    pub fn indices_bloqueados(&self, regra: Regra) -> Vec<usize> {
        let todos = 0..self.camadas.len();
        match regra {
            Regra::Face => todos.collect(),
            Regra::Nucleo => todos.filter(|&i| self.camadas[i].nucleo).collect(),
            Regra::Ate(prioridade) => {
                let acertos: Vec<usize> = todos.clone().filter(|&i| self.camadas[i].prioridade <= prioridade).collect();
                let (Some(&menor), Some(&maior)) = (acertos.first(), acertos.last()) else { return Vec::new() };
                todos.filter(|&i| i >= menor && i <= maior).collect()
            }
        }
    }

    /// `wallBlockedZone(rw, rule)`: a pegada da zona bloqueada, sem vãos de porta. Vazia para parede passa.
    pub fn zona_bloqueada(&self, regra: Regra) -> Result<Rc<MultiPoligono>, u32> {
        if let Some(z) = self.zonas.borrow().get(&regra.chave()) {
            return Ok(Rc::clone(z));
        }
        let indices = self.indices_bloqueados(regra);
        let zona: MultiPoligono = if indices.is_empty() { Vec::new() } else { uniao_com_escala(&indices.iter().map(|&i| self.camadas[i].bruta.clone()).collect::<Vec<_>>(), ESCALA_FINA)? };
        let z = Rc::new(zona);
        self.zonas.borrow_mut().insert(regra.chave(), Rc::clone(&z));
        Ok(z)
    }

    /// `wallZoneAt(p, rw, rule, z1)`: a pegada menos os vãos de porta que chegam ao piso até o topo `z1` da camada.
    pub fn zona_em(&self, regra: Regra, z1: f64) -> Result<Rc<MultiPoligono>, u32> {
        let zona = self.zona_bloqueada(regra)?;
        if zona.is_empty() {
            return Ok(zona);
        }
        // `doorRectsReaching`: soleira (base da parede + peitoril) até `z1 + Z_TOL`.
        let portas = self.portas_ate(z1);
        if portas.is_empty() {
            return Ok(zona);
        }
        let mut args: Vec<MultiPoligono> = Vec::with_capacity(portas.len() + 1);
        args.push(zona.as_ref().clone());
        args.extend(portas);
        Ok(Rc::new(diferenca_com_escala(&args, ESCALA_FINA)?))
    }
}

/// `doorRect(c, u, n, halfWidth, halfThick)`: o retângulo do vão em planta, os 4 vértices na ordem do TS.
pub fn retangulo_da_porta(centro: [f64; 2], u: [f64; 2], n: [f64; 2], largura: f64, espessura: f64) -> Anel {
    let (meia_largura, meia_espessura) = (largura / 2.0, espessura / 2.0 + MARGEM_DA_PORTA);
    let em = |a: f64, b: f64| -> [f64; 2] { [centro[0] + u[0] * a + n[0] * b, centro[1] + u[1] * a + n[1] * b] };
    vec![em(-meia_largura, -meia_espessura), em(meia_largura, -meia_espessura), em(meia_largura, meia_espessura), em(-meia_largura, meia_espessura)]
}

/// `boxOfMulti(m)`: a caixa de todos os pontos; `None` para o multipolígono vazio (`m.length === 0`).
fn caixa_do_multi(m: &MultiPoligono) -> Option<[f64; 4]> {
    if m.is_empty() {
        return None;
    }
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
    Some(c)
}

/// `boxesOverlap(a, b)` com `pad = 0` (fronteira inclusiva).
fn caixas_se_tocam(a: &[f64; 4], b: &[f64; 4]) -> bool {
    a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/// Carrega (e guarda, por nível) as paredes resolvidas que `layerOutlines` consulta: um `resolver_nivel` por nível e por consulta.
pub struct Carregador<'a> {
    cena: &'a Cena,
    tol: f64,
    por_nivel: RefCell<HashMap<u32, Rc<Vec<ParedeDoNivel>>>>,
}

impl<'a> Carregador<'a> {
    pub fn novo(cena: &'a Cena, tol: f64) -> Carregador<'a> {
        Carregador { cena, tol, por_nivel: RefCell::new(HashMap::new()) }
    }

    /// `wallsOfLevel(p, nivel)`.
    pub fn nivel(&self, nivel: u32) -> Result<Rc<Vec<ParedeDoNivel>>, u32> {
        if let Some(p) = self.por_nivel.borrow().get(&nivel) {
            return Ok(Rc::clone(p));
        }
        let resolvido = crate::b3::nivel_resolvido(self.cena, nivel, self.tol)?;
        let aberturas = aberturas_do_nivel(self.cena, nivel)?;
        let perfis = perfis_por_parede(self.cena)?;
        let mut paredes: Vec<ParedeDoNivel> = Vec::new();
        for (gi, g) in resolvido.pintado.grupos.iter().enumerate() {
            for &mi in &g.membros {
                let q = &resolvido.pintado.quadros[mi];
                let z = self.cena.a1.paredes_z.get(&q.id).ok_or(ENTRADA)?;
                let camadas = resolvido.grupos[gi]
                    .camadas
                    .iter()
                    .filter_map(|c| {
                        let it = &g.itens[c.item];
                        (it.parede == q.id).then(|| CamadaDaParede { nucleo: it.nucleo, prioridade: it.prioridade, bruta: it.forma.clone() })
                    })
                    .collect();
                let portas = aberturas
                    .iter()
                    .filter(|(_, a, _, _)| a.parede == q.id && !a.janela)
                    .map(|(_, _, _, geo)| Porta { peitoril: geo.peitoril, retangulo: vec![vec![retangulo_da_porta([geo.centro.x, geo.centro.y], [geo.u.x, geo.u.y], [geo.n.x, geo.n.y], geo.largura, geo.espessura)]] })
                    .collect();
                // Perfis (`withBottomProfile`/`withProfile`): só parede reta, com ao menos 2 pontos; o topo é o derivado ou, sem ele, o do modelo.
                let reta = self.cena.a1.quadros.get(&q.id).ok_or(ENTRADA)?.sag == 0.0;
                let pf = perfis.get(&q.id).cloned().unwrap_or_default();
                let util = |p: Option<Perfil>| -> Option<Perfil> { p.filter(|x| reta && x.len() >= 2) };
                let topo = if pf.topo.is_some() { pf.topo } else { pf.modelo };
                paredes.push(ParedeDoNivel::nova(z.z0, z.altura, q.clone(), util(topo), util(pf.base), camadas, portas));
            }
        }
        let r = Rc::new(paredes);
        self.por_nivel.borrow_mut().insert(nivel, Rc::clone(&r));
        Ok(r)
    }
}

/// `WallScope` de um elemento: os níveis cujas paredes contam (piso: o próprio; laje: o próprio, o de baixo e o de cima) e a faixa de cota de cada
/// camada. As paredes só são resolvidas na primeira camada que as consulta (como o `wallsNow` preguiçoso do TS).
pub struct Escopo<'a> {
    carregador: &'a Carregador<'a>,
    niveis: Vec<u32>,
    zonas: Vec<(f64, f64)>,
    paredes: RefCell<Option<Rc<Vec<Rc<Vec<ParedeDoNivel>>>>>>,
}

impl<'a> Escopo<'a> {
    pub fn novo(carregador: &'a Carregador<'a>, niveis: Vec<u32>, zonas: Vec<(f64, f64)>) -> Escopo<'a> {
        Escopo { carregador, niveis, zonas, paredes: RefCell::new(None) }
    }

    /// `scope.levelIds.flatMap(wallsOfLevel)`, na ordem dos níveis.
    fn paredes(&self) -> Result<Rc<Vec<Rc<Vec<ParedeDoNivel>>>>, u32> {
        if let Some(p) = self.paredes.borrow().as_ref() {
            return Ok(Rc::clone(p));
        }
        let lista = self.niveis.iter().map(|&n| self.carregador.nivel(n)).collect::<Result<Vec<_>, u32>>()?;
        let r = Rc::new(lista);
        *self.paredes.borrow_mut() = Some(Rc::clone(&r));
        Ok(r)
    }

    /// `zoneOf(i)`: a faixa da camada `i` (`{ z0: 0, z1: 0 }` sem faixa).
    fn faixa(&self, i: usize) -> (f64, f64) {
        self.zonas.get(i).copied().unwrap_or((0.0, 0.0))
    }

    /// `regionMinusWalls(p, ref, walls, rule, z0, z1)` com a faixa da camada `i`: `ref` menos a zona de cada parede que toca a faixa e cruza `ref`
    /// em planta. Sem parede, devolve `ref`.
    pub fn regiao_menos(&self, referencia: &MultiPoligono, regra: Regra, i: usize) -> Result<MultiPoligono, u32> {
        let Some(caixa) = caixa_do_multi(referencia) else { return Ok(referencia.clone()) };
        let (z0, z1) = self.faixa(i);
        let mut blocos: Vec<MultiPoligono> = Vec::new();
        for nivel in self.paredes()?.iter() {
            for parede in nivel.iter() {
                if !parede.toca(z0, z1) {
                    continue;
                }
                let trechos = parede.trechos_reais(z0, z1);
                if matches!(&trechos, Some(t) if t.is_empty()) {
                    continue;
                }
                let inteira = parede.zona_em(regra, z1)?;
                let zona = Rc::new(parede.restringir(&inteira, &trechos)?);
                if zona.is_empty() {
                    continue;
                }
                let Some(cz) = caixa_do_multi(&zona) else { continue };
                if !caixas_se_tocam(&caixa, &cz) {
                    continue;
                }
                blocos.push(zona.as_ref().clone());
            }
        }
        if blocos.is_empty() {
            return Ok(referencia.clone());
        }
        let mut args: Vec<MultiPoligono> = Vec::with_capacity(blocos.len() + 1);
        args.push(como_o_polygon_clipping(referencia)?);
        args.extend(blocos);
        diferenca_com_escala(&args, ESCALA_FINA)
    }

    /// `regionPlusWalls(ref, walls, allZ0, allZ1)`: `ref` mais a pegada inteira das paredes que tocam a faixa do ELEMENTO (menor `z0` e maior `z1`
    /// das camadas) e cruzam `ref` em planta.
    pub fn regiao_mais(&self, referencia: &MultiPoligono) -> Result<MultiPoligono, u32> {
        let Some(caixa) = caixa_do_multi(referencia) else { return Ok(referencia.clone()) };
        // `scope?.zones.length ? Math.min(...) : 0`.
        let (z0, z1) = if self.zonas.is_empty() {
            (0.0, 0.0)
        } else {
            (self.zonas.iter().fold(f64::INFINITY, |m, z| m.min(z.0)), self.zonas.iter().fold(f64::NEG_INFINITY, |m, z| m.max(z.1)))
        };
        let mut extra: Vec<MultiPoligono> = Vec::new();
        for nivel in self.paredes()?.iter() {
            for parede in nivel.iter() {
                if !parede.toca(z0, z1) {
                    continue;
                }
                let trechos = parede.trechos_reais(z0, z1);
                if matches!(&trechos, Some(t) if t.is_empty()) {
                    continue;
                }
                let inteira = parede.zona_bloqueada(Regra::Face)?;
                let pegada = Rc::new(parede.restringir(&inteira, &trechos)?);
                if let Some(cz) = caixa_do_multi(&pegada) {
                    if caixas_se_tocam(&caixa, &cz) {
                        extra.push(pegada.as_ref().clone());
                    }
                }
            }
        }
        if extra.is_empty() {
            return Ok(referencia.clone());
        }
        unir_com_pegadas(referencia, extra)
    }
}

/// Largura (m) da faixa colada à face da parede em que se procura a laje (`LARGURA_PRESENCA`).
const LARGURA_PRESENCA: f64 = 0.05;
/// Folga (m) para a banda passar das faces da parede (`FOLGA_BANDA`).
const FOLGA_BANDA: f64 = 1.0;
/// Área mínima (m2) de uma peça da laje na faixa de presença (`AREA_MINIMA`).
const AREA_MINIMA: f64 = 1e-9;
/// Tolerância (m) para a camada do meio da parede contar nas duas metades (`TOLERANCIA_META`).
const TOLERANCIA_META: f64 = 1e-9;
/// Código de `eixo` em `TerminoCamada.funcao`.
pub const FUNCAO_EIXO: u8 = 6;

/// `TerminoCamada`: a função da parede (0 a 5, ou 6 `eixo`), o lado (0 `proximo`, 1 `distante`), a face (0 `proxima`, 1 `meio`, 2 `distante`) e os cm.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RegraCamada {
    pub funcao: u8,
    pub lado: u8,
    pub face: u8,
    pub cm: f64,
}

/// Camada da parede como a busca a enxerga (`CamadaDeBusca`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CamadaDeBusca {
    pub funcao: u8,
    pub de: f64,
    pub ate: f64,
}

/// `bordaDaCamada`: a profundidade (desde a face externa) da borda da camada da laje e se foi preciso cair na camada seguinte (aviso).
/// `lado_laje_externo`: a laje está do lado externo da parede.
pub fn borda_da_camada(camadas: &[CamadaDeBusca], total: f64, regra: &RegraCamada, lado_laje_externo: bool) -> (f64, bool) {
    let sentido = if lado_laje_externo { 1.0 } else { -1.0 };
    let avanco = (regra.cm / 100.0) * sentido;
    let meio = total / 2.0;
    if regra.funcao == FUNCAO_EIXO {
        return (meio + avanco, false);
    }
    let metade_externa = (regra.lado == 0) == lado_laje_externo;
    let mut ordem: Vec<usize> = (0..camadas.len()).collect();
    if !metade_externa {
        ordem.reverse();
    }
    let centro = |c: &CamadaDeBusca| (c.de + c.ate) / 2.0;
    let na_metade = |c: &CamadaDeBusca| if metade_externa { centro(c) <= meio + TOLERANCIA_META } else { centro(c) >= meio - TOLERANCIA_META };
    let mut achada = ordem.iter().copied().find(|&i| na_metade(&camadas[i]) && camadas[i].funcao == regra.funcao);
    let mut aviso = false;
    if achada.is_none() {
        aviso = true;
        achada = ordem.iter().copied().find(|&i| camadas[i].funcao == regra.funcao).or_else(|| ordem.iter().copied().find(|&i| na_metade(&camadas[i])));
    }
    let Some(i) = achada else { return (meio + avanco, aviso) };
    let c = &camadas[i];
    let proxima = if lado_laje_externo { c.de } else { c.ate };
    let distante = if lado_laje_externo { c.ate } else { c.de };
    let face = match regra.face {
        0 => proxima,
        2 => distante,
        _ => centro(c),
    };
    (face + avanco, aviso)
}

/// `bandaDaParede`: a faixa entre os trechos `t0..t1` do eixo e as profundidades `d0..d1`. Parede reta: o retângulo; arco: o setor amostrado.
fn banda_da_parede(f: &Quadro, t0: f64, t1: f64, d0: f64, d1: f64) -> MultiPoligono {
    let (s0, s1) = (s_na_profundidade(f, d0), s_na_profundidade(f, d1));
    let par = |p: crate::geo2d::V| -> [f64; 2] { [p.x, p.y] };
    let Some(arco) = &f.arc else {
        return vec![vec![vec![par(ponto_em(f, t0, s0)), par(ponto_em(f, t1, s0)), par(ponto_em(f, t1, s1)), par(ponto_em(f, t0, s1))]]];
    };
    let passo = (8.0 * arco.radius * 3e-4).sqrt().max(0.05).min(0.5);
    let n = (((t1 - t0) / passo).ceil() as usize).max(1);
    let mut ida: Vec<[f64; 2]> = Vec::with_capacity(n + 1);
    let mut volta: Vec<[f64; 2]> = Vec::with_capacity(n + 1);
    for i in 0..=n {
        let t = t0 + ((t1 - t0) * i as f64) / n as f64;
        ida.push(par(ponto_em(f, t, s0)));
        volta.push(par(ponto_em(f, t, s1)));
    }
    volta.reverse();
    ida.extend(volta);
    vec![vec![ida]]
}

/// `intervaloT`: o menor e o maior `t` dos vértices de um anel, no sistema da parede.
fn intervalo_t(f: &Quadro, anel: &Anel) -> (f64, f64) {
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    for q in anel {
        let t = para_local(f, crate::geo2d::v(q[0], q[1])).0;
        lo = lo.min(t);
        hi = hi.max(t);
    }
    (lo, hi)
}


impl<'a> Escopo<'a> {
    /// `regionCamada(p, ref, walls, regra, z0, z1)` com a faixa da camada `i` (decisão 0054): o término por camada da parede.
    pub fn regiao_camada(&self, referencia: &MultiPoligono, regra: &RegraCamada, i: usize) -> Result<MultiPoligono, u32> {
        let Some(caixa) = caixa_do_multi(referencia) else { return Ok(referencia.clone()) };
        let (z0, z1) = self.faixa(i);
        let ref_pc = como_o_polygon_clipping(referencia)?;
        let mut blocos: Vec<MultiPoligono> = Vec::new();
        let mut proprios: Vec<MultiPoligono> = Vec::new();
        for nivel in self.paredes()?.iter() {
            for parede in nivel.iter() {
                let trechos = parede.trechos_reais(z0, z1);
                if matches!(&trechos, Some(t) if t.is_empty()) {
                    continue;
                }
                let pegada = parede.zona_bloqueada(Regra::Face)?;
                let Some(cz) = caixa_do_multi(&pegada) else { continue };
                if !caixas_se_tocam(&caixa, &cz) {
                    continue;
                }
                let f = &parede.quadro;
                let grande_f = parede.restringir(&pegada, &trechos)?;
                if grande_f.is_empty() {
                    continue;
                }
                let (mut t_min, mut t_max) = (f64::INFINITY, f64::NEG_INFINITY);
                for poly in &grande_f {
                    if let Some(externo) = poly.first() {
                        let (lo, hi) = intervalo_t(f, externo);
                        t_min = t_min.min(lo);
                        t_max = t_max.max(hi);
                    }
                }
                let total = f.thickness;
                let camadas: Vec<CamadaDeBusca> = f.tipo.camadas.iter().map(|c| CamadaDeBusca { funcao: c.funcao, de: c.de, ate: c.ate }).collect();
                let portas = parede.portas_ate(z1);
                for externo in [true, false] {
                    let faixa = if externo { banda_da_parede(f, t_min, t_max, -LARGURA_PRESENCA, 0.0) } else { banda_da_parede(f, t_min, t_max, total, total + LARGURA_PRESENCA) };
                    let presentes: MultiPoligono = interseccao_com_escala(&ref_pc, &faixa, ESCALA_FINA)?.into_iter().filter(|poly| area_do_poligono(poly) > AREA_MINIMA).collect();
                    if presentes.is_empty() {
                        continue;
                    }
                    let (borda, _) = borda_da_camada(&camadas, total, regra, externo);
                    // A borda avança `avanco` sobre a parede: a faixa passa dessa medida nas duas pontas da presença (o canto em esquadria não fica com entalhe).
                    let avanco = (if externo { borda } else { total - borda }).max(0.0);
                    let banda = |d0: f64, d1: f64| -> Result<MultiPoligono, u32> {
                        let partes: Vec<MultiPoligono> = presentes
                            .iter()
                            .map(|poly| {
                                let (lo, hi) = poly.first().map(|a| intervalo_t(f, a)).unwrap_or((f64::INFINITY, f64::NEG_INFINITY));
                                banda_da_parede(f, lo - avanco, hi + avanco, d0, d1)
                            })
                            .collect();
                        uniao_com_escala(&partes, ESCALA_FINA)
                    };
                    let tira = |d0: f64, d1: f64| -> Result<MultiPoligono, u32> { interseccao_com_escala(&grande_f, &banda(d0, d1)?, ESCALA_FINA) };
                    let mut bloco: MultiPoligono;
                    if externo {
                        if borda > 0.0 {
                            proprios.push(tira(-FOLGA_BANDA, borda)?);
                        }
                        bloco = tira(borda, total + FOLGA_BANDA)?;
                        if borda < 0.0 {
                            bloco = uniao_com_escala(&[bloco, banda(borda, 0.0)?], ESCALA_FINA)?;
                        }
                    } else {
                        if borda < total {
                            proprios.push(tira(borda, total + FOLGA_BANDA)?);
                        }
                        bloco = tira(-FOLGA_BANDA, borda)?;
                        if borda > total {
                            bloco = uniao_com_escala(&[bloco, banda(total, borda)?], ESCALA_FINA)?;
                        }
                    }
                    if !portas.is_empty() {
                        let mut args: Vec<MultiPoligono> = Vec::with_capacity(portas.len() + 1);
                        args.push(bloco);
                        args.extend(portas.iter().cloned());
                        bloco = diferenca_com_escala(&args, ESCALA_FINA)?;
                    }
                    blocos.push(bloco);
                }
            }
        }
        let proprios: Vec<MultiPoligono> = proprios.into_iter().filter(|m| !m.is_empty()).collect();
        let blocos: Vec<MultiPoligono> = blocos.into_iter().filter(|m| !m.is_empty()).collect();
        if proprios.is_empty() && blocos.is_empty() {
            return Ok(referencia.clone());
        }
        let sem = if blocos.is_empty() {
            referencia.clone()
        } else {
            let mut args: Vec<MultiPoligono> = Vec::with_capacity(blocos.len() + 1);
            args.push(ref_pc);
            args.extend(blocos);
            diferenca_com_escala(&args, ESCALA_FINA)?
        };
        if proprios.is_empty() {
            return Ok(sem);
        }
        let mut args: Vec<MultiPoligono> = Vec::with_capacity(proprios.len() + 1);
        args.push(sem);
        args.extend(proprios);
        uniao_com_escala(&args, ESCALA_FINA)
    }
}


/// `union(ref, ...pegadas)` do TS (polygon-clipping): o polígono de `ref` é o externo MENOS os furos, e a parte de um furo que passa do anel externo não
/// conta (furo manual de elemento vinculado sobre um entalhe do circuito). Sob NonZero ela contaria como região a mais (enrolamento -1) e a pegada de uma
/// parede não a cobriria: achado da B2 (semente 18 do estresse, 6,6e-4 m2 a menos no Rust).
fn unir_com_pegadas(referencia: &MultiPoligono, pegadas: Vec<MultiPoligono>) -> Result<MultiPoligono, u32> {
    let mut args: Vec<MultiPoligono> = Vec::with_capacity(pegadas.len() + 1);
    args.push(como_o_polygon_clipping(referencia)?);
    args.extend(pegadas);
    uniao_com_escala(&args, ESCALA_FINA)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::geo2d::v;
    use crate::pintor::area_da_forma;
    use crate::quadro::{construir_quadro, ParedeEntrada, TipoCalc};

    fn ret(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    /// Quadro de uma parede reta de 4 m ao longo de x, com três camadas (acabamento 5 cm, estrutura 10 cm, acabamento 5 cm) e a face externa em y = 0.
    fn quadro_basico() -> Quadro {
        let tipo = Rc::new(TipoCalc::novo(&[(0.05, 4, None), (0.1, 0, None), (0.05, 4, None)]));
        let entrada = ParedeEntrada { id: 1, a: v(0.0, 0.0), b: v(4.0, 0.0), ordem: 0.0, tipo, linha_loc: 2, invertida: false, sag: 0.0, sem_junta: [false, false], junta: [(false, false), (false, false)], z0: 0.0, topo: 2.8 };
        construir_quadro(&entrada).expect("quadro")
    }

    /// Parede de três camadas lado a lado (acabamento 5 cm, núcleo 10 cm, acabamento 5 cm) ao longo de x, com a base em 0.
    fn parede_de_tres(prioridades: [f64; 3], portas: Vec<Porta>) -> ParedeDoNivel {
        let camada = |nucleo: bool, prioridade: f64, y0: f64, y1: f64| CamadaDaParede { nucleo, prioridade, bruta: ret(0.0, y0, 4.0, y1) };
        ParedeDoNivel::nova(0.0, 2.8, quadro_basico(), None, None, vec![camada(false, prioridades[0], 0.0, 0.05), camada(true, prioridades[1], 0.05, 0.15), camada(false, prioridades[2], 0.15, 0.2)], portas)
    }

    #[test]
    fn indices_bloqueados_por_regra() {
        let p = parede_de_tres([4.0, 1.0, 5.0], vec![]);
        assert_eq!(p.indices_bloqueados(Regra::Face), [0, 1, 2]);
        assert_eq!(p.indices_bloqueados(Regra::Nucleo), [1]);
        // ate N: da primeira à última camada de prioridade <= N, e tudo o que fica entre elas
        assert_eq!(p.indices_bloqueados(Regra::Ate(1.0)), [1]);
        assert_eq!(p.indices_bloqueados(Regra::Ate(4.0)), [0, 1]);
        assert_eq!(p.indices_bloqueados(Regra::Ate(5.0)), [0, 1, 2]);
        assert!(p.indices_bloqueados(Regra::Ate(0.5)).is_empty(), "sem camada assim a parede é passa");
        let q = parede_de_tres([1.0, 9.0, 1.0], vec![]);
        assert_eq!(q.indices_bloqueados(Regra::Ate(1.0)), [0, 1, 2], "a faixa vai do menor ao maior índice, com o do meio");
    }

    #[test]
    fn zona_tira_so_a_porta_que_chega_ao_topo_da_camada() {
        // porta em x de 1 a 2 (largura 1, espessura 0,2 + 5 mm por face): o retângulo cobre y de -0,105 a 0,305 e perde 1 x 0,2 da pegada de 4 x 0,2
        let porta = |peitoril: f64| Porta { peitoril, retangulo: vec![vec![retangulo_da_porta([1.5, 0.1], [1.0, 0.0], [0.0, 1.0], 1.0, 0.2)]] };
        let p = parede_de_tres([4.0, 1.0, 5.0], vec![porta(0.0)]);
        let pegada = area_da_forma(&p.zona_bloqueada(Regra::Face).unwrap());
        assert!((pegada - 0.8).abs() < 1e-9);
        // soleira 0 chega a qualquer topo de camada: a zona perde o vão
        assert!((area_da_forma(&p.zona_em(Regra::Face, 0.0).unwrap()) - 0.6).abs() < 1e-9);
        // soleira a 10 cm: só chega às camadas cujo topo passa de 10 cm - 1 mm
        let alta = parede_de_tres([4.0, 1.0, 5.0], vec![porta(0.1)]);
        assert!((area_da_forma(&alta.zona_em(Regra::Face, 0.0).unwrap()) - 0.8).abs() < 1e-9);
        assert!((area_da_forma(&alta.zona_em(Regra::Face, 0.0985).unwrap()) - 0.8).abs() < 1e-9, "10 cm, 1 mm de folga: 0,0985 ainda não chega");
        assert!((area_da_forma(&alta.zona_em(Regra::Face, 0.0991).unwrap()) - 0.6).abs() < 1e-9, "0,0991 + 1 mm >= 0,1");
    }

    #[test]
    fn retangulo_da_porta_na_ordem_do_ts() {
        let r = retangulo_da_porta([1.0, 2.0], [1.0, 0.0], [0.0, 1.0], 0.9, 0.2);
        assert_eq!(r, vec![[0.55, 1.895], [1.45, 1.895], [1.45, 2.105], [0.55, 2.105]]);
    }

    #[test]
    fn regiao_mais_soma_a_pegada_das_paredes_que_tocam_a_faixa_do_elemento() {
        let p = parede_de_tres([4.0, 1.0, 5.0], vec![]);
        let cena = Cena::novo();
        let carregador = Carregador::novo(&cena, 0.02);
        let escopo = Escopo::novo(&carregador, vec![], vec![(-0.1, 0.0)]);
        // sem nível no escopo não há parede: devolve a referência
        let referencia = ret(0.0, -1.0, 4.0, 0.0);
        assert_eq!(escopo.regiao_mais(&referencia).unwrap(), referencia);
        assert_eq!(escopo.regiao_menos(&referencia, Regra::Face, 0).unwrap(), referencia);
        assert!((area_da_forma(&p.zona_em(Regra::Face, 0.0).unwrap()) - 0.8).abs() < 1e-9);
        // referência vazia volta como veio
        assert!(escopo.regiao_mais(&Vec::new()).unwrap().is_empty());
    }

    /// Ponto dentro do multipolígono (par-ímpar sobre todos os anéis: externo e furos).
    fn contem(m: &MultiPoligono, x: f64, y: f64) -> bool {
        let mut dentro = false;
        for poligono in m {
            for anel in poligono {
                let mut j = anel.len() - 1;
                for i in 0..anel.len() {
                    if (anel[i][1] > y) != (anel[j][1] > y) && x < (anel[j][0] - anel[i][0]) * (y - anel[i][1]) / (anel[j][1] - anel[i][1]) + anel[i][0] {
                        dentro = !dentro;
                    }
                    j = i;
                }
            }
        }
        dentro
    }

    #[test]
    fn uniao_com_a_pegada_nao_conta_a_parte_do_furo_manual_que_passa_do_circuito() {
        // circuito 4 x 4 com um entalhe (fora do polígono) de 1 x 0,5 saindo da borda esquerda; furo manual de 1 x 1 que cobre parte do polígono e parte do entalhe
        let externo: Anel = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0], [0.0, 2.5], [1.0, 2.5], [1.0, 2.0], [0.0, 2.0]];
        let furo: Anel = vec![[0.5, 1.8], [1.5, 1.8], [1.5, 2.8], [0.5, 2.8]];
        let referencia: MultiPoligono = vec![vec![externo, furo]];
        // pegada de uma parede em x de 1,1 a 2 e y de 1,9 a 2,6: tapa só a parte do furo que está dentro do polígono (e não toca o entalhe)
        let pegada: MultiPoligono = vec![vec![vec![[1.1, 1.9], [2.0, 1.9], [2.0, 2.6], [1.1, 2.6]]]];
        let r = unir_com_pegadas(&referencia, vec![pegada]).expect("união");
        assert!(contem(&r, 1.3, 2.3), "furo coberto pela pegada, dentro do polígono");
        assert!(!contem(&r, 0.7, 2.2), "entalhe: fora do polígono, o furo não o devolve à região (sob NonZero viraria região, enrolamento -1)");
        assert!(!contem(&r, 0.7, 2.7), "o furo fora da pegada continua furo");
        assert!(contem(&r, 3.0, 3.0));
        // a área é a do polígono (externo - entalhe - furo no polígono) mais a parte do furo que a pegada tapa
        let esperado = 16.0 - 0.5 - (1.0 - 0.25) + (0.4 * 0.7);
        assert!((area_da_forma(&r) - esperado).abs() < 1e-9, "{} x {esperado}", area_da_forma(&r));
    }

    fn cd(funcao: u8, de: f64, ate: f64) -> CamadaDeBusca {
        CamadaDeBusca { funcao, de, ate }
    }

    /// Acabamento 1 cm, substrato 2 cm, estrutura 10 cm, substrato 2 cm, acabamento 1 cm (funções 5, 1, 0, 1, 4).
    fn dois_lados() -> (Vec<CamadaDeBusca>, f64) {
        (vec![cd(5, 0.0, 0.01), cd(1, 0.01, 0.03), cd(0, 0.03, 0.13), cd(1, 0.13, 0.15), cd(4, 0.15, 0.16)], 0.16)
    }

    fn regra(funcao: u8, lado: u8, face: u8, cm: f64) -> RegraCamada {
        RegraCamada { funcao, lado, face, cm }
    }

    #[test]
    fn borda_da_camada_segue_o_lado_a_face_e_o_deslocamento() {
        let (c, t) = dois_lados();
        let perto = |r: RegraCamada, ext: bool| borda_da_camada(&c, t, &r, ext);
        assert!((perto(regra(0, 0, 0, 0.0), true).0 - 0.03).abs() < 1e-12);
        assert!((perto(regra(0, 0, 1, 0.0), true).0 - 0.08).abs() < 1e-12);
        assert!((perto(regra(0, 0, 2, 0.0), true).0 - 0.13).abs() < 1e-12);
        assert!((perto(regra(0, 0, 0, 0.0), false).0 - 0.13).abs() < 1e-12);
        // o deslocamento positivo avança para dentro da parede
        assert!((perto(regra(0, 0, 0, 2.0), true).0 - 0.05).abs() < 1e-12);
        assert!((perto(regra(0, 0, 0, 2.0), false).0 - 0.11).abs() < 1e-12);
        // lado: o substrato próximo e o distante são camadas diferentes
        assert_eq!(perto(regra(1, 0, 0, 0.0), true), (0.01, false));
        assert!((perto(regra(1, 1, 0, 0.0), true).0 - 0.13).abs() < 1e-12);
        // eixo
        assert_eq!(perto(regra(FUNCAO_EIXO, 0, 0, 0.0), true), (0.08, false));
    }

    #[test]
    fn borda_da_camada_sem_a_funcao_no_lado_cai_na_seguinte_com_aviso() {
        // substrato só na metade interna
        let c = vec![cd(5, 0.0, 0.01), cd(0, 0.01, 0.11), cd(1, 0.11, 0.13), cd(4, 0.13, 0.14)];
        let (b, aviso) = borda_da_camada(&c, 0.14, &regra(1, 0, 0, 0.0), true);
        assert!(aviso);
        assert!((b - 0.11).abs() < 1e-12);
        assert_eq!(borda_da_camada(&c, 0.14, &regra(1, 1, 0, 0.0), true), (0.11, false));
        // função que a parede não tem: a primeira camada do lado
        let (b, aviso) = borda_da_camada(&c, 0.14, &regra(2, 0, 0, 0.0), true);
        assert!(aviso);
        assert_eq!(b, 0.0);
    }

    #[test]
    fn trechos_reais_seguem_o_perfil_de_topo() {
        // parede de 4 m, topo de 3 m (t = 0) a 0,1 m (t = 4)
        let mut p = parede_de_tres([4.0, 1.0, 5.0], vec![]);
        p.altura = 3.0;
        p.perfil_topo = Some(vec![(0.0, 3.0), (4.0, 0.1)]);
        // sem perfil nem interseção: nada
        assert_eq!(p.trechos_reais(3.5, 3.6), Some(Vec::new()));
        // a camada de 1,4 a 1,5 m é tocada até onde o topo vale 1,399 m
        let t = p.trechos_reais(1.4, 1.5).expect("trechos");
        assert_eq!(t.len(), 1);
        assert!(t[0].0.abs() < 1e-12 && (t[0].1 - (3.0 - 1.399) * 4.0 / 2.9).abs() < 1e-9);
        // a parede inteira alcança a camada baixa
        assert_eq!(p.trechos_reais(0.05, 0.09), None);
        // sem perfil, a faixa real da parede decide (e não a nominal)
        let q = parede_de_tres([4.0, 1.0, 5.0], vec![]);
        assert_eq!(q.trechos_reais(1.0, 1.1), None);
        assert_eq!(q.trechos_reais(2.9, 3.0), Some(Vec::new()));
        assert!(q.toca(2.7, 3.0) && !q.toca(2.9, 3.0));
    }
}
