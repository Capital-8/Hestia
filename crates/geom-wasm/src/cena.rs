//! Armazenamento da cena (ABI v2): decodificação e validação de seções, linhas por coluna,
//! tabela de handles e cache de índices espaciais por nível.
//!
//! Tudo aqui é seguro e testável nativamente: recebe `&[u8]`/`&[u32]`, devolve `Result<_, u32>`
//! com os códigos de [`crate::esquema`]. Nada daqui pode entrar em panic por dado do JS.
//!
//! Determinismo: as linhas ficam em `Vec` por coluna e a ordem canônica (id crescente) vem de um
//! `BTreeMap<id, posição>`; nunca se itera um mapa de hash.

use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

use crate::esquema::{self, Tipo, ENTRADA, ID_AUSENTE, LIMITE, LIMITE_LINHAS_POR_SECAO, NIVEL_TODOS, SECAO_PAREDES};
use crate::indice::{Caixa, Indice};
use crate::secoes_a1::{ParedeZ, SecoesA1};
use crate::secoes_a3::SecoesA3;
use crate::secoes_b::SecoesB;
use crate::secoes_cortina::SecoesCortina;
use crate::secoes_gc::SecoesGC;
use crate::secoes_terreno::SecoesTerreno;

/// Módulo máximo aceito para uma coordenada ou espessura (metros). Evita `inf` em somas e
/// subtrações internas; 1e12 m é muito maior que qualquer projeto real.
pub const COORD_MAX: f64 = 1e12;

/// Uma coluna decodificada.
#[derive(Debug, Clone, PartialEq)]
pub enum Coluna {
    U32(Vec<u32>),
    I32(Vec<i32>),
    F64(Vec<f64>),
    U8(Vec<u8>),
}

/// Linhas de uma seção, já decodificadas e validadas, antes de entrarem na cena.
#[derive(Debug, Clone, PartialEq)]
pub struct LoteParedes {
    pub id: Vec<u32>,
    pub nivel: Vec<u32>,
    pub ax: Vec<f64>,
    pub ay: Vec<f64>,
    pub bx: Vec<f64>,
    pub by: Vec<f64>,
    pub espessura: Vec<f64>,
}

impl LoteParedes {
    pub fn len(&self) -> usize {
        self.id.len()
    }
    pub fn is_empty(&self) -> bool {
        self.id.is_empty()
    }
}

