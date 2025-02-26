/* Copyright 2024 Marimo. All rights reserved. */
import { createReducerAndAtoms } from "@/utils/createReducer";
import type {
  DataSourceConnection as DataSourceConnectionType,
  DataTable,
  SQLTablePreview,
} from "../kernel/messages";
import type { TypedString } from "@/utils/typed";
import type { VariableName } from "../variables/types";
import { atom } from "jotai";
import { store } from "../state/jotai";
import { datasetTablesAtom } from "./state";

export type ConnectionName = TypedString<"ConnectionName">;

export const DEFAULT_ENGINE = "__marimo_duckdb" as ConnectionName;

// Extend the backend type but override the name property with the strongly typed ConnectionName
export interface DataSourceConnection
  extends Omit<DataSourceConnectionType, "name"> {
  name: ConnectionName;
}

export interface DataSourceState {
  latestEngineSelected: ConnectionName;
  connectionsMap: ReadonlyMap<ConnectionName, DataSourceConnection>;
}

function initialState(): DataSourceState {
  return {
    latestEngineSelected: DEFAULT_ENGINE,
    connectionsMap: new Map().set(DEFAULT_ENGINE, {
      name: DEFAULT_ENGINE,
      dialect: "duckdb",
      source: "duckdb",
      display_name: "DuckDB In-Memory",
      databases: [],
    }),
  };
}

const {
  reducer,
  createActions,
  valueAtom: dataSourceConnectionsAtom,
  useActions: useDataSourceActions,
} = createReducerAndAtoms(initialState, {
  addDataSourceConnection: (
    state: DataSourceState,
    opts: { connections: DataSourceConnection[] },
  ): DataSourceState => {
    if (opts.connections.length === 0) {
      return state;
    }

    const { latestEngineSelected, connectionsMap } = state;

    // update existing connections with latest values
    // add new ones if they don't exist
    // Backend will dedupe by connection name & keep the latest, so we use this as the key
    const newMap = new Map(connectionsMap);
    for (const conn of opts.connections) {
      newMap.set(conn.name, conn);
    }

    return {
      latestEngineSelected,
      connectionsMap: newMap,
    };
  },

  // Keep default engine and any connections that are used by variables
  filterDataSourcesFromVariables: (
    state: DataSourceState,
    variableNames: VariableName[],
  ) => {
    const { latestEngineSelected, connectionsMap } = state;
    const names = new Set(variableNames);
    const newMap = new Map(
      [...connectionsMap].filter(([name]) => {
        if (name === DEFAULT_ENGINE) {
          return true;
        }
        return names.has(name as unknown as VariableName);
      }),
    );
    return {
      // If the latest engine selected is not in the new map, use the default engine
      latestEngineSelected: newMap.has(latestEngineSelected)
        ? latestEngineSelected
        : DEFAULT_ENGINE,
      connectionsMap: newMap,
    };
  },

  clearDataSourceConnections: (): DataSourceState => ({
    latestEngineSelected: DEFAULT_ENGINE,
    connectionsMap: new Map(),
  }),

  removeDataSourceConnection: (
    state: DataSourceState,
    connectionName: ConnectionName,
  ): DataSourceState => {
    const { latestEngineSelected, connectionsMap } = state;

    const newMap = new Map(connectionsMap);
    newMap.delete(connectionName);
    return {
      latestEngineSelected: newMap.has(latestEngineSelected)
        ? latestEngineSelected
        : DEFAULT_ENGINE,
      connectionsMap: newMap,
    };
  },
});

export { dataSourceConnectionsAtom, useDataSourceActions };

export const dataConnectionsMapAtom = atom(
  (get) => get(dataSourceConnectionsAtom).connectionsMap,
);

export function setLatestEngineSelected(engine: ConnectionName) {
  const existing = store.get(dataSourceConnectionsAtom);
  // Don't update the map if the engine is not in the map
  if (existing.connectionsMap.has(engine)) {
    store.set(dataSourceConnectionsAtom, {
      ...existing,
      latestEngineSelected: engine,
    });
  }
}

export const exportedForTesting = {
  reducer,
  createActions,
  initialState,
};

// Hook to get & persist SQL table previews
// Acts as a cache
export const tablePreviewsAtom = atom<ReadonlyMap<string, SQLTablePreview>>(
  new Map<string, SQLTablePreview>(),
);

// If you need to get tables from all connections & local datasets, use this atom
// When a table name is used in multiple connections, we need to use a fully qualified name
// starting with schema_name.table_name or database_name.schema_name.table_name
export const allTablesAtom = atom((get) => {
  const datasets = store.get(datasetTablesAtom);
  const connections = get(dataSourceConnectionsAtom).connectionsMap;
  const tableNames = new Map<string, DataTable>();

  for (const dataset of datasets) {
    tableNames.set(dataset.name, dataset);
  }

  for (const conn of connections.values()) {
    for (const database of conn.databases) {
      for (const schema of database.schemas) {
        for (const table of schema.tables) {
          // TODO: We should only save default schema tables with just the table name
          let nameToSave = table.name;
          if (tableNames.has(nameToSave)) {
            nameToSave = `${schema.name}.${table.name}`;
            if (tableNames.has(nameToSave)) {
              nameToSave = `${database.name}.${schema.name}.${table.name}`;
            }
          }
          tableNames.set(nameToSave, table);
        }
      }
    }
  }

  return tableNames;
});
