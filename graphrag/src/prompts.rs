kg_prompt = r"
Extract a comprehensive knowledge graph from the following contents.
First, identify and meticulously extract all entities mentioned in the document that belong to the provided ENTITY TYPES. For each entity, provide a concise description capturing its key features within the document's context. Use singular entity names and split compound concepts when necessary for clarity.
Next, identify and extract all relationships between these entities. For each relationship, provide a concise label that accurately captures the nature of the connection between the entities. Ensure that relationship labels are clear and unambiguous.
Please extract any relevant implicit relationships that may not be explicitly stated but can be inferred from the context.
Keep entity names and relationship labels concise (1-3 words max)

ENTITY TYPES: 
{entity_types}
TEXT:
{documents}
URLS:
{urls}
";

/// Use GraphRAG to answer a multi-hop query, for instance: "What discoveries by Marie Curie led to later advances in medical imaging?" 
/// Injecting Pagerank scores into the retrieval step helps by starting from seed entities ("Marie Curie," "medical imaging") and propagating importance through the graph's connections (e.g., "Marie Curie" -> "discovered radium" -> "used in radiotherapy" -> "advances in medical imaging"), effectively ranking nodes based on their relevance to the specific query context. 

seed_entities_prompt = r"
Given the following query, identify the seed entities that are explicitly mentioned in the query. 
If no explicit entities are mentioned, infer potential seed entities based on the context 
of the query that would be useful for extracting a knowledge graph to answer the query effectively.

QUERY:
{query}
"

retrieval_prompt = r"
Given the following query and seed entities, find the best resources (URLs) to extract a knowledge graph that can answer the query.
Use the seed entities as a starting point to identify relevant information.
Rank the resources based on their relevance to the query and seed entities, and provide a brief justification
for why each resource is relevant.
QUERY:
{query}
SEED ENTITIES:
{seed_entities}
RESOURCES:
"
