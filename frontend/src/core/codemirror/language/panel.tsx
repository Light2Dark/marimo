/* Copyright 2024 Marimo. All rights reserved. */
import type { EditorView } from "@codemirror/view";
import { languageAdapterState } from "./extension";
import { SQLLanguageAdapter } from "./sql";
import { normalizeName } from "@/core/cells/names";
import { useAutoGrowInputProps } from "@/hooks/useAutoGrowInputProps";
import { getFeatureFlag } from "@/core/config/feature-flag";
import {
  type ConnectionName,
  dataConnectionsMapAtom,
} from "@/core/cells/data-source-connections";
import { useAtomValue } from "jotai";
import { AlertCircle, CircleHelpIcon } from "lucide-react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatabaseLogo } from "@/components/databases/icon";
import { transformDisplayName } from "@/components/databases/display";

export const LanguagePanelComponent: React.FC<{
  view: EditorView;
}> = ({ view }) => {
  const languageAdapter = view.state.field(languageAdapterState);
  const { spanProps, inputProps } = useAutoGrowInputProps({ minWidth: 50 });

  let actions: React.ReactNode = <div />;
  let showDivider = false;

  // Send noop update code event, which will trigger an update to the new output variable name
  const triggerUpdate = () => {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: view.state.doc.toString(),
      },
    });
  };

  if (languageAdapter instanceof SQLLanguageAdapter) {
    showDivider = true;
    actions = (
      <div className="flex flex-1 gap-2 relative items-center">
        <label className="flex gap-2 items-center">
          <span className="select-none">Output variable: </span>
          <input
            {...inputProps}
            defaultValue={languageAdapter.dataframeName}
            onChange={(e) => {
              languageAdapter.setDataframeName(e.target.value);
              inputProps.onChange?.(e);
            }}
            onBlur={(e) => {
              // Normalize the name to a valid variable name
              const name = normalizeName(e.target.value, false);
              languageAdapter.setDataframeName(name);
              e.target.value = name;

              triggerUpdate();
            }}
            className="min-w-14 w-auto border border-border rounded px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span {...spanProps} />
        </label>
        {getFeatureFlag("sql_engines") && (
          <SQLEngineSelect
            languageAdapter={languageAdapter}
            onChange={triggerUpdate}
          />
        )}
        <label className="flex items-center gap-2 ml-auto">
          <input
            type="checkbox"
            onChange={(e) => {
              languageAdapter.setShowOutput(!e.target.checked);
              triggerUpdate();
            }}
            checked={!languageAdapter.showOutput}
          />
          <span className="select-none">Hide output</span>
        </label>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center gap-4 pl-2 pt-2">
      {actions}
      {showDivider && <div className="h-4 border-r border-border" />}
      {languageAdapter.type}
    </div>
  );
};

interface SelectProps {
  languageAdapter: SQLLanguageAdapter;
  onChange: (engine: ConnectionName) => void;
}

const SQLEngineSelect: React.FC<SelectProps> = ({
  languageAdapter,
  onChange,
}) => {
  const connectionsMap = useAtomValue(dataConnectionsMapAtom);

  // use local state as languageAdapter.engine may not trigger change
  // and we want to display the selected engine if it's disconnected
  const [selectedEngine, setSelectedEngine] = useState(
    connectionsMap.get(languageAdapter.engine),
  );

  const engineIsDisconnected =
    selectedEngine && connectionsMap.get(selectedEngine.name) === undefined;

  const handleSelectEngine = (value: string) => {
    const nextEngine = connectionsMap.get(value as ConnectionName);
    if (nextEngine) {
      languageAdapter.selectEngine(nextEngine.name);
      setSelectedEngine(nextEngine);
      onChange(nextEngine.name);
    }
  };

  return (
    <div className="flex flex-row gap-1 items-center">
      <Select value={selectedEngine?.name} onValueChange={handleSelectEngine}>
        <SelectTrigger className="text-xs border-border !shadow-none !ring-0">
          <SelectValue placeholder="Select an engine" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Database connections</SelectLabel>
            {engineIsDisconnected && (
              <SelectItem key={selectedEngine.name} value={selectedEngine.name}>
                <div className="flex items-center gap-1 opacity-50">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="truncate">
                    {transformDisplayName(selectedEngine.display_name)}
                  </span>
                </div>
              </SelectItem>
            )}
            {[...connectionsMap.entries()].map(([key, value]) => (
              <SelectItem key={key} value={value.name}>
                <div className="flex items-center gap-1">
                  <DatabaseLogo className="h-3.5 w-3.5" name={value.source} />
                  <span className="truncate">
                    {transformDisplayName(value.display_name)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip content="How to add a database connection" delayDuration={200}>
          <a
            href="http://docs.marimo.io/guides/working_with_data/sql/#connecting-to-a-custom-database"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelpIcon
              size={13}
              className="text-[var(--sky-11)] opacity-60 hover:opacity-100"
            />
          </a>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
