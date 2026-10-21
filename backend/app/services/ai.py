"""
AI Service - OpenAI/LLM API interactions with Notes Context
"""
import httpx
import logging
from typing import List, Optional, Tuple, Callable, Any
from datetime import datetime, timedelta
import json
import re

from ..config import settings

logger = logging.getLogger(__name__)


# System prompts
REFLECTION_SYSTEM_PROMPT = """Ты - помощник для рефлексии и самоанализа по имени Nous. Помогай пользователю размышлять о своих мыслях, чувствах и опыте. Отвечай на русском языке, будь эмпатичным и поддерживающим. Задавай наводящие вопросы для глубокой рефлексии. Будь кратким но содержательным.

У тебя есть доступ к инструментам:
- suggest_checklist: используй когда хочешь предложить практические задачи/техники/шаги. НЕ пиши списки в тексте - вызови этот инструмент.
- get_note: получить запись за конкретную дату
- search_notes: поиск по записям

Пример: если пользователь просит помочь с тревогой - НЕ перечисляй техники в тексте. Вместо этого напиши короткий поддерживающий ответ и вызови suggest_checklist с конкретными задачами."""


REFLECTION_WITH_CONTEXT_PROMPT = """Ты - помощник для рефлексии и самоанализа по имени Nous.

=== ПОСЛЕДНИЕ ЗАПИСИ ПОЛЬЗОВАТЕЛЯ ===
{notes_context}
=== КОНЕЦ ЗАПИСЕЙ ===

Используй записи как фоновые знания. Не говори "я вижу в твоих записях".

У тебя есть инструменты:
- suggest_checklist: предложить практические задачи (НЕ пиши списки в тексте!)
- get_note: получить запись за дату
- search_notes: поиск по записям

Когда хочешь предложить действия/техники/шаги - вызови suggest_checklist вместо написания списка."""


# Tools definition for function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "suggest_checklist",
            "description": "Предложить пользователю практические задачи/техники для добавления в чеклист. Используй когда хочешь дать конкретные действия.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Список задач (максимум 5). Формулируй как действия: 'Прогуляться 15 минут', 'Выпить воды'"
                    }
                },
                "required": ["tasks"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_note",
            "description": "Получить запись пользователя за конкретную дату",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Дата в формате YYYY-MM-DD"
                    }
                },
                "required": ["date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Поиск по записям пользователя",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Поисковый запрос"
                    }
                },
                "required": ["query"]
            }
        }
    }
]


HISTORY_SUMMARY_PROMPT = """Сожми предыдущий контекст диалога в 2-3 предложения, сохраняя ключевые факты о пользователе и темы обсуждения. Отвечай только саммари, без вступлений."""


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


CHECKLIST_SUGGESTION_PROMPT = """На основе диалога с пользователем, предложи конкретные простые задачи, которые помогут улучшить состояние.

Верни JSON:
{
    "items": ["задача 1", "задача 2", ...]
}

Правила:
- Максимум 5 задач
- Задачи должны быть простыми и выполнимыми
- Формулируй как действия: "Прогуляться 15 минут", "Выпить стакан воды"
- Не объясняй почему, просто дай список"""


SUMMARY_PROMPT = """На основе диалога создай краткую выжимку - записку с ключевыми мыслями и инсайтами.

Верни JSON:
{
    "title": "Краткий заголовок (3-5 слов)",
    "content": "Структурированная выжимка с ключевыми мыслями, инсайтами и выводами из диалога. Используй маркированные списки где уместно."
}

Пиши от первого лица, как будто это личная записка пользователя."""


