import './styles.css';

const BASE_API_URL = window.BASE_API_URL || 'http://localhost:3000/api';
let nodes = [];
let edges = [];
let network = null;
let inputQueue = [];
let currentGraphData = [];


window.onload = () => {
    fetchGraph();

    const inputEl = document.getElementById('inputData');
    if (inputEl) {
        inputEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') addToQueue();
        });
    }
    const addToQueueBtn = document.getElementById('addToQueueBtn');
    if (addToQueueBtn) {
        addToQueueBtn.addEventListener('click', addToQueue);
    }
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
        extractBtn.addEventListener('click', () => extractBatch(false));
    }
    const forceExtractBtn = document.getElementById('forceExtractBtn');
    if (forceExtractBtn) {
        forceExtractBtn.addEventListener('click', () => extractBatch(true));
    }
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchGraph);
    }
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', exportJSON);
    }
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportCSV);
    }
    const askQuestionBtn = document.getElementById('askQuestionBtn');
    if (askQuestionBtn) {
        askQuestionBtn.addEventListener('click', askQuestion);
    }
    const questionInput = document.getElementById('questionInput');
    if (questionInput) {
        questionInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') askQuestion();
        });
    }

};

function addToQueue() {
    const inputEl = document.getElementById('inputData');
    const val = inputEl.value.trim();
    if (!val) return;

    inputQueue.push(val);
    inputEl.value = '';
    renderQueue();
}

function removeFromQueue(index) {
    inputQueue.splice(index, 1);
    renderQueue();
}

function renderQueue() {
    const listEl = document.getElementById('stagingList');
    const stagingArea = document.getElementById('stagingArea');
    listEl.innerHTML = '';

    if (inputQueue.length === 0) {
        stagingArea.style.display = 'none';
        return;
    }

    stagingArea.style.display = 'block';
    inputQueue.forEach((item, index) => {
        const li = document.createElement('li');

        // Truncate long text for display
        const displayText = item.length > 80 ? item.substring(0, 80) + '...' : item;
        const isUrl = item.startsWith('http://') || item.startsWith('https://');

        li.innerHTML = `
            <span style="font-size: 16px;">${isUrl ? '🔗' : '📝'}</span> 
            <span>${displayText}</span>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.innerText = 'Remove';
        removeBtn.className = 'danger';
        removeBtn.onclick = () => removeFromQueue(index);

        li.appendChild(removeBtn);
        listEl.appendChild(li);
    });
}

async function extractBatch(force) {
    if (inputQueue.length === 0) return;

    console.log("Extracting batch:", inputQueue);
    const statusEl = document.getElementById('status');
    console.log("Status element:", statusEl);
    const btn = document.getElementById('extractBtn');
    console.log("Extract button:", btn);
    statusEl.innerText = "⏳ Sending batch to Gemini... this might take 15-30 seconds.";
    statusEl.style.color = "#d69e2e";
    btn.disabled = true;

    const urls = inputQueue.filter(i => i.startsWith("http"));
    console.log("URLs to extract:", urls);
    const texts = inputQueue.filter(i => !i.startsWith("http"));
    console.log("Texts to extract:", texts);
    const payload = {
        urls: urls.length ? urls : undefined,
        text: texts.length ? texts.join("\n") : undefined,
        force_reextract: force
    };
    console.log("Payload for extraction:", payload);

    try {
        const response = await fetch(`${BASE_API_URL}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Extraction failed on the server.");

        statusEl.innerText = "✅ Batch extraction complete! Updating graph...";
        statusEl.style.color = "#38a169";

        // Clear the queue on success
        inputQueue = [];
        renderQueue();
        await fetchGraph();

    } catch (error) {
        console.error(error);
        statusEl.innerText = "❌ Error during batch extraction. Check console.";
        statusEl.style.color = "#e53e3e";
    } finally {
        btn.disabled = false;
    }
}

async function fetchGraph() {
    try {
        const response = await fetch(`${BASE_API_URL}/graph`);
        currentGraphData = await response.json();
        renderGraph(currentGraphData);
    } catch (error) {
        console.error("Failed to fetch graph:", error);
    }
}

function renderGraph(rawEdges) {
    // 1. Extract unique nodes
    const nodeSet = new Set();
    rawEdges.forEach(edge => {
        nodeSet.add(edge.source);
        nodeSet.add(edge.target);
    });

    // 2. Format nodes for Vis.js
    nodes = new vis.DataSet(
        Array.from(nodeSet).map(name => ({ id: name, label: name, shape: "dot", size: 20 }))
    );

    // 3. Format edges for Vis.js
    edges = new vis.DataSet(
        rawEdges.map((edge, index) => ({
            id: index,
            from: edge.source,
            to: edge.target,
            label: edge.relation,
            arrows: "to",
            font: { align: "middle" }
        }))
    );

    // 4. Draw the network
    const container = document.getElementById('mynetwork');
    const data = { nodes, edges };
    const options = {
        physics: {
            barnesHut: { gravitationalConstant: -3000, centralGravity: 0.3, springLength: 150 }
        },
        nodes: {
            color: {
                background: '#fbb6ce', // Light pink fill
                border: '#d53f8c',     // Hot pink border
                highlight: { background: '#f687b3', border: '#97266d' } // Darker when clicked
            },
            font: { size: 14, face: 'Tahoma', color: '#4a0531' }, // Dark plum text
            borderWidth: 2
        },
        edges: {
            color: {
                color: '#f687b3',      // Soft pink lines
                highlight: '#d53f8c'   // Hot pink when connected node is clicked
            },
            smooth: { type: 'continuous' }
        }
    };

    if (network !== null) {
        network.destroy(); // clear old graph
    }
    network = new vis.Network(container, data, options);
}

function downloadFile(content, filename, mimeType) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
    a.download = filename;
    a.click();
}
function exportJSON() {
    downloadFile(JSON.stringify(currentGraphData, null, 2), "graph.json", "application/json");
}
function exportCSV() {
    let csv = "Source,Relation,Target\n" + currentGraphData.map(e => `"${e.source}","${e.relation}","${e.target}"`).join("\n");
    downloadFile(csv, "graph.csv", "text/csv");
}

