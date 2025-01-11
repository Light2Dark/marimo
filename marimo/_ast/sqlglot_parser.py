# Copyright 2024 Marimo. All rights reserved.
from dataclasses import dataclass, field

from sqlglot import exp, parse, parse_one
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import build_scope


def find_sql_refs_ast(sql_statement: str) -> list[str]:
    refs: list[str] = []
    expression_list = parse(sql_statement)
    for expression in expression_list:
        root = build_scope(expression)

        update_expr = expression.find(exp.Update)
        if update_expr:
            table_expr = update_expr.find(exp.Table)
            print(table_expr.name)
            print(table_expr.db)
            print(table_expr.catalog)

        # for node in expression.walk():
        #     if isinstance(node, exp.Update):
        #         table_expr = node.find(exp.Table)
        #         print(table_expr.name)
        #         print(table_expr.db)
        #         print(table_expr.catalog)

        # root will be none for non-select statements like comments, ddl
        if root is None:
            continue

        for scope in root.traverse():
            for _alias, (_node, source) in scope.selected_sources.items():
                if isinstance(source, exp.Table):
                    if source.catalog == "memory":
                        # Default in-memory catalog, only include table name
                        refs.append(source.name)
                    else:
                        # We skip schema if there is a catalog
                        # Because it may be called "public" or "main" across all catalogs
                        # and they aren't referenced in the code
                        if source.catalog:
                            refs.append(source.catalog)
                        elif source.db:
                            refs.append(source.db)  # schema

                        if source.name:
                            refs.append(source.name)  # table name

    # removes duplicates while preserving order
    return list(dict.fromkeys(refs))


def get_refs(sql_statement: str) -> list[str]:
    refs: list[str] = []
    sql_asts = parse(sql_statement)
    for sql_ast in sql_asts:
        qualified_ast = qualify(sql_ast)
        root = build_scope(qualified_ast)

        for scope in root.traverse():
            for _alias, (_node, source) in scope.selected_sources.items():
                if isinstance(source, exp.Table):
                    if source.name:
                        refs.append(source.name)  # table name
                    if source.db:
                        refs.append(source.db)  # schema
    return refs


@dataclass
class SQLDefs:
    tables: list[str] = field(default_factory=list)
    views: list[str] = field(default_factory=list)
    schemas: list[str] = field(default_factory=list)
    catalogs: list[str] = field(default_factory=list)

    # The schemas referenced in the CREATE SQL statement
    reffed_schemas: list[str] = field(default_factory=list)
    # The catalogs referenced in the CREATE SQL statement
    reffed_catalogs: list[str] = field(default_factory=list)


def get_sql_defs(sql_statement: str) -> SQLDefs:
    asts = parse(sql_statement)
    for sql_ast in asts:
        root = build_scope(sql_ast)
        if not root:
            return SQLDefs()
        for scope in root.traverse():
            for _alias, (_node, source) in scope.selected_sources.items():
                print(source)


