use axum::{
    extract::{Json, State},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use dotenv::dotenv;

mod gemini;
use gemini::*;

#[derive(Deserialize)]
pub struct ExtractRequest {
    pub urls: Option<Vec<String>>,
    pub text: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtractedEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
}

type SharedGraphState = Arc<Mutex<Vec<ExtractedEdge>>>;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Ensure API key exists on startup
    dotenv().ok();
    env::var("GEMINI_API_KEY").expect("GEMINI_API_KEY MUST be set!");

    // Initialize the empty global Knowledge Graph in memory
    let global_graph = Arc::new(Mutex::new(Vec::<ExtractedEdge>::new()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Set up the API routes AND attach the shared state
    let app = Router::new()
        .route("/api/extract", post(handle_extraction))
        .route("/api/graph", get(get_current_graph)) 
        .route("/", get(|| async { "Welcome to the Rust GraphRAG API! Use /api/extract to extract and /api/graph to view the accumulated graph." }))
        .layer(cors)
        .with_state(global_graph);

    println!("🚀 Rust GraphRAG API is running on http://localhost:3000");
    
    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Endpoint: Retrieve the current accumulated graph
async fn get_current_graph(State(state): State<SharedGraphState>) -> Json<Vec<ExtractedEdge>> {
    let graph = state.lock().unwrap();
    Json(graph.clone())
}

/// The API Endpoint Handler
async fn handle_extraction(
    State(state): State<SharedGraphState>,
    Json(payload): Json<ExtractRequest>,
) -> Json<Vec<ExtractedEdge>> {
    let api_key = env::var("GEMINI_API_KEY").unwrap();

    let input_type = if payload.text.is_some() {
        "text"
    } else if payload.urls.is_some() {
        "url"
    } else {
        eprintln!("Error: No valid 'urls' or 'text' provided in the request.");
        return Json(state.lock().unwrap().clone()); // Return current graph on error
    };

    // 1. Determine the source and build the prompt dynamically!
    let prompt = if let Some(text_inputs) = payload.text.filter(|t| !t.trim().is_empty()) {
        println!("Received extraction request for direct text input.");
        format!("Extract a comprehensive knowledge graph from this text. Keep entity names and relationship labels concise (1-3 words max):\n\n{}", text_inputs.join("\n"))
    } else if let Some(url_inputs) = payload.urls {
        println!("Received extraction request for URLs: {:?}", url_inputs);
        format!("Extract a comprehensive knowledge graph from the content at these URLs. Keep entity names and relationship labels concise (1-3 words max):\n\n{}", url_inputs.join("\n"))
    } else {
        eprintln!("Error: Neither valid 'url' nor 'text' was provided in the request.");
        return Json(state.lock().unwrap().clone()); // Return current graph on error
    };

    // 2. Extract with Gemini
    match extract_graph_with_gemini(&prompt, &api_key, &input_type).await {
        Ok(new_edges) => {
            println!("Successfully extracted {} new edges", new_edges.len());
            
            // 3. Lock the global state, push the new edges, and unlock
            let mut global_graph = state.lock().unwrap();
            global_graph.extend(new_edges);
            
            println!("Global Graph now contains {} total edges!", global_graph.len());
            
            // Return the ENTIRE accumulated graph back to the frontend
            Json(global_graph.clone()) 
        },
        Err(e) => {
            eprintln!("Extraction failed: {}", e);
            // On failure, just return the current graph state so the UI doesn't break
            let global_graph = state.lock().unwrap();
            Json(global_graph.clone()) 
        }
    }
}

async fn extract_graph_with_gemini(prompt: &str, api_key: &str, input_type: &str) -> Result<Vec<ExtractedEdge>, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

    // Build the Object property schema
    let mut properties = std::collections::HashMap::new();
    properties.insert("source".to_string(), GeminiSchemaProperty { property_type: "string".to_string(), description: None });
    properties.insert("target".to_string(), GeminiSchemaProperty { property_type: "string".to_string(), description: None });
    properties.insert("relation".to_string(), GeminiSchemaProperty { property_type: "string".to_string(), description: None });

    // Define the array items schema
    let items_schema = GeminiSchema {
        schema_type: "object".to_string(),
        items: None,
        properties: Some(properties),
        required: Some(vec!["source".to_string(), "target".to_string(), "relation".to_string()]),
    };

    // Define the parent array schema
    let response_schema = GeminiSchema {
        schema_type: "array".to_string(),
        items: Some(Box::new(items_schema)),
        properties: None,
        required: None,
    };

    let mut tool = Vec::new();

    if input_type == "url" {
        println!("Constructing Gemini payload with URL tool...");
        tool.push(GeminiTool {
            url_context: UrlContext {},
        });
    } else {
        println!("Constructing Gemini payload without tools...");
    }

    // Construct the final typed payload
    let payload = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: prompt.to_string(),
            }],
        }],
        generation_config: GeminiGenerationConfig {
            response_mime_type: "application/json".to_string(),
            response_json_schema: response_schema,
            temperature: 1.0,
        },
        tools: Some(tool),
    };

    println!("Sending request to Gemini with payload: {:#?}", serde_json::to_string(&payload)?);

    // Serialize and send the strongly-typed struct payload
    let response: reqwest::Response = client.post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await?;

    let response_json: serde_json::Value = response.json().await?;

    println!("Raw Gemini response: {}", response_json);
    
    if let Some(generated_text) = response_json["candidates"][0]["content"]["parts"][0]["text"].as_str() {
        let edges: Vec<ExtractedEdge> = serde_json::from_str(generated_text)?;
        Ok(edges)
    } else {
        Err("Failed to parse Gemini response".into())
    }
}