/// Decodifica as colunas de uma seção (column-major, cada coluna preenchida a múltiplo de 8).
/// `bytes.len()` precisa ser exatamente o tamanho do layout.
pub fn decodificar_colunas(secao_id: u32, n_linhas: u32, bytes: &[u8]) -> Result<Vec<Coluna>, u32> {
    let esperado = esquema::bytes_secao(secao_id, n_linhas)?;
    if bytes.len() != esperado {
        return Err(ENTRADA);
    }
    let s = esquema::secao(secao_id).ok_or(ENTRADA)?;
    let n = n_linhas as usize;
    let mut colunas = Vec::with_capacity(s.colunas.len());
    let mut pos = 0usize;
    for c in s.colunas {
        let tam = n.checked_mul(c.tipo.bytes()).ok_or(LIMITE)?;
        let fim = pos.checked_add(tam).ok_or(LIMITE)?;
        let trecho = bytes.get(pos..fim).ok_or(ENTRADA)?;
        colunas.push(match c.tipo {
            Tipo::U32 => Coluna::U32(
                trecho.chunks_exact(4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect(),
            ),
            Tipo::I32 => Coluna::I32(
                trecho.chunks_exact(4).map(|b| i32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect(),
            ),
            Tipo::F64 => Coluna::F64(
                trecho
                    .chunks_exact(8)
                    .map(|b| f64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
                    .collect(),
            ),
            Tipo::U8 => Coluna::U8(trecho.to_vec()),
        });
        pos = esquema::bytes_coluna(c.tipo, n).and_then(|p| pos.checked_add(p)).ok_or(LIMITE)?;
    }
    Ok(colunas)
}

fn coord_valida(v: f64) -> bool {
    v.is_finite() && v.abs() <= COORD_MAX
}

/// Decodifica e valida um lote da seção `paredes`.
///
/// Erros: `ENTRADA` para tamanho incoerente, chave ausente (`0xFFFFFFFF`), chave duplicada,
/// `nivel_num == 0xFFFFFFFF` (reservado para "todos"), coordenada não finita ou `|v| > 1e12`,
/// espessura negativa; `LIMITE` para linhas/bytes acima dos limites do esquema.
pub fn decodificar_paredes(n_linhas: u32, bytes: &[u8]) -> Result<LoteParedes, u32> {
    let mut cols = decodificar_colunas(SECAO_PAREDES, n_linhas, bytes)?.into_iter();
    let (id, nivel, ax, ay, bx, by, espessura) = match (
        cols.next(),
        cols.next(),
        cols.next(),
        cols.next(),
        cols.next(),
        cols.next(),
        cols.next(),
    ) {
        (
            Some(Coluna::U32(id)),
            Some(Coluna::U32(nivel)),
            Some(Coluna::F64(ax)),
            Some(Coluna::F64(ay)),
            Some(Coluna::F64(bx)),
            Some(Coluna::F64(by)),
            Some(Coluna::F64(espessura)),
        ) => (id, nivel, ax, ay, bx, by, espessura),
        _ => return Err(esquema::INTERNO),
    };
    if id.contains(&ID_AUSENTE) || nivel.contains(&NIVEL_TODOS) {
        return Err(ENTRADA);
    }
    for col in [&ax, &ay, &bx, &by] {
        if !col.iter().all(|&v| coord_valida(v)) {
            return Err(ENTRADA);
        }
    }
    if !espessura.iter().all(|&v| coord_valida(v) && v >= 0.0) {
        return Err(ENTRADA);
    }
    let mut ordenados = id.clone();
    ordenados.sort_unstable();
    if ordenados.windows(2).any(|w| w[0] == w[1]) {
        return Err(ENTRADA);
    }
    Ok(LoteParedes { id, nivel, ax, ay, bx, by, espessura })
}

/// Linhas da seção `paredes`.
#[derive(Default)]
pub struct Paredes {
    id: Vec<u32>,
    nivel: Vec<u32>,
    ax: Vec<f64>,
    ay: Vec<f64>,
    bx: Vec<f64>,
    by: Vec<f64>,
    espessura: Vec<f64>,
    /// id -> posição nas colunas; a iteração em ordem de id é a ordem canônica.
    pos: BTreeMap<u32, usize>,
}

/// Uma parede (valores copiados).
#[derive(Clone, Copy, Debug)]
pub struct ParedeRef {
    pub id: u32,
    pub nivel: u32,
    pub ax: f64,
    pub ay: f64,
    pub bx: f64,
    pub by: f64,
    pub espessura: f64,
}

impl ParedeRef {
    /// Caixa do segmento expandida por `espessura / 2` em cada lado.
    pub fn caixa_com_espessura(&self) -> Caixa {
        let h = self.espessura / 2.0;
        Caixa {
            minx: self.ax.min(self.bx) - h,
            miny: self.ay.min(self.by) - h,
            maxx: self.ax.max(self.bx) + h,
            maxy: self.ay.max(self.by) + h,
        }
    }

    /// Caixa do segmento, sem espessura.
    pub fn caixa_segmento(&self) -> Caixa {
        Caixa {
            minx: self.ax.min(self.bx),
            miny: self.ay.min(self.by),
            maxx: self.ax.max(self.bx),
            maxy: self.ay.max(self.by),
        }
    }

    pub fn comprimento(&self) -> f64 {
        let dx = self.bx - self.ax;
        let dy = self.by - self.ay;
        (dx * dx + dy * dy).sqrt()
    }
}

impl Paredes {
    pub fn len(&self) -> usize {
        self.id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.id.is_empty()
    }

    fn limpar(&mut self) {
        *self = Paredes::default();
    }

    fn em(&self, p: usize) -> Option<ParedeRef> {
        Some(ParedeRef {
            id: *self.id.get(p)?,
            nivel: *self.nivel.get(p)?,
            ax: *self.ax.get(p)?,
            ay: *self.ay.get(p)?,
            bx: *self.bx.get(p)?,
            by: *self.by.get(p)?,
            espessura: *self.espessura.get(p)?,
        })
    }

    pub fn obter(&self, id: u32) -> Option<ParedeRef> {
        self.em(*self.pos.get(&id)?)
    }

    /// Paredes de um nível (`NIVEL_TODOS` = todas), em ordem crescente de id.
    pub fn do_nivel(&self, nivel: u32) -> Vec<ParedeRef> {
        self.pos
            .values()
            .filter_map(|&p| self.em(p))
            .filter(|w| nivel == NIVEL_TODOS || w.nivel == nivel)
            .collect()
    }

    /// Insere ou substitui. Devolve os níveis tocados (o antigo e o novo de cada linha).
    fn upsert(&mut self, lote: &LoteParedes, tocados: &mut Vec<u32>) {
        for i in 0..lote.len() {
            let (Some(&id), Some(&nivel), Some(&ax), Some(&ay), Some(&bx), Some(&by), Some(&e)) = (
                lote.id.get(i),
                lote.nivel.get(i),
                lote.ax.get(i),
                lote.ay.get(i),
                lote.bx.get(i),
                lote.by.get(i),
                lote.espessura.get(i),
            ) else {
                continue;
            };
            tocados.push(nivel);
            match self.pos.get(&id).copied() {
                Some(p) => {
                    if let Some(antigo) = self.nivel.get(p).copied() {
                        tocados.push(antigo);
                    }
                    if p < self.id.len() {
                        self.nivel[p] = nivel;
                        self.ax[p] = ax;
                        self.ay[p] = ay;
                        self.bx[p] = bx;
                        self.by[p] = by;
                        self.espessura[p] = e;
                    }
                }
                None => {
                    self.pos.insert(id, self.id.len());
                    self.id.push(id);
                    self.nivel.push(nivel);
                    self.ax.push(ax);
                    self.ay.push(ay);
                    self.bx.push(bx);
                    self.by.push(by);
                    self.espessura.push(e);
                }
            }
        }
    }

    /// Remove por id (ids ausentes são ignorados). `swap_remove` mantém as colunas densas.
    fn remover(&mut self, ids: &[u32], tocados: &mut Vec<u32>) {
        for &id in ids {
            let Some(p) = self.pos.remove(&id) else { continue };
            if p >= self.id.len() {
                continue; // invariante quebrada: nunca acontece, mas não pode virar panic
            }
            if let Some(&n) = self.nivel.get(p) {
                tocados.push(n);
            }
            let ultimo = self.id.len() - 1;
            self.id.swap_remove(p);
            self.nivel.swap_remove(p);
            self.ax.swap_remove(p);
            self.ay.swap_remove(p);
            self.bx.swap_remove(p);
            self.by.swap_remove(p);
            self.espessura.swap_remove(p);
            if p != ultimo {
                // a linha que estava no fim agora ocupa `p`
                if let Some(&movido) = self.id.get(p) {
                    self.pos.insert(movido, p);
                }
            }
        }
    }
}

/// Índice de um nível: ids (crescentes) e a grade sobre as caixas com espessura.
pub struct IndiceNivel {
    pub ids: Vec<u32>,
    pub indice: Indice,
}

/// Uma cena: as seções e os caches derivados.
#[derive(Default)]
pub struct Cena {
    pub(crate) paredes: Paredes,
    /// Seções da A1 (`paredes_quadro`, `tipos_parede`, `camadas`).
    pub(crate) a1: SecoesA1,
    /// Seções da A3a (`tipos_abertura`, `aberturas`).
    pub(crate) a3: SecoesA3,
    /// Seções da B1 (`pisos`, `lajes`, tipos, camadas, contornos e furos).
    pub(crate) b: SecoesB,
    pub(crate) gc: SecoesGC,
    /// Seções da parede cortina (100 a 105); a cortina não passa pelo resolvedor de camadas das paredes.
    pub(crate) cortina: SecoesCortina,
    /// Seções do terreno (160 a 165); o kernel só as lê e elas não entram em nenhum cache das paredes.
    pub(crate) terreno: SecoesTerreno,
    /// Cache por nível (`NIVEL_TODOS` inclusive). Invalidado quando a seção muda.
    indices: BTreeMap<u32, IndiceNivel>,
    /// B3: `true` enquanto a consulta `junction_nivel` resolve as paredes na variante da JUNÇÃO (`paredes_z_juncao` e `perfis_z_juncao`, sem `flatAttach`). Só a
    /// `b3` o liga (com `VarianteDaJuncao`) e as leituras de cota e de perfil das paredes o consultam; fora dela vale sempre `paredes_z` e `perfis_z`.
    pub(crate) variante_juncao: Cell<bool>,
    /// Cortadores por (conjunto, nível, tolerância, variante): as consultas `junction_nivel` e `quant_*` do mesmo nível e as dos níveis vizinhos
    /// (que entram como cortadores externos) pedem os mesmos conjuntos; recalculá-los a cada consulta era o custo dominante da exportação.
    /// Esvaziado em qualquer escrita de seção.
    pub(crate) cache_elementos: RefCell<HashMap<(u32, u64, bool), Rc<Vec<crate::b1::ElementoResolvido>>>>,
    pub(crate) cache_cortadores: RefCell<HashMap<(bool, u32, u64, bool), Rc<crate::b3::Cortadores>>>,
    /// Nível resolvido na variante da junção, com os perfis já aplicados, por (nível, tolerância): a `junction_nivel` (peças das paredes) e a `quant_paredes`
    /// pedem exatamente o mesmo `resolver_nivel` + `aplicar_perfis`. Esvaziado em qualquer escrita de seção.
    pub(crate) cache_niveis: RefCell<HashMap<(u32, u64, bool), Rc<crate::a3c::NivelResolvido>>>,
    pub(crate) cache_niveis_perfis: RefCell<HashMap<(u32, u64), Rc<crate::b3::NivelComPerfis>>>,
    /// Selo (linhas e bytes) da última `definir_secao` bem-sucedida de cada seção, enquanto nenhuma outra escrita a tocou. Reenviar a mesma seção (a cena
    /// é reenviada inteira quando só faltam as seções da junção ou dos forros) não muda nada, então não refaz índices nem esvazia os caches.
    selos: HashMap<u32, (u32, usize, u64, u64)>,
}

/// Selo de 128 bits (dois FNV-1a de 64 bits com sementes e primos distintos, oito bytes por passo) das linhas de uma seção.
fn selo_da_secao(n_linhas: u32, bytes: &[u8]) -> (u32, usize, u64, u64) {
    let (mut h1, mut h2) = (0xcbf2_9ce4_8422_2325u64, 0x9e37_79b9_7f4a_7c15u64);
    let mut blocos = bytes.chunks_exact(8);
    for b in &mut blocos {
        let v = u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
        h1 = (h1 ^ v).wrapping_mul(0x0000_0100_0000_01b3).rotate_left(5);
        h2 = (h2 ^ v.rotate_left(31)).wrapping_mul(0xff51_afd7_ed55_8ccd).rotate_left(27);
    }
    for &b in blocos.remainder() {
        h1 = (h1 ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3);
        h2 = (h2 ^ u64::from(b)).wrapping_mul(0xff51_afd7_ed55_8ccd);
    }
    (n_linhas, bytes.len(), h1, h2)
}

impl Cena {
    pub fn novo() -> Cena {
        Cena::default()
    }

    pub fn n_paredes(&self) -> usize {
        self.paredes.len()
    }
    /// A variante da junção só muda alguma coisa se existe alguma linha em `paredes_z_juncao` (a cota e os perfis só são trocados nas paredes que a têm).
    /// Sem elas as duas variantes calculam exatamente o mesmo; as chaves dos caches usam este valor para compartilhar o resultado.
    pub(crate) fn variante_efetiva(&self) -> bool {
        self.variante_juncao.get() && !self.b.paredes_z_juncao.is_empty()
    }


    /// `paredes_z` da parede `id`. Na variante da junção (B3), a parede que tem linha em `paredes_z_juncao` usa a dela.
    pub(crate) fn parede_z(&self, id: u32) -> Option<ParedeZ> {
        if self.variante_juncao.get() {
            if let Some(z) = self.b.paredes_z_juncao.get(&id) {
                return Some(*z);
            }
        }
        self.a1.paredes_z.get(&id).copied()
    }

    /// Esvazia só os caches que a seção escrita pode ter tornado velhos. O nível resolvido das paredes (`cache_niveis`, `cache_niveis_perfis`) lê só as
    /// seções das paredes, das aberturas, dos perfis e, na variante da junção, `paredes_z_juncao` e `perfis_z_juncao`; os elementos (`cache_elementos`)
    /// leem também as seções de pisos e lajes; os cortadores (`cache_cortadores`) leem tudo isso mais as faixas da junção e dos forros.
    fn invalidar_caches(&mut self, secao_id: u32) {
        use esquema::{SECAO_FAIXAS_JUNCAO, SECAO_PAREDES_Z_JUNCAO, SECAO_PERFIS_Z_JUNCAO, SECAO_PONTOS_FAIXAS_JUNCAO};
        // As seções do guarda-corpo (60 a 81) não entram em nenhum cache de paredes, pisos, lajes ou forros.
        // Idem as da parede cortina (100 a 112); a 113 (`cortina_hospedes`) NÃO: ela recorta o hospedeiro no nível resolvido das paredes, como uma abertura.
        // Idem as do terreno (160 a 165), que têm cache próprio.
        if SecoesGC::e_minha(secao_id) || SecoesTerreno::e_minha(secao_id) || (SecoesCortina::e_minha(secao_id) && secao_id != esquema::SECAO_CORTINA_HOSPEDES) {
            return;
        }
        let so_b = SecoesB::e_minha(secao_id);
        let de_juncao = matches!(secao_id, SECAO_PAREDES_Z_JUNCAO | SECAO_PERFIS_Z_JUNCAO);
        self.cache_cortadores.get_mut().clear();
        if !so_b {
            self.cache_niveis.get_mut().clear();
            self.cache_niveis_perfis.get_mut().clear();
            self.cache_elementos.get_mut().clear();
        } else if de_juncao {
            // Só a variante da junção lê estas seções: o resultado sem variante continua valendo.
            self.cache_niveis.get_mut().retain(|k, _| !k.2);
            self.cache_niveis_perfis.get_mut().clear();
            self.cache_elementos.get_mut().retain(|k, _| !k.2);
        } else if !matches!(secao_id, SECAO_FAIXAS_JUNCAO | SECAO_PONTOS_FAIXAS_JUNCAO) {
            // Pisos, lajes, tipos, camadas, contornos, furos, níveis e forros: não entram no nível resolvido das paredes.
            self.cache_elementos.get_mut().clear();
        }
    }

    fn invalidar(&mut self, tocados: &[u32]) {
        for n in tocados {
            self.indices.remove(n);
        }
        self.indices.remove(&NIVEL_TODOS);
    }

    /// Substitui todas as linhas da seção. Atômico: se falhar, a cena não muda.
    pub fn definir_secao(&mut self, secao_id: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let selo = selo_da_secao(n_linhas, bytes);
        if self.selos.get(&secao_id) == Some(&selo) {
            // Mesmas linhas já definidas e nenhuma escrita desde então: a cena e os caches valem como estão.
            return Ok(());
        }
        self.selos.remove(&secao_id);
        self.invalidar_caches(secao_id);
        let r = match secao_id {
            SECAO_PAREDES => {
                let lote = decodificar_paredes(n_linhas, bytes)?;
                self.paredes.limpar();
                self.indices.clear();
                let mut tocados = Vec::new();
                self.paredes.upsert(&lote, &mut tocados);
                Ok(())
            }
            s if SecoesA1::e_minha(s) => self.a1.definir(s, n_linhas, bytes),
            s if SecoesA3::e_minha(s) => self.a3.definir(s, n_linhas, bytes),
            s if SecoesB::e_minha(s) => self.b.definir(s, n_linhas, bytes),
            s if SecoesGC::e_minha(s) => self.gc.definir(s, n_linhas, bytes),
            s if SecoesCortina::e_minha(s) => self.cortina.definir(s, n_linhas, bytes),
            s if SecoesTerreno::e_minha(s) => self.terreno.definir(s, n_linhas, bytes),
            _ => Err(ENTRADA),
        };
        if r.is_ok() {
            self.selos.insert(secao_id, selo);
        }
        r
    }

    /// Insere ou substitui pela chave. Atômico.
    pub fn upsert(&mut self, secao_id: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        self.selos.remove(&secao_id);
        self.invalidar_caches(secao_id);
        match secao_id {
            SECAO_PAREDES => {
                let lote = decodificar_paredes(n_linhas, bytes)?;
                let novas = lote.id.iter().filter(|id| !self.paredes.pos.contains_key(id)).count();
                if self.paredes.len().saturating_add(novas) > LIMITE_LINHAS_POR_SECAO as usize {
                    return Err(LIMITE);
                }
                let mut tocados = Vec::new();
                self.paredes.upsert(&lote, &mut tocados);
                self.invalidar(&tocados);
                Ok(())
            }
            s if SecoesA1::e_minha(s) => self.a1.upsert(s, n_linhas, bytes),
            s if SecoesA3::e_minha(s) => self.a3.upsert(s, n_linhas, bytes),
            s if SecoesB::e_minha(s) => self.b.upsert(s, n_linhas, bytes),
            s if SecoesGC::e_minha(s) => self.gc.upsert(s, n_linhas, bytes),
            s if SecoesCortina::e_minha(s) => self.cortina.upsert(s, n_linhas, bytes),
            s if SecoesTerreno::e_minha(s) => self.terreno.upsert(s, n_linhas, bytes),
            _ => Err(ENTRADA),
        }
    }

    /// Remove linhas pelos ids (ausentes são ignorados).
    pub fn remover(&mut self, secao_id: u32, ids: &[u32]) -> Result<(), u32> {
        self.selos.remove(&secao_id);
        self.invalidar_caches(secao_id);
        match secao_id {
            SECAO_PAREDES => {
                let mut tocados = Vec::new();
                self.paredes.remover(ids, &mut tocados);
                self.invalidar(&tocados);
                Ok(())
            }
            s if SecoesA1::e_minha(s) => {
                self.a1.remover(s, ids);
                Ok(())
            }
            s if SecoesA3::e_minha(s) => {
                self.a3.remover(s, ids);
                Ok(())
            }
            s if SecoesB::e_minha(s) => {
                self.b.remover(s, ids);
                Ok(())
            }
            s if SecoesGC::e_minha(s) => {
                self.gc.remover(s, ids);
                Ok(())
            }
            s if SecoesCortina::e_minha(s) => {
                self.cortina.remover(s, ids);
                Ok(())
            }
            s if SecoesTerreno::e_minha(s) => {
                self.terreno.remover(s, ids);
                Ok(())
            }
            _ => Err(ENTRADA),
        }
    }

    /// Índice do nível, construído sob demanda. Item `k` do índice = `ids[k]`.
    pub fn indice_do_nivel(&mut self, nivel: u32) -> &IndiceNivel {
        if !self.indices.contains_key(&nivel) {
            let ps = self.paredes.do_nivel(nivel);
            let ids: Vec<u32> = ps.iter().map(|p| p.id).collect();
            let caixas: Vec<Caixa> = ps.iter().map(|p| p.caixa_com_espessura()).collect();
            self.indices.insert(nivel, IndiceNivel { ids, indice: Indice::construir(caixas) });
        }
        // a chave acabou de ser garantida
        self.indices.entry(nivel).or_insert_with(|| IndiceNivel { ids: Vec::new(), indice: Indice::construir(Vec::new()) })
    }

    pub fn indices_em_cache(&self) -> usize {
        self.indices.len()
    }
}

/// Tabela de handles com geração. `handle = (geração << 12) | (slot + 1)`: nunca é 0, e um handle
/// destruído continua inválido mesmo depois de o slot ser reaproveitado (a geração muda).
pub struct Tabela<T> {
    slots: Vec<Slot<T>>,
}

struct Slot<T> {
    geracao: u32,
    valor: Option<T>,
}

const BITS_SLOT: u32 = 12;
const MAX_SLOTS: usize = (1 << BITS_SLOT) - 1;
const MASCARA_GERACAO: u32 = (1 << (32 - BITS_SLOT)) - 1;

impl<T> Default for Tabela<T> {
    fn default() -> Self {
        Tabela { slots: Vec::new() }
    }
}

impl<T> Tabela<T> {
    /// Insere e devolve o handle, ou `None` se a tabela está cheia.
    pub fn inserir(&mut self, valor: T) -> Option<u32> {
        let livre = self.slots.iter().position(|s| s.valor.is_none());
        let i = match livre {
            Some(i) => i,
            None => {
                if self.slots.len() >= MAX_SLOTS {
                    return None;
                }
                self.slots.push(Slot { geracao: 0, valor: None });
                self.slots.len() - 1
            }
        };
        let s = self.slots.get_mut(i)?;
        s.valor = Some(valor);
        Some((s.geracao << BITS_SLOT) | (i as u32 + 1))
    }

    fn localizar(&self, h: u32) -> Option<usize> {
        let slot = (h & ((1 << BITS_SLOT) - 1)).checked_sub(1)? as usize;
        let s = self.slots.get(slot)?;
        if s.valor.is_some() && s.geracao == (h >> BITS_SLOT) {
            Some(slot)
        } else {
            None
        }
    }

    pub fn obter_mut(&mut self, h: u32) -> Option<&mut T> {
        let i = self.localizar(h)?;
        self.slots.get_mut(i)?.valor.as_mut()
    }

    pub fn contem(&self, h: u32) -> bool {
        self.localizar(h).is_some()
    }

    /// Remove e devolve o valor; o handle passa a ser inválido para sempre (geração avança).
    pub fn remover(&mut self, h: u32) -> Option<T> {
        let i = self.localizar(h)?;
        let s = self.slots.get_mut(i)?;
        s.geracao = (s.geracao + 1) & MASCARA_GERACAO;
        s.valor.take()
    }

    pub fn vivos(&self) -> usize {
        self.slots.iter().filter(|s| s.valor.is_some()).count()
    }
}

#[cfg(test)]
pub(crate) mod testes_util {
    use super::*;

    /// Codifica um lote de paredes no layout do contrato (para os testes).
    pub fn codificar_paredes(l: &LoteParedes) -> Vec<u8> {
        fn pad(v: &mut Vec<u8>) {
            while !v.len().is_multiple_of(8) {
                v.push(0);
            }
        }
        let mut b = Vec::new();
        for c in [&l.id, &l.nivel] {
            for x in c.iter() {
                b.extend_from_slice(&x.to_le_bytes());
            }
            pad(&mut b);
        }
        for c in [&l.ax, &l.ay, &l.bx, &l.by, &l.espessura] {
            for x in c.iter() {
                b.extend_from_slice(&x.to_le_bytes());
            }
            pad(&mut b);
        }
        b
    }

    pub fn lote(linhas: &[(u32, u32, f64, f64, f64, f64, f64)]) -> LoteParedes {
        LoteParedes {
            id: linhas.iter().map(|l| l.0).collect(),
            nivel: linhas.iter().map(|l| l.1).collect(),
            ax: linhas.iter().map(|l| l.2).collect(),
            ay: linhas.iter().map(|l| l.3).collect(),
            bx: linhas.iter().map(|l| l.4).collect(),
            by: linhas.iter().map(|l| l.5).collect(),
            espessura: linhas.iter().map(|l| l.6).collect(),
        }
    }
}

#[cfg(test)]
mod testes {
    use super::testes_util::*;
    use super::*;
    

    #[test]
    fn decodifica_ida_e_volta() {
        let l = lote(&[(5, 1, 0.0, 0.0, 3.0, 4.0, 0.2), (2, 7, -1.0, 2.0, 1.0, 2.0, 0.1), (9, 1, 1.0, 1.0, 1.0, 1.0, 0.0)]);
        let b = codificar_paredes(&l);
        assert_eq!(decodificar_paredes(3, &b), Ok(l));
    }

    #[test]
    fn zero_linhas_e_valido() {
        assert_eq!(decodificar_paredes(0, &[]).map(|l| l.len()), Ok(0));
    }

    #[test]
    fn tamanho_errado_e_entrada() {
        let l = lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1)]);
        let mut b = codificar_paredes(&l);
        b.push(0);
        assert_eq!(decodificar_paredes(1, &b), Err(ENTRADA));
        b.truncate(b.len() - 9);
        assert_eq!(decodificar_paredes(1, &b), Err(ENTRADA));
        assert_eq!(decodificar_paredes(2, &codificar_paredes(&l)), Err(ENTRADA));
    }

    #[test]
    fn secao_desconhecida() {
        assert_eq!(decodificar_colunas(42, 0, &[]), Err(ENTRADA));
        let mut c = Cena::novo();
        assert_eq!(c.definir_secao(42, 0, &[]), Err(ENTRADA));
        assert_eq!(c.upsert(42, 0, &[]), Err(ENTRADA));
        assert_eq!(c.remover(42, &[1]), Err(ENTRADA));
    }

    #[test]
    fn limites_dao_limite() {
        assert_eq!(decodificar_paredes(LIMITE_LINHAS_POR_SECAO + 1, &[]), Err(LIMITE));
        assert_eq!(decodificar_paredes(u32::MAX, &[]), Err(LIMITE));
    }

    #[test]
    fn chaves_e_valores_invalidos() {
        let ruim = |l: LoteParedes| decodificar_paredes(l.len() as u32, &codificar_paredes(&l));
        assert_eq!(ruim(lote(&[(ID_AUSENTE, 0, 0.0, 0.0, 1.0, 0.0, 0.1)])), Err(ENTRADA));
        assert_eq!(ruim(lote(&[(1, NIVEL_TODOS, 0.0, 0.0, 1.0, 0.0, 0.1)])), Err(ENTRADA));
        assert_eq!(ruim(lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (1, 0, 0.0, 0.0, 2.0, 0.0, 0.1)])), Err(ENTRADA));
        for ruim_v in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e13, -1e13] {
            assert_eq!(ruim(lote(&[(1, 0, ruim_v, 0.0, 1.0, 0.0, 0.1)])), Err(ENTRADA));
            assert_eq!(ruim(lote(&[(1, 0, 0.0, ruim_v, 1.0, 0.0, 0.1)])), Err(ENTRADA));
            assert_eq!(ruim(lote(&[(1, 0, 0.0, 0.0, ruim_v, 0.0, 0.1)])), Err(ENTRADA));
            assert_eq!(ruim(lote(&[(1, 0, 0.0, 0.0, 1.0, ruim_v, 0.1)])), Err(ENTRADA));
            assert_eq!(ruim(lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, ruim_v)])), Err(ENTRADA));
        }
        assert_eq!(ruim(lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, -0.1)])), Err(ENTRADA));
        assert!(ruim(lote(&[(1, 0, -0.0, 0.0, 1.0, 0.0, 0.0)])).is_ok());
    }

    #[test]
    fn upsert_substitui_e_remove() {
        let mut c = Cena::novo();
        let a = lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (2, 0, 0.0, 1.0, 1.0, 1.0, 0.1), (3, 1, 0.0, 2.0, 1.0, 2.0, 0.1)]);
        assert_eq!(c.definir_secao(1, 3, &codificar_paredes(&a)), Ok(()));
        assert_eq!(c.n_paredes(), 3);
        let b = lote(&[(2, 1, 5.0, 5.0, 6.0, 5.0, 0.3), (4, 1, 0.0, 0.0, 0.0, 1.0, 0.2)]);
        assert_eq!(c.upsert(1, 2, &codificar_paredes(&b)), Ok(()));
        assert_eq!(c.n_paredes(), 4);
        let p2 = c.paredes.obter(2).expect("parede 2");
        assert_eq!((p2.nivel, p2.ax, p2.espessura), (1, 5.0, 0.3));
        // remover id do meio (swap_remove) mantém o mapa coerente
        assert_eq!(c.remover(1, &[1, 99, 1]), Ok(()));
        assert_eq!(c.n_paredes(), 3);
        assert!(c.paredes.obter(1).is_none());
        for id in [2, 3, 4] {
            assert_eq!(c.paredes.obter(id).map(|p| p.id), Some(id));
        }
        let ids: Vec<u32> = c.paredes.do_nivel(NIVEL_TODOS).iter().map(|p| p.id).collect();
        assert_eq!(ids, vec![2, 3, 4]);
        // definir_secao substitui tudo
        assert_eq!(c.definir_secao(1, 0, &[]), Ok(()));
        assert_eq!(c.n_paredes(), 0);
    }

    #[test]
    fn falha_nao_altera_a_cena() {
        let mut c = Cena::novo();
        let a = lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1)]);
        c.definir_secao(1, 1, &codificar_paredes(&a)).expect("ok");
        let ruim = lote(&[(2, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (3, 0, f64::NAN, 0.0, 1.0, 0.0, 0.1)]);
        assert_eq!(c.upsert(1, 2, &codificar_paredes(&ruim)), Err(ENTRADA));
        assert_eq!(c.definir_secao(1, 2, &codificar_paredes(&ruim)), Err(ENTRADA));
        assert_eq!(c.n_paredes(), 1);
        assert!(c.paredes.obter(1).is_some());
    }

    #[test]
    fn indice_e_invalidado_so_quando_a_secao_muda() {
        let mut c = Cena::novo();
        let a = lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (2, 1, 0.0, 1.0, 1.0, 1.0, 0.1)]);
        c.definir_secao(1, 2, &codificar_paredes(&a)).expect("ok");
        assert_eq!(c.indice_do_nivel(0).ids, vec![1]);
        assert_eq!(c.indice_do_nivel(1).ids, vec![2]);
        assert_eq!(c.indice_do_nivel(NIVEL_TODOS).ids, vec![1, 2]);
        assert_eq!(c.indices_em_cache(), 3);
        // tocar o nível 1 preserva o nível 0 e descarta 1 e "todos"
        let b = lote(&[(5, 1, 3.0, 3.0, 4.0, 3.0, 0.1)]);
        c.upsert(1, 1, &codificar_paredes(&b)).expect("ok");
        assert_eq!(c.indices_em_cache(), 1);
        assert_eq!(c.indice_do_nivel(1).ids, vec![2, 5]);
        // mover a parede 1 do nível 0 para o 1 invalida os dois
        let m = lote(&[(1, 1, 0.0, 0.0, 1.0, 0.0, 0.1)]);
        c.upsert(1, 1, &codificar_paredes(&m)).expect("ok");
        assert_eq!(c.indice_do_nivel(0).ids, Vec::<u32>::new());
        assert_eq!(c.indice_do_nivel(1).ids, vec![1, 2, 5]);
    }

    #[test]
    fn tabela_de_handles() {
        let mut t: Tabela<u32> = Tabela::default();
        let h1 = t.inserir(10).expect("h1");
        let h2 = t.inserir(20).expect("h2");
        assert!(h1 >= 1 && h2 >= 1 && h1 != h2);
        assert_eq!(t.obter_mut(h1).copied(), Some(10));
        assert_eq!(t.remover(h1), Some(10));
        assert!(!t.contem(h1));
        assert_eq!(t.remover(h1), None);
        // o slot é reaproveitado, mas o handle antigo continua inválido
        let h3 = t.inserir(30).expect("h3");
        assert_ne!(h3, h1);
        assert!(t.obter_mut(h1).is_none());
        assert_eq!(t.obter_mut(h3).copied(), Some(30));
        assert_eq!(t.vivos(), 2);
        // handles inventados
        for h in [0u32, u32::MAX, 0x1000, 9999, 1 << 20] {
            assert!(!t.contem(h) || h == h2 || h == h3);
        }
        assert!(t.obter_mut(0).is_none());
    }

    #[test]
    fn tabela_cheia_devolve_none() {
        let mut t: Tabela<()> = Tabela::default();
        for _ in 0..MAX_SLOTS {
            assert!(t.inserir(()).is_some());
        }
        assert!(t.inserir(()).is_none());
    }
}
