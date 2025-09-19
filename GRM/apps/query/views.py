# query_app/views.py

from django.shortcuts import render
from django.apps import apps
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from .models import QueryTemplate
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, permissions
from .models import QueryTemplate
from .serializers import QueryTemplateSerializer
from django.views.decorators.csrf import ensure_csrf_cookie

@ensure_csrf_cookie
def query_builder_page(request):
    """This view serves the main HTML page."""
    return render(request, 'index.html')

def dictfetchall(cursor):
    """Return all rows from a cursor as a list of dictionaries."""
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

def _build_subquery_sql(subquery_data):
    """
    Builds a raw SQL subquery string and its parameters from subquery data.
    Handles literal values and Outer References for correlated subqueries.
    """
    sub_model_name = subquery_data.get('model')
    sub_function = subquery_data.get('function', '').upper()
    sub_field = subquery_data.get('field')
    sub_filters = subquery_data.get('filters', {}).get('rules', [])

    if not all([sub_model_name, sub_field]):
        return None, []

    try:
        model_meta = next(m._meta for m in apps.get_models() if m.__name__ == sub_model_name)
        db_table = model_meta.db_table
    except StopIteration:
        return None, []

    select_expression = ""
    limit_clause = ""

    if sub_function:
        valid_functions = ['COUNT', 'AVG', 'SUM', 'MAX', 'MIN']
        if sub_function not in valid_functions:
            return None, []
        select_expression = f"{sub_function}(`{sub_field}`)"
    else:
        select_expression = f"`{sub_field}`"
        limit_clause = " LIMIT 1"

    sub_sql = f"SELECT {select_expression} FROM `{db_table}`"
    
    sub_where_clause = ""
    sub_params = []
    if sub_filters:
        where_parts = []
        for cond in sub_filters:
            field, op, value = cond.get('field'), cond.get('operator'), cond.get('value')
            if not all([field, op]) or value is None:
                continue

            if isinstance(value, dict) and value.get('type') == 'OUTER_REF':
                outer_ref_field = value.get('field', '')
                if '.' in outer_ref_field:
                    table, column = outer_ref_field.split('.', 1)
                    safe_outer_ref = f"`{table}`.`{column}`"
                    where_parts.append(f"`{field}` {op} {safe_outer_ref}")
            elif str(value) != '':
                where_parts.append(f"`{field}` {op} %s")
                sub_params.append(value)
        
        if where_parts:
            sub_where_clause = f" WHERE {' AND '.join(where_parts)}"

    final_sub_sql = f"{sub_sql}{sub_where_clause}{limit_clause}"
    return final_sub_sql, sub_params

def _build_where_recursive(group_data, tables_in_query):
    """
    Recursively builds a WHERE clause from a nested data structure.
    """
    if not group_data or not group_data.get('rules'):
        return "", []

    condition = group_data.get('condition', 'AND').upper()
    if condition not in ['AND', 'OR']:
        condition = 'AND'
    
    sql_parts = []
    params = []

    for rule in group_data['rules']:
        if 'condition' in rule:
            nested_sql, nested_params = _build_where_recursive(rule, tables_in_query)
            if nested_sql:
                sql_parts.append(f"({nested_sql})")
                params.extend(nested_params)
        else:
            field = rule.get('field')
            op = rule.get('operator')
            value = rule.get('value')

            if not all([field, op]):
                continue
            
            table_name = field.split('.')[0]
            if '.' not in field or table_name not in tables_in_query:
                continue

            safe_field = f"`{table_name}`.`{field.split('.')[1]}`"
            
            op_lower = op.lower() if op else ''
            if op_lower in ['between', 'not between']:
                val1 = value.get('value1') if isinstance(value, dict) else None
                val2 = value.get('value2') if isinstance(value, dict) else None
                if val1 is not None and val2 is not None and val1 != '' and val2 != '':
                    sql_parts.append(f"{safe_field} {op.upper()} %s AND %s")
                    params.extend([val1, val2])
            elif isinstance(value, dict) and 'model' in value:
                sub_sql, sub_params = _build_subquery_sql(value)
                if sub_sql:
                    sql_parts.append(f"{safe_field} {op} ({sub_sql})")
                    params.extend(sub_params)
            elif op_lower in ['is null', 'is not null']:
                sql_parts.append(f"{safe_field} {op.upper()}")
            elif value is not None and str(value) != '':
                if op_lower in ['in', 'not in']:
                    values_list = [v.strip() for v in str(value).split(',') if v.strip()]
                    if not values_list: continue
                    placeholders = ', '.join(['%s'] * len(values_list))
                    sql_parts.append(f"{safe_field} {op.upper()} ({placeholders})")
                    params.extend(values_list)
                else:
                    sql_parts.append(f"{safe_field} {op} %s")
                    params.append(value)

    if not sql_parts:
        return "", []
    
    return f" {condition} ".join(sql_parts), params

