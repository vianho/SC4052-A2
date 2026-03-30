use serde::Serialize;
use std::collections::HashMap;
use crate::models::ExtractedEdge;

// --- Structs for Gemini API Request Payload ---
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeminiRequest {
    pub contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<GeminiContent>,
}

#[derive(Serialize, Debug)]
pub struct GeminiContent {
    pub parts: Vec<GeminiPart>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeminiTool {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_context: Option<UrlContextTool>,
}

#[derive(Serialize, Debug, Default)]
pub struct UrlContextTool {}

#[derive(Serialize, Debug)]
pub struct GeminiPart {
    pub text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GeminiGenerationConfig {
    pub response_mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_json_schema: Option<GeminiSchema>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
}

#[derive(Serialize, Debug)]
pub struct GeminiSchema {
    #[serde(rename = "type")]
    pub schema_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<GeminiSchema>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, GeminiSchemaProperty>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

#[derive(Serialize, Debug)]
pub struct GeminiSchemaProperty {
    #[serde(rename = "type")]
    pub property_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

// --- Functions to call Gemini REST APIs ---

pub async fn text_query(prompt: &str, system_instruction: &str, api_key: &str, response_schema: Option<GeminiSchema>) -> Result<String, String> {
    let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

    let mut generation_config = None;
    if let Some(schema) = response_schema {
        println!("Constructing Gemini payload with custom response schema...");
        generation_config = Some(GeminiGenerationConfig {
            response_mime_type: "application/json".to_string(),
            response_json_schema: Some(schema),
            temperature: Some(1.0),
        });
    } else {
        println!("Constructing Gemini payload without custom response schema...");
    }
    let payload = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: prompt.to_string(),
            }],
        }],
        tools: None,
        system_instruction: Some(GeminiContent {
            parts: vec![GeminiPart {
                text: system_instruction.to_string(),
            }],
        }),
        generation_config,
    };

    if let Ok(json_string) = serde_json::to_string_pretty(&payload) {
        println!("--- Sending Payload to Gemini (Text Query) ---\n{}\n---------------------------------------------", json_string);
    } else {
        println!("Failed to serialize Gemini payload for logging.");
    }

    let client = reqwest::Client::new();
    let response: reqwest::Response = client.post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Gemini API Error: {}", response.text().await.unwrap_or_default()));
    }

    let resp_obj: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    println!("Raw Gemini response: {}", resp_obj);
    let text = resp_obj["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Failed to extract text from Gemini response")?;

    Ok(text.to_string())
}

pub async fn extract_graph(prompt: &str, system_instruction: &str, api_key: &str) -> Result<Vec<ExtractedEdge>, String> {
    let url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

    // Construct the final typed payload
    let payload = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: prompt.to_string(),
            }],
        }],
        tools: Some(vec![GeminiTool {
            url_context: Some(UrlContextTool {}),
        }]),
        // system_instruction: None,
        system_instruction: Some(GeminiContent {
            parts: vec![GeminiPart {
                text: system_instruction.to_string(),
            }],
        }),
        generation_config: Some(GeminiGenerationConfig {
            response_mime_type: "application/json".to_string(),
            response_json_schema: Some(GeminiSchema {
                schema_type: "array".to_string(),
                items: Some(Box::new(GeminiSchema {
                    schema_type: "object".to_string(),
                    properties: Some(HashMap::from([
                        ("source".into(), GeminiSchemaProperty {
                            property_type: "string".to_string(),
                            description: None 
                        }),
                        ("target".into(), GeminiSchemaProperty { 
                            property_type: "string".to_string(), 
                            description: None 
                        }),
                        ("relation".into(), GeminiSchemaProperty { 
                            property_type: "string".to_string(), 
                            description: None 
                        }),
                    ])),
                    required: Some(vec!["source".to_string(), "target".to_string(), "relation".to_string()]),
                    items: None,
                })),
                properties: None,
                required: None,
            }),
            temperature: Some(1.0),
        }),
    };

    if let Ok(json_string) = serde_json::to_string_pretty(&payload) {
        println!("--- Sending Payload to Gemini (Graph Extraction) ---\n{}\n-------------------------------------------", json_string);
    } else {
        println!("Failed to serialize Gemini payload for logging.");
    }

    let client = reqwest::Client::new();
    let response: reqwest::Response = client.post(url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Gemini API Error: {}", response.text().await.unwrap_or_default()));
    }

    let resp_obj: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    println!("Raw Gemini response: {}", resp_obj);
    let text = resp_obj["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or("Failed to extract text from Gemini response")?;

    serde_json::from_str(text).map_err(|e| format!("Failed to parse JSON: {}. Text: {}", e, text))
}
