import './styles.css';

const BASE_API_URL = window.BASE_API_URL || 'http://localhost:3000/api';
let network = null;
let inputQueue = [];


window.onload = () => {
    fetchGraph();

    const inputEl = document.getElementById('inputData');
    if (inputEl) {
        inputEl.addEventListener('keyup', handleKeyPress);
    }
    const addToQueueBtn = document.getElementById('addToQueueBtn');
    if (addToQueueBtn) {
        addToQueueBtn.addEventListener('click', addToQueue);
    }
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
        extractBtn.addEventListener('click', extractBatch);
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

};

function handleKeyPress(e) {
    if (e.key === 'Enter') addToQueue();
}

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

async function extractBatch() {
    if (inputQueue.length === 0) return;

    const statusEl = document.getElementById('status');
    const btn = document.getElementById('extractBtn');
    statusEl.innerText = "⏳ Sending batch to Gemini... this might take 15-30 seconds.";
    statusEl.style.color = "#d69e2e";
    btn.disabled = true;

    // Separate the queue into URLs and Texts
    const urls = inputQueue.filter(item => item.startsWith("http://") || item.startsWith("https://"));
    const texts = inputQueue.filter(item => !item.startsWith("http://") && !item.startsWith("https://"));

    // Build the payload
    const payload = {};
    if (urls.length > 0) payload.urls = urls;

    // Combine all text snippets into one giant string with spacing
    if (texts.length > 0) payload.text = texts.join("\n\n---\n\n");

    try {
        const response = await fetch(`${API_BASE_URL}/extract`, {
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

        // Immediately fetch the updated global graph
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
        const edgesData = await response.json();
        renderGraph(edgesData);
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
    const nodes = new vis.DataSet(
        Array.from(nodeSet).map(name => ({ id: name, label: name, shape: "dot", size: 20 }))
    );

    // 3. Format edges for Vis.js
    const edges = new vis.DataSet(
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
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportJSON() {
    if (currentGraphData.length === 0) {
        alert("The graph is empty! Extract some knowledge first.");
        return;
    }
    // Convert the Javascript object back to pretty-printed JSON
    const jsonString = JSON.stringify(currentGraphData, null, 2);
    downloadFile(jsonString, "knowledge_graph.json", "application/json");
}

function exportCSV() {
    if (currentGraphData.length === 0) {
        alert("The graph is empty! Extract some knowledge first.");
        return;
    }

    // Create CSV Headers
    let csvString = "Source,Relation,Target\n";

    // Loop through edges and format them safely (escaping quotes)
    currentGraphData.forEach(edge => {
        const src = `"${edge.source.replace(/"/g, '""')}"`;
        const rel = `"${edge.relation.replace(/"/g, '""')}"`;
        const tgt = `"${edge.target.replace(/"/g, '""')}"`;
        csvString += `${src},${rel},${tgt}\n`;
    });

    downloadFile(csvString, "knowledge_graph.csv", "text/csv");
}