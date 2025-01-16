/* Copyright 2024 Marimo. All rights reserved. */
"use no memo";
// tanstack/table is not compatible with React compiler
// https://github.com/TanStack/table/issues/5567

import React, { memo, useRef } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  ColumnPinning,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  Row,
  Cell,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  Table,
  Table2,
  TableCell,
  TableContainer,
  TableRow,
} from "@/components/ui/table";
import type { DownloadActionProps } from "./download-actions";
import { cn } from "@/utils/cn";
import { FilterPills } from "./filter-pills";
import { useColumnPinning } from "./hooks/useColumnPinning";
import {
  renderTableHeader,
  renderTableBody,
  getPinningStyles,
} from "./renderers";
import { SearchBar } from "./SearchBar";
import { TableActions } from "./TableActions";
import { ColumnFormattingFeature } from "./column-formatting/feature";
import { ColumnWrappingFeature } from "./column-wrapping/feature";

interface DataTableProps<TData> extends Partial<DownloadActionProps> {
  wrapperClassName?: string;
  className?: string;
  columns: Array<ColumnDef<TData>>;
  data: TData[];
  // Sorting
  manualSorting?: boolean; // server-side sorting
  sorting?: SortingState; // controlled sorting
  setSorting?: OnChangeFn<SortingState>; // controlled sorting
  // Pagination
  totalRows: number | "too_many";
  totalColumns: number;
  pagination?: boolean;
  manualPagination?: boolean; // server-side pagination
  paginationState?: PaginationState; // controlled pagination
  setPaginationState?: OnChangeFn<PaginationState>; // controlled pagination
  // Selection
  selection?: "single" | "multi" | null;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  // Search
  enableSearch?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  showFilters?: boolean;
  filters?: ColumnFiltersState;
  onFiltersChange?: OnChangeFn<ColumnFiltersState>;
  reloading?: boolean;
  // Columns
  freezeColumnsLeft?: string[];
  freezeColumnsRight?: string[];
}

