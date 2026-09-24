#!/usr/bin/env python3
"""
Generate TypeScript types from Python Pydantic models.

This script extracts Pydantic models from the AI service and generates
corresponding TypeScript interfaces for the Worker API to prevent drift.

Usage:
    python scripts/generate_ts_types.py
    python scripts/generate_ts_types.py --output apps/worker-api/src/types.generated.ts
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Add project root to path
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from pydantic import BaseModel
from pydantic.json_schema import GenerateJsonSchema


def extract_models_from_module(module_path: str) -> dict[str, type[BaseModel]]:
    """Extract all Pydantic models from a module."""
    import importlib
    import inspect

    module = importlib.import_module(module_path)
    models = {}
    for name, obj in inspect.getmembers(module):
        if inspect.isclass(obj) and issubclass(obj, BaseModel) and obj is not BaseModel:
            models[name] = obj
    return models


def pydantic_to_typescript(model: type[BaseModel], schema: dict[str, Any]) -> str:
    """Convert a Pydantic model to TypeScript interface."""
    lines = [f"export interface {model.__name__} {{"]
    
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    
    for prop_name, prop_schema in properties.items():
        ts_type = json_schema_to_ts(prop_schema)
        optional = "?" if prop_name not in required else ""
        lines.append(f"  {prop_name}{optional}: {ts_type};")
    
    lines.append("}")
    return "\n".join(lines)


def json_schema_to_ts(schema: dict[str, Any]) -> str:
    """Convert JSON schema type to TypeScript type."""
    if "anyOf" in schema:
        # Handle union types (e.g., Optional)
        types = [json_schema_to_ts(s) for s in schema["anyOf"]]
        # Remove null from union for optional
        types = [t for t in types if t != "null"]
        if len(types) == 1:
            return types[0]
        return " | ".join(types)
    
    if "oneOf" in schema:
        types = [json_schema_to_ts(s) for s in schema["oneOf"]]
        return " | ".join(types)
    
    if "allOf" in schema:
        # For allOf, we'd need intersection types, but simplify to first
        return json_schema_to_ts(schema["allOf"][0])
    
    schema_type = schema.get("type")
    
    if schema_type == "string":
        if schema.get("format") == "date-time":
            return "string"  # ISO 8601 datetime
        if schema.get("format") == "date":
            return "string"
        if schema.get("format") == "uuid":
            return "string"
        if "enum" in schema:
            return " | ".join(f'"{v}"' for v in schema["enum"])
        return "string"
    
    if schema_type == "integer":
        return "number"
    
    if schema_type == "number":
        return "number"
    
    if schema_type == "boolean":
        return "boolean"
    
    if schema_type == "array":
        items = schema.get("items", {})
        return f"{json_schema_to_ts(items)}[]"
    
    if schema_type == "object":
        if "properties" in schema:
            # Inline object
            lines = ["{"]
            for prop_name, prop_schema in schema["properties"].items():
                required = prop_name in schema.get("required", [])
                ts_type = json_schema_to_ts(prop_schema)
                optional = "?" if not required else ""
                lines.append(f"  {prop_name}{optional}: {ts_type};")
            lines.append("}")
            return "\n".join(lines)
        return "Record<string, unknown>"
    
    if schema_type == "null":
        return "null"
    
    if "$ref" in schema:
        # Reference to another schema
        ref = schema["$ref"]
        ref_name: str = ref.split("/")[-1]
        return ref_name
    
    return "unknown"


def generate_typescript(models: dict[str, type[BaseModel]], output_path: Path) -> None:
    """Generate TypeScript file from Pydantic models."""
    # Generate JSON schema for each model using TypeAdapter
    definitions = {}
    for model_name, model in models.items():
        from pydantic import TypeAdapter
        adapter = TypeAdapter(model)
        schema = adapter.json_schema()
        definitions[model_name] = schema
    
    # Generate TypeScript interfaces
    ts_lines = [
        "// Generated from Python Pydantic models",
        "// DO NOT EDIT MANUALLY - run scripts/generate_ts_types.py to regenerate",
        "",
    ]
    
    # Sort by name for consistent output
    for model_name in sorted(models.keys()):
        model = models[model_name]
        model_schema = definitions.get(model_name, {})
        ts_lines.append(pydantic_to_typescript(model, model_schema))
        ts_lines.append("")
    
    # Add common API response types
    ts_lines.extend([
        "// Common API response types",
        "export interface ApiResponse<T> {",
        "  success: boolean;",
        "  data?: T;",
        "  error?: string;",
        "}",
        "",
        "export interface PaginatedResponse<T> {",
        "  success: boolean;",
        "  data: T[];",
        "  total: number;",
        "  page: number;",
        "  page_size: number;",
        "}",
        "",
    ])
    
    output_path.write_text("\n".join(ts_lines), encoding="utf-8")
    print(f"Generated TypeScript types at {output_path}")


def main() -> int:
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate TypeScript types from Pydantic models")
    parser.add_argument("--output", type=Path, default=REPO_ROOT / "apps/worker-api/src/types.generated.ts",
                        help="Output TypeScript file path")
    args = parser.parse_args()
    
    # Add AI service to path
    ai_service_path = REPO_ROOT / "apps/ai-service"
    sys.path.insert(0, str(ai_service_path))
    
    # Extract models from AI service
    all_models = {}
    
    # Schemas module
    try:
        schema_models = extract_models_from_module("app.schemas")
        all_models.update(schema_models)
        print(f"Found {len(schema_models)} models in app.schemas")
    except ImportError as e:
        print(f"Warning: Could not import app.schemas: {e}")
    
    # Routers
    for router_name in ["crop", "yield_", "market", "advisory"]:
        try:
            router_models = extract_models_from_module(f"app.routers.{router_name}")
            all_models.update(router_models)
            print(f"Found {len(router_models)} models in app.routers.{router_name}")
        except ImportError as e:
            print(f"Warning: Could not import app.routers.{router_name}: {e}")
    
    # Main module
    try:
        main_models = extract_models_from_module("app.main")
        all_models.update(main_models)
        print(f"Found {len(main_models)} models in app.main")
    except ImportError as e:
        print(f"Warning: Could not import app.main: {e}")
    
    print(f"Total models: {len(all_models)}")
    
    if not all_models:
        print("No models found!")
        return 1
    
    generate_typescript(all_models, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())