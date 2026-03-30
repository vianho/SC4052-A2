pub mod models;
pub mod gemini;
pub mod handlers;
pub mod prompts;
pub mod utils;

use axum::{
    routing::{get, post},
    Router,
};
use std::env;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use dotenv::dotenv;
use std::collections::{HashSet};

use crate::models::{AppState, SharedAppState};
use crate::handlers::{get_current_graph, handle_extraction, handle_ask, handle_get_sources};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Ensure API key exists on startup
    dotenv().ok();
    let api_key = env::var("GEMINI_API_KEY").expect("GEMINI_API_KEY MUST be set!");

    // Initialize the empty global Knowledge Graph in memory
    let shared_state: SharedAppState = Arc::new(Mutex::new(AppState {
        edges: Vec::new(),
        visited_urls: HashSet::new(),
        texts_processed: Vec::new(),
        ordered_sources: Vec::new(),
        api_key,
    }));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Set up the API routes and attach the shared state
    let app = Router::new()
        .route("/api/graph", get(get_current_graph)) 
        .route("/api/extract", post(handle_extraction))
        .route("/api/ask", post(handle_ask))
        .route("/api/sources", get(handle_get_sources))
        .route("/api", get(|| async { "Welcome to the Rust GraphRAG API! Use /api/extract to extract and /api/graph to view the accumulated graph." }))
        .layer(cors)
        .with_state(shared_state);

    println!("🌸 Rust GraphRAG API is running on http://localhost:3000");
    
    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
