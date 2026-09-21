"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";

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
  /** 搜索无结果时展示在空态下方的自定义操作（如「选其他学校」「去反馈」） */
  emptyFooter?: ReactNode;
  /** 挂在根元素上，供外层控制宽度 */
  className?: string;
}

const PANEL_MAX = 302;
/** 下方可用空间小于该值且上方更宽裕时，面板向上展开（避免被手机键盘/视口底部裁掉） */
const FLIP_THRESHOLD = 240;

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
  emptyFooter,
  className,
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [flip, setFlip] = useState(false);
  const [panelMax, setPanelMax] = useState(PANEL_MAX);
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

  // 面板默认向下展开；触发器贴近视口底部（手机键盘弹起时常见）且上方更宽裕时改为向上。
  function updatePlacement() {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldFlip = spaceBelow < FLIP_THRESHOLD && spaceAbove > spaceBelow;
    setFlip(shouldFlip);
    setPanelMax(Math.max(140, Math.min(PANEL_MAX, (shouldFlip ? spaceAbove : spaceBelow) - 14)));
  }

  useEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // 打开或重新过滤时：高亮定位到已选项（无则第一项）；仅在「打开且未输入筛选」时滚动定位，
  // 避免输入过程中面板随高亮乱跳。
  useEffect(() => {
    const index = flat.findIndex((option) => option.value === value);
    shouldScrollRef.current = open && !query && index > 3;
    setActive(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  // 仅键盘导航或打开定位时滚动，鼠标 hover 不滚动（避免面板在点击瞬间移动）
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
    <div className={`tsel${className ? ` ${className}` : ""}${open ? " open" : ""}`} ref={rootRef}>
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
        placeholder={open && searchable ? placeholder : selected ? undefined : placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <span className="tsel-chevron" aria-hidden="true"><CaretDown className="ui-icon" weight="bold" /></span>
      {open && (
        <ul
          className={`tsel-panel${flip ? " flip" : ""}`}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{ maxHeight: panelMax }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            // 空态操作按钮交给原生 click（这里若卸载面板会吞掉 click），冒泡到面板 onClick 再收起
            if (target.closest(".tsel-empty-footer")) return;
            const optionTarget = target.closest("[data-value]");
            if (!optionTarget) return;
            event.preventDefault();
            const option = flat.find((item) => item.value === optionTarget.getAttribute("data-value"));
            if (option) select(option);
          }}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest(".tsel-empty-footer")) {
              setOpen(false);
              setQuery("");
            }
          }}
        >
          {flat.length === 0 && (
            <>
              <li className="tsel-empty">{emptyText}</li>
              {emptyFooter && <li className="tsel-empty-footer">{emptyFooter}</li>}
            </>
          )}
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
                        {option.value === value && <span className="tsel-check" aria-hidden="true"><Check className="ui-icon" weight="bold" /></span>}
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
                      {option.value === value && <span className="tsel-check" aria-hidden="true"><Check className="ui-icon" weight="bold" /></span>}
                    </li>
                  );
                })
          ))}
        </ul>
      )}
    </div>
  );
}
