/// Use GraphRAG to answer a multi-hop query, for instance: "What discoveries by Marie Curie led to later advances in medical imaging?"
/// Injecting Pagerank scores into the retrieval step helps by starting from seed entities ("Marie Curie," "medical imaging") and propagating importance through the graph's connections (e.g., "Marie Curie" -> "discovered radium" -> "used in radiotherapy" -> "advances in medical imaging"), effectively ranking nodes based on their relevance to the specific query context.

// ==========================================
// System Instructions (Personas)
// ==========================================

pub const SYSTEM_INSTRUCTION_KG_EXTRACTION: &str = r"
You are an expert Knowledge Graph extraction engine and entity resolver.
Your objective is to read texts or web pages and distill them into a highly accurate, unified topological graph.
First, identify and meticulously extract all entities mentioned in the document. For each entity, use singular entity names and split compound concepts when necessary for clarity.
CRITICAL: You must perform strict Entity Resolution. Merge aliases, pronouns, and variations of a name into a single, universally recognized identifier.
For example, 'Mdm. Marie Curie', 'Curie', and 'she' must all be mapped to the exact same node string: 'Marie Curie'.
Next, identify and extract all relationships between these entities. For each relationship, provide a concise label that accurately captures the nature of the connection between the entities. Ensure that relationship labels are clear and unambiguous.
";

pub const SYSTEM_INSTRUCTION_QA: &str = r"
You are an analytical GraphRAG (Retrieval-Augmented Generation) assistant.
Your job is to answer user questions using ONLY the provided sub-graph facts.
If the provided facts do not contain the answer, politely state that you do not have enough information.
Do not hallucinate facts outside of the provided context.
";

pub const SYSTEM_INSTRUCTION_SEED_EXTRACTION: &str = r"
You are a Named Entity Recognition (NER) system.
Your objective is to extract the core subjects, objects, and concepts from a user's question to be used as search keys in a graph database.
";

// ==========================================
// Dynamic Prompt Builders
// ==========================================

pub fn build_extraction_prompt(
    urls: &[String],
    text: &Option<String>,
    existing_context: &str,
) -> String {
    let mut prompt = String::new();

    // 1. Append the source material
    if !urls.is_empty() {
        prompt.push_str(&format!(
            "Read the following articles:\n- {}\n\n",
            urls.join("\n- ")
        ));
    }

    if let Some(t) = text {
        prompt.push_str(&format!(
            "Extract knowledge graph edges from this text:\n\n{}\n\n",
            t
        ));
    }

    // 2. Append existing context (if doing a "Continue Extraction")
    if !existing_context.is_empty() {
        prompt.push_str(&format!(
            "We ALREADY know the following facts from previous extractions:\n{}\n\n\
            Your task is to 'continue the extraction'. Focus ONLY on finding NEW or MISSING entities \
            and relationships that logically connect to or expand upon this existing knowledge. \
            Do not repeat the facts listed above.\n\n \
            ENTITY MATCHING RULE: If a concept in the new text refers to an entity that already exists in the facts above, \
            you MUST use the EXACT string from the existing facts to link them together.\n\n", 
            existing_context
        ));
    } else {
        prompt.push_str(
            "Extract a comprehensive, unified knowledge graph connecting the core concepts.\n\n",
        );
    }

    // 3. Append the strict output constraints
    prompt.push_str(
        "Constraints:\n\
        1. Entities must be concise (1-3 words) and normalized (e.g., use 'marie curie' instead of 'Mdm. Marie Curie').\n\
        2. Relations must be verbs or distinct actions, in lowercase.\n\
        3. Resolve all pronouns and aliases to their base entity name."
    );

    prompt
}

/// Builds the prompt for answering a user's question based on PageRank results.
pub fn build_qa_prompt(context_string: &str, question: &str) -> String {
    format!(
        "Facts:\n{}\n\n\
        Question: {}\n\n\
        Answer concisely and intelligently:",
        context_string, question
    )
}

/// Builds the prompt to extract seed entities from user query.
pub fn build_entity_extraction_prompt(query: &str) -> String {
    format!(
        "Extract the core entities from this question:\n\
        Question: {}",
        query
    )
}
