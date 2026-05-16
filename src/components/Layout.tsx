import React from 'react';
import FloatingDock, { type DockDestination } from './FloatingDock';

interface LayoutProps {
  children: React.ReactNode;
  dockActive: DockDestination;
  onDockNavigate: (dest: 'books' | 'review') => void;
  onAddTransaction: () => void;
  onSettings: () => void;
  /** When true the floating dock is omitted — full-bleed surfaces like
   *  the Capture route own the whole viewport. */
  dockHidden?: boolean;
}

/**
 * Variant B (Soft / Organic) app shell.
 *
 * Mobile-first: a single centered column on a cream paper background, with a
 * floating ink-dark dock at the bottom. On larger viewports the column widens
 * but the dock geometry stays the same — desktop is the scaled-up version of
 * mobile (DESIGN.md §4.4).
 */
export default function Layout({
  children,
  dockActive,
  onDockNavigate,
  onAddTransaction,
  onSettings,
  dockHidden = false,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <main
        className={[
          'mx-auto w-full max-w-[480px] sm:max-w-[640px] lg:max-w-[960px] xl:max-w-[1100px]',
          'px-4 sm:px-6 lg:px-10',
          'pt-4 sm:pt-6 lg:pt-10',
          dockHidden
            ? 'pb-[env(safe-area-inset-bottom,0px)]'
            : 'pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]',
        ].join(' ')}
      >
        {children}
      </main>

      {!dockHidden && (
        <FloatingDock
          active={dockActive}
          onNavigate={onDockNavigate}
          onAdd={onAddTransaction}
          onSettings={onSettings}
        />
      )}
    </div>
  );
}
