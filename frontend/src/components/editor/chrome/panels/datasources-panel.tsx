/* Copyright 2024 Marimo. All rights reserved. */
import React from "react";
import {
  ChevronRightIcon,
  DatabaseIcon,
  PlusIcon,
  PaintRollerIcon,
  PlusSquareIcon,
  XIcon,
  LoaderCircle,
  Table2Icon,
  EyeIcon,
} from "lucide-react";
import { Command, CommandInput, CommandItem } from "@/components/ui/command";
import { CommandList } from "cmdk";

import { cn } from "@/utils/cn";
import {
  datasetTablesAtom,
  expandedColumnsAtom,
  useDatasets,
  useDatasetsActions,
} from "@/core/datasets/state";
import { DATA_TYPE_ICON } from "@/components/datasets/icons";
import { Button } from "@/components/ui/button";
import { cellIdsAtom, useCellActions } from "@/core/cells/cells";
import { useLastFocusedCellId } from "@/core/cells/focus";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { Tooltip } from "@/components/ui/tooltip";
import { PanelEmptyState } from "./empty-state";
import { previewDatasetColumn } from "@/core/network/requests";
import { prettyNumber } from "@/utils/numbers";
import { Events } from "@/utils/events";
import { CopyClipboardIcon } from "@/components/icons/copy-icon";
import { ErrorBoundary } from "../../boundary/ErrorBoundary";
import type { TopLevelFacetedUnitSpec } from "@/plugins/impl/data-explorer/queries/types";
import { useTheme } from "@/theme/useTheme";
import {
  maybeAddAltairImport,
  maybeAddMarimoImport,
} from "@/core/cells/add-missing-import";
import { autoInstantiateAtom } from "@/core/config/config";
import type {
  Database,
  DatabaseSchema,
  DataColumnPreview,
  DataSourceConnection,
  DataTable,
  DataTableColumn,
} from "@/core/kernel/messages";
import { variablesAtom } from "@/core/variables/state";
import { sortBy } from "lodash-es";
import { logNever } from "@/utils/assertNever";
import { DatabaseLogo } from "@/components/databases/icon";
import { EngineVariable } from "@/components/databases/engine-variable";
import type { VariableName } from "@/core/variables/types";
import { dbDisplayName } from "@/components/databases/display";
import { AddDatabaseDialog } from "../../database/add-database-form";
import {
  tablePreviewsAtom,
  dataConnectionsMapAtom,
  DEFAULT_ENGINE,
} from "@/core/datasets/data-source-connections";
import { PythonIcon } from "../../cell/code/icons";
import { PreviewSQLTable } from "@/core/functions/FunctionRegistry";
import { useAsyncData } from "@/hooks/useAsyncData";

const sortedTablesAtom = atom((get) => {
  const tables = get(datasetTablesAtom);
  const variables = get(variablesAtom);
  const cellIds = get(cellIdsAtom);

  // Sort tables by the index of the variable they are defined in
  return sortBy(tables, (table) => {
    // Put at the top
    if (!table.variable_name) {
      return -1;
    }
    const variable = Object.values(variables).find(
      (v) => v.name === table.variable_name,
    );
    if (!variable) {
      return 0;
    }

    const index = cellIds.inOrderIds.indexOf(variable.declaredBy[0]);
    if (index === -1) {
      return 0;
    }
    return index;
  });
});

const connectionsAtom = atom((get) => {
  const dataConnections = new Map(get(dataConnectionsMapAtom));
  // Filter out the internal duckdb engine if it has no databases
  const defaultEngine = dataConnections.get(DEFAULT_ENGINE);
  if (defaultEngine && defaultEngine.databases.length === 0) {
    dataConnections.delete(DEFAULT_ENGINE);
  }
  return dataConnections;
});

