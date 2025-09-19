/**
 * Complete Workflow Editor - n8n-like no-code environment
 */
class WorkflowEditor {
    constructor(options = {}) {
        this.options = {
            workflowId: null,
            workflowData: { nodes: [], connections: [] },
            csrfToken: null,
            apiBaseUrl: '/api/workflows/',
            autoSave: true,
            ...options
        };

        // Core components
        this.canvas = null;
        this.nodePalette = null;
        this.propertiesPanel = null;

        // State management
        this.workflow = {
            id: this.options.workflowId,
            name: 'Untitled Workflow',
            description: '',
            nodes: new Map(),
            connections: new Map(),
            variables: new Map(),
            status: 'draft'
        };

        this.executionData = new Map(); // Store execution results for each node
        this.isDirty = false;
        this.isExecuting = false;
        this.selectedNode = null;
        this.selectedConnection = null;

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupNodePalette();
        this.setupPropertiesPanel();
        this.setupEventListeners();
        this.loadWorkflowData();
        this.setupCSRFProtection();
    }

    setupCSRFProtection() {
        // Setup CSRF token for all AJAX requests
        const csrfToken = this.getCsrfToken();
        
        // Set default headers for fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            if (!options.headers) {
                options.headers = {};
            }
            
            // Add CSRF token for non-GET requests
            if (!options.method || options.method.toUpperCase() !== 'GET') {
                options.headers['X-CSRFToken'] = csrfToken;
                options.headers['X-XSRF-TOKEN'] = csrfToken;
            }
            
            // Ensure credentials are included
            options.credentials = options.credentials || 'same-origin';
            
