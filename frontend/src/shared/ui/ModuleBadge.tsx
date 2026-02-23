import React from 'react'
import {
  BORDER_RADIUS,
  BORDER_WIDTH,
  FONT_SIZE,
  FONT_WEIGHT,
  GAP,
  MODULE_COLORS,
  PADDING,
  TRANSITION,
} from '../styles/designSystem'

type ModuleBadgeProps = {
  text: string
  icon?: string
  color?: string
  title?: string
}

export default function ModuleBadge({
  text,
  icon,
  color = MODULE_COLORS.strategy,
  title,
}: ModuleBadgeProps) {
  const tooltip = title ?? text

  return (
    <div
      title={tooltip}
      aria-label={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: GAP.xs,
        padding: PADDING.badge,
        borderRadius: BORDER_RADIUS.sm,
        border: `${BORDER_WIDTH.medium} solid ${color}`,
        background: color + '08',
        fontSize: FONT_SIZE.sm,
        fontWeight: FONT_WEIGHT.medium,
        color: 'var(--text)',
        boxShadow: `0 0 0 1px ${color}15`,
        transition: `all ${TRANSITION.fast}`,
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      {icon && <span style={{ fontSize: FONT_SIZE.md, flexShrink: 0 }}>{icon}</span>}
      <span
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {text}
      </span>
    </div>
  )
}