export const DataSourcesPanel: React.FC = () => {
  const [searchValue, setSearchValue] = React.useState<string>("");

  const { toggleTable, toggleColumn, closeAllColumns } = useDatasetsActions();
  const tables = useAtomValue(sortedTablesAtom);
  const dataConnections = useAtomValue(connectionsAtom);

  if (tables.length === 0 && dataConnections.size === 0) {
    return (
      <PanelEmptyState
        title="No tables found"
        description="Any datasets/dataframes in the global scope will be shown here."
        action={
          <AddDatabaseDialog>
            <Button variant="outline" size="sm">
              Add database
              <PlusIcon className="h-4 w-4 ml-2" />
            </Button>
          </AddDatabaseDialog>
        }
        icon={<DatabaseIcon />}
      />
    );
  }

  const hasSearch = !!searchValue.trim();

  return (
    <Command className="border-b bg-background rounded-none h-full pb-10 overflow-auto">
      <div className="flex items-center w-full">
        <CommandInput
          placeholder="Search tables..."
          className="h-6 m-1"
          value={searchValue}
          onValueChange={(value) => {
            // If searching, remove open previews
            if (value.length > 0) {
              closeAllColumns();
            }
            setSearchValue(value);
          }}
          rootClassName="flex-1 border-r"
        />
        {hasSearch && (
          <button
            type="button"
            className="float-right border-b px-2 m-0 h-full hover:bg-accent hover:text-accent-foreground"
            onClick={() => setSearchValue("")}
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}

        <AddDatabaseDialog>
          <button
            type="button"
            className="float-right border-b px-2 m-0 h-full hover:bg-accent hover:text-accent-foreground"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </AddDatabaseDialog>
      </div>

      {Array.from(dataConnections.values(), (connection) => {
        return (
          <Engine
            key={connection.name}
            connection={connection}
            hasChildren={connection.databases.length > 0}
          >
            {Array.from(connection.databases.values(), (database) => (
              <DatabaseItem key={database.name} database={database}>
                {database.schemas.map((schema) => (
                  <SchemaItem
                    key={schema.name}
                    dbName={database.name}
                    schema={schema}
                  >
                    <TableList
                      tables={schema.tables}
                      isSearching={hasSearch}
                      sqlTableContext={{
                        engine: connection.name,
                        database: database.name,
                        schema: schema.name,
                      }}
                    />
                  </SchemaItem>
                ))}
              </DatabaseItem>
            ))}
          </Engine>
        );
      })}

      {dataConnections.size > 0 && tables.length > 0 && (
        <DatasourceLabel>
          <PythonIcon className="h-4 w-4 text-muted-foreground" />
          <span>Python</span>
        </DatasourceLabel>
      )}
      {tables.length > 0 && (
        <TableList tables={tables} isSearching={hasSearch} />
      )}
    </Command>
  );
};

const Engine: React.FC<{
  connection: DataSourceConnection;
  children: React.ReactNode;
  hasChildren?: boolean;
}> = ({ connection, children, hasChildren }) => {
  const hasEngine = connection.databases.length > 0;
  // If the connection has no engine, it's the internal duckdb engine
  const engineName = hasEngine
    ? connection.databases[0]?.engine || "In-Memory"
    : connection.name;

  return (
    <>
      <DatasourceLabel>
        <DatabaseLogo
          className="h-4 w-4 text-muted-foreground"
          name={connection.dialect}
        />
        <span>{dbDisplayName(connection.dialect)}</span>
        <span className="text-xs text-muted-foreground">
          (<EngineVariable variableName={engineName as VariableName} />)
        </span>
      </DatasourceLabel>
      {hasChildren ? (
        children
      ) : (
        <EmptyState content="No databases available" className="pl-2" />
      )}
    </>
  );
};

const DatabaseItem: React.FC<{
  database: Database;
  children: React.ReactNode;
}> = ({ database, children }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const renderChildren = () => {
    if (!isExpanded) {
      return;
    }

    if (database.schemas.length === 0) {
      return <EmptyState content="No schemas available" className="pl-6" />;
    }

    return children;
  };

  return (
    <>
      <CommandItem
        className="text-sm flex flex-row gap-1 items-center cursor-pointer"
        onSelect={() => setIsExpanded(!isExpanded)}
      >
        <RotatingChevron isExpanded={isExpanded} />
        <DatabaseIcon
          className={cn(
            "h-4 w-4",
            isExpanded ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className={cn(isExpanded && "font-semibold")}>
          {database.name}
        </span>
      </CommandItem>
      {renderChildren()}
    </>
  );
};

const SchemaItem: React.FC<{
  dbName: string;
  schema: DatabaseSchema;
  children: React.ReactNode;
}> = ({ dbName, schema, children }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const uniqueValue = `${dbName}:${schema.name}`;

  return (
    <>
      <CommandItem
        className="text-sm flex flex-row gap-1 items-center pl-5 cursor-pointer"
        onSelect={() => setIsExpanded(!isExpanded)}
        value={uniqueValue}
      >
        <RotatingChevron isExpanded={isExpanded} />
        <PaintRollerIcon
          className={cn(
            "h-4 w-4 text-muted-foreground",
            isExpanded && "text-foreground",
          )}
        />
        <span className={cn(isExpanded && "font-semibold")}>{schema.name}</span>
      </CommandItem>
      {isExpanded && <div className="pl-5">{children}</div>}
    </>
  );
};

interface SQLTableContext {
  engine: string;
  database: string;
  schema: string;
}

const TableList: React.FC<{
  isSearching: boolean;
  tables: DataTable[];
  sqlTableContext?: SQLTableContext;
}> = ({ tables, isSearching, sqlTableContext }) => {
  return (
    <CommandList className="flex flex-col">
      {tables.length === 0 ? (
        <EmptyState
          content="No tables found"
          className={cn(sqlTableContext ? "pl-5" : "pl-2")}
        />
      ) : (
        tables.map((table) => (
          <DatasetTableItem
            key={table.name}
            table={table}
            forceMount={isSearching}
            sqlTableContext={sqlTableContext}
          />
        ))
      )}
    </CommandList>
  );
};

const DatasetTableItem: React.FC<{
  table: DataTable;
  forceMount?: boolean;
  sqlTableContext?: SQLTableContext;
}> = ({ table, sqlTableContext }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const [tablePreviews, setTablePreviews] = useAtom(tablePreviewsAtom);
  const tablePreview = tablePreviews.get(table.name);
  const tableDetailsExist = table.columns.length > 0;

  const { loading, error } = useAsyncData(async () => {
    // Only fetch table preview when the data is not passed in and doesn't exist in the atom
    if (isExpanded && !tableDetailsExist && sqlTableContext && !tablePreview) {
      const { engine, database, schema } = sqlTableContext;
      const previewTable = await PreviewSQLTable.request({
        engine: engine,
        database: database,
        schema: schema,
        tableName: table.name,
      });

      if (!previewTable?.table) {
        throw new Error("No table details available");
      }

      setTablePreviews((prev) => new Map(prev).set(table.name, previewTable));
    }
  }, [isExpanded, tableDetailsExist]);

  const autoInstantiate = useAtomValue(autoInstantiateAtom);
  const lastFocusedCellId = useLastFocusedCellId();
  const { createNewCell } = useCellActions();

  const handleAddTable = () => {
    maybeAddMarimoImport(autoInstantiate, createNewCell, lastFocusedCellId);
    let code = "";
    if (sqlTableContext) {
      const { engine, schema } = sqlTableContext;
      code = `_df = mo.sql(f"SELECT * FROM ${schema}.${table.name} LIMIT 100", engine=${engine})`;
    } else {
      switch (table.source_type) {
        case "local":
          code = `mo.ui.table(${table.name})`;
          break;
        case "duckdb":
          code = `_df = mo.sql(f"SELECT * FROM ${table.name} LIMIT 100")`;
          break;
        case "connection":
          code = `_df = mo.sql(f"SELECT * FROM ${table.name} LIMIT 100", engine=${table.engine})`;
          break;
        default:
          logNever(table.source_type);
          break;
      }
    }

    createNewCell({
      code,
      before: false,
      cellId: lastFocusedCellId ?? "__end__",
    });
  };

  const renderRowsByColumns = () => {
    const label: string[] = [];
    if (table.num_rows != null) {
      label.push(`${table.num_rows} rows`);
    }
    if (table.num_columns != null) {
      label.push(`${table.num_columns} columns`);
    }

    if (label.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-row gap-2 items-center pl-6 group-hover:hidden">
        <span className="text-xs text-muted-foreground">
          {label.join(", ")}
        </span>
      </div>
    );
  };

  const renderColumns = () => {
    if (loading) {
      return (
        <div className="pl-6 text-sm bg-blue-50 text-blue-500 flex items-center gap-2 p-2 h-8">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading columns...
        </div>
      );
    }

    if (error) {
      return (
        <div className="pl-6 text-sm bg-red-50 text-red-600 flex items-center gap-2 p-2 h-8">
          <XIcon className="h-4 w-4" />
          {error.message}
        </div>
      );
    }

    const columns = tableDetailsExist
      ? table.columns
      : tablePreview?.table?.columns || [];
    return columns.map((column) => (
      <DatasetColumnItem
        key={column.name}
        table={tablePreview?.table ?? table}
        column={column}
        sqlTableContext={sqlTableContext}
      />
    ));
  };

  const renderTableType = () => {
    if (table.source_type === "local") {
      return;
    }

    const TableTypeIcon = table.type === "table" ? Table2Icon : EyeIcon;
    return (
      <TableTypeIcon
        className="h-3 w-3"
        strokeWidth={isExpanded ? 2.5 : undefined}
      />
    );
  };

  const uniqueId = sqlTableContext
    ? `${sqlTableContext.database}.${sqlTableContext.schema}.${table.name}`
    : table.name;

  return (
    <>
      <CommandItem
        className={cn(
          "rounded-none group h-8 cursor-pointer",
          table.source_type !== "local" && "pl-6",
          isExpanded && "font-semibold",
        )}
        value={uniqueId}
        aria-selected={isExpanded}
        forceMount={true}
        onSelect={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex gap-2 items-center flex-1">
          {renderTableType()}
          <span className="text-sm">{table.name}</span>
        </div>
        {renderRowsByColumns()}
        <Tooltip content="Add table to notebook" delayDuration={400}>
          <Button
            className="group-hover:inline-flex hidden"
            variant="text"
            size="icon"
            onClick={Events.stopPropagation(() => handleAddTable())}
          >
            <PlusSquareIcon className="h-3 w-3" />
          </Button>
        </Tooltip>
      </CommandItem>
      {isExpanded && renderColumns()}
    </>
  );
};

const DatasetColumnItem: React.FC<{
  table: DataTable;
  column: DataTableColumn;
  sqlTableContext?: SQLTableContext;
}> = ({ table, column, sqlTableContext }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const setExpandedColumns = useSetAtom(expandedColumnsAtom);

  if (isExpanded) {
    setExpandedColumns(
      (prev) => new Set([...prev, `${table.name}:${column.name}`]),
    );
  } else {
    setExpandedColumns((prev) => {
      prev.delete(`${table.name}:${column.name}`);
      return new Set(prev);
    });
  }

  const Icon = DATA_TYPE_ICON[column.type];

  const autoInstantiate = useAtomValue(autoInstantiateAtom);
  const lastFocusedCellId = useLastFocusedCellId();
  const { createNewCell } = useCellActions();

  const { columnsPreviews } = useDatasets();
  const isPrimaryKey = table.primary_keys?.includes(column.name) || false;
  const isIndexed = table.indexes?.includes(column.name) || false;

  const handleAddColumn = (chartCode: string) => {
    if (chartCode.includes("alt")) {
      maybeAddAltairImport(autoInstantiate, createNewCell, lastFocusedCellId);
    }
    createNewCell({
      code: chartCode,
      before: false,
      cellId: lastFocusedCellId ?? "__end__",
    });
  };

  return (
    <>
      <CommandItem
        className="rounded-none py-1 group cursor-pointer"
        key={`${table.name}.${column.name}`}
        value={`${table.name}.${column.name}`}
        onSelect={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={cn(
            "flex flex-row gap-2 items-center flex-1",
            table.source_type === "local" ? "pl-6" : "pl-7",
          )}
        >
          <Icon className="flex-shrink-0 h-3 w-3" strokeWidth={1.5} />
          <span>{column.name}</span>
          {isPrimaryKey && (
            <Tooltip content="Primary Key" delayDuration={100}>
              <span className="text-xs text-black bg-gray-200 rounded px-1">
                PK
              </span>
            </Tooltip>
          )}
          {isIndexed && (
            <Tooltip content="Indexed" delayDuration={100}>
              <span className="text-xs text-black bg-gray-200 rounded px-1">
                IDX
              </span>
            </Tooltip>
          )}
        </div>
        <Tooltip content="Copy column name" delayDuration={400}>
          <Button
            variant="text"
            size="icon"
            className="group-hover:opacity-100 opacity-0 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <CopyClipboardIcon
              tooltip={false}
              value={column.name}
              className="h-3 w-3"
            />
          </Button>
        </Tooltip>
        <span className="text-xs text-muted-foreground">
          {column.external_type}
        </span>
      </CommandItem>
      {isExpanded && (
        <div className="pl-10 pr-2 py-2 bg-[var(--slate-1)] shadow-inner border-b">
          <ErrorBoundary>
            <DatasetColumnPreview
              table={table}
              column={column}
              onAddColumnChart={handleAddColumn}
              preview={columnsPreviews.get(`${table.name}:${column.name}`)}
              sqlTableContext={sqlTableContext}
            />
          </ErrorBoundary>
        </div>
      )}
    </>
  );
};

const LazyVegaLite = React.lazy(() =>
  import("react-vega").then((m) => ({ default: m.VegaLite })),
);

const DatasetColumnPreview: React.FC<{
  table: DataTable;
  column: DataTableColumn;
  onAddColumnChart: (code: string) => void;
  preview: DataColumnPreview | undefined;
  sqlTableContext?: SQLTableContext;
}> = ({ table, column, preview, onAddColumnChart, sqlTableContext }) => {
  const { theme } = useTheme();

  // Only fetch previews for local or duckdb tables
  if (table.source_type === "connection") {
    return (
      <span className="text-xs text-muted-foreground gap-2 flex items-center justify-between">
        {column.name} ({column.external_type})
        <Button
          variant="outline"
          size="xs"
          onClick={Events.stopPropagation(() => {
            onAddColumnChart(sqlCode(table, column, sqlTableContext));
          })}
        >
          <PlusSquareIcon className="h-3 w-3 mr-1" /> Add SQL cell
        </Button>
      </span>
    );
  }

  if (!preview) {
    previewDatasetColumn({
      source: table.source,
      tableName: table.name,
      columnName: column.name,
      sourceType: table.source_type,
    });
  }

  if (!preview) {
    return <span className="text-xs text-muted-foreground">Loading...</span>;
  }

  const error = preview.error && (
    <span className="text-xs text-muted-foreground">{preview.error}</span>
  );

  const summary = preview.summary && (
    <div className="gap-x-16 gap-y-1 grid grid-cols-2-fit border rounded p-2 empty:hidden">
      {Object.entries(preview.summary).map(([key, value]) => {
        if (value == null) {
          return null;
        }

        return (
          <div key={key} className="flex items-center gap-1 group">
            <CopyClipboardIcon
              className="h-3 w-3 invisible group-hover:visible"
              value={String(value)}
            />
            <span className="text-xs min-w-[60px] uppercase">{key}</span>
            <span className="text-xs font-bold text-muted-foreground tracking-wide">
              {prettyNumber(value)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const updateSpec = (spec: TopLevelFacetedUnitSpec) => {
    return {
      ...spec,
      config: { ...spec.config, background: "transparent" },
    };
  };
  const chart = preview.chart_spec && (
    <LazyVegaLite
      spec={updateSpec(
        JSON.parse(preview.chart_spec) as TopLevelFacetedUnitSpec,
      )}
      width={"container" as unknown as number}
      height={100}
      actions={false}
      theme={theme === "dark" ? "dark" : "vox"}
    />
  );

  const addDataframeChart = preview.chart_code &&
    table.source_type === "local" && (
      <Tooltip content="Add chart to notebook" delayDuration={400}>
        <Button
          variant="outline"
          size="icon"
          className="z-10 bg-background absolute right-1 -top-1"
          onClick={Events.stopPropagation(() =>
            onAddColumnChart(preview.chart_code || ""),
          )}
        >
          <PlusSquareIcon className="h-3 w-3" />
        </Button>
      </Tooltip>
    );

  const addSQLChart = table.source_type === "duckdb" && (
    <Tooltip content="Add SQL cell" delayDuration={400}>
      <Button
        variant="outline"
        size="icon"
        className="z-10 bg-background absolute right-1 -top-1"
        onClick={Events.stopPropagation(() => {
          onAddColumnChart(sqlCode(table, column, sqlTableContext));
        })}
      >
        <PlusSquareIcon className="h-3 w-3" />
      </Button>
    </Tooltip>
  );

  const chartMaxRowsWarning = preview.chart_max_rows_errors && (
    <span className="text-xs text-muted-foreground">
      Too many rows to render the chart.
    </span>
  );

  if (!error && !summary && !chart && !chartMaxRowsWarning) {
    return <span className="text-xs text-muted-foreground">No data</span>;
  }

  return (
    <div className="flex flex-col gap-2 relative">
      {error}
      {addDataframeChart}
      {addSQLChart}
      {chartMaxRowsWarning}
      {chart}
      {summary}
    </div>
  );
};

const DatasourceLabel: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <div className="flex gap-1 items-center font-bold px-2 py-1.5 text-muted-foreground bg-[var(--slate-2)] text-sm">
      {children}
    </div>
  );
};

const RotatingChevron: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
  <ChevronRightIcon
    className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")}
  />
);

export const EmptyState: React.FC<{ content: string; className?: string }> = ({
  content,
  className,
}) => {
  return (
    <div className={cn("text-sm text-muted-foreground py-1", className)}>
      {content}
    </div>
  );
};

function sqlCode(
  table: DataTable,
  column: DataTableColumn,
  sqlTableContext?: SQLTableContext,
) {
  if (sqlTableContext) {
    const { engine, schema } = sqlTableContext;
    return `_df = mo.sql(f'SELECT ${column.name} FROM ${schema}.${table.name} LIMIT 100', engine=${engine})`;
  }
  return `_df = mo.sql(f'SELECT "${column.name}" FROM ${table.name} LIMIT 100')`;
}
