use axum::{extract::State, Json, response::IntoResponse};
use reqwest::StatusCode;
use std::collections::{HashSet};
use crate::models::{
    AskRequest, 
    AskResponse, 
    ExtractRequest, 
    ExtractedEdge, 
    SharedAppState
};
use crate::gemini::{
    text_query, 
    extract_graph,
    GeminiSchema,
};
use crate::prompts::{
    build_extraction_prompt, 
    build_qa_prompt, 
    build_entity_extraction_prompt, 
    SYSTEM_INSTRUCTION_QA, 
    SYSTEM_INSTRUCTION_SEED_EXTRACTION, 
    SYSTEM_INSTRUCTION_KG_EXTRACTION
};
use crate::utils::{
    match_entities_basic,
    run_personalized_pagerank,
};


/// GET /api/graph - Retrieve the current accumulated graph
pub async fn get_current_graph(State(state): State<SharedAppState>) -> Json<Vec<ExtractedEdge>> {
    let graph = state.lock().unwrap().edges.clone();
    Json(graph)
}

/// POST /api/extract - Extract graph from provided URLs or text
pub async fn handle_extraction(
    State(state): State<SharedAppState>,
    Json(payload): Json<ExtractRequest>,
) -> impl IntoResponse {
    let mut new_urls_to_process = Vec::new();
    let mut existing_context = String::new();
    let api_key: String;

    // Determine which URLs are new and should be processed, 
    // and build the existing context string from the current graph
    {
        let mut locked_state = state.lock().unwrap();
        api_key = locked_state.api_key.clone();
        
        if let Some(urls) = &payload.urls {
            for url in urls {
                let force = payload.force_reextract.unwrap_or(false);
                if force || !locked_state.visited_urls.contains(url) {
                    new_urls_to_process.push(url.clone());
                    locked_state.visited_urls.insert(url.clone());
                }
            }
        }

        if new_urls_to_process.is_empty() && payload.text.is_none() {
            return (StatusCode::OK, "URLs already cached. Pass 'force_reextract: true' to dig deeper.").into_response();
        }

        if !locked_state.edges.is_empty() {
            existing_context = locked_state.edges.iter()
                .rev().take(100) 
                .map(|e| format!("{} [{}] {}", e.source, e.relation, e.target))
                .collect::<Vec<_>>()
                .join("\n");
        }
    }

    let prompt_text = build_extraction_prompt(&new_urls_to_process, &payload.text, &existing_context);

    match extract_graph(&prompt_text, SYSTEM_INSTRUCTION_KG_EXTRACTION, &api_key).await {
        Ok(new_edges) => {
            println!("Successfully extracted {} new edges", new_edges.len());
            
            // 3. Lock the global state, push the new edges, and unlock
            let mut locked_state = state.lock().unwrap();
            locked_state.edges.extend(new_edges.clone());
            
            println!("Global Graph now contains {} total edges!", locked_state.edges.len());
            
            Json(serde_json::json!({
                "message": format!("Successfully extracted {} new edges.", new_edges.len()),
                "new_edges": new_edges
            })).into_response()
        },
        Err(e) => {
            eprintln!("Extraction failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to extract graph").into_response()
        }
    }
}

/// POST /api/ask - Answer user questions based on the current knowledge graph
pub async fn handle_ask(
    State(state): State<SharedAppState>,
    Json(payload): Json<AskRequest>,
) -> impl IntoResponse {
    let (edges, api_key) = {
        let locked_state = state.lock().unwrap();
        (locked_state.edges.clone(), locked_state.api_key.clone())
    };
    
    if edges.is_empty() {
        return (StatusCode::BAD_REQUEST, "The knowledge graph is empty.").into_response();
    }

    // 1. Identify Seeds (Simple keyword matching for demo)
    let seed_prompt = build_entity_extraction_prompt(&payload.question);
    let seed_response_schema = Some(GeminiSchema {
        schema_type: "array".to_string(),
        items: Some(Box::new(GeminiSchema {
            schema_type: "string".to_string(),
            items: None,
            properties: None,
            required: None,
        })),
        properties: None,
        required: None,
    });
    let entity_json_result = text_query(&seed_prompt, SYSTEM_INSTRUCTION_SEED_EXTRACTION, &api_key, seed_response_schema).await;

    let mut seeds = HashSet::new();
    if let Ok(json_arr) = entity_json_result {
        if let Ok(llm_entities) = serde_json::from_str::<Vec<String>>(&json_arr) {
            let all_nodes: HashSet<String> = edges.iter().flat_map(|e| vec![e.source.clone(), e.target.clone()]).collect();
            if llm_entities.is_empty() {
                eprintln!("LLM did not return any seed entities. Proceeding with empty seeds for PPR.");
            } else {
                println!("LLM extracted seed entities: {:?}", llm_entities);
            }
            seeds = match_entities_basic(&llm_entities, &all_nodes);
        }
    }

    // 2. Match seeds to graph and run PPR to find top relevant nodes
    let ranked_nodes = run_personalized_pagerank(&edges, &seeds, 20);
    
    let top_nodes_list: Vec<String> = ranked_nodes.iter().take(10).map(|(n, _)| n.clone()).collect();
    let top_k_set: HashSet<String> = top_nodes_list.clone().into_iter().collect();

    // 3. Augmentation: Build Sub-Graph Context String
    let context_edges: Vec<ExtractedEdge> = edges.into_iter()
        .filter(|e| top_k_set.contains(&e.source) || top_k_set.contains(&e.target))
        .collect();

    let context_string = context_edges.iter()
        .map(|e| format!("{} [{}] {}", e.source, e.relation, e.target))
        .collect::<Vec<_>>()
        .join("\n");

    // 4. Generation: Final Gemini Call
    let final_prompt = build_qa_prompt(&context_string, &payload.question);

    match text_query(&final_prompt, SYSTEM_INSTRUCTION_QA, &api_key, None).await {
        Ok(answer) => {
            Json(AskResponse {
                answer,
                context_used: context_edges,
                top_nodes: top_nodes_list,
            }).into_response()
        }
        Err(e) => {
            eprintln!("Error answering query via Gemini: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate answer from the Knowledge Graph").into_response()
        }
    }
}
