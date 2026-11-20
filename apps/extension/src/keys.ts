/**
 * The learner's shortcut keys. A key is stored as its physical code plus
 * modifiers ("Alt+KeyH", "Digit1"), so a layout or macOS's Alt characters
 * (Alt+H types "˙") never change what it does.
 */

export type KeyAction = 'play' | 'back' | 'forward' | 'prev' | 'next' | 'loop' | 'hint' | 'answer';

export const KEY_ACTIONS: { action: KeyAction; label: string }[] = [
  { action: 'play', label: 'Play / pause' },
  { action: 'back', label: 'Back 2 s' },
  { action: 'forward', label: 'Forward 2 s' },
  { action: 'prev', label: 'Previous line' },
  { action: 'next', label: 'Next line' },
  { action: 'loop', label: 'Loop the line' },
  { action: 'hint', label: 'Hint' },
  { action: 'answer', label: 'Show answer' },
];

export type KeyMap = Record<KeyAction, string>;

export const DEFAULT_KEYS: KeyMap = {
  play: 'Digit1',
  back: 'Digit2',
  forward: 'Digit3',
  prev: 'Alt+ArrowLeft',
  next: 'Alt+ArrowRight',
  loop: 'Alt+KeyL',
  hint: 'Alt+KeyH',
  answer: 'Alt+KeyA',
};

const PREF = 'mdKeys';
let current: KeyMap = { ...DEFAULT_KEYS };
const listeners = new Set<(keys: KeyMap) => void>();

export function keys(): KeyMap {
  return current;
}

export async function loadKeys(): Promise<KeyMap> {
  try {
    const saved = (await chrome.storage.local.get(PREF))[PREF] as Partial<KeyMap> | undefined;
    current = { ...DEFAULT_KEYS, ...(saved ?? {}) };
  } catch {
    current = { ...DEFAULT_KEYS };
  }
  listeners.forEach((f) => f(current));
  return current;
}

export function saveKeys(next: KeyMap): void {
  current = { ...next };
  listeners.forEach((f) => f(current));
  try {
    void chrome.storage.local.set({ [PREF]: current });
  } catch {
    /* extension reloaded under the page: kept for this page only */
  }
}

export function onKeysChange(f: (keys: KeyMap) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;

/** "Ctrl+Alt+KeyH" for a key press, or null while only modifiers are down. */
export function comboOf(e: KeyboardEvent): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mods, e.code].join('+');
}

export function actionFor(e: KeyboardEvent): KeyAction | null {
  const combo = comboOf(e);
  if (!combo) return null;
  for (const { action } of KEY_ACTIONS) if (current[action] === combo) return action;
  return null;
}

/**
 * Ctrl/⌘ plus a key that is bound bare (1, 2, 3 by default) types that key,
 * so a digit can still be written in an answer.
 */
export function isTypeThrough(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.length !== 1) return false;
  return Object.values(current).includes(e.code);
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter',
    Escape: 'Esc', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  };
  return named[code] ?? code;
}

/** Key caps for display: ["⌥", "H"] on a Mac, ["Alt", "H"] elsewhere. */
export function keyCaps(combo: string): string[] {
  return combo.split('+').map((part) => {
    if (part === 'Ctrl') return IS_MAC ? '⌃' : 'Ctrl';
    if (part === 'Alt') return IS_MAC ? '⌥' : 'Alt';
    if (part === 'Shift') return IS_MAC ? '⇧' : 'Shift';
    if (part === 'Meta') return IS_MAC ? '⌘' : 'Win';
    return keyName(part);
  });
}

/** Keys typing or moving through the blanks needs; they stay fixed. */
const RESERVED = new Set(['Enter', 'Space', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** Why a key can't be used for an action, or null when it can. */
export function refuse(combo: string, action: KeyAction, map: KeyMap): string | null {
  const parts = combo.split('+');
  const code = parts[parts.length - 1];
  const bare = parts.length === 1 || (parts.length === 2 && parts[0] === 'Shift');
  if (bare && RESERVED.has(code)) return `${keyCaps(combo).join('+')} is needed for typing. Add ${IS_MAC ? '⌥' : 'Alt'} or ${IS_MAC ? '⌃' : 'Ctrl'}.`;
  if (bare && /^Key[A-Z]$/.test(code)) return `A letter on its own would stop you typing it. Add ${IS_MAC ? '⌥' : 'Alt'} or ${IS_MAC ? '⌃' : 'Ctrl'}.`;
  if (parts.includes('Meta') || (parts.includes('Ctrl') && /^Key[ACVXZ]$/.test(code))) return 'The browser or system already uses that key.';
  const taken = KEY_ACTIONS.find((a) => a.action !== action && map[a.action] === combo);
  if (taken) return `Already used for ${taken.label.toLowerCase()}.`;
  return null;
}
