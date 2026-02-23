// Пример использования CollapsibleSection в ProfilePage

import CollapsibleSection, { useCollapsibleSections } from './CollapsibleSection'

export default function ExamplePage() {
  const { isExpanded, toggle, expandAll, collapseAll } = useCollapsibleSections({
    personal: true,
    statistics: true,
    settings: false,
  })

  return (
    <div style={{ display: 'grid', gap: 16, padding: 16 }}>
      {/* Управление всеми секциями */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={expandAll}>Развернуть все</button>
        <button onClick={collapseAll}>Свернуть все</button>
      </div>

      {/* Секция с вариантом "card" */}
      <CollapsibleSection
        title="Личная информация"
        icon="👤"
        variant="card"
        defaultExpanded={isExpanded('personal')}
        onToggle={() => toggle('personal')}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label>Email</label>
            <input type="email" />
          </div>
          <div>
            <label>Имя</label>
            <input type="text" />
          </div>
        </div>
      </CollapsibleSection>

      {/* Секция с действиями в заголовке */}
      <CollapsibleSection
        title="Статистика"
        icon="📊"
        variant="card"
        defaultExpanded={isExpanded('statistics')}
        onToggle={() => toggle('statistics')}
        headerActions={
          <>
            <button style={{ fontSize: 12, padding: '4px 8px' }}>
              Обновить
            </button>
            <button style={{ fontSize: 12, padding: '4px 8px' }}>
              Экспорт
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>Всего ботов: 10</div>
          <div>Активных: 5</div>
          <div>PnL: +$1,234</div>
        </div>
      </CollapsibleSection>

      {/* Минималистичная секция */}
      <CollapsibleSection
        title="Настройки"
        icon="⚙️"
        variant="minimal"
        defaultExpanded={isExpanded('settings')}
        onToggle={() => toggle('settings')}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            <input type="checkbox" /> Получать уведомления
          </label>
          <label>
            <input type="checkbox" /> Темная тема
          </label>
        </div>
      </CollapsibleSection>
    </div>
  )
}
