/**
 * Variable Manager - Handles workflow variables and expressions
 */
class VariableManager {
    constructor(workflowEditor) {
        this.editor = workflowEditor;
        this.variables = new Map();
        this.expressions = new Map();
        
        this.init();
    }

    init() {
        this.setupVariableEvents();
        this.loadWorkflowVariables();
    }

    setupVariableEvents() {
        // Add variable button
        document.getElementById('add-variable')?.addEventListener('click', () => {
            this.showAddVariableDialog();
        });

        // Variable search
        document.getElementById('variable-search')?.addEventListener('input', (e) => {
            this.filterVariables(e.target.value);
        });
    }

    showAddVariableDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'variable-dialog-overlay';
        dialog.innerHTML = `
            <div class="variable-dialog">
                <div class="dialog-header">
                    <h3>Add Variable</h3>
                    <button class="dialog-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label for="var-name">Variable Name</label>
                        <input type="text" id="var-name" class="form-control" placeholder="my_variable">
                    </div>
                    <div class="form-group">
                        <label for="var-value">Default Value</label>
                        <input type="text" id="var-value" class="form-control" placeholder="default value">
                    </div>
                    <div class="form-group">
                        <label for="var-type">Type</label>
                        <select id="var-type" class="form-control">
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="json">JSON</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="var-description">Description</label>
                        <textarea id="var-description" class="form-control" rows="2" placeholder="Variable description"></textarea>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="var-secret"> Secret Variable
                        </label>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="btn btn-outline" onclick="this.parentElement.parentElement.parentElement.remove()">Cancel</button>
                    <button class="btn btn-primary" onclick="variableManager.addVariable()">Add Variable</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    }

    addVariable() {
        const name = document.getElementById('var-name').value.trim();
        const value = document.getElementById('var-value').value;
        const type = document.getElementById('var-type').value;
        const description = document.getElementById('var-description').value;
        const isSecret = document.getElementById('var-secret').checked;

        if (!name) {
            alert('Variable name is required');
            return;
        }

        if (this.variables.has(name)) {
            alert('Variable with this name already exists');
            return;
        }

        const variable = {
            name: name,
            value: value,
            type: type,
            description: description,
            isSecret: isSecret,
            scope: 'workflow'
        };

        this.variables.set(name, variable);
        this.renderVariablesList();
        this.editor.markDirty();

        // Close dialog
        document.querySelector('.variable-dialog-overlay').remove();
    }

    renderVariablesList() {
        const container = document.getElementById('variables-list');
        if (!container) return;

        let html = '';
        this.variables.forEach((variable, name) => {
            html += `
                <div class="variable-item" data-variable="${name}">
                    <div class="variable-info">
                        <div class="variable-name">${name}</div>
                        <div class="variable-value">${variable.isSecret ? '***' : variable.value}</div>
                        <div class="variable-type">${variable.type}</div>
                    </div>
                    <div class="variable-actions">
                        <button class="btn btn-sm btn-outline" onclick="variableManager.editVariable('${name}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="variableManager.deleteVariable('${name}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        if (html === '') {
            html = '<div class="empty-message">No variables defined</div>';
        }

        container.innerHTML = html;
    }

    editVariable(name) {
        const variable = this.variables.get(name);
        if (!variable) return;

        // Show edit dialog (similar to add dialog but pre-filled)
        this.showEditVariableDialog(variable);
    }

    deleteVariable(name) {
        if (confirm(`Are you sure you want to delete variable "${name}"?`)) {
            this.variables.delete(name);
            this.renderVariablesList();
            this.editor.markDirty();
        }
    }

    getVariableExpression(variableName) {
        return `{{variables.${variableName}}}`;
    }

    getNodeDataExpression(nodeId, fieldPath = '') {
        if (fieldPath) {
            return `{{${nodeId}.data.${fieldPath}}}`;
        } else {
            return `{{${nodeId}.data}}`;
        }
    }

    resolveExpression(expression, context) {
        // Simple expression resolver
        const pattern = /\{\{([^}]+)\}\}/g;
        
        return expression.replace(pattern, (match, varPath) => {
            const value = this.getValueFromPath(varPath.trim(), context);
            return value !== undefined ? value : match;
        });
    }

    getValueFromPath(path, context) {
        const parts = path.split('.');
        let current = context;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
            }
        }

        return current;
    }

    loadWorkflowVariables() {
        // Load variables from workflow definition
        if (this.editor.workflow.variables) {
            this.editor.workflow.variables.forEach((variable, name) => {
                this.variables.set(name, variable);
            });
        }
        
        this.renderVariablesList();
    }

    getAvailableVariables() {
        return Array.from(this.variables.values());
    }

    getVariablesByScope(scope) {
        return Array.from(this.variables.values()).filter(v => v.scope === scope);
    }
}

// Export for global use
window.VariableManager = VariableManager;