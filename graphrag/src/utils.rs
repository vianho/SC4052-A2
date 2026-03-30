use crate::models::ExtractedEdge;
use std::collections::{HashMap, HashSet};
use strsim::jaro_winkler;

pub fn match_entities_basic(
    llm_seeds: &[String],
    graph_nodes: &HashSet<String>,
) -> HashSet<String> {
    let mut matched_seeds = HashSet::new();
    let threshold = 0.85;

    for seed in llm_seeds {
        let normalized_seed = seed.to_lowercase().trim().to_string();
        let mut best_match = None;
        let mut highest_score = 0.0;

        for node in graph_nodes {
            let normalized_node = node.to_lowercase().trim().to_string();

            // 1. Check for an exact normalized match first (O(1) fast path)
            if normalized_seed == normalized_node {
                best_match = Some(node.clone());
                break; // Perfect match found, stop checking other nodes
            }

            // 2. Fallback to Fuzzy Matching for typos (e.g., "Marie Curiee" -> "Marie Curie")
            let score = jaro_winkler(&normalized_seed, &normalized_node);
            if score > highest_score && score >= threshold {
                highest_score = score;
                best_match = Some(node.clone());
            }
        }

        // If a valid match above the threshold is found, add the ORIGINAL graph node string
        if let Some(matched_node) = best_match {
            matched_seeds.insert(matched_node);
        }
    }
    matched_seeds
}

pub fn run_personalized_pagerank(
    edges: &Vec<ExtractedEdge>,
    seeds: &HashSet<String>,
    iterations: usize,
) -> Vec<(String, f64)> {
    let damping = 0.85;
    let mut nodes = HashSet::new();
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();
    let mut out_degree: HashMap<String, usize> = HashMap::new();

    // 1. Build Adjacency List
    for edge in edges {
        nodes.insert(edge.source.clone());
        nodes.insert(edge.target.clone());
        adjacency
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
        *out_degree.entry(edge.source.clone()).or_insert(0) += 1;
    }

    let num_nodes = nodes.len();
    if num_nodes == 0 {
        return vec![];
    }

    // 2. Initialize Scores (Personalization)
    let mut scores: HashMap<String, f64> = nodes.iter().map(|n| (n.clone(), 0.0)).collect();
    if seeds.is_empty() {
        // Fallback to standard PageRank if no seeds found
        let initial_val = 1.0 / num_nodes as f64;
        for score in scores.values_mut() {
            *score = initial_val;
        }
    } else {
        let initial_val = 1.0 / seeds.len() as f64;
        for seed in seeds {
            if let Some(score) = scores.get_mut(seed) {
                *score = initial_val;
            }
        }
    }

    // 3. Power Iteration
    for _ in 0..iterations {
        let mut next_scores: HashMap<String, f64> =
            nodes.iter().map(|n| (n.clone(), 0.0)).collect();
        let mut dangling_weight = 0.0;

        for node in &nodes {
            let current_score = scores[node];
            if let Some(neighbors) = adjacency.get(node) {
                let contribution = current_score * damping / neighbors.len() as f64;
                for neighbor in neighbors {
                    *next_scores.get_mut(neighbor).unwrap() += contribution;
                }
            } else {
                // Dangling node (no outgoing edges)
                dangling_weight += current_score * damping;
            }
        }

        // Apply Personalization (Teleportation)
        for node in &nodes {
            let teleport_base = if seeds.is_empty() {
                1.0 / num_nodes as f64
            } else if seeds.contains(node) {
                1.0 / seeds.len() as f64
            } else {
                0.0
            };

            // Add (1-d) + distributed dangling weight
            let jump = (1.0 - damping) + dangling_weight;
            *next_scores.get_mut(node).unwrap() += jump * teleport_base;
        }
        scores = next_scores;
    }

    // 4. Sort results
    let mut ranked: Vec<(String, f64)> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    ranked
}