class AIService:
    """Service for AI/LLM interactions with Notes Context"""
    
    def __init__(self):
        self.api_key = settings.openai_api_key
        self.base_url = settings.openai_base_url
        self.model = settings.openai_model
        self.model_cheap = settings.openai_model_cheap
        self.history_limit = settings.chat_history_limit
        self.summarize_after = settings.chat_summarize_after
        self.use_cheap_for_summary = settings.chat_use_cheap_model_for_summary
    
    def _estimate_tokens(self, text: str) -> int:
        """
        Грубая оценка количества токенов (1 токен ≈ 4 символа для русского)
        """
        return len(text) // 3
    
    def _format_notes_context(self, notes: List[dict], max_notes: int = 5) -> str:
        """
        Форматирует записи для контекста AI
        """
        if not notes:
            return "У пользователя пока нет записей."
        
        context_parts = []
        for note in notes[:max_notes]:
            date_str = note.get('created_at', '')
            if isinstance(date_str, datetime):
                date_str = date_str.strftime('%d.%m.%Y %H:%M')
            elif isinstance(date_str, str) and 'T' in date_str:
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    date_str = dt.strftime('%d.%m.%Y %H:%M')
                except:
                    pass
            
            title = note.get('title', 'Без названия')
            content = note.get('content', '')
            
            # Ограничиваем длину контента
            if len(content) > 500:
                content = content[:500] + "..."
            
            context_parts.append(f"📝 [{date_str}] {title}\n{content}")
        
        return "\n\n---\n\n".join(context_parts)
    
    def _optimize_history(
        self,
        history: List[dict],
        history_summary: Optional[str] = None
    ) -> Tuple[List[dict], bool]:
        """
        Оптимизация истории сообщений для снижения стоимости
        
        Returns:
            Tuple[оптимизированная история, нужно ли обновить саммари]
        """
        need_new_summary = False
        
        # Если история маленькая, не оптимизируем
        if len(history) <= self.history_limit:
            return history, False
        
        # Если есть саммари и история выросла значительно - обновим саммари
        if len(history) > self.summarize_after:
            need_new_summary = True
        
        # Берём только последние N сообщений
        optimized = history[-self.history_limit:]
        
        # Если есть саммари предыдущего контекста, добавим его в начало
        if history_summary:
            optimized = [
                {"role": "system", "content": f"[Контекст прошлого разговора: {history_summary}]"}
            ] + optimized
        
        logger.info(f"History optimized: {len(history)} -> {len(optimized)} messages")
        return optimized, need_new_summary
    
    async def _summarize_history(self, history: List[dict]) -> str:
        """
        Создать краткое саммари истории разговора
        Использует дешёвую модель для экономии
        """
        # Собираем текст для саммаризации
        text = "\n".join([
            f"{'Пользователь' if m['role'] == 'user' else 'Ассистент'}: {m['content']}"
            for m in history
        ])
        
        # Ограничиваем длину входного текста (не больше 2000 символов)
        if len(text) > 2000:
            text = text[-2000:]
        
        messages = [
            {"role": "system", "content": HISTORY_SUMMARY_PROMPT},
            {"role": "user", "content": text}
        ]
        
        # TODO: Раскомментировать когда будет дешёвая модель
        # model = self.model_cheap if self.use_cheap_for_summary else self.model
        model = self.model  # Пока используем основную модель
        
        try:
            response_msg = await self.chat_completion(messages, model=model)
            summary = response_msg.get("content", "")
            logger.info(f"History summarized: {len(text)} chars -> {len(summary)} chars")
            return summary
        except Exception as e:
            logger.error(f"Failed to summarize history: {e}")
            return ""
    
    async def chat_completion(
        self,
        messages: List[dict],
        model: Optional[str] = None,
        tools: Optional[List[dict]] = None
    ) -> dict:
        """
        Call OpenAI-compatible chat completion API with optional tools
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (defaults to settings.openai_model)
            tools: Optional list of tools for function calling
            
        Returns:
            Full message object including content and tool_calls
        """
        if not self.api_key:
            logger.error("OpenAI API key not configured")
            raise ValueError("OpenAI API key not configured")
        
        model = model or self.model
        url = f"{self.base_url}/chat/completions"
        
        logger.debug(f"Calling AI API: {url}, model: {model}")
        logger.debug(f"Messages count: {len(messages)}, tools: {bool(tools)}")
        
        request_body = {
            "model": model,
            "messages": messages
        }
        
        if tools:
            request_body["tools"] = tools
            request_body["tool_choice"] = "auto"
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json=request_body
                )
                
                logger.debug(f"Response status: {response.status_code}")
                
                if response.status_code != 200:
                    logger.error(f"API error: {response.text}")
                    response.raise_for_status()
                
                data = response.json()
                message_obj = data["choices"][0]["message"]
                
                return message_obj
                
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
        history: List[dict],
        history_summary: Optional[str] = None,
        notes_context: Optional[List[dict]] = None
    ) -> dict:
        """
        Get reflection chat response with optimized history and notes context
        
        Args:
            message: User's message
            history: Full message history
            history_summary: Optional summary of older messages
            notes_context: List of recent user notes for context
        
        Returns:
            dict with 'response', 'suggest_checklist', 'history_summary', 
                   'need_summary_update', 'need_note_date', 'search_notes_query'
        """
        # Оптимизируем историю
        optimized_history, need_summary_update = self._optimize_history(history, history_summary)
        
        # Если нужно обновить саммари - делаем это параллельно
        new_summary = None
        if need_summary_update and len(history) > self.summarize_after:
            # Суммаризируем старые сообщения (которые отрезаем)
            old_messages = history[:-self.history_limit]
            if old_messages:
                new_summary = await self._summarize_history(old_messages)
        
        # Формируем системный промпт с контекстом записей
        if notes_context:
            formatted_notes = self._format_notes_context(notes_context)
            system_prompt = REFLECTION_WITH_CONTEXT_PROMPT.format(notes_context=formatted_notes)
            logger.info(f"Added {len(notes_context)} notes to context")
        else:
            system_prompt = REFLECTION_SYSTEM_PROMPT
        
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        messages.extend(optimized_history)
        messages.append({"role": "user", "content": message})
        
        # Логируем экономию
        original_tokens = self._estimate_tokens(str(history))
        optimized_tokens = self._estimate_tokens(str(optimized_history))
        if original_tokens > optimized_tokens:
            logger.info(f"Token savings: ~{original_tokens} -> ~{optimized_tokens} (saved ~{original_tokens - optimized_tokens})")
        
        # Вызываем API с tools
        response_msg = await self.chat_completion(messages, tools=TOOLS)
        
        # Парсим результат
        content = response_msg.get("content", "") or ""
        tool_calls = response_msg.get("tool_calls", [])
        
        # Обрабатываем tool calls
        checklist_items = None
        need_note_date = None
        search_notes_query = None
        
        for tool_call in tool_calls:
            func_name = tool_call.get("function", {}).get("name")
            func_args_str = tool_call.get("function", {}).get("arguments", "{}")
            
            try:
                func_args = json.loads(func_args_str)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse tool args: {func_args_str}")
                continue
            
            logger.info(f"Tool call: {func_name} with args: {func_args}")
            
            if func_name == "suggest_checklist":
                checklist_items = func_args.get("tasks", [])
            elif func_name == "get_note":
                need_note_date = func_args.get("date")
            elif func_name == "search_notes":
                search_notes_query = func_args.get("query")
        
        return {
            "response": content,
            "suggest_checklist": bool(checklist_items),
            "checklist_items": checklist_items,  # Теперь сразу возвращаем items!
            "history_summary": new_summary or history_summary,
            "need_summary_update": need_summary_update,
            "need_note_date": need_note_date,
            "search_notes_query": search_notes_query
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
        
        response_msg = await self.chat_completion(messages)
        content = response_msg.get("content", "")
        return self._parse_json_response(content)
    
    async def suggest_tasks(self, message: str, history: List[dict]) -> dict:
        """
        Suggest tasks based on conversation (legacy method, kept for compatibility)
        
        Returns:
            dict with 'items'
        """
        messages = [
            {"role": "system", "content": CHECKLIST_SUGGESTION_PROMPT}
        ]
        messages.extend(history)
        messages.append({
            "role": "user",
            "content": f"Последнее сообщение: {message}\n\nПредложи задачи и верни JSON."
        })
        
        response_msg = await self.chat_completion(messages)
        content = response_msg.get("content", "")
        result = self._parse_json_response(content)
        
        if result:
            return result
        return {"items": []}
    
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
        
        response_msg = await self.chat_completion(messages)
        content = response_msg.get("content", "")
        return self._parse_json_response(content)
    
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
