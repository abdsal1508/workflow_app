document.addEventListener('DOMContentLoaded', () => {
    // Helper function to get the CSRF token from cookies
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    const csrftoken = getCookie('csrftoken');

    const queryForm = document.getElementById('queryForm');
    const statusMessage = document.getElementById('statusMessage');
    const resultsContainer = document.getElementById('resultsTableContainer');
    const tableSearch = document.getElementById('tableSearch');
    const tableList = document.getElementById('tableList');
    const selectedTableList = document.getElementById('selectedTableList');
    const columnSearch = document.getElementById('columnSearch');
    const columnList = document.getElementById('columnList');
    const selectedColumnList = document.getElementById('selectedColumnList');
    const joinsContainer = document.getElementById('joinsContainer');
    const addJoinBtn = document.getElementById('addJoinBtn');
    const whereContainer = document.getElementById('whereConditionsContainer');
    const groupByContainer = document.getElementById('groupByContainer');
    const addGroupByBtn = document.getElementById('addGroupByBtn');
    const aggregatesContainer = document.getElementById('aggregatesContainer');
    const addAggregateBtn = document.getElementById('addAggregateBtn');
    const orderByContainer = document.getElementById('orderByContainer');
    const addOrderByBtn = document.getElementById('addOrderByBtn');
    const subqueryColumnContainer = document.getElementById('subqueryColumnContainer');
    const addSubqueryColumnBtn = document.getElementById('addSubqueryColumnBtn');

    const subqueryModal = document.getElementById('subqueryModal');
    const closeSubqueryBtn = document.getElementById('closeSubqueryBtn');
    const cancelSubqueryBtn = document.getElementById('cancelSubqueryBtn');
    const saveSubqueryBtn = document.getElementById('saveSubqueryBtn');
    const subqueryModelSelect = document.getElementById('subqueryModelSelect');
    const subqueryFunctionSelect = document.getElementById('subqueryFunctionSelect');
    const subqueryFieldSelect = document.getElementById('subqueryFieldSelect');
    const subqueryFiltersContainer = document.getElementById('subqueryFiltersContainer');
    const addSubqueryFilterBtn = document.getElementById('addSubqueryFilterBtn');
    let activeSubqueryInput = null;

    const BACKEND_URL = "/query/api/query/";
    const TEMPLATE_API_URL = "/query/api/templates/";
    let currentTemplateId = null;

    let allModels = [];
    let allFields = [];
    let selectedTables = [];
    let selectedColumns = [];

    fetch(BACKEND_URL)
        .then(r => r.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            allModels = data.models;
            renderTableSelectionUI();
            rebuildDynamicRows();
        })
        .catch(err => setStatusMessage(`Error fetching models: ${err.message}`, "error"));

    function renderTableSelectionUI() {
        const query = tableSearch.value.toLowerCase();
        tableList.innerHTML = '';
        selectedTableList.innerHTML = '';
        const filteredModels = allModels.filter(m => m.displayName.toLowerCase().includes(query));

        filteredModels.forEach(model => {
            const isSelected = selectedTables.some(t => t.tableName === model.tableName);
            const item = document.createElement('div');
            item.className = 'select-list-item';
            item.textContent = model.displayName;
            if (isSelected) {
                item.onclick = () => {
                    selectedTables = selectedTables.filter(t => t.tableName !== model.tableName);
                    updateUIBasedOnSelections();
                };
                selectedTableList.appendChild(item);
            } else {
                item.onclick = () => {
                    selectedTables.push({ tableName: model.tableName, displayName: model.displayName });
                    updateUIBasedOnSelections();
                };
                tableList.appendChild(item);
            }
        });
    }

    function renderColumnSelectionUI() {
        const query = columnSearch.value.toLowerCase();
        columnList.innerHTML = '';
        selectedColumnList.innerHTML = '';
        const filteredFields = allFields.filter(f => f.name.toLowerCase().includes(query));
        let currentAvailableHeader = null;
        let currentSelectedHeader = null;

        selectedColumns.forEach(selected => {
            const field = allFields.find(f => f.name === selected.column);
            if (!field) return;

            if (field.table !== currentSelectedHeader) {
                const header = document.createElement('div');
                header.className = 'select-list-table-header';
                const tableInfo = selectedTables.find(t => t.tableName === field.table);
                header.textContent = tableInfo ? tableInfo.displayName : field.table;
                selectedColumnList.appendChild(header);
                currentSelectedHeader = field.table;
            }
            
            const item = document.createElement('div');
            item.className = 'selected-column-item';
            item.dataset.columnName = field.name;
            item.innerHTML = `
                <span class="column-name-text">${field.field}</span>
                <input type="text" class="alias-input" placeholder="Alias..." value="${selected.alias || ''}">
                <button type="button" class="remove-btn-small">&times;</button>
            `;
            
            item.querySelector('.remove-btn-small').onclick = () => {
                selectedColumns = selectedColumns.filter(c => c.column !== field.name);
                renderColumnSelectionUI();
            };
            item.querySelector('.alias-input').addEventListener('input', (e) => {
                const col = selectedColumns.find(c => c.column === field.name);
                if (col) {
                    col.alias = e.target.value;
                }
            });
            selectedColumnList.appendChild(item);
        });

        filteredFields.forEach(field => {
            const isSelected = selectedColumns.some(c => c.column === field.name);
            if (isSelected) return;

            if (field.table !== currentAvailableHeader) {
                const header = document.createElement('div');
                header.className = 'select-list-table-header';
                const tableInfo = selectedTables.find(t => t.tableName === field.table);
                header.textContent = tableInfo ? tableInfo.displayName : field.table;
                columnList.appendChild(header);
                currentAvailableHeader = field.table;
            }

            const item = document.createElement('div');
            item.className = 'select-list-item';
            item.textContent = field.field;
            item.onclick = () => {
                selectedColumns.push({ column: field.name, alias: '' });
                renderColumnSelectionUI();
            };
            columnList.appendChild(item);
        });
    }

    function updateUIBasedOnSelections() {
        renderTableSelectionUI();
        allFields = [];
        selectedTables.forEach(tableInfo => {
            const model = allModels.find(m => m.tableName === tableInfo.tableName);
            if (model) {
                model.fields.forEach(field => {
                    allFields.push({ table: model.tableName, field: field, name: `${model.tableName}.${field}` });
                });
            }
        });
        const validFieldNames = allFields.map(f => f.name);
        selectedColumns = selectedColumns.filter(c => validFieldNames.includes(c.column));
        
        renderColumnSelectionUI();
        rebuildDynamicRows();
    }

    tableSearch.addEventListener('input', renderTableSelectionUI);
    columnSearch.addEventListener('input', renderColumnSelectionUI);

    function rebuildDynamicRows() {
        whereContainer.innerHTML = '';
        createFilterGroup(whereContainer, true);
        joinsContainer.innerHTML = '';
        groupByContainer.innerHTML = '';
        aggregatesContainer.innerHTML = '';
        orderByContainer.innerHTML = '';
        subqueryColumnContainer.innerHTML = '';
    }

    function createFieldOptions() {
        return allFields.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
    }

    function createFilterGroup(container, isRoot = false) {
        const groupEl = document.createElement('div');
        groupEl.className = 'filter-group';
        const andOrId = `op-${Math.random()}`;
        const removeBtnHtml = isRoot ? '' : '<button type="button" class="remove-btn-small remove-group-btn">&times;</button>';

        groupEl.innerHTML = `
            <div class="filter-controls">
                <div class="condition-toggle">
                    <input type="radio" id="and-${andOrId}" name="${andOrId}" value="AND" checked><label for="and-${andOrId}">AND</label>
                    <input type="radio" id="or-${andOrId}" name="${andOrId}" value="OR"><label for="or-${andOrId}">OR</label>
                </div>
                <button type="button" class="add-rule-btn">+ Add Rule</button>
                <button type="button" class="add-group-btn">+ Add Group</button>
                ${removeBtnHtml}
            </div>
            <div class="rules-container"></div>
        `;
        container.appendChild(groupEl);
        
        const rulesContainer = groupEl.querySelector('.rules-container');
        groupEl.querySelector('.add-rule-btn').addEventListener('click', () => createFilterRule(rulesContainer));
        groupEl.querySelector('.add-group-btn').addEventListener('click', () => createFilterGroup(rulesContainer));
        
        if (!isRoot) {
            groupEl.querySelector('.remove-group-btn').addEventListener('click', () => groupEl.remove());
        }
    }

    function createFilterRule(container) {
        const ruleEl = document.createElement('div');
        ruleEl.className = 'dynamic-row filter-rule';
        ruleEl.innerHTML = `
            <select class="field-select"><option value="">-- Field --</option>${createFieldOptions()}</select>
            <select class="operator-select">
                <option value="=">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value="<">&lt;</option>
                <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                <option value="IN">IN</option><option value="NOT IN">NOT IN</option>
                <option value="LIKE">LIKE</option><option value="contains">contains</option>
                <option value="BETWEEN">BETWEEN</option><option value="NOT BETWEEN">NOT BETWEEN</option>
                <option value="IS NULL">IS NULL</option><option value="IS NOT NULL">IS NOT NULL</option>
            </select>
            <div class="value-container"></div>
            <button type="button" class="remove-btn-small remove-rule-btn">&times;</button>
        `;
        container.appendChild(ruleEl);

        const operatorSelect = ruleEl.querySelector('.operator-select');
        const valueContainer = ruleEl.querySelector('.value-container');
        
        function updateValueInput() {
            const op = operatorSelect.value.toLowerCase();
            valueContainer.innerHTML = '';
            if (op === 'is null' || op === 'is not null') {
                // No input
            } else if (op === 'between' || op === 'not between') {
                valueContainer.innerHTML = `
                    <div class="between-container">
                        <input type="text" class="value-input1" placeholder="Start value">
                        <span class="and-separator">AND</span>
                        <input type="text" class="value-input2" placeholder="End value">
                    </div>
                `;
            } else {
                valueContainer.innerHTML = `
                    <div class="value-wrapper">
                        <input type="text" class="value-input" placeholder="Value">
                        <button type="button" class="subquery-btn">Sub</button>
                    </div>
                `;
                valueContainer.querySelector('.subquery-btn').onclick = () => {
                    openSubqueryModal(valueContainer.querySelector('.value-input'));
                };
            }
        }
        
        operatorSelect.addEventListener('change', updateValueInput);
        ruleEl.querySelector('.remove-rule-btn').addEventListener('click', () => ruleEl.remove());
        updateValueInput();
    }

    function serializeFiltersRecursive(groupElement) {
        if (!groupElement) return null;
        const groupData = {
            condition: groupElement.querySelector('.condition-toggle input:checked').value,
            rules: []
        };
        groupElement.querySelector('.rules-container').childNodes.forEach(child => {
            if (child.classList.contains('filter-group')) {
                groupData.rules.push(serializeFiltersRecursive(child));
            } else if (child.classList.contains('filter-rule')) {
                const operator = child.querySelector('.operator-select').value;
                const valueInput = child.querySelector('.value-input');
                let value = null;
                if (operator.toLowerCase() === 'between' || operator.toLowerCase() === 'not between') {
                    value = {
                        value1: child.querySelector('.value-input1')?.value || '',
                        value2: child.querySelector('.value-input2')?.value || ''
                    };
                } else if (valueInput?.dataset.subquery) {
                    value = JSON.parse(valueInput.dataset.subquery);
                } else if (valueInput) {
                    value = valueInput.value;
                }
                groupData.rules.push({
                    field: child.querySelector('.field-select').value,
                    operator: operator,
                    value: value
                });
            }
        });
        return groupData;
    }

    function createSubqueryColumnRow() {
        const row = document.createElement('div');
        row.className = 'dynamic-row subquery-column-row';
        row.innerHTML = `<input type="text" class="alias-input" placeholder="Column Alias (e.g., order_count)"><input type="text" class="subquery-display" placeholder="[No Subquery Defined]" readonly><button type="button" class="build-subquery-btn">Build</button><button type="button" class="remove-btn">x</button>`;
        const subqueryDisplay = row.querySelector('.subquery-display');
        row.querySelector('.build-subquery-btn').onclick = () => openSubqueryModal(subqueryDisplay);
        row.querySelector('.remove-btn').onclick = () => row.remove();
        subqueryColumnContainer.appendChild(row);
    }
    addSubqueryColumnBtn.onclick = createSubqueryColumnRow;

    function openSubqueryModal(inputElement) {
        activeSubqueryInput = inputElement;
        subqueryFiltersContainer.innerHTML = '';
        subqueryModelSelect.innerHTML = allModels.map(m => `<option value="${m.displayName}">${m.displayName}</option>`).join('');
        subqueryModelSelect.dispatchEvent(new Event('change'));
        subqueryFunctionSelect.dispatchEvent(new Event('change'));
        subqueryModal.style.display = 'flex';
    }

    function closeSubqueryModal() {
        subqueryModal.style.display = 'none';
        activeSubqueryInput = null;
    }

    function saveSubquery() {
        if (!activeSubqueryInput) return;
        const subqueryData = {
            model: subqueryModelSelect.value,
            function: subqueryFunctionSelect.value,
            field: subqueryFieldSelect.value,
            filters: {
                condition: 'AND',
                rules: Array.from(subqueryFiltersContainer.children).map(row => {
                    const valueInput = row.querySelector('.sub-filter-value');
                    const outerRefCb = row.querySelector('.outer-ref-cb');
                    const outerRefSelect = row.querySelector('.outer-ref-select');
                    let value;
                    if (outerRefCb.checked) {
                        value = { type: 'OUTER_REF', field: outerRefSelect.value };
                    } else {
                        value = valueInput.value;
                    }
                    return { field: row.querySelector('.sub-filter-field').value, operator: row.querySelector('.sub-filter-operator').value, value: value };
                })
            }
        };
        activeSubqueryInput.dataset.subquery = JSON.stringify(subqueryData);
        const funcText = subqueryData.function ? `${subqueryData.function}(${subqueryData.field})` : subqueryData.field;
        activeSubqueryInput.value = `[Subquery: ${funcText}]`;
        activeSubqueryInput.readOnly = true;
        activeSubqueryInput.classList.add('subquery-active');
        closeSubqueryModal();
    }
    
    subqueryFunctionSelect.addEventListener('change', () => {
        const fieldLabel = document.querySelector('label[for="subqueryFieldSelect"]');
        if (subqueryFunctionSelect.value) fieldLabel.textContent = 'Field to Aggregate';
        else fieldLabel.textContent = 'Field to Return';
    });

    subqueryModelSelect.addEventListener('change', () => {
        const model = allModels.find(m => m.displayName === subqueryModelSelect.value);
        if (model) subqueryFieldSelect.innerHTML = model.fields.map(f => `<option value="${f}">${f}</option>`).join('');
    });
    
    addSubqueryFilterBtn.addEventListener('click', () => {
        const model = allModels.find(m => m.displayName === subqueryModelSelect.value);
        if (!model) return;
        const fieldOptions = model.fields.map(f => `<option value="${f}">${f}</option>`).join('');
        const outerRefOptions = createFieldOptions();
        const row = document.createElement('div');
        row.className = 'dynamic-row sub-filter-row';
        row.innerHTML = `<select class="sub-filter-field">${fieldOptions}</select><select class="sub-filter-operator"><option value="=">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value="<">&lt;</option></select><div class="value-wrapper"><input type="text" class="sub-filter-value" placeholder="Value"><select class="outer-ref-select" style="display:none;">${outerRefOptions}</select></div><label class="outer-ref-label"><input type="checkbox" class="outer-ref-cb" title="Use value from main query"> Ref</label><button type="button" class="remove-btn">x</button>`;
        row.querySelector('.remove-btn').onclick = () => row.remove();
        const valueInput = row.querySelector('.sub-filter-value');
        const outerRefSelect = row.querySelector('.outer-ref-select');
        row.querySelector('.outer-ref-cb').addEventListener('change', e => {
            valueInput.style.display = e.target.checked ? 'none' : 'block';
            outerRefSelect.style.display = e.target.checked ? 'block' : 'none';
        });
        subqueryFiltersContainer.appendChild(row);
    });

    closeSubqueryBtn.onclick = closeSubqueryModal;
    cancelSubqueryBtn.onclick = closeSubqueryModal;
    saveSubqueryBtn.onclick = saveSubquery;

    function createJoinRow() {
        const row = document.createElement('div');
        row.className = 'dynamic-row join-row';
        const tableOptions = selectedTables.map(t => `<option value="${t.tableName}">${t.displayName}</option>`).join('');
        row.innerHTML = `<select class="join-table-select"><option value="">-- Left Table --</option>${tableOptions}</select><select class="join-field-select"><option value="">-- Field --</option></select><span> = </span><select class="join-table-select"><option value="">-- Right Table --</option>${tableOptions}</select><select class="join-field-select"><option value="">-- Field --</option></select><button type="button" class="remove-btn">x</button>`;
        row.querySelector('.remove-btn').onclick = () => row.remove();
        row.querySelectorAll('.join-table-select').forEach(select => {
            select.addEventListener('change', e => {
                const model = allModels.find(m => m.tableName === e.target.value);
                const nextFieldSelect = e.target.nextElementSibling;
                if (nextFieldSelect) nextFieldSelect.innerHTML = `<option value="">-- Field --</option>${model ? model.fields.map(f => `<option value="${f}">${f}</option>`).join('') : ''}`;
            });
        });
        joinsContainer.appendChild(row);
    }
    addJoinBtn.onclick = createJoinRow;
    
    function createGroupByRow(){const r=document.createElement('div');r.className='dynamic-row';r.innerHTML=`<select class="groupby-field-select"><option value="">-- Field --</option>${createFieldOptions()}</select><button type="button" class="remove-btn">x</button>`;r.querySelector('.remove-btn').onclick=()=>r.remove();groupByContainer.appendChild(r)}
    addGroupByBtn.onclick=createGroupByRow;
    
    function createAggregateRow(){const r=document.createElement('div');r.className='dynamic-row aggregate-row';r.innerHTML=`<select class="agg-func-select"><option value="count">COUNT</option><option value="sum">SUM</option><option value="avg">AVG</option><option value="max">MAX</option><option value="min">MIN</option></select><select class="agg-field-select"><option value="">-- Field --</option>${createFieldOptions()}</select><button type="button" class="remove-btn">x</button>`;r.querySelector('.remove-btn').onclick=()=>r.remove();aggregatesContainer.appendChild(r)}
    addAggregateBtn.onclick = createAggregateRow;
    
    function createOrderByRow(){const r=document.createElement('div');r.className='dynamic-row orderby-row';r.innerHTML=`<select class="orderby-field-select"><option value="">-- Field --</option>${createFieldOptions()}</select><select class="orderby-direction"><option value="">ASC</option><option value="-">DESC</option></select><button type="button" class="remove-btn">x</button>`;r.querySelector('.remove-btn').onclick=()=>r.remove();orderByContainer.appendChild(r)}
    addOrderByBtn.onclick = createOrderByRow;

    function getCurrentQueryState() {
        return {
            tables: selectedTables.map(t => t.tableName),
            columns: selectedColumns,
            joins: Array.from(document.querySelectorAll('.join-row')).map(r => ({
                left_table: r.querySelectorAll('.join-table-select')[0].value,
                left_field: r.querySelectorAll('.join-field-select')[0].value,
                right_table: r.querySelectorAll('.join-table-select')[1].value,
                right_field: r.querySelectorAll('.join-field-select')[1].value
            })),
            where: serializeFiltersRecursive(whereContainer.querySelector('.filter-group')),
            groupBy: Array.from(document.querySelectorAll('.groupby-field-select')).map(s => s.value).filter(Boolean),
            aggregates: Array.from(document.querySelectorAll('.aggregate-row')).map(r => ({
                func: r.querySelector('.agg-func-select').value,
                field: r.querySelector('.agg-field-select').value,
            })).filter(item => item.field),
            orderBy: Array.from(document.querySelectorAll('.orderby-row')).map(r => ({
                direction: r.querySelector('.orderby-direction').value,
                field: r.querySelector('.orderby-field-select').value
            })).filter(item => item.field),
            selectSubqueries: Array.from(document.querySelectorAll('.subquery-column-row')).map(row => {
                const alias = row.querySelector('.alias-input').value;
                const subqueryDisplay = row.querySelector('.subquery-display');
                if (alias && subqueryDisplay.dataset.subquery) {
                    return { alias: alias, subquery: JSON.parse(subqueryDisplay.dataset.subquery) };
                }
                return null;
            }).filter(Boolean),
            limit: document.getElementById('limitInput').value || 100
        };
    }

    async function loadQueryState(state) {
        if (!state) return;
        
        selectedTables = allModels.filter(m => state.tables.includes(m.tableName)).map(m => ({ tableName: m.tableName, displayName: m.displayName }));
        selectedColumns = state.columns || [];
        updateUIBasedOnSelections();
        
        await new Promise(resolve => setTimeout(resolve, 0));

        joinsContainer.innerHTML = '';
        (state.joins || []).forEach(j => {
            addJoinBtn.click();
            const newRow = joinsContainer.lastElementChild;
            const selects = newRow.querySelectorAll('.join-table-select');
            selects[0].value = j.left_table;
            selects[0].dispatchEvent(new Event('change'));
            selects[1].value = j.right_table;
            selects[1].dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                newRow.querySelectorAll('.join-field-select')[0].value = j.left_field;
                newRow.querySelectorAll('.join-field-select')[1].value = j.right_field;
            }, 50);
        });

        whereContainer.innerHTML = '';
        if(state.where && state.where.rules.length > 0) {
            rebuildWhereClauseUI(state.where, whereContainer);
        } else {
            createFilterGroup(whereContainer, true);
        }

        groupByContainer.innerHTML = '';
        (state.groupBy || []).forEach(field => {
            addGroupByBtn.click();
            groupByContainer.lastElementChild.querySelector('select').value = field;
        });

        aggregatesContainer.innerHTML = '';
        (state.aggregates || []).forEach(agg => {
            addAggregateBtn.click();
            const newRow = aggregatesContainer.lastElementChild;
            newRow.querySelector('.agg-func-select').value = agg.func;
            newRow.querySelector('.agg-field-select').value = agg.field;
        });
        
        orderByContainer.innerHTML = '';
        (state.orderBy || []).forEach(order => {
            addOrderByBtn.click();
            const newRow = orderByContainer.lastElementChild;
            newRow.querySelector('.orderby-direction').value = order.direction;
            newRow.querySelector('.orderby-field-select').value = order.field;
        });
        
        subqueryColumnContainer.innerHTML = '';
        (state.selectSubqueries || []).forEach(sq => {
            addSubqueryColumnBtn.click();
            const newRow = subqueryColumnContainer.lastElementChild;
            newRow.querySelector('.alias-input').value = sq.alias;
            const display = newRow.querySelector('.subquery-display');
            display.dataset.subquery = JSON.stringify(sq.subquery);
            const funcText = sq.subquery.function ? `${sq.subquery.function}(${sq.subquery.field})` : sq.subquery.field;
            display.value = `[Subquery: ${funcText}]`;
        });

        document.getElementById('limitInput').value = state.limit || 100;
    }

    function rebuildWhereClauseUI(groupData, container) {
        const isRoot = container.id === 'whereConditionsContainer';
        if (!isRoot) {
            const parentControls = container.parentElement.querySelector('.filter-controls .add-group-btn');
            parentControls.click();
            container = container.lastElementChild;
        }
        const groupEl = isRoot ? container.querySelector('.filter-group') : container;

        const condition = (groupData.condition || 'AND').toLowerCase();
        groupEl.querySelector(`input[value="${condition.toUpperCase()}"]`).checked = true;

        const rulesContainer = groupEl.querySelector('.rules-container');
        (groupData.rules || []).forEach(rule => {
            if (rule.condition) {
                rebuildWhereClauseUI(rule, rulesContainer);
            } else {
                groupEl.querySelector('.add-rule-btn').click();
                const ruleEl = rulesContainer.lastElementChild;
                ruleEl.querySelector('.field-select').value = rule.field;
                const opSelect = ruleEl.querySelector('.operator-select');
                opSelect.value = rule.operator;
                opSelect.dispatchEvent(new Event('change'));
                
                const op = rule.operator.toLowerCase();
                if (op === 'between' || op === 'not between') {
                    ruleEl.querySelector('.value-input1').value = rule.value.value1;
                    ruleEl.querySelector('.value-input2').value = rule.value.value2;
                } else if (op !== 'is null' && op !== 'is not null') {
                    const valueInput = ruleEl.querySelector('.value-input');
                    if (typeof rule.value === 'object' && rule.value !== null && rule.value.model) {
                        valueInput.dataset.subquery = JSON.stringify(rule.value);
                        const funcText = rule.value.function ? `${rule.value.function}(${rule.value.field})` : rule.value.field;
                        valueInput.value = `[Subquery: ${funcText}]`;
                    } else {
                        valueInput.value = rule.value;
                    }
                }
            }
        });
    }

    queryForm.addEventListener('submit', function(event) {
        event.preventDefault();
        try {
            const queryData = {
                tables: selectedTables.map(t => t.tableName),
                columns: selectedColumns,
                joins: Array.from(document.querySelectorAll('.join-row')).map(r => ({ left_table: r.querySelectorAll('.join-table-select')[0].value, left_field: r.querySelectorAll('.join-field-select')[0].value, right_table: r.querySelectorAll('.join-table-select')[1].value, right_field: r.querySelectorAll('.join-field-select')[1].value })),
                where: serializeFiltersRecursive(whereContainer.querySelector('.filter-group')),
                groupBy: Array.from(document.querySelectorAll('.groupby-field-select')).map(s => s.value).filter(Boolean),
                aggregates: Array.from(document.querySelectorAll('.aggregate-row')).map(r => {
                    const field = r.querySelector('.agg-field-select').value;
                    const func = r.querySelector('.agg-func-select').value;
                    return field ? `${func}:${field}` : null;
                }).filter(Boolean),
                orderBy: Array.from(document.querySelectorAll('.orderby-row')).map(r => {
                    const field = r.querySelector('.orderby-field-select').value;
                    const dir = r.querySelector('.orderby-direction').value;
                    return field ? `${dir}${field}` : null;
                }).filter(Boolean),
                selectSubqueries: Array.from(document.querySelectorAll('.subquery-column-row')).map(row => { const alias = row.querySelector('.alias-input').value; const subqueryDisplay = row.querySelector('.subquery-display'); if (alias && subqueryDisplay.dataset.subquery) { return { alias: alias, subquery: JSON.parse(subqueryDisplay.dataset.subquery) }; } return null; }).filter(Boolean),
                limit: document.getElementById('limitInput').value || 100
            };
            
            setStatusMessage("Executing query...", "loading");
            fetch(BACKEND_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    'X-CSRFToken': csrftoken
                },
                body: JSON.stringify(queryData)
            }).then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.error || `HTTP error! status: ${response.status}`) });
                return response.json();
            }).then(data => {
                if (data.error) throw new Error(data.error);
                displayResults(data.data);
                setStatusMessage(`Query executed successfully! Displaying ${data.data.length} records.`, "success");
            }).catch(err => {
                console.error("Query execution failed:", err);
                setStatusMessage(`Error: ${err.message}`, "error");
                resultsContainer.innerHTML = '';
            });
        } catch (err) {
            console.error("Submit handler crashed:", err);
            setStatusMessage(`Error: ${err.message}`, "error");
        }
    });

    function displayResults(results) {
        resultsContainer.innerHTML = '';
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p>No results found.</p>';
            return;
        }
        const table = document.createElement('table');
        const headerRow = table.createTHead().insertRow();
        Object.keys(results[0]).forEach(k => {
            const th = document.createElement('th');
            th.textContent = k;
            headerRow.appendChild(th);
        });
        const tbody = table.createTBody();
        results.forEach(row => {
            const tr = tbody.insertRow();
            Object.values(row).forEach(val => {
                const td = document.createElement('td');
                td.textContent = val !== null && val !== undefined ? val.toString() : '';
                tr.appendChild(td);
            });
        });
        resultsContainer.appendChild(table);
    }

    function setStatusMessage(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.className = `status ${type}`;
    }

    const templateSelect = document.getElementById('templateSelect');
    const templateNameInput = document.getElementById('templateNameInput');
    const loadTemplateBtn = document.getElementById('loadTemplateBtn');
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');

    function fetchAndRenderTemplates() {
        fetch(TEMPLATE_API_URL)
            .then(r => {
                if (!r.ok) { throw new Error(`Network response was not ok (${r.status})`); }
                return r.json();
            })
            .then(data => {
                const currentVal = templateSelect.value;
                templateSelect.innerHTML = '<option value="">-- Load a Template --</option>';
                data.results.forEach(t => {
                    const option = document.createElement('option');
                    option.value = t.id;
                    option.textContent = t.name;
                    templateSelect.appendChild(option);
                });
                templateSelect.value = currentVal;
            }).catch(err => {
                console.error("Failed to fetch templates:", err);
                setStatusMessage("Error: Could not load templates.", "error");
            });
    }

    loadTemplateBtn.addEventListener('click', () => {
        const id = templateSelect.value;
        if (!id) return;
        fetch(`${TEMPLATE_API_URL}${id}/`)
            .then(r => r.json())
            .then(template => {
                templateNameInput.value = template.name;
                currentTemplateId = template.id;
                loadQueryState(template.configuration);
                setStatusMessage(`Template '${template.name}' loaded.`, 'success');
            }).catch(err => setStatusMessage(`Error loading template: ${err}`, 'error'));
    });

    saveTemplateBtn.addEventListener('click', () => {
        const name = templateNameInput.value.trim();
        if (!name) {
            alert("Please enter a template name.");
            return;
        }
        const state = getCurrentQueryState();
        const isUpdating = currentTemplateId && templateSelect.value === currentTemplateId.toString();

        let url = TEMPLATE_API_URL;
        let method = 'POST';

        if (isUpdating) {
            url = `${TEMPLATE_API_URL}${currentTemplateId}/`;
            method = 'PUT';
        }

        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin', 
            body: JSON.stringify({ name: name, configuration: state })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || err.detail || 'Save failed') });
            }
            return response.json();
        })
        .then(data => {
            setStatusMessage(`Template '${data.name}' saved successfully.`, 'success');
            currentTemplateId = data.id;
            fetchAndRenderTemplates();
        })
        .catch(err => setStatusMessage(`Error: ${err.message}`, 'error'));
    });

    deleteTemplateBtn.addEventListener('click', () => {
        const id = templateSelect.value;
        if (!id || !confirm(`Are you sure you want to delete the template "${templateSelect.options[templateSelect.selectedIndex].text}"?`)) {
            return;
        }
        fetch(`${TEMPLATE_API_URL}${id}/`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': csrftoken
            },
            credentials: 'same-origin', 
         })
            .then(response => {
                if (response.ok) {
                    setStatusMessage('Template deleted.', 'success');
                    templateNameInput.value = '';
                    currentTemplateId = null;
                    fetchAndRenderTemplates();
                } else {
                   return response.json().then(err => { throw new Error(err.error || err.detail || 'Delete failed') });
                }
            }).catch(err => setStatusMessage(`Error: ${err.message}`, 'error'));
    });

    fetchAndRenderTemplates();
});