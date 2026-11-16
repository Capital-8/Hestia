//! Espelho da cena no processo do renderizador e relatório de estado.
//!
//! Esta fatia ainda não desenha: ela PROVA que o snapshot, os deltas, a câmera e as substituições do Hestia chegam
//! e são aplicados. O relatório JSON (`--state-file`) é o que o teste de integração lê, de outro processo.

use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

#[derive(Default)]
pub struct Scene {
    pub project_id: String,
    pub project_name: String,
    pub revision: u64,
    pub entities: BTreeMap<String, Value>,
    pub materials: BTreeMap<String, Value>,
    pub textures: BTreeMap<String, Value>,
    pub has_snapshot: bool,
}

#[derive(Default)]
pub struct State {
    pub scene: Scene,
    pub connections: u32,
    pub connected: bool,
    pub session_id: Option<String>,
    pub protocol: String,
    pub api: String,
    pub granted: Vec<String>,
    pub denied: Vec<String>,
    pub resumed: bool,
    pub camera_mode: String,
    pub camera: Option<Value>,
    pub camera_rev: u64,
    pub camera_updates: u32,
    pub overrides: Map<String, Value>,
    pub snapshots: u32,
    pub deltas: u32,
    pub resyncs: u32,
    pub errors: Vec<Value>,
    pub last_close: String,
    pub auth_required: bool,
    pub authenticated: bool,
}

fn id_of(v: &Value) -> Option<String> {
    v.get("id").and_then(Value::as_str).map(str::to_owned)
}

impl Scene {
    pub fn load_snapshot(&mut self, s: &Value) {
        self.project_id = s["projectId"].as_str().unwrap_or_default().to_owned();
        self.project_name = s["projectName"].as_str().unwrap_or_default().to_owned();
        self.revision = s["revision"].as_u64().unwrap_or(0);
        self.entities = collect(&s["entities"]);
        self.materials = collect(&s["materials"]);
        self.textures = collect(&s["textures"]);
        self.has_snapshot = true;
    }

    /// Aplica um delta. `false` quando ele não parte da revisão que temos (o chamador pede `scene.resync`).
    pub fn apply_delta(&mut self, d: &Value) -> bool {
        if !self.has_snapshot || d["baseRevision"].as_u64() != Some(self.revision) {
            return false;
        }
        for op in d["ops"].as_array().map(Vec::as_slice).unwrap_or(&[]) {
            match op["op"].as_str().unwrap_or_default() {
                "entity.add" | "entity.update" => put(&mut self.entities, &op["entity"]),
                "entity.remove" => drop_id(&mut self.entities, &op["id"]),
                "material.add" | "material.update" => put(&mut self.materials, &op["material"]),
                "material.remove" => drop_id(&mut self.materials, &op["id"]),
                "texture.add" => put(&mut self.textures, &op["texture"]),
                "texture.remove" => drop_id(&mut self.textures, &op["id"]),
                _ => {}
            }
        }
        self.revision = d["revision"].as_u64().unwrap_or(self.revision);
        true
    }
}

fn collect(list: &Value) -> BTreeMap<String, Value> {
    let mut m = BTreeMap::new();
    for v in list.as_array().map(Vec::as_slice).unwrap_or(&[]) {
        if let Some(id) = id_of(v) {
            m.insert(id, v.clone());
        }
    }
    m
}

fn put(m: &mut BTreeMap<String, Value>, v: &Value) {
    if let Some(id) = id_of(v) {
        m.insert(id, v.clone());
    }
}

fn drop_id(m: &mut BTreeMap<String, Value>, id: &Value) {
    if let Some(id) = id.as_str() {
        m.remove(id);
    }
}

/// Resumo de uma entidade para o relatório (a geometria em si fica na memória do processo).
fn entity_summary(e: &Value) -> Value {
    let mesh = &e["mesh"];
    let n = |k: &str| mesh[k].as_array().map_or(0, Vec::len);
    json!({
        "kind": e["kind"],
        "levelId": e["levelId"],
        "materialIds": e["materialIds"],
        "vertices": n("positions") / 3,
        "triangles": n("indices") / 3,
        "meshHash": mesh["hash"],
    })
}

impl State {
    pub fn report(&self) -> Value {
        let entities: Map<String, Value> = self.scene.entities.iter().map(|(k, v)| (k.clone(), entity_summary(v))).collect();
        let materials: Map<String, Value> = self.scene.materials.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        json!({
            "pid": std::process::id(),
            "connections": self.connections,
            "connected": self.connected,
            "sessionId": self.session_id,
            "protocol": self.protocol,
            "api": self.api,
            "granted": self.granted,
            "denied": self.denied,
            "resumed": self.resumed,
            "cameraMode": self.camera_mode,
            "camera": self.camera,
            "cameraRev": self.camera_rev,
            "cameraUpdates": self.camera_updates,
            "overrides": self.overrides,
            "snapshots": self.snapshots,
            "deltas": self.deltas,
            "resyncs": self.resyncs,
            "errors": self.errors,
            "lastClose": self.last_close,
            "authRequired": self.auth_required,
            "authenticated": self.authenticated,
            "scene": {
                "projectId": self.scene.project_id,
                "projectName": self.scene.project_name,
                "revision": self.scene.revision,
                "entities": entities,
                "materials": materials,
                "textures": self.scene.textures.len(),
            },
        })
    }
}
