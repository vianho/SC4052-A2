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
    pub texts_processed: Vec<String>,
    pub ordered_sources: Vec<Source>,
    pub api_key: String,
}

pub type SharedAppState = Arc<Mutex<AppState>>;

#[derive(Deserialize)]
pub struct ExtractRequest {
    pub urls: Option<Vec<String>>,
    pub text: Option<String>,
    pub ordered_sources: Option<Vec<Source>>,
    pub force_reextract: Option<bool>,
}

#[derive(Serialize, Debug)]
pub struct ExtractResponse {
    pub edges: Vec<ExtractedEdge>,
    pub message: String,
}

#[derive(Deserialize)]
pub struct AskRequest {
    pub question: String,
}

#[derive(Serialize, Debug, Clone, Deserialize)]
pub struct NodeScore {
    pub node: String,
    pub score: f64,
}

#[derive(Serialize, Debug)]
pub struct AskResponse {
    pub answer: String,
    pub context_used: Vec<ExtractedEdge>,
    pub top_nodes: Vec<NodeScore>,
}

#[derive(Serialize, Debug, Clone, Deserialize)]
pub struct Source {
    pub content: String,
    #[serde(rename = "type")]
    pub type_: String, // "url" or "text"
}

#[derive(Serialize, Debug)]
pub struct SourcesResponse {
    pub sources: Vec<Source>,
}
