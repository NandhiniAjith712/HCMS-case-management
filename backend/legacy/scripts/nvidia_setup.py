import os
import json
import logging
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path

env_path = Path(__file__).resolve().parent / "config.env"
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)


class NvidiaAIConfig:
    def __init__(self) -> None:
        self.api_key: str = os.getenv("NVIDIA_API_KEY", "").strip()
        self.model: str = os.getenv("NVIDIA_MODEL", "").strip()
        self.base_url: str = os.getenv(
            "NVIDIA_BASE_URL",
            "https://integrate.api.nvidia.com/v1"
        ).strip()
        self.timeout: int = int(os.getenv("NVIDIA_TIMEOUT", "120"))
        self.max_retries: int = int(os.getenv("NVIDIA_MAX_RETRIES", "2"))
        self.temperature: float = float(os.getenv("NVIDIA_TEMPERATURE", "0.2"))
        self.max_tokens: int = int(os.getenv("NVIDIA_MAX_TOKENS", "2048"))
        self.top_p: float = float(os.getenv("NVIDIA_TOP_P", "0.9"))
        self.default_system_prompt: str = os.getenv(
            "NVIDIA_DEFAULT_SYSTEM_PROMPT",
            "You are a helpful AI assistant."
        )

    def validate(self) -> None:
        if not self.api_key:
            raise ValueError("Missing NVIDIA_API_KEY in environment.")
        if not self.model:
            raise ValueError("Missing NVIDIA_MODEL in environment.")


class NvidiaAIClient:
    def __init__(self, config: Optional[NvidiaAIConfig] = None) -> None:
        self.config = config or NvidiaAIConfig()
        self.config.validate()

        self.client = OpenAI(
            api_key=self.config.api_key,
            base_url=self.config.base_url,
            timeout=self.config.timeout,
            max_retries=self.config.max_retries,
        )

    def chat(
        self,
        user_prompt: str,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Simple text generation for all products.
        """
        messages = [
            {
                "role": "system",
                "content": system_prompt or self.config.default_system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ]

        response = self.client.chat.completions.create(
            model=self.config.model,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.config.max_tokens,
            top_p=top_p if top_p is not None else self.config.top_p,
            extra_body=extra_body or {},
        )

        return response.choices[0].message.content.strip()

    def chat_messages(
        self,
        messages: List[Dict[str, Union[str, List[Dict[str, Any]]]]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Advanced multi-message chat.
        """
        response = self.client.chat.completions.create(
            model=self.config.model,
            messages=messages,
            temperature=temperature if temperature is not None else self.config.temperature,
            max_tokens=max_tokens if max_tokens is not None else self.config.max_tokens,
            top_p=top_p if top_p is not None else self.config.top_p,
            extra_body=extra_body or {},
        )

        return response.choices[0].message.content.strip()

    def json_response(
        self,
        user_prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: Optional[int] = None,
        extra_body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ask model to return JSON only.
        """
        strict_system_prompt = (
            (system_prompt or self.config.default_system_prompt)
            + "\nReturn valid JSON only. No markdown. No explanation."
        )

        raw = self.chat(
            user_prompt=user_prompt,
            system_prompt=strict_system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body=extra_body,
        )

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("Model returned invalid JSON: %s", raw)
            raise ValueError("Model did not return valid JSON.") from exc

    def health_check(self) -> Dict[str, Any]:
        """
        Basic connectivity test.
        """
        try:
            output = self.chat(
                user_prompt="Reply with only: NVIDIA connection successful",
                system_prompt="You are a health-check assistant.",
                temperature=0.0,
                max_tokens=20,
            )
            return {
                "status": "success",
                "model": self.config.model,
                "base_url": self.config.base_url,
                "response": output,
            }
        except Exception as exc:
            return {
                "status": "failed",
                "model": self.config.model,
                "base_url": self.config.base_url,
                "error": str(exc),
            }


# Singleton-style shared instance
def get_nvidia_client() -> NvidiaAIClient:
    return NvidiaAIClient()


if __name__ == "__main__":
    ai = get_nvidia_client()
    result = ai.health_check()
    print(json.dumps(result, indent=2))