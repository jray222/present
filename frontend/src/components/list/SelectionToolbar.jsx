import React from 'react';
import { Share2, X } from 'lucide-react';

export default function SelectionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onShareSelected,
  onExit,
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-xl">
      <div className="card p-3 shadow-lift bg-surface/95 backdrop-blur-md border-line flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-2 pl-2">
          <span className="w-2.5 h-2.5 rounded-full bg-tomato-500 animate-pulse" />
          <span className="font-extrabold text-sm text-ink">
            {selectedCount} of {totalCount} selected
          </span>
          <div className="hidden sm:flex items-center gap-1.5 ml-2 text-xs">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-tomato-600 font-bold hover:underline"
            >
              Select All
            </button>
            <span className="text-muted">•</span>
            <button
              type="button"
              onClick={onClear}
              className="text-muted font-bold hover:underline"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShareSelected}
            disabled={selectedCount === 0}
            className="btn-primary text-xs py-2 px-4 shadow-pop flex items-center gap-1.5 font-extrabold"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Selected ({selectedCount})</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="btn-icon w-8 h-8 text-muted hover:text-ink"
            title="Exit Selection Mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
