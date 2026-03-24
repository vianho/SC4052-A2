# Instructions

Explore the open-source repository [fast-graphrag](https://github.com/circlemind-ai/fast-graphrag) by circlemind-ai, which is a GraphRAG framework for interpretable agent-driven retrieval workflows. Its primary goal is to support for dynamic, incrementally updatable knowledge graphs by PageRank to enhance accuracy and dependability. 

Use GraphRAG to answer a multi-hop query, for instance: "What discoveries by Marie Curie led to later advances in medical imaging?" Injecting Pagerank scores into the retrieval step helps by starting from seed entities ("Marie Curie," "medical imaging") and propagating importance through the graph's connections (e.g., "Marie Curie" -> "discovered radium" -> "used in radiotherapy" -> "advances in medical imaging"), effectively ranking nodes based on their relevance to the specific query context. 

Write a program/software to take a knowledge graph and a set of query entities to return the top-k most relevant nodes.

<!-- 
ideas:
- use graphRAG to retrieve documentation content?
- explain how it can be used in an internal developer platform
- use graphRAG to answer stardew valley questions
 -->