const DataTableInternal = <TData,>({
  wrapperClassName,
  className,
  columns,
  data,
  selection,
  totalColumns,
  totalRows,
  manualSorting = false,
  sorting,
  setSorting,
  rowSelection,
  paginationState,
  setPaginationState,
  downloadAs,
  manualPagination = false,
  pagination = false,
  onRowSelectionChange,
  enableSearch = false,
  searchQuery,
  onSearchQueryChange,
  showFilters = false,
  filters,
  onFiltersChange,
  reloading,
  freezeColumnsLeft,
  freezeColumnsRight,
}: DataTableProps<TData>) => {
  const [isSearchEnabled, setIsSearchEnabled] = React.useState<boolean>(false);

  const { columnPinning, setColumnPinning } = useColumnPinning(
    freezeColumnsLeft,
    freezeColumnsRight,
  );

  const table = useReactTable<TData>({
    _features: [ColumnPinning, ColumnWrappingFeature, ColumnFormattingFeature],
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // pagination
    rowCount: totalRows === "too_many" ? undefined : totalRows,
    ...(setPaginationState
      ? {
          onPaginationChange: setPaginationState,
          getRowId: (_row, idx) => {
            if (!paginationState) {
              return String(idx);
            }
            // Add offset if manualPagination is enabled
            const offset = manualPagination
              ? paginationState.pageIndex * paginationState.pageSize
              : 0;
            return String(idx + offset);
          },
        }
      : {}),
    manualPagination: manualPagination,
    getPaginationRowModel: getPaginationRowModel(),
    // sorting
    ...(setSorting ? { onSortingChange: setSorting } : {}),
    manualSorting: manualSorting,
    getSortedRowModel: getSortedRowModel(),
    // filtering
    manualFiltering: true,
    enableColumnFilters: showFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: onFiltersChange,
    // selection
    onRowSelectionChange: onRowSelectionChange,
    state: {
      ...(sorting ? { sorting } : {}),
      columnFilters: filters,
      ...// Controlled state
      (paginationState
        ? { pagination: paginationState }
        : // Uncontrolled state
          pagination && !paginationState
          ? {}
          : // No pagination, show all rows
            { pagination: { pageIndex: 0, pageSize: data.length } }),
      rowSelection,
      columnPinning: columnPinning,
    },
    onColumnPinningChange: setColumnPinning,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 33, //estimate row height for accurate scrollbar dragging
    getScrollElement: () => tableContainerRef.current,
    //measure dynamic row height, except in firefox because it measures table border height incorrectly
    measureElement:
      typeof window !== "undefined" &&
      navigator.userAgent.indexOf("Firefox") === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 5,
  });

  const renderCells = (row: Row<TData>, cells: Array<Cell<TData, unknown>>) => {
    return cells.map((cell) => {
      const { className, style } = getPinningStyles(cell.column);
      return (
        <TableCell
          key={cell.id}
          className={cn(
            "whitespace-pre truncate max-w-[300px]",
            cell.column.getColumnWrapping &&
              cell.column.getColumnWrapping() === "wrap" &&
              "whitespace-pre-wrap min-w-[200px]",
            className,
          )}
          style={style}
          title={String(cell.getValue())}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      );
    });
  };

  return (
    <div className={cn(wrapperClassName, "flex flex-col space-y-1")}>
      <FilterPills filters={filters} table={table} />
      <div className={cn(className || "rounded-md border overflow-hidden")}>
        {onSearchQueryChange && enableSearch && (
          <SearchBar
            value={searchQuery || ""}
            onHide={() => setIsSearchEnabled(false)}
            handleSearch={onSearchQueryChange}
            hidden={!isSearchEnabled}
            reloading={reloading}
          />
        )}
        {/* <Table>
          {renderTableHeader(table)}
          {renderTableBody(table, columns)}
        </Table> */}

        <TableContainer
          ref={tableContainerRef}
          className="overflow-auto relative h-[400px]"
        >
          <Table2 className="grid">
            {renderTableHeader(table)}
            <tbody
              style={{
                display: "grid",
                height: `${rowVirtualizer.getTotalSize()}px`, //tells scrollbar how big the table is
                position: "relative", //needed for absolute positioning of rows
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index] as Row;
                return (
                  <TableRow
                    className="flex absolute"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => {
                      if (table.getIsSomeRowsSelected()) {
                        row.toggleSelected();
                      }
                    }}
                  >
                    {renderCells(row, row.getLeftVisibleCells())}
                    {renderCells(row, row.getCenterVisibleCells())}
                    {renderCells(row, row.getRightVisibleCells())}
                  </TableRow>
                );
              })}
            </tbody>
          </Table2>
        </TableContainer>

        {/* <div
          ref={tableContainerRef}
          className="overflow-auto relative h-[400px]"
        >
          <table className="grid">
            {renderTableHeader(table)}
            <tbody
              style={{
                display: "grid",
                height: `${rowVirtualizer.getTotalSize()}px`, //tells scrollbar how big the table is
                position: "relative", //needed for absolute positioning of rows
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index] as Row;
                return (
                  <TableRow
                    className="flex absolute"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => {
                      if (table.getIsSomeRowsSelected()) {
                        row.toggleSelected();
                      }
                    }}
                  >
                    {renderCells(row, row.getLeftVisibleCells())}
                    {renderCells(row, row.getCenterVisibleCells())}
                    {renderCells(row, row.getRightVisibleCells())}
                  </TableRow>
                );
              })}
            </tbody>
          </table>
        </div> */}
      </div>
      <TableActions
        enableSearch={enableSearch}
        totalColumns={totalColumns}
        onSearchQueryChange={onSearchQueryChange}
        isSearchEnabled={isSearchEnabled}
        setIsSearchEnabled={setIsSearchEnabled}
        pagination={pagination}
        selection={selection}
        onRowSelectionChange={onRowSelectionChange}
        table={table}
        downloadAs={downloadAs}
      />
    </div>
  );
};

export const DataTable = memo(DataTableInternal) as typeof DataTableInternal;