@csrf_exempt
def query_builder_api(request):
    if request.method == 'GET':
        try:
            models_dict = {}
            for model in apps.get_models():
                if 'django.contrib' in model.__module__:
                    continue
                db_table_name = model._meta.db_table
                
                if db_table_name in models_dict:
                    is_existing_proxy = models_dict[db_table_name].get('is_proxy', False)
                    is_current_proxy = model._meta.proxy
                    if is_existing_proxy and not is_current_proxy:
                        pass
                    else:
                        continue

                fields = [f.column for f in model._meta.get_fields() if hasattr(f, 'column')]
                models_dict[db_table_name] = {
                    'displayName': model.__name__,
                    'tableName': db_table_name,
                    'fields': sorted(list(set(fields))),
                    'is_proxy': model._meta.proxy
                }
            
            final_models_data = sorted(models_dict.values(), key=lambda x: x['displayName'])
            for model_data in final_models_data:
                if 'is_proxy' in model_data:
                    del model_data['is_proxy']

            return JsonResponse({'models': final_models_data})
        except Exception as e:
            return JsonResponse({'error': f"Error discovering models: {e}"}, status=500)

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            tables = data.get('tables', [])
            columns = data.get('columns', [])
            joins = data.get('joins', [])
            where_data = data.get('where', {})
            group_by_fields = data.get('groupBy', [])
            order_by_fields = data.get('orderBy', [])
            aggregates_data = data.get('aggregates', [])
            select_subqueries = data.get('selectSubqueries', [])
            limit = data.get('limit', 100)

            safe_limit = int(limit) if str(limit).isdigit() and int(limit) > 0 else 100

            if not tables:
                return JsonResponse({'error': 'No tables selected.'}, status=400)
            
            base_table = tables[0]
            from_clause = f"FROM `{base_table}`"
            tables_in_query = {base_table}
            
            final_join_parts = []
            joins_to_process = [j for j in joins if all(j.get(k) for k in ['left_table', 'right_table', 'left_field', 'right_field'])]
            added_join_in_pass = True
            while added_join_in_pass and joins_to_process:
                added_join_in_pass = False
                remaining_joins = []
                for join in joins_to_process:
                    lt, rt = join.get('left_table'), join.get('right_table')
                    if lt in tables_in_query and rt not in tables_in_query:
                        final_join_parts.append(f"LEFT JOIN `{rt}` ON `{lt}`.`{join['left_field']}` = `{rt}`.`{join['right_field']}`")
                        tables_in_query.add(rt)
                        added_join_in_pass = True
                    elif rt in tables_in_query and lt not in tables_in_query:
                        final_join_parts.append(f"LEFT JOIN `{lt}` ON `{lt}`.`{join['left_field']}` = `{rt}`.`{join['right_field']}`")
                        tables_in_query.add(lt)
                        added_join_in_pass = True
                    elif lt in tables_in_query and rt in tables_in_query:
                        pass
                    else:
                        remaining_joins.append(join)

                if len(remaining_joins) == len(joins_to_process):
                    break
                joins_to_process = remaining_joins
            join_clause = ' '.join(final_join_parts)

            select_parts = []
            params = []
            
            if columns:
                for item in columns:
                    column_name = item.get('column')
                    alias = item.get('alias')
                    if column_name and '.' in column_name:
                        table, column = column_name.split('.', 1)
                        safe_column = f"`{table}`.`{column}`"
                        if alias:
                            safe_alias = f"`{alias.replace('`', '')}`"
                            select_parts.append(f"{safe_column} AS {safe_alias}")
                        else:
                            select_parts.append(safe_column)
            
            if aggregates_data:
                for col in aggregates_data:
                    if ':' in col and col.split(':', 1)[1]:
                        func, fld = col.split(':', 1)
                        if '.' in fld: 
                            safe_fld = f"`{fld.split('.')[0]}`.`{fld.split('.')[1]}`"
                            alias = f'`{func}_{fld.replace(".", "_")}`'
                            select_parts.append(f'{func.upper()}({safe_fld}) AS {alias}')
            
            if select_subqueries:
                for item in select_subqueries:
                    alias = item.get('alias')
                    subquery_data = item.get('subquery')
                    if alias and subquery_data:
                        sub_sql, sub_params = _build_subquery_sql(subquery_data)
                        if sub_sql:
                            select_parts.append(f"({sub_sql}) AS `{alias}`")
                            params.extend(sub_params)
            
            if not select_parts:
                select_parts.append('*')
            
            select_clause = f"SELECT {', '.join(select_parts)}"

            where_clause = ""
            where_sql, where_params = _build_where_recursive(where_data, tables_in_query)
            if where_sql:
                where_clause = f"WHERE {where_sql}"
            
            final_params = params + where_params

            group_by_clause = ""
            if group_by_fields:
                safe_group_by = [f"`{f.split('.')[0]}`.`{f.split('.')[1]}`" for f in group_by_fields if '.' in f]
                if safe_group_by:
                    group_by_clause = f"GROUP BY {', '.join(safe_group_by)}"

            order_by_clause = ""
            if order_by_fields:
                final_order = [f"`{o.lstrip('-').split('.')[0]}`.`{o.lstrip('-').split('.')[1]}` {'DESC' if o.startswith('-') else 'ASC'}" for o in order_by_fields if '.' in o]
                if final_order:
                    order_by_clause = f"ORDER BY {', '.join(final_order)}"
            
            limit_clause = f"LIMIT {safe_limit}"
            final_sql = f"{select_clause} {from_clause} {join_clause} {where_clause} {group_by_clause} {order_by_clause} {limit_clause}"
            
            with connection.cursor() as cursor:
                cursor.execute(final_sql, final_params)
                results = dictfetchall(cursor)
            return JsonResponse({'data': results})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid method'}, status=405)


