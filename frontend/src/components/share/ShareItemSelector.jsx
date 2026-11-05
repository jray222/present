import React from 'react';
import { CheckSquare, Square } from 'lucide-react';

export default function ShareItemSelector({
  shareMode,
  setShareMode,
  allItems,
  selectedIds,
  setSelectedIds,
  selectAll,
  deselectAll,
  toggleItemSelection,
}) {
  return (
    <div className="space-y-3">
      {/* Mode Switcher: Full Wishlist vs. Selected Items */}
      <div className="flex items-center gap-1 p-1 bg-sunk rounded-2xl border border-line">
        <button
          type="button"
          onClick={() => setShareMode('all')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold transition ${
            shareMode === 'all'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          Full List ({allItems.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setShareMode('selected');
            if (selectedIds.length === 0 && allItems.length > 0) {
              setSelectedIds([allItems[0].id]);
            }
          }}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
            shareMode === 'selected'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span>Selected Items</span>
          <span className="px-1.5 py-0.5 rounded-full bg-tomato-100 text-tomato-800 text-[10px]">
            {selectedIds.length}
          </span>
        </button>
      </div>

      {/* Item Checklist when "Selected Items" is active */}
      {shareMode === 'selected' && (
        <div className="card p-3 bg-surface border-line space-y-2 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-line">
            <span className="font-bold text-muted">
              Choose gifts to share ({selectedIds.length} selected):
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-tomato-600 font-bold hover:underline"
              >
                Select All
              </button>
              <span className="text-muted">•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-muted font-bold hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {allItems.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItemSelection(item.id)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition ${
                  checked ? 'bg-tomato-50 dark:bg-tomato-950/30' : 'hover:bg-sunk/50'
                }`}
              >
                {checked ? (
                  <CheckSquare className="w-4 h-4 text-tomato-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-muted shrink-0" />
                )}
                <span className="text-xs font-bold text-ink truncate flex-1">
                  {item.title}
                </span>
                {item.price && (
                  <span className="text-xs font-mono font-bold text-pine-700 shrink-0">
                    ${Number(item.price).toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
