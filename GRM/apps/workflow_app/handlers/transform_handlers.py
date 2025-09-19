"""
Transform node handlers for data manipulation
"""
import json
import re
from typing import Dict, Any, List
from .base import BaseNodeHandler

class DataTransformHandler(BaseNodeHandler):
    """Handler for data transformation nodes"""
    
    def execute(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        transform_type = config.get('transform_type', 'map')
        field_mappings = self._parse_field_mappings(config.get('field_mappings', []))
        
        data = input_data.get('data', {})
        
        if transform_type == 'map':
            return self._map_fields(data, field_mappings)
        elif transform_type == 'filter':
            return self._filter_data(data, config)
        elif transform_type == 'aggregate':
            return self._aggregate_data(data, config)
        elif transform_type == 'format':
            return self._format_data(data, config)
        elif transform_type == 'merge':
            return self._merge_data(data, config, input_data)
        else:
            raise ValueError(f"Unsupported transform type: {transform_type}")
    
    def _parse_field_mappings(self, mappings):
        """Parse field mappings from various formats"""
        if isinstance(mappings, str):
            try:
                return json.loads(mappings)
            except json.JSONDecodeError:
                return []
        elif isinstance(mappings, list):
            return mappings
        else:
            return []
    
    def _map_fields(self, data: Any, mappings: List[Dict]) -> Dict[str, Any]:
        """Map fields from input to output"""
        if not mappings:
            return {'data': data, 'success': True, 'message': 'No mappings defined, data passed through'}
            
        if isinstance(data, list):
            result = []
            for item in data:
                mapped_item = {}
                for mapping in mappings:
                    source_field = mapping.get('source')
                    target_field = mapping.get('target')
                    transform_function = mapping.get('transform', '')
                    
                    if source_field and target_field:
                        value = self._get_nested_value(item, source_field)
                        
                        # Apply transformation function if specified
                        if transform_function:
                            value = self._apply_transform_function(value, transform_function)
                            
                        self._set_nested_value(mapped_item, target_field, value)
                result.append(mapped_item)
            return {'data': result, 'success': True, 'message': f'Mapped {len(result)} items'}
        else:
            mapped_data = {}
            for mapping in mappings:
                source_field = mapping.get('source')
                target_field = mapping.get('target')
                transform_function = mapping.get('transform', '')
                
                if source_field and target_field:
                    value = self._get_nested_value(data, source_field)
                    
                    if transform_function:
                        value = self._apply_transform_function(value, transform_function)
                        
                    self._set_nested_value(mapped_data, target_field, value)
            return {'data': mapped_data, 'success': True, 'message': 'Data mapped successfully'}
    
    def _apply_transform_function(self, value: Any, function: str) -> Any:
        """Apply transformation function to value"""
        try:
            if function == 'upper':
                return str(value).upper() if value is not None else ''
            elif function == 'lower':
                return str(value).lower() if value is not None else ''
            elif function == 'trim':
                return str(value).strip() if value is not None else ''
            elif function == 'int':
                return int(float(value)) if value is not None else 0
            elif function == 'float':
                return float(value) if value is not None else 0.0
            elif function == 'bool':
                return bool(value) if value is not None else False
            elif function == 'json':
                return json.dumps(value) if value is not None else '{}'
            elif function == 'date_format':
                from datetime import datetime
                if isinstance(value, str):
                    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    return dt.strftime('%Y-%m-%d')
                return value
            else:
                return value
        except Exception:
            return value
    
    def _filter_data(self, data: Any, config: Dict) -> Dict[str, Any]:
        """Filter data based on conditions"""
        if not isinstance(data, list):
            data = [data]
        
        filter_field = config.get('filter_field', '')
        filter_operator = config.get('filter_operator', 'equals')
        filter_value = config.get('filter_value', '')
        filter_expression = config.get('filter_expression', '')
        
        # Use filter expression if provided
        if filter_expression:
            return self._filter_by_expression(data, filter_expression)
        
        filtered_data = []
        for item in data:
            item_value = self._get_nested_value(item, filter_field)
            if self._evaluate_condition(item_value, filter_operator, filter_value):
                filtered_data.append(item)
        
        return {
            'data': filtered_data,
            'success': True,
            'message': f'Filtered to {len(filtered_data)} items'
        }
    
    def _filter_by_expression(self, data: List[Dict], expression: str) -> Dict[str, Any]:
        """Filter data using JavaScript-like expression"""
        filtered_data = []
        
        for item in data:
            try:
                # Simple expression evaluation
                # Replace item.field with actual values
                eval_expression = expression
                for key, value in item.items():
                    pattern = f'item\\.{key}'
                    if isinstance(value, str):
                        eval_expression = re.sub(pattern, f"'{value}'", eval_expression)
                    else:
                        eval_expression = re.sub(pattern, str(value), eval_expression)
                
                # Evaluate the expression safely
                if eval(eval_expression, {"__builtins__": {}}):
                    filtered_data.append(item)
            except Exception:
                # Skip items that cause evaluation errors
                continue
        
        return {
            'data': filtered_data,
            'success': True,
            'message': f'Filtered to {len(filtered_data)} items using expression'
        }
    
    def _aggregate_data(self, data: Any, config: Dict) -> Dict[str, Any]:
        """Aggregate data"""
        if not isinstance(data, list):
            return {'data': data, 'success': True, 'message': 'No aggregation needed for single item'}
        
        agg_type = config.get('aggregation_type', 'count')
        agg_field = config.get('aggregation_field', '')
        group_by = config.get('group_by', '')
        
        if group_by:
            return self._group_and_aggregate(data, group_by, agg_type, agg_field)
        
        if agg_type == 'count':
            result = len(data)
        elif agg_type == 'sum' and agg_field:
            result = sum(float(self._get_nested_value(item, agg_field) or 0) for item in data)
        elif agg_type == 'avg' and agg_field:
            values = [float(self._get_nested_value(item, agg_field) or 0) for item in data]
            result = sum(values) / len(values) if values else 0
        elif agg_type == 'min' and agg_field:
            values = [self._get_nested_value(item, agg_field) for item in data if self._get_nested_value(item, agg_field) is not None]
            result = min(values) if values else None
        elif agg_type == 'max' and agg_field:
            values = [self._get_nested_value(item, agg_field) for item in data if self._get_nested_value(item, agg_field) is not None]
            result = max(values) if values else None
        else:
            result = len(data)
        
        return {
            'data': {'result': result, 'type': agg_type, 'field': agg_field},
            'success': True,
            'message': f'Aggregated {len(data)} items using {agg_type}'
        }
    
    def _group_and_aggregate(self, data: List[Dict], group_by: str, agg_type: str, agg_field: str) -> Dict[str, Any]:
        """Group data and apply aggregation"""
        groups = {}
        
        for item in data:
            group_value = self._get_nested_value(item, group_by)
            group_key = str(group_value) if group_value is not None else 'null'
            
            if group_key not in groups:
                groups[group_key] = []
            groups[group_key].append(item)
        
        result = {}
        for group_key, group_items in groups.items():
            if agg_type == 'count':
                result[group_key] = len(group_items)
            elif agg_type == 'sum' and agg_field:
                result[group_key] = sum(float(self._get_nested_value(item, agg_field) or 0) for item in group_items)
            elif agg_type == 'avg' and agg_field:
                values = [float(self._get_nested_value(item, agg_field) or 0) for item in group_items]
                result[group_key] = sum(values) / len(values) if values else 0
            else:
                result[group_key] = len(group_items)
        
        return {
            'data': result,
            'success': True,
            'message': f'Grouped by {group_by} and aggregated using {agg_type}'
        }
    
    def _format_data(self, data: Any, config: Dict) -> Dict[str, Any]:
        """Format data according to specified format"""
        format_type = config.get('format_type', 'json')
        
        if format_type == 'json':
            formatted = json.dumps(data, indent=2)
        elif format_type == 'csv':
            formatted = self._to_csv(data)
        elif format_type == 'xml':
            formatted = self._to_xml(data)
        else:
            formatted = str(data)
        
        return {
            'data': {'formatted': formatted, 'format': format_type},
            'success': True,
            'message': f'Data formatted as {format_type}'
        }
    
    def _merge_data(self, data: Any, config: Dict, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Merge data from multiple sources"""
        merge_sources = config.get('merge_sources', [])
        merge_strategy = config.get('merge_strategy', 'combine')
        
        merged_data = data if isinstance(data, (list, dict)) else [data]
        
        for source in merge_sources:
            source_data = self._get_nested_value(input_data, source)
            if source_data:
                if merge_strategy == 'combine' and isinstance(merged_data, list) and isinstance(source_data, list):
                    merged_data.extend(source_data)
                elif merge_strategy == 'merge' and isinstance(merged_data, dict) and isinstance(source_data, dict):
                    merged_data.update(source_data)
        
        return {
            'data': merged_data,
            'success': True,
            'message': f'Merged data using {merge_strategy} strategy'
        }
    
    def _to_csv(self, data: Any) -> str:
        """Convert data to CSV format"""
        if not isinstance(data, list):
            data = [data]
        
        if not data:
            return ''
        
        # Get all unique keys
        keys = set()
        for item in data:
            if isinstance(item, dict):
                keys.update(item.keys())
        
        keys = sorted(list(keys))
        
        # Create CSV
        csv_lines = [','.join(keys)]
        for item in data:
            if isinstance(item, dict):
                row = [str(item.get(key, '')) for key in keys]
                csv_lines.append(','.join(row))
        
        return '\n'.join(csv_lines)
    
    def _to_xml(self, data: Any) -> str:
        """Convert data to XML format"""
        def dict_to_xml(d, root_name='item'):
            xml = f'<{root_name}>'
            for key, value in d.items():
                if isinstance(value, dict):
                    xml += dict_to_xml(value, key)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            xml += dict_to_xml(item, key)
                        else:
                            xml += f'<{key}>{item}</{key}>'
                else:
                    xml += f'<{key}>{value}</{key}>'
            xml += f'</{root_name}>'
            return xml
        
        if isinstance(data, list):
            xml = '<root>'
            for item in data:
                if isinstance(item, dict):
                    xml += dict_to_xml(item)
                else:
                    xml += f'<item>{item}</item>'
            xml += '</root>'
            return xml
        elif isinstance(data, dict):
            return dict_to_xml(data, 'root')
        else:
            return f'<root>{data}</root>'
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
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
    
    def _set_nested_value(self, data: Dict, path: str, value: Any):
        """Set nested value using dot notation"""
        parts = path.split('.')
        current = data
        
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        
        current[parts[-1]] = value
    
    def _evaluate_condition(self, value: Any, operator: str, expected: Any) -> bool:
        """Evaluate a condition"""
        if operator == 'equals':
            return value == expected
        elif operator == 'not_equals':
            return value != expected
        elif operator == 'contains':
            return str(expected).lower() in str(value).lower()
        elif operator == 'greater_than':
            return float(value or 0) > float(expected or 0)
        elif operator == 'less_than':
            return float(value or 0) < float(expected or 0)
        else:
            return False

class JsonParserHandler(BaseNodeHandler):
    """Handler for JSON parsing and manipulation"""
    
    def execute(self, config: Dict[str, Any], input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        operation = config.get('operation', 'parse')
        
        if operation == 'parse':
            return self._parse_json(input_data, config)
        elif operation == 'stringify':
            return self._stringify_json(input_data, config)
        elif operation == 'extract':
            return self._extract_fields(input_data, config)
        else:
            raise ValueError(f"Unsupported JSON operation: {operation}")
    
    def _parse_json(self, input_data: Dict, config: Dict) -> Dict[str, Any]:
        """Parse JSON string to object"""
        json_field = config.get('json_field', 'data')
        data = input_data.get('data', {})
        
        json_string = self._get_nested_value(data, json_field)
        if not json_string:
            return {'data': {}, 'success': False, 'message': 'No JSON string found'}
        
        try:
            parsed_data = json.loads(json_string)
            return {
                'data': parsed_data,
                'success': True,
                'message': 'JSON parsed successfully'
            }
        except json.JSONDecodeError as e:
            return {
                'data': {},
                'success': False,
                'message': f'JSON parsing failed: {str(e)}'
            }
    
    def _stringify_json(self, input_data: Dict, config: Dict) -> Dict[str, Any]:
        """Convert object to JSON string"""
        data = input_data.get('data', {})
        
        try:
            json_string = json.dumps(data, indent=2)
            return {
                'data': {'json_string': json_string},
                'success': True,
                'message': 'Object converted to JSON string'
            }
        except Exception as e:
            return {
                'data': {},
                'success': False,
                'message': f'JSON stringify failed: {str(e)}'
            }
    
    def _extract_fields(self, input_data: Dict, config: Dict) -> Dict[str, Any]:
        """Extract specific fields from JSON data"""
        fields_to_extract = config.get('fields', [])
        data = input_data.get('data', {})
        
        extracted_data = {}
        for field in fields_to_extract:
            value = self._get_nested_value(data, field)
            if value is not None:
                extracted_data[field] = value
        
        return {
            'data': extracted_data,
            'success': True,
            'message': f'Extracted {len(extracted_data)} fields'
        }
    
    def _get_nested_value(self, data: Dict, path: str) -> Any:
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
