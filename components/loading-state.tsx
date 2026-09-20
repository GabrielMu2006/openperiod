interface LoadingStateProps {
  label: string;
  compact?: boolean;
}

/**
 * 统一的数据加载反馈：只让一条进度轨迹运动，下面的骨架保持静止，
 * 避免表格或卡片中的许多元素各自闪烁。
 */
export function LoadingState({ label, compact = false }: LoadingStateProps) {
  return (
    <div className={`loading-state${compact ? " compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <span className="loading-state-label">{label}</span>
      <span className="loading-track" aria-hidden="true"><i /></span>
      <span className="loading-skeleton" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
