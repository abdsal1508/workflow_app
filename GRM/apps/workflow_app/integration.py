"""
Integration with query app for seamless data access
"""
from django.db import connection
from django.apps import apps
import json
from typing import Dict, Any, List

class QueryAppIntegration:
    """
    Integration layer between workflow app and query app
    """
    
    def __init__(self):
        self.models_cache = None
    
    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get all available models for query building"""
        if self.models_cache is None:
            self.models_cache = self._discover_models()
        return self.models_cache
    
    def _discover_models(self) -> List[Dict[str, Any]]:
        """Discover all Django models and their fields"""
        models_data = []
        
        for model in apps.get_models():
            # Skip Django internal models
            if 'django.contrib' in model.__module__:
                continue
                
            model_info = {
                'name': model.__name__,
                'table_name': model._meta.db_table,
                'app_label': model._meta.app_label,
                'fields': []
            }
            
            # Get model fields
            for field in model._meta.get_fields():
                if hasattr(field, 'column'):
                    field_info = {
                        'name': field.name,
                        'column': field.column,
                        'type': field.__class__.__name__,
                        'nullable': field.null if hasattr(field, 'null') else False,
                        'max_length': getattr(field, 'max_length', None)
                    }
                    model_info['fields'].append(field_info)
            
            models_data.append(model_info)
        
        return sorted(models_data, key=lambda x: x['name'])
    
    def execute_query_builder_query(self, query_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a query builder configuration
        
        Args:
            query_config: Query configuration from query app
            
        Returns:
            Query results
        """
        try:
            # Import query app views to reuse logic
            from apps.query.views import query_builder_api
            from django.http import HttpRequest
            
            # Create a mock request
            request = HttpRequest()
            request.method = 'POST'
            request._body = json.dumps(query_config).encode('utf-8')
            
            # Execute query
            response = query_builder_api(request)
            
            if response.status_code == 200:
                result_data = json.loads(response.content)
                return {
                    'data': result_data.get('data', []),
                    'success': True,
                    'message': f"Query executed successfully"
                }
            else:
                error_data = json.loads(response.content)
                raise ValueError(error_data.get('error', 'Query execution failed'))
                
        except Exception as e:
            raise ValueError(f"Query execution failed: {str(e)}")
    
    def build_query_from_config(self, config: Dict[str, Any]) -> str:
        """
        Build SQL query from configuration
        
        Args:
            config: Query configuration
            
        Returns:
            SQL query string
        """
        tables = config.get('tables', [])
        columns = config.get('columns', [])
        joins = config.get('joins', [])
        where_conditions = config.get('where', {})
        limit = config.get('limit', 100)
        
        if not tables:
            raise ValueError("No tables specified")
        
        # Build SELECT clause
        if columns:
            select_parts = []
            for col in columns:
                if isinstance(col, dict):
                    column_name = col.get('column', '')
                    alias = col.get('alias', '')
                    if column_name:
                        if alias:
                            select_parts.append(f"`{column_name}` AS `{alias}`")
                        else:
                            select_parts.append(f"`{column_name}`")
                elif isinstance(col, str):
                    select_parts.append(f"`{col}`")
            
            select_clause = f"SELECT {', '.join(select_parts)}" if select_parts else "SELECT *"
        else:
            select_clause = "SELECT *"
        
        # Build FROM clause
        base_table = tables[0]
        from_clause = f"FROM `{base_table}`"
        
        # Build JOIN clauses
        join_clause = ""
        if joins:
            join_parts = []
            for join in joins:
                if isinstance(join, dict) and all(join.get(k) for k in ['left_table', 'right_table', 'left_field', 'right_field']):
                    join_parts.append(
                        f"LEFT JOIN `{join['right_table']}` ON `{join['left_table']}`.`{join['left_field']}` = `{join['right_table']}`.`{join['right_field']}`"
                    )
            join_clause = ' '.join(join_parts)
        
        # Build WHERE clause
        where_clause = ""
        if where_conditions and where_conditions.get('rules'):
            where_sql = self._build_where_clause_recursive(where_conditions)
            if where_sql:
                where_clause = f"WHERE {where_sql}"
        
        # Build LIMIT clause
        limit_clause = f"LIMIT {int(limit)}" if limit else ""
        
        # Combine all parts
        query_parts = [select_clause, from_clause, join_clause, where_clause, limit_clause]
        return ' '.join(part for part in query_parts if part)
    
    def _build_where_clause_recursive(self, conditions: Dict[str, Any]) -> str:
        """Build WHERE clause recursively"""
        if not conditions or not conditions.get('rules'):
            return ""
        
        condition_type = conditions.get('condition', 'AND').upper()
        rules = conditions.get('rules', [])
        
        sql_parts = []
        
        for rule in rules:
            if isinstance(rule, dict):
                if 'condition' in rule:
                    # Nested condition group
                    nested_sql = self._build_where_clause_recursive(rule)
                    if nested_sql:
                        sql_parts.append(f"({nested_sql})")
                else:
                    # Individual condition
                    field = rule.get('field', '')
                    operator = rule.get('operator', '=')
                    value = rule.get('value')
                    
                    if field and operator and value is not None:
                        if '.' in field:
                            table, column = field.split('.', 1)
                            safe_field = f"`{table}`.`{column}`"
                        else:
                            safe_field = f"`{field}`"
                        
                        if operator.upper() in ['IS NULL', 'IS NOT NULL']:
                            sql_parts.append(f"{safe_field} {operator.upper()}")
                        elif operator.upper() in ['IN', 'NOT IN']:
                            if isinstance(value, list):
                                value_list = ', '.join([f"'{v}'" for v in value])
                                sql_parts.append(f"{safe_field} {operator.upper()} ({value_list})")
                        else:
                            if isinstance(value, str):
                                sql_parts.append(f"{safe_field} {operator} '{value}'")
                            else:
                                sql_parts.append(f"{safe_field} {operator} {value}")
        
        return f" {condition_type} ".join(sql_parts) if sql_parts else ""

# Global integration instance
query_integration = QueryAppIntegration()