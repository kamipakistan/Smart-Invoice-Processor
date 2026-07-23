from app.config import settings
from app.providers.base_provider import BaseAIProvider
from app.providers.litellm_provider import LiteLLMAIProvider
from app.providers.ollama_provider import OllamaAIProvider

def get_ai_provider() -> BaseAIProvider:
    if settings.AI_PROVIDER.lower() == "ollama":
        return OllamaAIProvider()
    return LiteLLMAIProvider()
