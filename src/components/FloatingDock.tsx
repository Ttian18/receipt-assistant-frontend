import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export type DockDestination = 'books' | 'add' | 'review' | 'settings';

interface FloatingDockProps {
  active: DockDestination;
  onNavigate: (dest: 'books' | 'review') => void;
  onAdd: () => void;
  onSettings: () => void;
}

/**
 * Bottom-floating pill dock per Variant B (Soft / Organic).
 * Three destinations: Books · Add · Review.
 *
 * Maps to the existing App.tsx `activeTab` state:
 *   Books   ← dashboard / transactions / batches
 *   Add     ← navigates to the full-screen Capture route
 *   Review  ← monthly / yearly
 */
export default function FloatingDock({ active, onNavigate, onAdd, onSettings }: FloatingDockProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-40',
        // Sit above the iOS home indicator on devices with safe-area-inset.
        'bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
        'flex items-center gap-1 p-1.5',
        'rounded-full bg-[var(--color-ink)] text-[color:rgba(250,246,236,0.7)]',
        'shadow-[0_12px_32px_-10px_rgba(45,37,32,0.4)]',
      )}
    >
      <DockButton
        label="Books"
        isActive={active === 'books'}
        onClick={() => onNavigate('books')}
      />
      <DockButton
        label="Add"
        isActive={active === 'add'}
        onClick={onAdd}
        emphasize
      />
      <DockButton
        label="Review"
        isActive={active === 'review'}
        onClick={() => onNavigate('review')}
      />
      <button
        type="button"
        onClick={onSettings}
        aria-current={active === 'settings' ? 'page' : undefined}
        aria-label="Settings"
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-200 ease-out',
          active === 'settings'
            ? 'bg-[var(--color-terracotta)] text-white'
            : 'text-[color:rgba(250,246,236,0.7)] hover:text-[color:rgba(250,246,236,1)]',
        )}
      >
        <SettingsIcon size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

interface DockButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  emphasize?: boolean;
}

function DockButton({ label, isActive, onClick, emphasize }: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium',
        'transition-colors duration-200 ease-out',
        isActive
          ? 'bg-[var(--color-terracotta)] text-white'
          : 'text-[color:rgba(250,246,236,0.7)] hover:text-[color:rgba(250,246,236,1)]',
        // Slight emphasis on the middle "Add" pill so it reads as the action.
        emphasize && !isActive && 'text-[color:rgba(250,246,236,0.9)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          isActive ? 'bg-white/70' : 'bg-current opacity-50',
        )}
      />
      {label}
    </button>
  );
}