if __name__ == "__main__":
    sql = """
    CREATE TABLE t2 AS
    WITH x AS (
        SELECT 1 as a from t1
    )
    SELECT * FROM x;
    """

    sql = """
    CREATE OR REPLACE TABLE my_catalog.my_db.my_table as (SELECT 42);
    """

    sql = "UPDATE v3 SET id = 1"

    sql = """
    CREATE VIEW v1 (id INT);
    CREATE VIEW v2 (id INT);
    UPDATE TABLE v3 SET id = 1;
    DELETE FROM TABLE v4 WHERE false;
    DROP VIEW v5;
    INSERT INTO t6 (id) VALUES (1);
    CREATE UNIQUE INDEX tbl_idx ON t7 (id);
    CREATE TABLE my_catalog.my_schema.my_table (id INT);
    CREATE TEMPORARY TABLE my_table_temp AS
    -- Comment in the middle
    SELECT * FROM existing_table;
    ATTACH 'Chinook.sqlite' AS my_db;
    ATTACH 'Chinook.sqlite';
    ATTACH DATABASE 'Chinook.sqlite';
    ATTACH 'md:my_db_2'
    """

    sql = "CREATE TABLE test_table (id INT, name VARCHAR(255));"
    sql = "ALTER TABLE t1 ADD COLUMN (hobby VARCHAR)"
    sql = """
    CREATE TABLE my_catalog.my_schema.my_table (id INT, name VARCHAR(255));
    CREATE VIEW my_catalog3.s3.view1 (id INT);
    CREATE SCHEMA my_catalog2.s2;
    CREATE DATABASE db1;
    ALTER TABLE t1 ADD COLUMN (hobby VARCHAR);
    DROP SCHEMA s3;
    """
    sql = "CREATE OR REPLACE TABLE catalog.my_table AS SELECT 1 FROM users;"
    sql = r"""
    CREATE TABLE "my--table" (
        "column/*with*/comment" INT,
        "another--column" VARCHAR
    );

    CREATE TABLE my_table_with_select AS
    SELECT *
    FROM (
        VALUES
        ('a', 1),
        ('b', 2)
    ) AS t("col--1", "col--2");

    CREATE TABLE "my/*weird*/table" (id INT);

    CREATE TABLE "with a space" (id INT);

    CREATE TABLE 'single-quotes' (id INT);
    CREATE TABLE 'escaped\ntable' (id INT);
    """
    sql = """
    CREATE TABLE IF NOT EXISTS my_table
    -- Comment before AS
    AS
    /* Comment
    before SELECT */
    SELECT * FROM read_csv('x')
    """

    created_tables: list[str] = []
    created_views: list[str] = []
    created_schemas: list[str] = []
    created_catalogs: list[str] = []

    reffed_schemas: list[str] = []
    reffed_catalogs: list[str] = []

    expression_list = parse(sql, read="duckdb")

    for expression in expression_list:
        if expression is None:
            continue

        for ddl_expr in expression.find_all(exp.Create, exp.Alter, exp.Drop):
            table_expr = ddl_expr.find(exp.Table)

            if ddl_expr.kind == "VIEW":
                created_views.append(table_expr.name)  # view name
                if table_expr.catalog:
                    reffed_catalogs.append(table_expr.catalog)
                if table_expr.db:
                    reffed_schemas.append(table_expr.db)

            elif ddl_expr.kind == "TABLE":
                created_tables.append(table_expr.name)
                if table_expr.db and not table_expr.catalog:
                    # treat this as catalog
                    reffed_catalogs.append(table_expr.db)
                    continue
                if table_expr.catalog:
                    reffed_catalogs.append(table_expr.catalog)
                if table_expr.db:
                    reffed_schemas.append(table_expr.db)

            elif ddl_expr.kind == "SCHEMA":
                created_schemas.append(table_expr.db)
                if table_expr.catalog:
                    reffed_catalogs.append(table_expr.catalog)

            elif ddl_expr.kind == "DATABASE":
                created_catalogs.append(table_expr.name)

        # if attach, we add the alias if exist.
        # catalog:alias. if there is ':', we add the alias
        # else, add catalog
        for attach_expr in expression.find_all(exp.Attach):
            if attach_expr.name:
                # sqlglot doesn't breakdown catalog for attach
                name = attach_expr.name
                catalog: str = None
                if "." in name:
                    catalog = attach_expr.name.split(".")[0]
                elif ":" in name:
                    catalog = attach_expr.name.split(":")[-1]

                if catalog:
                    created_catalogs.append(catalog)

            # could be defined as alias
            aliased = attach_expr.find(exp.Alias)
            if aliased:
                created_catalogs.append(aliased.alias_or_name)

    # removes duplicates while preserving order
    created_catalogs = list(dict.fromkeys(created_catalogs))
    created_tables = list(dict.fromkeys(created_tables))
    created_schemas = list(dict.fromkeys(created_schemas))
    reffed_catalogs = list(dict.fromkeys(reffed_catalogs))
    reffed_schemas = list(dict.fromkeys(reffed_schemas))

    # Remove 'memory' from catalogs, as this is the default and doesn't have a def
    if "memory" in reffed_catalogs:
        reffed_catalogs.remove("memory")
    # Remove 'main' from schemas, as this is the default and doesn't have a def
    if "main" in reffed_schemas:
        reffed_schemas.remove("main")

    sql_defs = SQLDefs(
        tables=created_tables,
        views=created_views,
        schemas=created_schemas,
        catalogs=created_catalogs,
        reffed_schemas=reffed_schemas,
        reffed_catalogs=reffed_catalogs,
    )
    print(sql_defs)
