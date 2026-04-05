"""Local LLM interface -- zentraler Zugriff auf Ollama mit Serialisierung.

Alle lokalen LLM-Aufrufe in geofrey laufen durch dieses Modul.
Es stellt sicher dass:
1. Nur ein LLM-Aufruf gleichzeitig laeuft (Threading Lock)
2. Das richtige Modell + Parameter verwendet werden
3. Fehler sauber behandelt werden (Timeout, Ollama nicht erreichbar)

Modell-Empfehlung fuer Mac Mini M4 (16GB):
- Qwen 3 14B (Q4_K_M): ~9GB, beste Reasoning-Qualitaet, 119 Sprachen
- Fallback: Qwen 3 8B (Q5_K_M): ~6.7GB, wenn RAM knapp
"""

import json
import logging
import threading
from typing import Any

logger = logging.getLogger("geofrey.llm")

# Global lock: ensures only one LLM call runs at a time.
# Ollama serializes internally too, but this prevents queuing up
# expensive calls that would block other services.
_llm_lock = threading.Lock()

# Default config (overridden by config.yaml at runtime)
DEFAULT_MODEL = "qwen3:14b"
DEFAULT_TEMPERATURE = 0.3
DEFAULT_TIMEOUT = 120  # seconds


def ask(
    prompt: str,
    system: str = "",
    model: str | None = None,
    temperature: float | None = None,
    json_output: bool = False,
    config: dict | None = None,
) -> str:
    """Send a prompt to the local LLM and return the response text.

    Thread-safe: only one call runs at a time via lock.
    Returns empty string on failure (never raises).
    """
    model = model or _resolve_model(config)
    temperature = temperature if temperature is not None else DEFAULT_TEMPERATURE

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    acquired = _llm_lock.acquire(timeout=300)  # Wait max 5 min for lock
    if not acquired:
        logger.error("LLM lock timeout (5 min). Another call is stuck?")
        return ""

    try:
        return _call_ollama(messages, model, temperature, json_output)
    finally:
        _llm_lock.release()


def ask_json(
    prompt: str,
    system: str = "",
    model: str | None = None,
    config: dict | None = None,
) -> dict | list | None:
    """Send a prompt and parse JSON from the response.

    Returns None on failure or invalid JSON.
    """
    response = ask(
        prompt=prompt,
        system=system,
        model=model,
        json_output=True,
        config=config,
    )
    if not response:
        return None

    # Strip thinking tags if present (Qwen 3 thinking mode)
    response = _strip_thinking(response)

    try:
        return json.loads(response)
    except json.JSONDecodeError:
        # Try to extract JSON from text
        json_match = _extract_json(response)
        if json_match:
            try:
                return json.loads(json_match)
            except json.JSONDecodeError:
                pass
        logger.warning(f"Failed to parse JSON from LLM response: {response[:200]}")
        return None


def _call_ollama(
    messages: list[dict],
    model: str,
    temperature: float,
    json_output: bool,
) -> str:
    """Call Ollama API. Returns response text or empty string."""
    try:
        import ollama
    except ImportError:
        logger.error("ollama package not installed.")
        return ""

    try:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "options": {"temperature": temperature},
        }

        # Disable thinking mode for efficiency (Qwen 3 specific)
        # Enable only when we explicitly want chain-of-thought
        kwargs["think"] = False

        if json_output:
            kwargs["format"] = "json"

        response = ollama.chat(**kwargs)
        text = response.get("message", {}).get("content", "")
        return text.strip()

    except Exception as e:
        logger.error(f"Ollama call failed ({model}): {e}")
        return ""


def ask_with_thinking(
    prompt: str,
    system: str = "",
    model: str | None = None,
    config: dict | None = None,
) -> tuple[str, str]:
    """Call LLM with thinking mode enabled. Returns (thinking, response).

    Use this for complex reasoning tasks where chain-of-thought helps.
    More expensive (slower) than regular ask().
    """
    model = model or _resolve_model(config)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    acquired = _llm_lock.acquire(timeout=300)
    if not acquired:
        return "", ""

    try:
        import ollama
        response = ollama.chat(
            model=model,
            messages=messages,
            think=True,  # Enable thinking
            options={"temperature": 0.5},  # Slightly higher for creative reasoning
        )
        msg = response.get("message", {})
        thinking = msg.get("thinking", "")
        content = msg.get("content", "")
        return thinking.strip(), content.strip()
    except Exception as e:
        logger.error(f"Ollama thinking call failed: {e}")
        return "", ""
    finally:
        _llm_lock.release()


def _resolve_model(config: dict | None) -> str:
    """Get model name from config or use default."""
    if config:
        llm_config = config.get("llm", {})
        return llm_config.get("model", DEFAULT_MODEL)
    return DEFAULT_MODEL


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> tags from Qwen 3 output."""
    import re
    return re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()


def _extract_json(text: str) -> str | None:
    """Try to extract JSON object or array from text."""
    # Find first { or [
    for i, ch in enumerate(text):
        if ch in ('{', '['):
            # Find matching closing bracket
            depth = 0
            opener = ch
            closer = '}' if ch == '{' else ']'
            for j in range(i, len(text)):
                if text[j] == opener:
                    depth += 1
                elif text[j] == closer:
                    depth -= 1
                    if depth == 0:
                        return text[i:j+1]
    return None
