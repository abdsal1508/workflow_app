"""
Query Integration Handler - Integrates with the query app
"""
from typing import Dict, Any
from .base import BaseNodeHandler
from ..integration import query_integration

class QueryIntegrationHandler(BaseNodeHandler):
    """Handler for integrating with the query app"""
    
    def execute(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        operation = config.get('operation', 'execute_query')
        
        if operation == 'execute_query':
            return self._execute_query_builder(config, input_data, context)
        elif operation == 'get_models':
            return self._get_available_models()
        elif operation == 'build_query':
            return self._build_query_only(config, input_data, context)
        else:
            raise ValueError(f"Unsupported query operation: {operation}")
    
    def _execute_query_builder(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a query using the query builder configuration"""
        query_config = config.get('query_config', {})
        
        # Apply variable substitution to query config
        resolved_config = self._resolve_query_config(query_config, input_data, context)
        
        try:
            result = query_integration.execute_query_builder_query(resolved_config)
            
            return {
                'data': result['data'],
                'count': len(result['data']) if isinstance(result['data'], list) else 1,
                'query_config': resolved_config,
                'success': True,
                'message': result['message']
            }
            
        except Exception as e:
            self.log_execution(f"Query execution failed: {str(e)}", 'error')
            raise ValueError(f"Query execution failed: {str(e)}")
    
    def _get_available_models(self) -> Dict[str, Any]:
        """Get all available models for query building"""
        try:
            models = query_integration.get_available_models()
            
            return {
                'data': models,
                'count': len(models),
                'success': True,
                'message': f"Retrieved {len(models)} available models"
            }
            
        except Exception as e:
            self.log_execution(f"Failed to get models: {str(e)}", 'error')
            raise ValueError(f"Failed to get models: {str(e)}")
    
    def _build_query_only(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Build SQL query without executing it"""
        query_config = config.get('query_config', {})
        
        # Apply variable substitution
        resolved_config = self._resolve_query_config(query_config, input_data, context)
        
        try:
            sql_query = query_integration.build_query_from_config(resolved_config)
            
            return {
                'data': {
                    'sql_query': sql_query,
                    'query_config': resolved_config
                },
                'success': True,
                'message': "SQL query built successfully"
            }
            
        except Exception as e:
            self.log_execution(f"Query building failed: {str(e)}", 'error')
            raise ValueError(f"Query building failed: {str(e)}")
    
    def _resolve_query_config(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve variables in query configuration"""
        resolved_config = {}
        
        for key, value in config.items():
            if isinstance(value, str):
                resolved_config[key] = self._resolve_variables(value, input_data, context)
            elif isinstance(value, dict):
                resolved_config[key] = self._resolve_query_config(value, input_data, context)
            elif isinstance(value, list):
                resolved_config[key] = [
                    self._resolve_query_config(item, input_data, context) if isinstance(item, dict)
                    else self._resolve_variables(item, input_data, context) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                resolved_config[key] = value
        
        return resolved_config
    
    def _resolve_variables(self, text: str, input_data: Dict[str, Any], context: Dict[str, Any]) -> str:
        """Resolve variables in text"""
        if not isinstance(text, str):
            return text
        
        import re
        pattern = r'\{\{([^}]+)\}\}'
        
        def replace_variable(match):
            var_path = match.group(1).strip()
            value = self._get_variable_value(var_path, input_data, context)
            return str(value) if value is not None else ''
        
        return re.sub(pattern, replace_variable, text)
    
    def _get_variable_value(self, var_path: str, input_data: Dict[str, Any], context: Dict[str, Any]) -> Any:
        """Get variable value from various sources"""
        if var_path.startswith('input.'):
            return self._get_nested_value(input_data.get('data', {}), var_path[6:])
        elif var_path.startswith('context.'):
            return self._get_nested_value(context, var_path[8:])
        elif var_path.startswith('variables.'):
            return self._get_nested_value(context.get('variables', {}), var_path[10:])
        elif '.' in var_path:
            # Handle node references
            parts = var_path.split('.', 1)
            node_id = parts[0]
            field_path = parts[1] if len(parts) > 1 else ''
            
            node_data = context.get('node_results', {}).get(node_id, {})
            return self._get_nested_value(node_data, field_path)
        else:
            return context.get('variables', {}).get(var_path, var_path)
    
    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """Get nested value using dot notation"""
        if not path:
            return data
        
        current = data
        for part in path.split('.'):
            if isinstance(current, dict) and part in current:
                current = current[part]
            elif isinstance(current, list) and part.isdigit():
                index = int(part)
                if 0 <= index < len(current):
                    current = current[index]
                else:
                    return None
            else:
                return None
        return current