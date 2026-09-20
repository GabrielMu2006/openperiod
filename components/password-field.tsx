"use client";

import { useState } from "react";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/src/domain/auth";

export function PasswordField({ id, label, newPassword = false, disabled = false }: {
  id: string; label: string; newPassword?: boolean; disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input id={id} name={id} type={visible ? "text" : "password"} required disabled={disabled}
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? PASSWORD_MIN_LENGTH : 1} maxLength={PASSWORD_MAX_LENGTH}
          aria-describedby={newPassword ? `${id}-hint` : undefined} />
        <button type="button" className="link-button" aria-label={`${visible ? "隐藏" : "显示"}${label}`}
          aria-pressed={visible} disabled={disabled} onClick={() => setVisible(!visible)}>{visible ? "隐藏" : "显示"}</button>
      </div>
      {newPassword && <small id={`${id}-hint`} className="password-hint">6–128 个字符，无需固定字符组合。</small>}
    </div>
  );
}
