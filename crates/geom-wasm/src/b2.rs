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
//! da camada, com `Z_TOL`), `wallZoneAt`, `wallTouchesZone` (faixa NOMINAL da parede, ± `Z_TOL`), `regionMinusWalls` e `regionPlusWalls`.
//! Escala das booleanas: 1 nm (`ESCALA_FINA`), como o corte dos furos da B1 (o `polygon-clipping` do TS não quantiza).

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::a3::aberturas_do_nivel;
use crate::b1::como_o_polygon_clipping;
use crate::cena::Cena;
use crate::esquema::ENTRADA;
use crate::ops::{diferenca_com_escala, uniao_com_escala, ESCALA_FINA};
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
    /// `nominalZ0` e `nominalZ1` (a faixa que a parede ocupa sem o esvaziamento do término).
    pub nominal_z0: f64,
    pub nominal_z1: f64,
    pub camadas: Vec<CamadaDaParede>,
    pub portas: Vec<Porta>,
    /// Zona bloqueada por regra (a união das camadas bloqueadas, sem portas): não depende da cota da camada.
    zonas: RefCell<HashMap<(u8, u64), Rc<MultiPoligono>>>,
}

impl ParedeDoNivel {
    pub fn nova(base_z: f64, nominal_z0: f64, nominal_z1: f64, camadas: Vec<CamadaDaParede>, portas: Vec<Porta>) -> ParedeDoNivel {
        ParedeDoNivel { base_z, nominal_z0, nominal_z1, camadas, portas, zonas: RefCell::new(HashMap::new()) }
    }

    /// `wallTouchesZone(rw, z0, z1)`.
    pub fn toca(&self, z0: f64, z1: f64) -> bool {
        self.nominal_z0 <= z1 + Z_TOL && self.nominal_z1 >= z0 - Z_TOL
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
        let portas: Vec<MultiPoligono> = self.portas.iter().filter(|p| !(self.base_z + p.peitoril > z1 + Z_TOL)).map(|p| p.retangulo.clone()).collect();
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
                paredes.push(ParedeDoNivel::nova(z.z0, q.z0, q.topo, camadas, portas));
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
                let zona = parede.zona_em(regra, z1)?;
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
                let pegada = parede.zona_bloqueada(Regra::Face)?;
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
    use crate::pintor::area_da_forma;

    fn ret(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    /// Parede de três camadas lado a lado (acabamento 5 cm, núcleo 10 cm, acabamento 5 cm) ao longo de x, com a base em 0.
    fn parede_de_tres(prioridades: [f64; 3], portas: Vec<Porta>) -> ParedeDoNivel {
        let camada = |nucleo: bool, prioridade: f64, y0: f64, y1: f64| CamadaDaParede { nucleo, prioridade, bruta: ret(0.0, y0, 4.0, y1) };
        ParedeDoNivel::nova(0.0, 0.0, 2.8, vec![camada(false, prioridades[0], 0.0, 0.05), camada(true, prioridades[1], 0.05, 0.15), camada(false, prioridades[2], 0.15, 0.2)], portas)
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
}