@csrf_exempt
def query_template_api(request, pk=None):
    """API view for CRUD operations on QueryTemplate."""
    if request.method == 'GET':
        if pk:
            template = get_object_or_404(QueryTemplate, pk=pk)
            return JsonResponse({
                'id': template.id,
                'name': template.name,
                'configuration': template.configuration
            })
        else:
            templates = QueryTemplate.objects.all().order_by('name')
            data = [{'id': t.id, 'name': t.name} for t in templates]
            return JsonResponse(data, safe=False)

    elif request.method == 'POST':
        # This route is now ONLY for CREATING new templates.
        data = json.loads(request.body)
        name = data.get('name')
        config = data.get('configuration')
        if not name or not config:
            return JsonResponse({'error': 'Name and configuration are required.'}, status=400)
        
        # Use .create() for clarity, and handle potential name conflicts.
        if QueryTemplate.objects.filter(name=name).exists():
            return JsonResponse({'error': f"A template with the name '{name}' already exists."}, status=409) # 409 Conflict

        template = QueryTemplate.objects.create(name=name, configuration=config)
        return JsonResponse({'id': template.id, 'name': template.name}, status=201)

    elif request.method == 'PUT' and pk:
        # This route is now ONLY for UPDATING existing templates by ID.
        data = json.loads(request.body)
        name = data.get('name')
        config = data.get('configuration')
        if not name or not config:
            return JsonResponse({'error': 'Name and configuration are required.'}, status=400)
        
        # Check if another template already has the new name
        if QueryTemplate.objects.filter(name=name).exclude(pk=pk).exists():
            return JsonResponse({'error': f"Another template with the name '{name}' already exists."}, status=409)

        template = get_object_or_404(QueryTemplate, pk=pk)
        template.name = name
        template.configuration = config
        template.save()
        return JsonResponse({'id': template.id, 'name': template.name})

    elif request.method == 'DELETE' and pk:
        template = get_object_or_404(QueryTemplate, pk=pk)
        template.delete()
        return JsonResponse({'status': 'ok'}, status=204)

    return JsonResponse({'error': 'Invalid method or missing ID.'}, status=405)

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

@method_decorator(csrf_exempt, name='dispatch')
class QueryTemplateViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows query templates to be viewed or edited.
    """
    queryset = QueryTemplate.objects.all().order_by('name')
    serializer_class = QueryTemplateSerializer
    permission_classes = [permissions.AllowAny]
