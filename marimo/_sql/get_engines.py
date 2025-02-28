# Copyright 2024 Marimo. All rights reserved.
from __future__ import annotations

from typing import Any, cast

from marimo import _loggers
from marimo._config.config import DatasourcesConfig
from marimo._config.manager import get_default_config_manager
from marimo._data.models import Database, DataSourceConnection
from marimo._runtime.context.types import (
    ContextNotInitializedError,
    get_context,
)
from marimo._sql.engines import (
    INTERNAL_DUCKDB_ENGINE,
    DuckDBEngine,
    SQLAlchemyEngine,
)
from marimo._sql.types import SQLEngine
from marimo._types.ids import VariableName

LOGGER = _loggers.marimo_logger()


def get_engines_from_variables(
    variables: list[tuple[VariableName, object]],
) -> list[tuple[VariableName, SQLEngine]]:
    engines: list[tuple[VariableName, SQLEngine]] = []
    for variable_name, value in variables:
        if SQLAlchemyEngine.is_compatible(value):
            engines.append(
                (
                    variable_name,
                    SQLAlchemyEngine(
                        cast(Any, value), engine_name=variable_name
                    ),
                )
            )
        elif DuckDBEngine.is_compatible(value):
            engines.append(
                (
                    variable_name,
                    DuckDBEngine(cast(Any, value), engine_name=variable_name),
                )
            )

    return engines


def engine_to_data_source_connection(
    variable_name: VariableName,
    engine: SQLEngine,
) -> DataSourceConnection:
    databases: list[Database] = []
    if isinstance(engine, SQLAlchemyEngine):
        config: DatasourcesConfig = {}
        try:
            config = get_context().marimo_config.get("datasources", {})
        except ContextNotInitializedError:
            config = (
                get_default_config_manager(current_path=None)
                .get_config()
                .get("datasources", {})
            )

        databases = engine.get_databases(
            include_schemas=config.get("include_schemas", True),
            include_tables=config.get("include_tables", False),
            include_table_details=config.get("include_table_details", False),
        )
    elif isinstance(engine, DuckDBEngine):
        databases = engine.get_databases()
    else:
        LOGGER.warning(
            f"Unsupported engine type: {type(engine)}. Unable to get databases for {variable_name}."
        )

    display_name = (
        f"{engine.dialect} ({variable_name})"
        if variable_name != INTERNAL_DUCKDB_ENGINE
        else f"{engine.dialect} (In-Memory)"
    )

    return DataSourceConnection(
        source=engine.source,
        dialect=engine.dialect,
        name=variable_name,
        display_name=display_name,
        databases=databases,
    )
