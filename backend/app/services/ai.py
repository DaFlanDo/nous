"""
AI Service - OpenAI/LLM API interactions
"""
import httpx
import logging
from typing import List, Optional
import json

from ..config import settings

logger = logging.getLogger(__name__)


# System prompts
REFLECTION_SYSTEM_PROMPT = """Ты - помощник для рефлексии и самоанализа. Помогай пользователю размышлять о своих мыслях, чувствах и опыте. Отвечай на русском языке, будь эмпатичным и поддерживающим. Задавай наводящие вопросы для глубокой рефлексии. Будь кратким но содержательным.

Если пользователь спрашивает что делать или просит задачи - можешь предложить добавить их в чеклист. В этом случае добавь в конце ответа специальный маркер [SUGGEST_CHECKLIST] чтобы система предложила пользователю создать чеклист.

Если пользователь просит оценить состояние - можешь проанализировать его нейромедиаторы."""


STATE_ANALYSIS_PROMPT = """Проанализируй записи и оцени текущее психофизиологическое состояние.

Верни JSON в формате:
{
    "metrics": {
        "dopamine": 0-10,
        "serotonin": 0-10,
        "gaba": 0-10,
        "noradrenaline": 0-10,
        "cortisol": 0-10,
        "testosterone": 0-10,
        "pfc_activity": 0-10,
        "focus": 0-10,
        "energy": 0-10,
        "motivation": 0-10
    },
    "analysis": "Краткий анализ состояния (2-3 предложения)"
}

ВАЖНО: В поле "analysis" пиши обращаясь напрямую к человеку на "ты", как будто разговариваешь с ним лично.
НЕ пиши в третьем лице ("пользователь", "он/она").
Пример правильного стиля: "Ты недоспал и чувствуешь усталость, но при этом сохраняешь позитивный настрой..."

Описание метрик:
- dopamine: удовольствие, награда, мотивация к действию
- serotonin: настроение, спокойствие, удовлетворённость
- gaba: расслабление, снижение тревоги
- noradrenaline: бдительность, концентрация, стресс-реакция
- cortisol: уровень стресса (высокий = плохо)
- testosterone: уверенность, энергия, доминантность
- pfc_activity: активность префронтальной коры, самоконтроль
- focus: способность концентрироваться
- energy: общий уровень энергии
- motivation: желание действовать

Оценивай на основе того, что человек рассказывает о своём состоянии, настроении, делах."""


CHECKLIST_SUGGESTION_PROMPT = """На основе диалога с пользователем, предложи задачи которые могут быть полезны.

Верни JSON:
{
    "items": ["задача 1", "задача 2", ...],
    "reasoning": "Почему эти задачи могут помочь (1-2 предложения)"
}

Предлагай только релевантные задачи, максимум 5 штук."""


SUMMARY_PROMPT = """На основе диалога создай краткую выжимку - записку с ключевыми мыслями и инсайтами.

Верни JSON:
{
    "title": "Краткий заголовок (3-5 слов)",
    "content": "Структурированная выжимка с ключевыми мыслями, инсайтами и выводами из диалога. Используй маркированные списки где уместно."
}

Пиши от первого лица, как будто это личная записка пользователя."""


class AIService:
    """Service for AI/LLM interactions"""
    
    def __init__(self):
        self.api_key = settings.openai_api_key
        self.base_url = settings.openai_base_url
        self.model = settings.openai_model
    
    async def chat_completion(
        self,
        messages: List[dict],
        model: Optional[str] = None
    ) -> str:
        """
        Call OpenAI-compatible chat completion API
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (defaults to settings.openai_model)
            
        Returns:
            Assistant's response content
        """
        if not self.api_key:
            logger.error("OpenAI API key not configured")
            raise ValueError("OpenAI API key not configured")
        
        model = model or self.model
        url = f"{self.base_url}/chat/completions"
        
        logger.debug(f"Calling AI API: {url}, model: {model}")
        logger.debug(f"Messages count: {len(messages)}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": messages
                    }
                )
                
                logger.debug(f"Response status: {response.status_code}")
                
                if response.status_code != 200:
                    logger.error(f"API error: {response.text}")
                    response.raise_for_status()
                
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                logger.debug(f"Response content length: {len(content)}")
                
                return content
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error: {type(e).__name__} - {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error: {type(e).__name__} - {str(e)}")
            raise
    
    async def get_reflection_response(
        self,
        message: str,
        history: List[dict]
    ) -> dict:
        """
        Get reflection chat response
        
        Returns:
            dict with 'response' and 'suggest_checklist' keys
        """
        messages = [
            {"role": "system", "content": REFLECTION_SYSTEM_PROMPT}
        ]
        messages.extend(history)
        messages.append({"role": "user", "content": message})
        
        response = await self.chat_completion(messages)
        
        suggest_checklist = "[SUGGEST_CHECKLIST]" in response
        clean_response = response.replace("[SUGGEST_CHECKLIST]", "").strip()
        
        return {
            "response": clean_response,
            "suggest_checklist": suggest_checklist
        }
    
    async def analyze_state(self, content: str) -> Optional[dict]:
        """
        Analyze psychophysiological state from text
        
        Returns:
            dict with 'metrics' and 'analysis' or None if failed
        """
        messages = [
            {"role": "system", "content": STATE_ANALYSIS_PROMPT},
            {"role": "user", "content": f"{content}\n\nПроанализируй состояние и верни JSON."}
        ]
        
        response = await self.chat_completion(messages)
        return self._parse_json_response(response)
    
    async def suggest_tasks(self, message: str, history: List[dict]) -> dict:
        """
        Suggest tasks based on conversation
        
        Returns:
            dict with 'items' and 'reasoning'
        """
        messages = [
            {"role": "system", "content": CHECKLIST_SUGGESTION_PROMPT}
        ]
        messages.extend(history)
        messages.append({
            "role": "user",
            "content": f"Последнее сообщение: {message}\n\nПредложи задачи и верни JSON."
        })
        
        response = await self.chat_completion(messages)
        result = self._parse_json_response(response)
        
        if result:
            return result
        return {"items": [], "reasoning": "Не удалось сгенерировать предложения"}
    
    async def create_summary(self, dialog_text: str) -> Optional[dict]:
        """
        Create summary note from dialog
        
        Returns:
            dict with 'title' and 'content' or None if failed
        """
        messages = [
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": f"Диалог:\n{dialog_text}\n\nСоздай выжимку и верни JSON."}
        ]
        
        response = await self.chat_completion(messages)
        return self._parse_json_response(response)
    
    def _parse_json_response(self, response: str) -> Optional[dict]:
        """Extract and parse JSON from response"""
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start != -1 and json_end > json_start:
                return json.loads(response[json_start:json_end])
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
        return None


# Singleton instance
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get AI service instance"""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
