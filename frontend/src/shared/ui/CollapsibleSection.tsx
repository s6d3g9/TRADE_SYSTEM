import { useState, ReactNode } from 'react'
import {
  BORDER_RADIUS,
  BORDER_WIDTH,
  SPACING,
  PADDING,
  TRANSITION,
  FONT_SIZE,
} from '../styles/designSystem'

interface CollapsibleSectionProps {
  title: string
  icon?: string
  defaultExpanded?: boolean
  children: ReactNode
  headerActions?: ReactNode
  variant?: 'default' | 'card' | 'minimal'
  onToggle?: (expanded: boolean) => void
}

export default function CollapsibleSection({
  title,
  icon,
  defaultExpanded = true,
  children,
  headerActions,
  variant = 'default',
  onToggle,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const handleToggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    onToggle?.(newExpanded)
  }

  const getContainerStyle = () => {
    switch (variant) {
      case 'card':
        return {
          background: 'var(--surface)',
          border: `${BORDER_WIDTH.thin} solid var(--border)`,
          borderRadius: BORDER_RADIUS.md,
          overflow: 'hidden',
        }
      case 'minimal':
        return {
          borderBottom: `${BORDER_WIDTH.thin} solid var(--border)`,
        }
      default:
        return {
          background: 'var(--surface)',
          borderRadius: BORDER_RADIUS.md,
          border: `${BORDER_WIDTH.thin} solid var(--border)`,
        }
    }
  }

  const getHeaderStyle = () => {
    const base = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: variant === 'minimal' ? PADDING.section : PADDING.section,
      cursor: 'pointer',
      userSelect: 'none' as const,
      transition: `background ${TRANSITION.fast}`,
    }

    if (variant !== 'minimal') {
      return {
        ...base,
        ':hover': {
          background: 'var(--bg)',
        },
      }
    }

    return base
  }

  return (
    <div style={getContainerStyle()}>
      {/* Header */}
      <div
        onClick={handleToggle}
        style={getHeaderStyle()}
        onMouseEnter={(e) => {
          if (variant !== 'minimal') {
            e.currentTarget.style.background = 'var(--bg)'
          }
        }}
        onMouseLeave={(e) => {
          if (variant !== 'minimal') {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, flex: 1 }}>
          {/* Expand/Collapse Icon */}
          <span
            style={{
              fontSize: FONT_SIZE.lg,
              color: 'var(--text-secondary)',
              transition: `transform ${TRANSITION.normal}`,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          >
            ▶
          </span>

          {/* Section Icon */}
          {icon && (
            <span style={{ fontSize: FONT_SIZE.xxl }}>
              {icon}
            </span>
          )}

          {/* Title */}
          <h3
            style={{
              fontSize: variant === 'minimal' ? FONT_SIZE.lg : FONT_SIZE.xl,
              fontWeight: 600,
              margin: 0,
              color: 'var(--text)',
            }}
          >
            {title}
          </h3>
        </div>

        {/* Header Actions */}
        {headerActions && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {headerActions}
          </div>
        )}
      </div>

      {/* Content */}
      {expanded && (
        <div
          style={{
            padding: variant === 'minimal' ? '0 0 12px 26px' : '0 16px 16px 16px',
            animation: 'slideDown 200ms ease-out',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// Helper hook for managing multiple sections
export function useCollapsibleSections(initialState: Record<string, boolean> = {}) {
  const [sections, setSections] = useState<Record<string, boolean>>(initialState)

  const toggle = (key: string) => {
    setSections(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const expandAll = () => {
    setSections(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(key => {
        updated[key] = true
      })
      return updated
    })
  }

  const collapseAll = () => {
    setSections(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(key => {
        updated[key] = false
      })
      return updated
    })
  }

  return {
    sections,
    toggle,
    expandAll,
    collapseAll,
    isExpanded: (key: string) => sections[key] ?? true,
  }
}
