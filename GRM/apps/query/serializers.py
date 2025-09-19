
from rest_framework import serializers
from .models import QueryTemplate

class QueryTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QueryTemplate
        fields = ['id', 'name', 'configuration']