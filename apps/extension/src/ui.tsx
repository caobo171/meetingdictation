/**
 * The panel's form controls, as Radix primitives rendered into its shadow DOM.
 * The panel itself stays plain DOM; each control is a small React root mounted
 * into a slot, re-rendered with new props through the handle it returns.
 * Menus portal into the panel's own wrapper, so the panel's styles reach them.
 */

import * as Checkbox from '@radix-ui/react-checkbox';
import * as Select from '@radix-ui/react-select';
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { KEY_ACTIONS, comboOf, keyCaps, refuse, DEFAULT_KEYS, type KeyAction, type KeyMap } from './keys';

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="m2 3.8 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ------------------------------------------------------------ select

export interface SelectProps {
  options: { value: string; label: string }[];
  value: string;
  title: string;
  onChange(value: string): void;
}

function PanelSelect({ options, value, title, onChange, portal }: SelectProps & { portal: HTMLElement }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className="sel" aria-label={title} title={title}>
        <Select.Value />
        <Select.Icon className="sel-icon">
          <Chevron />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal container={portal}>
        <Select.Content className="sel-menu" position="popper" side="bottom" align="start" sideOffset={4}>
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className="sel-item">
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator className="sel-tick">
                  <Check />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function mountSelect(slot: HTMLElement, portal: HTMLElement, props: SelectProps): { set(value: string): void; get(): string } {
  const root = createRoot(slot);
  let current = props;
  const draw = () => root.render(<PanelSelect {...current} portal={portal} onChange={change} />);
  const change = (value: string) => {
    current = { ...current, value };
    draw();
    props.onChange(value);
  };
  draw();
  return {
    set(value) {
      current = { ...current, value };
      draw();
    },
    get: () => current.value,
  };
}

// ------------------------------------------------------------ checkbox

export interface CheckProps {
  label: string;
  checked: boolean;
  title?: string;
  onChange(checked: boolean): void;
}

export function mountCheckbox(slot: HTMLElement, props: CheckProps): { set(checked: boolean): void; get(): boolean } {
  const root = createRoot(slot);
  let current = props;
  const id = `md-check-${Math.random().toString(36).slice(2, 8)}`;
  const change = (checked: boolean) => {
    current = { ...current, checked };
    draw();
    props.onChange(checked);
  };
  const draw = () =>
    root.render(
      <span className="check" title={current.title}>
        <Checkbox.Root id={id} className="check-box" checked={current.checked} onCheckedChange={(v) => change(v === true)}>
          <Checkbox.Indicator className="check-tick">
            <Check />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <label htmlFor={id}>{current.label}</label>
      </span>,
    );
  draw();
  return {
    set(checked) {
      current = { ...current, checked };
      draw();
    },
    get: () => current.checked,
  };
}

// ------------------------------------------------------------ settings

function Caps({ combo }: { combo: string }) {
  const caps = keyCaps(combo);
  return (
    <>
      {caps.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="plus">+</span>}
          <kbd>{c}</kbd>
        </span>
      ))}
    </>
  );
}

function Settings({ keys, onSave, onClose }: { keys: KeyMap; onSave(map: KeyMap): void; onClose(): void }) {
  const [listening, setListening] = useState<KeyAction | null>(null);
  const [error, setError] = useState<{ action: KeyAction; text: string } | null>(null);

  const capture = (action: KeyAction) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (listening !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setListening(null);
      setError(null);
      return;
    }
    const combo = comboOf(e.nativeEvent);
    if (!combo) return; // only a modifier so far
    const why = refuse(combo, action, keys);
    if (why) {
      setError({ action, text: why });
      return;
    }
    setError(null);
    setListening(null);
    onSave({ ...keys, [action]: combo });
  };

  const isDefault = KEY_ACTIONS.every(({ action }) => keys[action] === DEFAULT_KEYS[action]);

  return (
    <div className="settings">
      <div className="settings-head">
        <strong>Shortcut keys</strong>
        <button className="b" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="settings-note">Click a key, then press the new one. Esc cancels.</p>
      <div className="keylist">
        {KEY_ACTIONS.map(({ action, label }) => (
          <div className="keyrow" key={action}>
            <span>{label}</span>
            <button
              className={`keybtn${listening === action ? ' listening' : ''}`}
              onClick={() => {
                setError(null);
                setListening(listening === action ? null : action);
              }}
              onKeyDown={capture(action)}
              onBlur={() => listening === action && setListening(null)}
            >
              {listening === action ? 'Press a key…' : <Caps combo={keys[action]} />}
            </button>
            {error?.action === action && <span className="keyerr">{error.text}</span>}
          </div>
        ))}
        <div className="keyrow fixed">
          <span>Check, then next line</span>
          <span className="keyfixed">
            <kbd>Enter</kbd>
          </span>
        </div>
        <div className="keyrow fixed">
          <span>Next word</span>
          <span className="keyfixed">
            <kbd>Space</kbd>
          </span>
        </div>
      </div>
      <button className="b" disabled={isDefault} onClick={() => onSave({ ...DEFAULT_KEYS })}>
        Reset to defaults
      </button>
    </div>
  );
}

export function mountSettings(slot: HTMLElement, props: { keys: KeyMap; onSave(map: KeyMap): void; onClose(): void }): { set(keys: KeyMap): void } {
  const root = createRoot(slot);
  let current = props;
  const draw = () => root.render(<Settings {...current} />);
  draw();
  return {
    set(keys) {
      current = { ...current, keys };
      draw();
    },
  };
}
