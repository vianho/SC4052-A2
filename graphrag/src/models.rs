use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
}

pub struct AppState {
    pub edges: Vec<ExtractedEdge>,
    pub visited_urls: HashSet<String>,
    pub api_key: String,
}

pub type SharedAppState = Arc<Mutex<AppState>>;

#[derive(Deserialize)]
pub struct ExtractRequest {
    pub urls: Option<Vec<String>>,
    pub text: Option<String>,
    pub force_reextract: Option<bool>,
}

#[derive(Deserialize)]
pub struct AskRequest {
    pub question: String,
}

#[derive(Serialize)]
pub struct AskResponse {
    pub answer: String,
    pub context_used: Vec<ExtractedEdge>,
    pub top_nodes: Vec<String>,
}