async function askQuestion() {
    const qInput = document.getElementById('questionInput');
    const question = qInput.value.trim();
    if (!question) return;

    const answerBox = document.getElementById('answerBox');
    const answerText = document.getElementById('answerText');
    const contextNodesText = document.getElementById('contextNodes');

    answerBox.style.display = 'block';
    // Tailwind natively provides animate-pulse for loading!
    answerText.innerHTML = "<span class='text-purple-600 animate-pulse font-medium'>⏳ Extracting entities & running PageRank...</span>";
    contextNodesText.innerText = "";

    try {
        const res = await fetch(`${BASE_API_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();

        // 1. Display the synthesized answer
        answerText.innerText = data.answer;

        // 2. Display the nodes that were used as context
        contextNodesText.innerHTML = `<strong>Context Nodes Used:</strong> ${data.top_nodes.join(', ')}`;

        // 3. Make the graph VISUALLY light up!
        highlightNodes(data.top_nodes);

    } catch (e) {
        answerText.innerText = `❌ Error: ${e.message || "Failed to get answer."}`;
    }
}

function highlightNodes(winningNodeIds) {
    if (!nodes) return;

    // Step 1: Dim ALL nodes to a light grey color
    const allNodes = nodes.get().map(node => ({
        id: node.id,
        color: { background: '#f1f5f9', border: '#cbd5e1' }, // Tailwind Slate-100 / Slate-300
        size: 10,
        font: { color: '#94a3b8' } // Tailwind Slate-400
    }));

    // Step 2: Enlarge and highlight the specific PageRank winners
    winningNodeIds.forEach(id => {
        const nodeIndex = allNodes.findIndex(n => n.id === id);
        if (nodeIndex !== -1) {
            allNodes[nodeIndex].color = { background: '#fef08a', border: '#eab308' }; // Bright Yellow
            allNodes[nodeIndex].size = 35;
            allNodes[nodeIndex].font = { color: '#854d0e', size: 18, bold: true };
        }
    });

    // Push updates to the visualization
    nodes.update(allNodes);
}