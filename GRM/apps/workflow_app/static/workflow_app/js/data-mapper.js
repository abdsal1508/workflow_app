/**
 * Data Mapper - Handles data mapping between nodes
 */
class DataMapper {
    constructor(workflowEditor) {
        this.editor = workflowEditor;
        this.mappings = new Map();
        
        this.init();
    }

    init() {
        this.setupMappingEvents();
    }

    setupMappingEvents() {
        // Listen for node selection to show mapping options
        document.addEventListener('nodeSelected', (e) => {
            this.showMappingOptions(e.detail.nodeId);
        });
    }

    showMappingOptions(nodeId) {
        const node = this.editor.workflow.nodes.get(nodeId);
        if (!node || node.type === 'manual_trigger') return;

        const previousNodes = this.getPreviousNodes(nodeId);
        if (previousNodes.length === 0) return;

        this.renderMappingInterface(node, previousNodes);
    }

    renderMappingInterface(node, previousNodes) {
        const container = document.getElementById('data-mapping-container');
        if (!container) return;

        let html = `
            <div class="mapping-section">
                <div class="mapping-header">
                    <h4>Data Mapping for ${node.name}</h4>
                    <button class="btn btn-sm btn-primary" onclick="dataMapper.addMapping('${node.id}')">
                        <i class="fas fa-plus"></i> Add Mapping
                    </button>
                </div>
                <div class="mapping-list" id="mappings-${node.id}">
        `;

        const mappings = node.config.data_mappings || [];
        mappings.forEach((mapping, index) => {
            html += this.renderMappingRow(node.id, mapping, index, previousNodes);
        });

        html += `
                </div>
                <div class="mapping-preview">
                    <h5>Preview</h5>
                    <div id="mapping-preview-${node.id}" class="preview-content">
                        ${this.generateMappingPreview(node, mappings, previousNodes)}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    renderMappingRow(nodeId, mapping, index, previousNodes) {
        return `
            <div class="mapping-row" data-index="${index}">
                <div class="mapping-source">
                    <label>Source Node</label>
                    <select class="form-control source-node-select" onchange="dataMapper.updateSourceFields('${nodeId}', ${index})">
                        <option value="">Select source node...</option>
                        ${previousNodes.map(prevNode => {
                            const selected = mapping.sourceNode === prevNode.id ? 'selected' : '';
                            return `<option value="${prevNode.id}" ${selected}>${prevNode.name}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div class="mapping-field">
                    <label>Source Field</label>
                    <select class="form-control source-field-select">
                        <option value="">Select field...</option>
                        ${this.getSourceFieldOptions(mapping.sourceNode, previousNodes)}
                    </select>
                </div>
                <div class="mapping-transform">
                    <label>Transform</label>
                    <select class="form-control transform-select">
                        <option value="">No transform</option>
                        <option value="upper" ${mapping.transform === 'upper' ? 'selected' : ''}>Uppercase</option>
                        <option value="lower" ${mapping.transform === 'lower' ? 'selected' : ''}>Lowercase</option>
                        <option value="trim" ${mapping.transform === 'trim' ? 'selected' : ''}>Trim</option>
                        <option value="int" ${mapping.transform === 'int' ? 'selected' : ''}>To Integer</option>
                        <option value="float" ${mapping.transform === 'float' ? 'selected' : ''}>To Float</option>
                        <option value="date_format" ${mapping.transform === 'date_format' ? 'selected' : ''}>Format Date</option>
                    </select>
                </div>
                <div class="mapping-target">
                    <label>Target Field</label>
                    <input type="text" class="form-control target-field-input" 
                           value="${mapping.targetField || ''}" 
                           placeholder="target_field_name"
                           onchange="dataMapper.updateMapping('${nodeId}', ${index})">
                </div>
                <div class="mapping-actions">
                    <button class="btn btn-sm btn-danger" onclick="dataMapper.removeMapping('${nodeId}', ${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getSourceFieldOptions(sourceNodeId, previousNodes) {
        if (!sourceNodeId) return '';

        const sourceNode = previousNodes.find(node => node.id === sourceNodeId);
        if (!sourceNode || !sourceNode.data) return '';

        const fields = this.extractFieldsFromData(sourceNode.data);
        return fields.map(field => 
            `<option value="${field}">${field}</option>`
        ).join('');
    }

    extractFieldsFromData(data) {
        const fields = [];
        
        if (Array.isArray(data) && data.length > 0) {
            // Get fields from first item in array
            const firstItem = data[0];
            if (typeof firstItem === 'object') {
                this.extractFieldsRecursive(firstItem, '', fields);
            }
        } else if (typeof data === 'object' && data !== null) {
            this.extractFieldsRecursive(data, '', fields);
        }

        return fields;
    }

    extractFieldsRecursive(obj, prefix, fields) {
        Object.keys(obj).forEach(key => {
            const fullPath = prefix ? `${prefix}.${key}` : key;
            fields.push(fullPath);

            // Recursively extract nested fields (limit depth to avoid infinite recursion)
            if (typeof obj[key] === 'object' && obj[key] !== null && prefix.split('.').length < 3) {
                this.extractFieldsRecursive(obj[key], fullPath, fields);
            }
        });
    }

    updateSourceFields(nodeId, mappingIndex) {
        const row = document.querySelector(`[data-index="${mappingIndex}"]`);
        if (!row) return;

        const sourceNodeSelect = row.querySelector('.source-node-select');
        const sourceFieldSelect = row.querySelector('.source-field-select');
        
        const sourceNodeId = sourceNodeSelect.value;
        if (!sourceNodeId) {
            sourceFieldSelect.innerHTML = '<option value="">Select field...</option>';
            return;
        }

        const sourceNode = this.editor.workflow.nodes.get(sourceNodeId);
        if (!sourceNode || !sourceNode.data) {
            sourceFieldSelect.innerHTML = '<option value="">No data available</option>';
            return;
        }

        const fields = this.extractFieldsFromData(sourceNode.data);
        sourceFieldSelect.innerHTML = `
            <option value="">Select field...</option>
            ${fields.map(field => `<option value="${field}">${field}</option>`).join('')}
        `;
    }

    updateMapping(nodeId, mappingIndex) {
        const node = this.editor.workflow.nodes.get(nodeId);
        if (!node) return;

        const row = document.querySelector(`[data-index="${mappingIndex}"]`);
        if (!row) return;

        const sourceNode = row.querySelector('.source-node-select').value;
        const sourceField = row.querySelector('.source-field-select').value;
        const transform = row.querySelector('.transform-select').value;
        const targetField = row.querySelector('.target-field-input').value;

        if (!node.config.data_mappings) {
            node.config.data_mappings = [];
        }

        if (!node.config.data_mappings[mappingIndex]) {
            node.config.data_mappings[mappingIndex] = {};
        }

        node.config.data_mappings[mappingIndex] = {
            sourceNode: sourceNode,
            sourceField: sourceField,
            transform: transform,
            targetField: targetField
        };

        this.editor.markDirty();
        this.updateMappingPreview(nodeId);
    }

    addMapping(nodeId) {
        const node = this.editor.workflow.nodes.get(nodeId);
        if (!node) return;

        if (!node.config.data_mappings) {
            node.config.data_mappings = [];
        }

        node.config.data_mappings.push({
            sourceNode: '',
            sourceField: '',
            transform: '',
            targetField: ''
        });

        this.showMappingOptions(nodeId);
        this.editor.markDirty();
    }

    removeMapping(nodeId, mappingIndex) {
        const node = this.editor.workflow.nodes.get(nodeId);
        if (!node || !node.config.data_mappings) return;

        node.config.data_mappings.splice(mappingIndex, 1);
        this.showMappingOptions(nodeId);
        this.editor.markDirty();
    }

    updateMappingPreview(nodeId) {
        const previewContainer = document.getElementById(`mapping-preview-${nodeId}`);
        if (!previewContainer) return;

        const node = this.editor.workflow.nodes.get(nodeId);
        const mappings = node.config.data_mappings || [];
        const previousNodes = this.getPreviousNodes(nodeId);

        previewContainer.innerHTML = this.generateMappingPreview(node, mappings, previousNodes);
    }

    generateMappingPreview(node, mappings, previousNodes) {
        if (mappings.length === 0) {
            return '<div class="preview-empty">No mappings defined</div>';
        }

        let preview = '<div class="preview-mappings">';
        
        mappings.forEach((mapping, index) => {
            const sourceNode = previousNodes.find(n => n.id === mapping.sourceNode);
            const sourceName = sourceNode ? sourceNode.name : 'Unknown';
            
            preview += `
                <div class="preview-mapping">
                    <span class="source">${sourceName}.${mapping.sourceField}</span>
                    ${mapping.transform ? `<span class="transform">[${mapping.transform}]</span>` : ''}
                    <span class="arrow">→</span>
                    <span class="target">${mapping.targetField}</span>
                </div>
            `;
        });

        preview += '</div>';
        return preview;
    }

    getPreviousNodes(nodeId) {
        const previousNodes = [];
        this.editor.workflow.connections.forEach(connection => {
            if (connection.target === nodeId) {
                const sourceNode = this.editor.workflow.nodes.get(connection.source);
                if (sourceNode) {
                    previousNodes.push(sourceNode);
                }
            }
        });
        return previousNodes;
    }

    // Expression Builder
    buildExpression(type, params) {
        switch (type) {
            case 'variable':
                return `{{variables.${params.name}}}`;
            case 'node_data':
                return `{{${params.nodeId}.data${params.field ? '.' + params.field : ''}}}`;
            case 'input_data':
                return `{{input.${params.field}}}`;
            case 'context':
                return `{{context.${params.field}}}`;
            default:
                return params.expression || '';
        }
    }

    // Data transformation utilities
    transformValue(value, transformType) {
        switch (transformType) {
            case 'upper':
                return String(value).toUpperCase();
            case 'lower':
                return String(value).toLowerCase();
            case 'trim':
                return String(value).trim();
            case 'int':
                return parseInt(value) || 0;
            case 'float':
                return parseFloat(value) || 0.0;
            case 'bool':
                return Boolean(value);
            case 'json':
                return JSON.stringify(value);
            case 'date_format':
                return new Date(value).toISOString().split('T')[0];
            default:
                return value;
        }
    }

    // Validation
    validateMapping(mapping) {
        const errors = [];

        if (!mapping.sourceNode) {
            errors.push('Source node is required');
        }

        if (!mapping.sourceField) {
            errors.push('Source field is required');
        }

        if (!mapping.targetField) {
            errors.push('Target field is required');
        }

        return errors;
    }

    validateAllMappings(nodeId) {
        const node = this.editor.workflow.nodes.get(nodeId);
        if (!node || !node.config.data_mappings) return [];

        const allErrors = [];
        node.config.data_mappings.forEach((mapping, index) => {
            const errors = this.validateMapping(mapping);
            if (errors.length > 0) {
                allErrors.push({ index, errors });
            }
        });

        return allErrors;
    }
}

// Export for global use
window.DataMapper = DataMapper;