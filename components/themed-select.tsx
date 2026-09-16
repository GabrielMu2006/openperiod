"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ThemedOption = { value: string; label: string; hint?: string };
export type ThemedGroup = { label?: string; options: ThemedOption[] };

interface ThemedSelectProps {
  value: string;
  groups: ThemedGroup[];
  onChange: (value: string) => void;
  /** 可输入过滤（组合框模式）；缺省为纯下拉 */
  searchable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  emptyText?: string;
}

// 符合站点主题的下拉/组合框，替代系统原生 select。
// 键盘：↑↓ 移动、Enter 选中、Esc 关闭；可搜索模式输入即过滤。
export function ThemedSelect({
  value,
  groups,
  onChange,
  searchable = false,
  placeholder = "请选择",
  disabled = false,
  ariaLabel,
  emptyText = "没有匹配的选项",
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const shouldScrollRef = useRef(false);
  const listId = useId();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          !needle || option.label.toLowerCase().includes(needle) || (option.hint ?? "").toLowerCase().includes(needle)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((group) => group.options), [filtered]);
  const selected = flat.find((option) => option.value === value)
    ?? groups.flatMap((group) => group.options).find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  // 仅键盘导航时滚动定位，鼠标 hover 不滚动（避免面板在点击瞬间移动）
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function select(option: ThemedOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      shouldScrollRef.current = true;
      setActive((current) => Math.min(flat.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      shouldScrollRef.current = true;
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = flat[active];
      if (option) select(option);
    }
  }

  let renderIndex = -1;

  return (
    <div className={`tsel${open ? " open" : ""}`} ref={rootRef}>
      <input
        ref={inputRef}
        className="tsel-input"
        type="text"
        role="combobox"
        inputMode={searchable ? "text" : "none"}
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && flat[active] ? `${listId}-${flat[active].value}` : undefined}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        disabled={disabled}
        value={open && searchable ? query : selected?.label ?? ""}
        placeholder={selected ? undefined : placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <span className="tsel-chevron" aria-hidden="true">▾</span>
      {open && (
        <ul
          className="tsel-panel"
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          onPointerDown={(event) => {
            const target = (event.target as HTMLElement).closest("[data-value]");
            if (!target) return;
            event.preventDefault();
            const option = flat.find((item) => item.value === target.getAttribute("data-value"));
            if (option) select(option);
          }}
        >
          {flat.length === 0 && <li className="tsel-empty">{emptyText}</li>}
          {filtered.map((group, groupIndex) => (
            group.label
              ? [
                  <li className="tsel-group" key={`g-${group.label}`} aria-hidden="true">{group.label}</li>,
                  ...group.options.map((option) => {
                    renderIndex += 1;
                    const index = renderIndex;
                    return (
                      <li
                        key={option.value}
                        id={`${listId}-${option.value}`}
                        ref={index === active ? activeRef : undefined}
                        role="option"
                        aria-selected={option.value === value}
                        className={`tsel-option${index === active ? " active" : ""}${option.value === value ? " selected" : ""}`}
                        onPointerMove={() => setActive(index)}
                        data-value={option.value}
                      >
                        <span>{option.label}</span>
                        {option.value === value && <span className="tsel-check" aria-hidden="true">✓</span>}
                      </li>
                    );
                  }),
                ]
              : group.options.map((option) => {
                  renderIndex += 1;
                  const index = renderIndex;
                  return (
                    <li
                      key={option.value}
                      id={`${listId}-${option.value}`}
                      ref={index === active ? activeRef : undefined}
                      role="option"
                      aria-selected={option.value === value}
                      className={`tsel-option${index === active ? " active" : ""}${option.value === value ? " selected" : ""}`}
                      onPointerMove={() => setActive(index)}
                      data-value={option.value}
                    >
                      <span>{option.label}</span>
                      {option.value === value && <span className="tsel-check" aria-hidden="true">✓</span>}
                    </li>
                  );
                })
          ))}
        </ul>
      )}
    </div>
  );
}
