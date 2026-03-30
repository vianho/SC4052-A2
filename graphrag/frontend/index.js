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

    initSourcesTabs();
    fetchSources();
    const refreshSourcesBtn = document.getElementById('refreshSourcesBtn');
    if (refreshSourcesBtn) {
        refreshSourcesBtn.addEventListener('click', fetchSources);
    }

    initSourcesToggle();
};

function setStatus(msg, state = 'idle') {
    const statusEl = document.getElementById('status');
    const colors = {
        idle: '#ff69b4',
        loading: '#f0a500',
        success: '#90ee90',
        error: '#ff4f4f',
    };
    statusEl.innerText = msg;
    statusEl.style.color = colors[state] ?? colors.idle;
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

        const displayText = item.length > 80 ? item.substring(0, 80) + '...' : item;
        const isUrl = item.startsWith('http://') || item.startsWith('https://');

        li.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
        li.innerHTML = `
            <span style="font-size:14px;">${isUrl ? '🔗' : '📝'}</span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayText}</span>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.innerText = '✕';
        removeBtn.style.cssText = `
            background: transparent;
            border: 1px solid #ff4f4f;
            color: #ff4f4f;
            font-family: 'Rajdhani', sans-serif;
            font-weight: 700;
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            flex-shrink: 0;
            transition: background 0.2s;
        `;
        removeBtn.onmouseover = () => removeBtn.style.background = 'rgba(255,79,79,0.15)';
        removeBtn.onmouseleave = () => removeBtn.style.background = 'transparent';
        removeBtn.onclick = () => removeFromQueue(index);

        li.appendChild(removeBtn);
        listEl.appendChild(li);
    });
}

async function extractBatch(force) {
    if (inputQueue.length === 0) return;

    const btn = document.getElementById('extractBtn');
    setStatus('⏳ Sending batch to Gemini... this might take 15-30 seconds.', 'loading');
    btn.disabled = true;
    btn.style.opacity = '0.5';

    const urls = inputQueue.filter(i => i.startsWith("http"));
    const texts = inputQueue.filter(i => !i.startsWith("http"));
    const payload = {
        urls: urls.length ? urls : undefined,
        text: texts.length ? texts.join("\n") : undefined,
        ordered_sources: inputQueue.map(item => ({
            content: item,
            type: item.startsWith("http") ? "url" : "text",
        })),
        force_reextract: force
    };

    try {
        const response = await fetch(`${BASE_API_URL}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Extraction failed on the server.");

        setStatus('✅ Batch extraction complete! Updating graph...', 'success');
        inputQueue = [];
        renderQueue();
        await fetchGraph();
        await fetchSources();

    } catch (error) {
        console.error(error);
        setStatus('❌ Error during batch extraction. Check console.', 'error');
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
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
    const nodeSet = new Set();
    rawEdges.forEach(edge => {
        nodeSet.add(edge.source);
        nodeSet.add(edge.target);
    });

    nodes = new vis.DataSet(
        Array.from(nodeSet).map(name => ({
            id: name,
            label: name,
            shape: "dot",
            size: 18,
        }))
    );

    edges = new vis.DataSet(
        rawEdges.map((edge, index) => ({
            id: index,
            from: edge.source,
            to: edge.target,
            label: edge.relation,
            arrows: "to",
            font: { align: "middle", color: '#fff', size: 11, face: 'Space Mono' }
        }))
    );

    const container = document.getElementById('mynetwork');
    const data = { nodes, edges };
    const options = {
        physics: {
            barnesHut: { gravitationalConstant: -3000, centralGravity: 0.3, springLength: 150 }
        },
        nodes: {
            color: {
                background: '#2e2e2e',
                border: '#ff69b4',
                highlight: { background: '#3a2030', border: '#ff69b4' },
                hover: { background: '#3a2030', border: '#ff9fd0' },
            },
            font: { size: 13, face: 'Space Mono', color: '#ff69b4' },
            borderWidth: 2,
            borderWidthSelected: 3,
            shadow: { enabled: true, color: 'rgba(255,105,180,0.35)', size: 12, x: 0, y: 0 },
        },
        edges: {
            color: {
                color: '#3a3a3a',
                highlight: '#ff69b4',
                hover: '#c4507f',
            },
            smooth: { type: 'continuous' },
            width: 1.5,
            font: {
                strokeWidth: 0
            },
        },
        interaction: { hover: true },
    };

    if (network !== null) {
        network.destroy();
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
    const nodesContainer = document.getElementById('contextNodes');
    const edgesContainer = document.getElementById('contextEdges');

    answerBox.style.display = 'block';
    answerText.innerHTML = `<span style="color:#f0a500; font-family:'Space Mono',monospace; font-size:0.85rem;">⏳ Extracting entities &amp; running PageRank...</span>`;
    nodesContainer.innerHTML = "";
    edgesContainer.innerHTML = "";

    try {
        const res = await fetch(`${BASE_API_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();

        answerText.innerText = data.answer;
        answerText.style.cssText = "color:#c8c8c8; font-family:'Space Mono',monospace; font-size:0.85rem; line-height:1.7;";

        // Top nodes as neon pills
        nodesContainer.innerHTML = `
            <div style="margin-bottom:6px; font-family:'Rajdhani',sans-serif; font-weight:700; font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:#555;">
                Top Nodes
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${data.top_nodes.map(node => `
                    <span style="
                        display:inline-block;
                        background:rgba(255,105,180,0.08);
                        border:1px solid rgba(255,105,180,0.35);
                        color:#ff69b4;
                        font-family:'Space Mono',monospace;
                        font-size:0.72rem;
                        padding:3px 10px;
                        border-radius:4px;
                    ">${node.node} <span style="color:#c4507f;">${node.score.toFixed(4)}</span></span>
                `).join('')}
            </div>
        `;

        // Context edges as a monospace list
        edgesContainer.innerHTML = `
            <div style="margin:12px 0 6px; font-family:'Rajdhani',sans-serif; font-weight:700; font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase; color:#555;">
                Context Edges
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                ${data.context_used.map(edge => `
                    <div style="font-family:'Space Mono',monospace; font-size:0.75rem; color:#666;">
                        <span style="color:#ccc;">${edge.source}</span>
                        <span style="color:#ff69b4; margin:0 6px;">[${edge.relation}]</span>
                        <span style="color:#ccc;">${edge.target}</span>
                    </div>
                `).join('')}
            </div>
        `;

        highlightNodes(data.top_nodes.map(n => n.node));

    } catch (e) {
        answerText.style.color = '#ff4f4f';
        answerText.innerText = `❌ Error: ${e.message || "Failed to get answer."}`;
    }
}

function highlightNodes(winningNodeIds) {
    if (!nodes) return;

    // Dim all nodes to dark/muted
    const allNodes = nodes.get().map(node => ({
        id: node.id,
        color: {
            background: '#252525',
            border: '#3a3a3a',
        },
        size: 10,
        font: { color: '#444', size: 11 },
        shadow: { enabled: false },
    }));

    // Highlight PageRank winners in neon green
    winningNodeIds.forEach(id => {
        const nodeIndex = allNodes.findIndex(n => n.id === id);
        if (nodeIndex !== -1) {
            allNodes[nodeIndex].color = {
                background: '#1a2e1a',
                border: '#90ee90',
            };
            allNodes[nodeIndex].size = 32;
            allNodes[nodeIndex].font = { color: '#90ee90', size: 15, face: 'Space Mono' };
            allNodes[nodeIndex].shadow = { enabled: true, color: 'rgba(144,238,144,0.5)', size: 16, x: 0, y: 0 };
        }
    });

    nodes.update(allNodes);
}

let allSources = [];
let activeTab = 'all';

function initSourcesToggle() {
    const toggle = document.getElementById('sourcesToggle');
    const sidebar = document.getElementById('sourcesPanel');
    if (!toggle || !sidebar) return;

    let collapsed = false;

    toggle.addEventListener('click', () => {
        collapsed = !collapsed;
        sidebar.classList.toggle('collapsed', collapsed);
        toggle.classList.toggle('collapsed', collapsed);
        // Flip arrow direction
        toggle.textContent = collapsed ? '▶' : '◀';
        // Reposition toggle: when collapsed it hugs the right edge of graphRow
        toggle.style.right = collapsed ? '-1px' : 'calc(300px - 1px)';
        // Let vis.js re-fit after the transition
        setTimeout(() => { if (network) network.redraw(); }, 320);
    });
}

async function fetchSources() {
    const list = document.getElementById('sourcesList');
    const empty = document.getElementById('sourcesEmpty');
    list.innerHTML = `<div style="font-size:.72rem;color:#ff69b455;text-align:center;padding:16px 0;">Loading sources...</div>`;
    empty.style.display = 'none';

    try {
        const res = await fetch(`${BASE_API_URL}/sources`);
        if (!res.ok) throw new Error(res.statusText);
        const sourcesJson = await res.json();
        allSources = sourcesJson.sources;
        renderSources();
    } catch (e) {
        list.innerHTML = `<div style="font-size:.72rem;color:#ff4f4f;text-align:center;padding:16px 0;">❌ Failed to load sources: ${e.message}</div>`;
    }
}

function renderSources() {
    const list = document.getElementById('sourcesList');
    const empty = document.getElementById('sourcesEmpty');

    const filtered = allSources.filter(s => {
        if (activeTab === 'url') return s.type === 'url';
        if (activeTab === 'text') return s.type === 'text';
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    list.innerHTML = filtered.map((s, i) => {
        const isUrl = s.type === 'url';
        const label = isUrl ? s.content : `Text snippet #${i + 1}`;
        const preview = s.text || s.content || '';
        const trimmed = preview.length > 200 ? preview.slice(0, 200) + '…' : preview;
        const meta = [
            isUrl ? 'URL' : 'Text',
            s.node_count != null ? `${s.node_count} nodes` : null,
            s.edge_count != null ? `${s.edge_count} edges` : null,
            s.created_at ? new Date(s.created_at).toLocaleString() : null,
        ].filter(Boolean).join('  ·  ');

        return `
        <div class="source-card">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    ${isUrl
                ? `<a href="${s.content}" target="_blank" rel="noopener" class="source-url hover:underline">${label}</a>`
                : `<span class="source-url">${label}</span>`
            }
                    ${!isUrl && trimmed ? `<p class="source-text mt-1 mb-0">${trimmed}</p>` : ''}
                    <div class="source-meta">${meta}</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function initSourcesTabs() {
    document.querySelectorAll('.sources-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            document.querySelectorAll('.sources-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderSources();
        });
    });
    // Set initial active state
    document.querySelector('.sources-tab[data-tab="all"]').classList.add('active');
}