            return originalFetch(url, options);
        };
    }

    getCsrfToken() {
        // Try multiple ways to get CSRF token
        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken) {
            return metaToken.getAttribute('content');
        }

        const cookieToken = this.getCookie('csrftoken');
        if (cookieToken) {
            return cookieToken;
        }

        const inputToken = document.querySelector('[name="csrfmiddlewaretoken"]');
        if (inputToken) {
            return inputToken.value;
        }

        return '';
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    }

    setupCanvas() {
        const canvasContainer = document.getElementById('workflow-canvas');
        if (!canvasContainer) return;

        // Create canvas with grid and connection layer
        canvasContainer.innerHTML = `
            <div class="canvas-grid"></div>
            <svg class="connections-svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                    </marker>
                </defs>
            </svg>
            <div class="nodes-container" style="position: relative; z-index: 2;"></div>
        `;

        this.connectionsLayer = canvasContainer.querySelector('.connections-svg');
        this.nodesContainer = canvasContainer.querySelector('.nodes-container');
        this.gridLayer = canvasContainer.querySelector('.canvas-grid');

        this.setupCanvasEvents();
    }

    setupCanvasEvents() {
        const canvas = document.getElementById('workflow-canvas');
        
        // Drag and drop for new nodes
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('text/plain');
            if (nodeType) {
                const rect = canvas.getBoundingClientRect();
                const position = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };
                this.addNode(nodeType, position);
            }
        });

        // Canvas click to deselect
        canvas.addEventListener('click', (e) => {
            if (e.target === canvas || e.target.classList.contains('canvas-grid')) {
                this.clearSelection();
            }
        });
    }

    setupNodePalette() {
        this.loadNodeTypes().then(nodeTypes => {
            this.renderNodePalette(nodeTypes);
        });
    }

    async loadNodeTypes() {
        try {
            const response = await fetch('/api/node-types/');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to load node types from API, using defaults');
        }
        
        // Fallback to default node types
        return this.getDefaultNodeTypes();
    }

    getDefaultNodeTypes() {
        return [
            {
                name: 'manual_trigger',
                display_name: 'Manual Trigger',
                category: 'trigger',
                icon: 'fa-hand-pointer',
                color: '#10b981',
                description: 'Manually start workflow',
                config_schema: { fields: [] }
            },
            {
                name: 'database_query',
                display_name: 'Database Query',
                category: 'data',
                icon: 'fa-database',
                color: '#8b5cf6',
                description: 'Query database for data',
                config_schema: {
                    fields: [
                        { name: 'query_type', type: 'select', options: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], default: 'SELECT', label: 'Query Type' },
                        { name: 'table_name', type: 'text', required: true, label: 'Table Name' },
                        { name: 'conditions', type: 'text', label: 'WHERE Conditions' },
                        { name: 'fields', type: 'text', default: '*', label: 'Fields' },
                        { name: 'limit', type: 'number', default: 100, label: 'Limit' }
                    ]
                }
            },
            {
                name: 'data_transform',
                display_name: 'Data Transform',
                category: 'transform',
                icon: 'fa-cogs',
                color: '#059669',
                description: 'Transform and map data',
                config_schema: {
                    fields: [
                        { name: 'transform_type', type: 'select', options: ['map', 'filter', 'aggregate'], default: 'map', label: 'Transform Type' },
                        { name: 'field_mappings', type: 'textarea', label: 'Field Mappings (JSON)' },
                        { name: 'filter_expression', type: 'text', label: 'Filter Expression' }
                    ]
                }
            },
            {
                name: 'condition',
                display_name: 'Condition',
                category: 'condition',
                icon: 'fa-code-branch',
                color: '#ef4444',
                description: 'Branch based on conditions',
                config_schema: {
                    fields: [
                        { name: 'conditions', type: 'textarea', label: 'Conditions (JSON)', required: true },
                        { name: 'logic_operator', type: 'select', options: ['AND', 'OR'], default: 'AND', label: 'Logic Operator' }
                    ]
                }
            },
            {
                name: 'email_send',
                display_name: 'Send Email',
                category: 'action',
                icon: 'fa-envelope',
                color: '#06b6d4',
                description: 'Send email notifications',
                config_schema: {
                    fields: [
                        { name: 'to', type: 'text', required: true, label: 'To Email' },
                        { name: 'subject', type: 'text', required: true, label: 'Subject' },
                        { name: 'body', type: 'textarea', required: true, label: 'Email Body' }
                    ]
                }
            }
        ];
    }

    renderNodePalette(nodeTypes) {
        const paletteContent = document.querySelector('.palette-content');
        if (!paletteContent) return;

        const categories = this.groupNodesByCategory(nodeTypes);
        
        Object.entries(categories).forEach(([category, nodes]) => {
            const categoryElement = paletteContent.querySelector(`[data-category="${category}"]`);
            if (categoryElement) {
                const nodesContainer = categoryElement.querySelector('.category-nodes');
                nodesContainer.innerHTML = '';
                
                nodes.forEach(nodeType => {
                    const nodeElement = this.createPaletteNode(nodeType);
                    nodesContainer.appendChild(nodeElement);
                });
            }
        });

        this.setupPaletteEvents();
    }

    groupNodesByCategory(nodeTypes) {
        const categories = {};
        nodeTypes.forEach(nodeType => {
            const category = nodeType.category || 'other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(nodeType);
        });
        return categories;
    }

    createPaletteNode(nodeType) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'palette-node';
        nodeDiv.draggable = true;
        nodeDiv.setAttribute('data-node-type', nodeType.name);
        nodeDiv.title = nodeType.description;

        nodeDiv.innerHTML = `
            <div class="node-icon" style="background-color: ${nodeType.color}">
                <i class="fas ${nodeType.icon}"></i>
            </div>
            <span class="node-name">${nodeType.display_name}</span>
        `;

        nodeDiv.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', nodeType.name);
            e.dataTransfer.setData('application/json', JSON.stringify(nodeType));
        });

        return nodeDiv;
    }

    setupPaletteEvents() {
        // Category toggle
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => {
                const category = header.parentElement;
                category.classList.toggle('collapsed');
            });
        });

        // Node search
        const searchInput = document.getElementById('node-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterNodes(e.target.value);
            });
        }
    }

    filterNodes(searchTerm) {
        const term = searchTerm.toLowerCase();
        document.querySelectorAll('.palette-node').forEach(node => {
            const name = node.querySelector('.node-name').textContent.toLowerCase();
            const matches = name.includes(term);
            node.style.display = matches ? 'flex' : 'none';
        });
    }

    setupPropertiesPanel() {
        // Properties panel will be populated when nodes are selected
        this.setupPropertiesEvents();
    }

    setupPropertiesEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Clear logs
        document.getElementById('clear-logs')?.addEventListener('click', () => {
            this.clearExecutionLogs();
        });
    }

    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    setupEventListeners() {
        // Toolbar buttons
        document.getElementById('save-btn')?.addEventListener('click', () => {
            this.saveWorkflow();
        });

        document.getElementById('test-btn')?.addEventListener('click', () => {
            this.testWorkflow();
        });

        document.getElementById('deploy-btn')?.addEventListener('click', () => {
            this.deployWorkflow();
        });

        // Workflow name/description editing
        document.getElementById('workflow-name')?.addEventListener('input', (e) => {
            this.workflow.name = e.target.value;
            this.markDirty();
        });

        document.getElementById('workflow-description')?.addEventListener('input', (e) => {
            this.workflow.description = e.target.value;
            this.markDirty();
        });

        // Zoom controls
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out')?.addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('zoom-fit')?.addEventListener('click', () => {
            this.fitToView();
        });

        // Canvas controls
        document.getElementById('center-canvas')?.addEventListener('click', () => {
            this.centerCanvas();
        });

        document.getElementById('clear-canvas')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all nodes?')) {
                this.clearCanvas();
            }
        });
    }

    // Node Management
    addNode(nodeType, position) {
        const nodeId = this.generateId();
        const nodeTypeData = this.getNodeTypeData(nodeType);
        
        const node = {
            id: nodeId,
            type: nodeType,
            name: nodeTypeData?.display_name || nodeType,
            position: position,
            config: {},
            data: null, // Store execution results
            status: 'idle' // idle, running, success, failed
        };

        this.workflow.nodes.set(nodeId, node);
        this.renderNode(node);
        this.markDirty();
        
        return nodeId;
    }

    renderNode(node) {
        let nodeElement = this.nodesContainer.querySelector(`[data-node-id="${node.id}"]`);
        
        if (!nodeElement) {
            nodeElement = document.createElement('div');
            nodeElement.className = 'workflow-node';
            nodeElement.setAttribute('data-node-id', node.id);
            nodeElement.setAttribute('data-node-type', node.type);
            this.nodesContainer.appendChild(nodeElement);
        }

        const nodeTypeData = this.getNodeTypeData(node.type);
        const isSelected = this.selectedNode === node.id;

        nodeElement.className = `workflow-node ${isSelected ? 'selected' : ''} status-${node.status}`;
        nodeElement.style.left = `${node.position.x}px`;
        nodeElement.style.top = `${node.position.y}px`;

        nodeElement.innerHTML = `
            <div class="node-header" style="background-color: ${nodeTypeData?.color || '#6b7280'}">
                <div class="node-icon">
                    <i class="fas ${nodeTypeData?.icon || 'fa-cube'}"></i>
                </div>
                <div class="node-title">${node.name}</div>
                <div class="node-status ${node.status}"></div>
            </div>
            <div class="node-body">
                ${this.getNodeSummary(node)}
                ${node.data ? this.renderDataPreview(node.data) : ''}
            </div>
            <div class="node-handles">
                <div class="node-handle input" data-handle="input"></div>
                <div class="node-handle output" data-handle="output"></div>
            </div>
        `;

        this.setupNodeEvents(nodeElement, node);
    }

    getNodeSummary(node) {
        const config = node.config || {};
        const keys = Object.keys(config);
        
        if (keys.length === 0) {
            return '<div class="node-summary">Click to configure</div>';
        }

        const summaryItems = keys.slice(0, 2).map(key => {
            const value = config[key];
            const displayValue = typeof value === 'string' && value.length > 20 
                ? value.substring(0, 20) + '...' 
                : value;
            return `<div class="config-item">${key}: ${displayValue}</div>`;
        });

        return `<div class="node-summary">${summaryItems.join('')}</div>`;
    }

    renderDataPreview(data) {
        if (!data) return '';
        
        let preview = '';
        if (typeof data === 'object') {
            if (Array.isArray(data)) {
                preview = `Array (${data.length} items)`;
                if (data.length > 0) {
                    preview += `\nFirst item: ${JSON.stringify(data[0]).substring(0, 100)}...`;
                }
            } else {
                const keys = Object.keys(data);
                preview = `Object (${keys.length} keys)`;
                if (keys.length > 0) {
                    preview += `\nKeys: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
                }
            }
        } else {
            preview = String(data).substring(0, 100);
        }

        return `
            <div class="data-preview">
                <div class="preview-header">
                    <i class="fas fa-database"></i> Data Preview
                </div>
                <pre>${preview}</pre>
            </div>
        `;
    }

    setupNodeEvents(nodeElement, node) {
        // Node selection
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
        });

        // Node dragging
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };

        nodeElement.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('node-handle')) return;
            
            isDragging = true;
            dragStart = {
                x: e.clientX - node.position.x,
                y: e.clientY - node.position.y
            };
            
            nodeElement.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            node.position.x = e.clientX - dragStart.x;
            node.position.y = e.clientY - dragStart.y;
            
            nodeElement.style.left = `${node.position.x}px`;
            nodeElement.style.top = `${node.position.y}px`;
            
            this.updateConnections();
            this.markDirty();
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                nodeElement.style.cursor = 'grab';
            }
        });

        // Handle connections
        const inputHandle = nodeElement.querySelector('.node-handle.input');
        const outputHandle = nodeElement.querySelector('.node-handle.output');

        if (outputHandle) {
            outputHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startConnection(node.id, 'output', e);
            });
        }

        if (inputHandle) {
            inputHandle.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                this.finishConnection(node.id, 'input');
            });
        }
    }

    // Connection Management
    startConnection(sourceNodeId, sourceHandle, e) {
        this.connectionInProgress = {
            source: sourceNodeId,
            sourceHandle: sourceHandle,
            startPos: { x: e.clientX, y: e.clientY }
        };

        // Create temporary connection line
        this.createTempConnection(e);
        
        document.addEventListener('mousemove', this.updateTempConnection.bind(this));
        document.addEventListener('mouseup', this.cancelConnection.bind(this));
    }

    createTempConnection(e) {
        const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempLine.setAttribute('class', 'temp-connection');
        tempLine.setAttribute('stroke', '#6b7280');
        tempLine.setAttribute('stroke-width', '2');
        tempLine.setAttribute('stroke-dasharray', '5,5');
        tempLine.setAttribute('fill', 'none');
        this.connectionsLayer.appendChild(tempLine);
    }

    updateTempConnection(e) {
        const tempLine = this.connectionsLayer.querySelector('.temp-connection');
        if (!tempLine || !this.connectionInProgress) return;

        const canvas = document.getElementById('workflow-canvas');
        const rect = canvas.getBoundingClientRect();
        
        const start = this.getNodeHandlePosition(this.connectionInProgress.source, 'output');
        const end = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        const path = this.createConnectionPath(start, end);
        tempLine.setAttribute('d', path);
    }

    finishConnection(targetNodeId, targetHandle) {
        if (!this.connectionInProgress) return;

        const connectionId = this.generateId();
        const connection = {
            id: connectionId,
            source: this.connectionInProgress.source,
            sourceHandle: this.connectionInProgress.sourceHandle,
            target: targetNodeId,
            targetHandle: targetHandle
        };

        this.workflow.connections.set(connectionId, connection);
        this.renderConnection(connection);
        this.markDirty();

        this.cancelConnection();
    }

    cancelConnection() {
        // Remove temp connection
        const tempLine = this.connectionsLayer.querySelector('.temp-connection');
        if (tempLine) {
            tempLine.remove();
        }

        this.connectionInProgress = null;
        document.removeEventListener('mousemove', this.updateTempConnection.bind(this));
        document.removeEventListener('mouseup', this.cancelConnection.bind(this));
    }

    renderConnection(connection) {
        const sourceNode = this.workflow.nodes.get(connection.source);
        const targetNode = this.workflow.nodes.get(connection.target);
        
        if (!sourceNode || !targetNode) return;

        let connectionElement = this.connectionsLayer.querySelector(`[data-connection-id="${connection.id}"]`);
        
        if (!connectionElement) {
            connectionElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            connectionElement.setAttribute('data-connection-id', connection.id);
            connectionElement.setAttribute('class', 'connection-line');
            connectionElement.setAttribute('marker-end', 'url(#arrowhead)');
            connectionElement.setAttribute('stroke', '#3b82f6');
            connectionElement.setAttribute('stroke-width', '2');
            connectionElement.setAttribute('fill', 'none');
            this.connectionsLayer.appendChild(connectionElement);

            connectionElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectConnection(connection.id);
            });
        }

        const sourcePos = this.getNodeHandlePosition(connection.source, 'output');
        const targetPos = this.getNodeHandlePosition(connection.target, 'input');
        
        const path = this.createConnectionPath(sourcePos, targetPos);
        connectionElement.setAttribute('d', path);
    }

    getNodeHandlePosition(nodeId, handleType) {
        const nodeElement = this.nodesContainer.querySelector(`[data-node-id="${nodeId}"]`);
        if (!nodeElement) return { x: 0, y: 0 };

        const nodeRect = nodeElement.getBoundingClientRect();
        const canvasRect = document.getElementById('workflow-canvas').getBoundingClientRect();

        const handle = nodeElement.querySelector(`.node-handle.${handleType}`);
        if (!handle) return { x: 0, y: 0 };

        const handleRect = handle.getBoundingClientRect();

        return {
            x: handleRect.left + handleRect.width / 2 - canvasRect.left,
            y: handleRect.top + handleRect.height / 2 - canvasRect.top
        };
    }

    createConnectionPath(start, end) {
        const dx = end.x - start.x;
        const controlOffset = Math.max(50, Math.abs(dx) * 0.5);

        return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
    }

    updateConnections() {
        this.workflow.connections.forEach(connection => {
            this.renderConnection(connection);
        });
    }

    // Selection Management
    selectNode(nodeId) {
        this.clearSelection();
        this.selectedNode = nodeId;
        
        const nodeElement = this.nodesContainer.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }

        this.showNodeProperties(nodeId);
    }

    selectConnection(connectionId) {
        this.clearSelection();
        this.selectedConnection = connectionId;
        
        const connectionElement = this.connectionsLayer.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connectionElement) {
            connectionElement.classList.add('selected');
        }

        this.showConnectionProperties(connectionId);
    }

    clearSelection() {
        // Clear node selection
        if (this.selectedNode) {
            const nodeElement = this.nodesContainer.querySelector(`[data-node-id="${this.selectedNode}"]`);
            if (nodeElement) {
                nodeElement.classList.remove('selected');
            }
            this.selectedNode = null;
        }

        // Clear connection selection
        if (this.selectedConnection) {
            const connectionElement = this.connectionsLayer.querySelector(`[data-connection-id="${this.selectedConnection}"]`);
            if (connectionElement) {
                connectionElement.classList.remove('selected');
            }
            this.selectedConnection = null;
        }

        this.hideProperties();
    }

    // Properties Panel Management
    showNodeProperties(nodeId) {
        const node = this.workflow.nodes.get(nodeId);
        if (!node) return;

        const nodeTypeData = this.getNodeTypeData(node.type);
        if (!nodeTypeData) return;

        const propertiesContainer = document.getElementById('node-properties');
        const noSelection = document.getElementById('no-selection');
        
        if (propertiesContainer && noSelection) {
            noSelection.style.display = 'none';
            propertiesContainer.style.display = 'block';
            
            propertiesContainer.innerHTML = this.generateNodePropertiesForm(node, nodeTypeData);
            this.setupPropertyFormEvents(propertiesContainer, node);
        }

        // Update panel title
        const panelTitle = document.getElementById('panel-title');
        if (panelTitle) {
            panelTitle.textContent = node.name;
        }
    }

    generateNodePropertiesForm(node, nodeTypeData) {
        let html = `
            <div class="form-section">
                <h4>General</h4>
                <div class="form-group">
                    <label for="node-name">Node Name</label>
                    <input type="text" id="node-name" value="${node.name}" class="form-control">
                </div>
            </div>
        `;

        if (nodeTypeData.config_schema && nodeTypeData.config_schema.fields) {
            html += `<div class="form-section"><h4>Configuration</h4>`;
            
            nodeTypeData.config_schema.fields.forEach(field => {
                const value = node.config[field.name] || field.default || '';
                html += this.generateFormField(field, value, node);
            });
            
            html += `</div>`;
        }

        // Data mapping section for non-trigger nodes
        if (node.type !== 'manual_trigger') {
            html += this.generateDataMappingSection(node);
        }

        // Variable section
        html += this.generateVariableSection(node);

        return html;
    }

    generateFormField(field, value, node) {
        const fieldId = `field-${field.name}`;
        const required = field.required ? 'required' : '';
        
        let html = `<div class="form-group">`;
        html += `<label for="${fieldId}">${field.label || field.name}</label>`;

        switch (field.type) {
            case 'text':
                html += `<input type="text" id="${fieldId}" name="${field.name}" value="${value}" class="form-control" ${required}>`;
                break;
            case 'number':
                html += `<input type="number" id="${fieldId}" name="${field.name}" value="${value}" class="form-control" ${required}>`;
                break;
            case 'textarea':
                html += `<textarea id="${fieldId}" name="${field.name}" class="form-control" rows="3" ${required}>${value}</textarea>`;
                break;
            case 'select':
                html += `<select id="${fieldId}" name="${field.name}" class="form-control" ${required}>`;
                field.options.forEach(option => {
                    const selected = value === option ? 'selected' : '';
                    html += `<option value="${option}" ${selected}>${option}</option>`;
                });
                html += `</select>`;
                break;
            default:
                html += `<input type="text" id="${fieldId}" name="${field.name}" value="${value}" class="form-control" ${required}>`;
        }

        // Add variable picker button
        html += `<button type="button" class="btn btn-sm btn-outline variable-picker" data-field="${field.name}">
            <i class="fas fa-code"></i> Variables
        </button>`;

        html += `</div>`;
        return html;
    }

    generateDataMappingSection(node) {
        const previousNodes = this.getPreviousNodes(node.id);
        if (previousNodes.length === 0) {
            return '';
        }

        let html = `
            <div class="form-section">
                <h4>Data Mapping</h4>
                <div class="mapping-container">
                    <div class="mapping-header">
                        <span>Map data from previous nodes:</span>
                        <button type="button" class="btn btn-sm btn-primary" onclick="addMapping('${node.id}')">
                            <i class="fas fa-plus"></i> Add Mapping
                        </button>
                    </div>
                    <div id="mappings-${node.id}" class="mappings-list">
        `;

        // Show existing mappings
        const mappings = node.config.data_mappings || [];
        mappings.forEach((mapping, index) => {
            html += this.generateMappingRow(node.id, mapping, index, previousNodes);
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    generateMappingRow(nodeId, mapping, index, previousNodes) {
        return `
            <div class="mapping-row" data-index="${index}">
                <select class="form-control source-select">
                    <option value="">Select source...</option>
                    ${previousNodes.map(prevNode => {
                        const selected = mapping.source === prevNode.id ? 'selected' : '';
                        return `<option value="${prevNode.id}" ${selected}>${prevNode.name}</option>`;
                    }).join('')}
                </select>
                <input type="text" class="form-control source-path" placeholder="data.field" value="${mapping.sourcePath || ''}">
                <span class="mapping-arrow">→</span>
                <input type="text" class="form-control target-field" placeholder="target_field" value="${mapping.targetField || ''}">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeMapping('${nodeId}', ${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }

    generateVariableSection(node) {
        return `
            <div class="form-section">
                <h4>Variables</h4>
                <div class="variables-container">
                    <div class="variable-header">
                        <button type="button" class="btn btn-sm btn-primary" onclick="addVariable('${node.id}')">
                            <i class="fas fa-plus"></i> Add Variable
                        </button>
                    </div>
                    <div id="variables-${node.id}" class="variables-list">
                        <!-- Variables will be populated here -->
                    </div>
                </div>
            </div>
        `;
    }

    setupPropertyFormEvents(container, node) {
        // Form field changes
        container.querySelectorAll('input, select, textarea').forEach(element => {
            element.addEventListener('change', (e) => {
                this.updateNodeConfig(node.id, e.target.name, e.target.value);
            });
        });

        // Variable picker buttons
        container.querySelectorAll('.variable-picker').forEach(button => {
            button.addEventListener('click', (e) => {
                this.showVariablePicker(e.target.dataset.field, node.id);
            });
        });
    }

    updateNodeConfig(nodeId, fieldName, value) {
        const node = this.workflow.nodes.get(nodeId);
        if (!node) return;

        if (fieldName === 'name') {
            node.name = value;
        } else {
            if (!node.config) {
                node.config = {};
            }
            node.config[fieldName] = value;
        }

        this.renderNode(node);
        this.markDirty();
    }

    showVariablePicker(fieldName, nodeId) {
        const variables = this.getAvailableVariables(nodeId);
        const previousNodes = this.getPreviousNodes(nodeId);
        
        let html = `
            <div class="variable-picker-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Select Variable</h3>
                        <button class="modal-close" onclick="closeVariablePicker()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="variable-categories">
                            <div class="category">
                                <h4>Workflow Variables</h4>
                                ${variables.map(v => `
                                    <div class="variable-item" onclick="selectVariable('{{${v.name}}}', '${fieldName}', '${nodeId}')">
                                        <span class="variable-name">${v.name}</span>
                                        <span class="variable-value">${v.value}</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="category">
                                <h4>Previous Node Data</h4>
                                ${previousNodes.map(prevNode => `
                                    <div class="variable-item" onclick="selectVariable('{{${prevNode.id}.data}}', '${fieldName}', '${nodeId}')">
                                        <span class="variable-name">${prevNode.name} (All Data)</span>
                                    </div>
                                    ${this.getNodeDataFields(prevNode).map(field => `
                                        <div class="variable-item" onclick="selectVariable('{{${prevNode.id}.data.${field}}}', '${fieldName}', '${nodeId}')">
                                            <span class="variable-name">${prevNode.name}.${field}</span>
                                        </div>
                                    `).join('')}
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    getAvailableVariables(nodeId) {
        return Array.from(this.workflow.variables.values());
    }

    getPreviousNodes(nodeId) {
        const previousNodes = [];
        this.workflow.connections.forEach(connection => {
            if (connection.target === nodeId) {
                const sourceNode = this.workflow.nodes.get(connection.source);
                if (sourceNode) {
                    previousNodes.push(sourceNode);
                }
            }
        });
        return previousNodes;
    }

    getNodeDataFields(node) {
        if (!node.data || typeof node.data !== 'object') return [];
        
        if (Array.isArray(node.data) && node.data.length > 0) {
            return Object.keys(node.data[0] || {});
        } else if (typeof node.data === 'object') {
            return Object.keys(node.data);
        }
        
        return [];
    }

    hideProperties() {
        const noSelection = document.getElementById('no-selection');
        const nodeProperties = document.getElementById('node-properties');
        const connectionProperties = document.getElementById('connection-properties');
        
        if (noSelection) noSelection.style.display = 'flex';
        if (nodeProperties) nodeProperties.style.display = 'none';
        if (connectionProperties) connectionProperties.style.display = 'none';
    }

    // Workflow Operations
    async saveWorkflow() {
        try {
            this.showLoading('Saving workflow...');
            
            const workflowData = {
                name: this.workflow.name,
                description: this.workflow.description,
                definition: {
                    nodes: Array.from(this.workflow.nodes.values()),
                    connections: Array.from(this.workflow.connections.values())
                },
                status: this.workflow.status
            };

            let response;
            if (this.workflow.id) {
                // Update existing workflow
                response = await fetch(`${this.options.apiBaseUrl}${this.workflow.id}/`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(workflowData)
                });
            } else {
                // Create new workflow
                response = await fetch(this.options.apiBaseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(workflowData)
                });
            }

            if (response.ok) {
                const result = await response.json();
                this.workflow.id = result.id;
                this.isDirty = false;
                this.showNotification('Workflow saved successfully', 'success');
                
                // Update URL if this was a new workflow
                if (!this.options.workflowId) {
                    window.history.replaceState({}, '', `/workflows/${result.id}/edit/`);
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save workflow');
            }
        } catch (error) {
            console.error('Save error:', error);
            this.showNotification(`Failed to save: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async testWorkflow() {
        if (!this.workflow.id) {
            this.showNotification('Please save the workflow first', 'warning');
            return;
        }

        try {
            this.showLoading('Testing workflow...');
            this.isExecuting = true;
            
            // Clear previous execution data
            this.executionData.clear();
            this.workflow.nodes.forEach(node => {
                node.status = 'idle';
                node.data = null;
                this.renderNode(node);
            });

            const response = await fetch(`/api/workflows/${this.workflow.id}/test/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input_data: {},
                    test_mode: true
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.handleTestResults(result);
                this.showNotification('Workflow test completed', 'success');
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Test execution failed');
            }
        } catch (error) {
            console.error('Test error:', error);
            this.showNotification(`Test failed: ${error.message}`, 'error');
        } finally {
            this.isExecuting = false;
            this.hideLoading();
        }
    }

    handleTestResults(result) {
        // Update nodes with execution results
        if (result.node_executions) {
            result.node_executions.forEach(nodeExecution => {
                const node = this.workflow.nodes.get(nodeExecution.node_id);
                if (node) {
                    node.status = nodeExecution.status;
                    node.data = nodeExecution.output_data;
                    this.renderNode(node);
                }
            });
        }

        // Show execution logs
        this.showExecutionLogs(result);
    }

    showExecutionLogs(result) {
        const logsContainer = document.getElementById('execution-logs');
        if (!logsContainer) return;

        let logsHtml = '';
        if (result.node_executions) {
            result.node_executions.forEach(nodeExecution => {
                const statusIcon = this.getStatusIcon(nodeExecution.status);
                const duration = nodeExecution.duration_ms ? `${nodeExecution.duration_ms}ms` : '';
                
                logsHtml += `
                    <div class="log-entry log-${nodeExecution.status}">
                        <div class="log-header">
                            <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
                            <span class="log-level">${nodeExecution.status}</span>
                            <span class="log-node">${nodeExecution.node_name}</span>
                            ${duration ? `<span class="log-duration">${duration}</span>` : ''}
                        </div>
                        <div class="log-message">
                            ${nodeExecution.status === 'success' ? 'Node executed successfully' : 'Node execution failed'}
                        </div>
                        ${nodeExecution.output_data ? `
                            <div class="log-data">
                                <pre>${JSON.stringify(nodeExecution.output_data, null, 2)}</pre>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
        }

        logsContainer.innerHTML = logsHtml;
        
        // Switch to logs tab
        this.switchTab('logs');
    }

    getStatusIcon(status) {
        const icons = {
            success: 'fa-check-circle',
            failed: 'fa-times-circle',
            running: 'fa-spinner fa-spin',
            idle: 'fa-circle'
        };
        return icons[status] || 'fa-question-circle';
    }

    async deployWorkflow() {
        if (!this.workflow.id) {
            this.showNotification('Please save the workflow first', 'warning');
            return;
        }

        try {
            const response = await fetch(`${this.options.apiBaseUrl}${this.workflow.id}/activate/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                this.workflow.status = 'active';
                this.showNotification('Workflow deployed successfully', 'success');
                this.updateStatusDisplay();
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to deploy workflow');
            }
        } catch (error) {
            console.error('Deploy error:', error);
            this.showNotification(`Deploy failed: ${error.message}`, 'error');
        }
    }

    updateStatusDisplay() {
        const statusElement = document.querySelector('.workflow-status');
        if (statusElement) {
            statusElement.className = `workflow-status status-${this.workflow.status}`;
            statusElement.textContent = this.workflow.status.charAt(0).toUpperCase() + this.workflow.status.slice(1);
        }
    }

    // Data Loading
    loadWorkflowData() {
        if (this.options.workflowData && this.options.workflowData.nodes) {
            this.workflow.name = this.options.workflowData.name || 'Untitled Workflow';
            this.workflow.description = this.options.workflowData.description || '';
            
            // Load nodes
            this.options.workflowData.nodes.forEach(nodeData => {
                this.workflow.nodes.set(nodeData.id, nodeData);
                this.renderNode(nodeData);
            });

            // Load connections
            if (this.options.workflowData.connections) {
                this.options.workflowData.connections.forEach(connectionData => {
                    this.workflow.connections.set(connectionData.id, connectionData);
                    this.renderConnection(connectionData);
                });
            }
        }
    }

    // Utility Methods
    generateId() {
        return 'node_' + Math.random().toString(36).substr(2, 9);
    }

    getNodeTypeData(nodeType) {
        // This would normally come from the loaded node types
        // For now, return basic data
        const defaultTypes = this.getDefaultNodeTypes();
        return defaultTypes.find(type => type.name === nodeType);
    }

    markDirty() {
        this.isDirty = true;
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save*';
        }
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            const spinner = overlay.querySelector('.loading-spinner p');
            if (spinner) spinner.textContent = message;
            overlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        notification.style.backgroundColor = colors[type] || colors.info;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    clearExecutionLogs() {
        const logsContainer = document.getElementById('execution-logs');
        if (logsContainer) {
            logsContainer.innerHTML = `
                <div class="log-placeholder">
                    <i class="fas fa-info-circle"></i>
                    <p>No execution logs yet. Run your workflow to see logs here.</p>
                </div>
            `;
        }
    }

    // Zoom and View Controls
    zoomIn() {
        // Implement zoom in functionality
        this.showNotification('Zoom in', 'info');
    }

    zoomOut() {
        // Implement zoom out functionality
        this.showNotification('Zoom out', 'info');
    }

    fitToView() {
        // Implement fit to view functionality
        this.showNotification('Fit to view', 'info');
    }

    centerCanvas() {
        // Implement center canvas functionality
        this.showNotification('Canvas centered', 'info');
    }

    clearCanvas() {
        this.workflow.nodes.clear();
        this.workflow.connections.clear();
        this.nodesContainer.innerHTML = '';
        this.connectionsLayer.innerHTML = `
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
            </defs>
        `;
        this.clearSelection();
        this.markDirty();
    }
}

// Global functions for template usage
window.addMapping = function(nodeId) {
    const editor = window.workflowEditor;
    const node = editor.workflow.nodes.get(nodeId);
    if (!node) return;

    if (!node.config.data_mappings) {
        node.config.data_mappings = [];
    }

    node.config.data_mappings.push({
        source: '',
        sourcePath: '',
        targetField: ''
    });

    editor.showNodeProperties(nodeId);
    editor.markDirty();
};

window.removeMapping = function(nodeId, index) {
    const editor = window.workflowEditor;
    const node = editor.workflow.nodes.get(nodeId);
    if (!node || !node.config.data_mappings) return;

    node.config.data_mappings.splice(index, 1);
    editor.showNodeProperties(nodeId);
    editor.markDirty();
};

window.addVariable = function(nodeId) {
    const editor = window.workflowEditor;
    const variableName = prompt('Enter variable name:');
    const variableValue = prompt('Enter variable value:');
    
    if (variableName && variableValue) {
        editor.workflow.variables.set(variableName, {
            name: variableName,
            value: variableValue,
            scope: 'workflow'
        });
        editor.markDirty();
    }
};

window.selectVariable = function(variableExpression, fieldName, nodeId) {
    const fieldElement = document.getElementById(`field-${fieldName}`);
    if (fieldElement) {
        fieldElement.value = variableExpression;
        fieldElement.dispatchEvent(new Event('change'));
    }
    closeVariablePicker();
};

window.closeVariablePicker = function() {
    const modal = document.querySelector('.variable-picker-modal');
    if (modal) {
        modal.remove();
    }
};

// Export for global use
window.WorkflowEditor = WorkflowEditor;