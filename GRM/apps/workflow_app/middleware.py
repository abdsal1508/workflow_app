"""
Custom middleware for workflow app
"""
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
import json

class WorkflowCSRFMiddleware(MiddlewareMixin):
    """
    Custom CSRF middleware for workflow API endpoints
    """
    
    def process_request(self, request):
        # Check for CSRF token in multiple headers
        csrf_token = None
        
        # Try different header names
        header_names = [
            'HTTP_X_CSRFTOKEN',
            'HTTP_X_XSRF_TOKEN', 
            'HTTP_X_CSRF_TOKEN'
        ]
        
        for header_name in header_names:
            csrf_token = request.META.get(header_name)
            if csrf_token:
                break
        
        # If found, set it in the standard location
        if csrf_token:
            request.META['HTTP_X_CSRFTOKEN'] = csrf_token
        
        return None

class WorkflowErrorMiddleware(MiddlewareMixin):
    """
    Handle errors in workflow API endpoints
    """
    
    def process_exception(self, request, exception):
        # Only handle workflow API requests
        if not request.path.startswith('/api/'):
            return None
        
        # Return JSON error response
        return JsonResponse({
            'error': str(exception),
            'type': exception.__class__.__name__
        }, status=500)