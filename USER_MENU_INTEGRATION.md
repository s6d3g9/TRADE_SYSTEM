# User Menu & Authentication Integration

## ✅ Реализовано

### 1. **UserMenu Component** (`/frontend/src/shared/ui/UserMenu.tsx`)
- Dropdown меню с аватаром пользователя
- Автоматическое получение инициалов из имени или email
- Отображение статуса верификации email
- Пункты меню: Profile, Dashboard, My Bots, Settings
- Кнопка Sign Out с автоматическим выходом
- Sign In кнопка для неавторизованных пользователей

### 2. **useAuth Hook** (`/frontend/src/shared/hooks/useAuth.ts`)
- Управление состоянием аутентификации
- Автоматическая загрузка пользователя при монтировании
- Методы: `login()`, `logout()`, `refresh()`
- Хранение токена в localStorage (`access_token`)
- Автоматическое удаление токена при ошибке 401

### 3. **ProfilePage** (`/frontend/src/pages/Profile/ProfilePage.tsx`)
- Полный профиль пользователя с аватаром
- Статистика:
  - Total Bots / Active Bots
  - Total Trades / Open Positions
  - Total P&L с процентами
  - Win Rate
  - Total Sessions
  - Лучший бот с профитом
- Пустое состояние с кнопкой создания первого бота

### 4. **User Stats API** (`/backend/app/api/trading.py`)
**Endpoint**: `GET /api/trading/user/stats`

Возвращает:
```python
{
  "user_id": str,
  "total_bots": int,
  "active_bots": int,
  "total_sessions": int,
  "total_trades": int,
  "open_positions": int,
  "total_pnl": Decimal,
  "total_pnl_percent": Decimal,
  "win_rate": Decimal,
  "best_bot_id": str | None,
  "best_bot_name": str | None,
  "best_bot_pnl": Decimal | None
}
```

### 5. **Интеграция в Topbar**
- UserMenu заменил placeholder "User (TODO)"
- Показывает аватар/инициалы справа в шапке
- Dropdown открывается при клике

### 6. **Обновлена LoginPage**
- Интегрирована с `useAuth` hook
- Автоматический `login()` после успешного входа/регистрации
- Единый ключ токена: `access_token` (вместо `trade_access_token`)

### 7. **httpClient обновлен**
- Использует `access_token` из localStorage
- Автоматический редирект на `/login` при 401
- Очистка токена при ошибке авторизации

## 🎯 Как использовать

### Вход в систему
1. Перейти на `/login`
2. Ввести email и пароль
3. После успешного входа → автоматический редирект на dashboard
4. UserMenu в правом верхнем углу показывает аватар

### Просмотр профиля
1. Кликнуть на аватар в правом верхнем углу
2. Выбрать "Profile"
3. Увидеть полную статистику по ботам и трейдам

### API для статистики
```typescript
// Получить статистику текущего пользователя
const token = localStorage.getItem('access_token')
const response = await fetch('/api/trading/user/stats', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
})
const stats = await response.json()
```

## 📁 Файлы

### Новые файлы:
- `/frontend/src/shared/hooks/useAuth.ts` - хук аутентификации
- `/frontend/src/shared/ui/UserMenu.tsx` - компонент меню пользователя
- `/frontend/src/pages/Profile/ProfilePage.tsx` - страница профиля
- `/backend/app/schemas/user_stats.py` - схема статистики пользователя

### Измененные файлы:
- `/frontend/src/app/layout/Topbar.tsx` - добавлен UserMenu
- `/frontend/src/app/routes.tsx` - добавлен роут `/profile`
- `/frontend/src/pages/Auth/LoginPage.tsx` - интеграция с useAuth
- `/frontend/src/services/httpClient.ts` - единый ключ токена
- `/backend/app/api/trading.py` - endpoint `/trading/user/stats`

## 🔐 Аутентификация

### Доступные методы:
1. **Password Login** - email + password
2. **Password Register** - email + password + recovery mnemonic
3. **Password Reset** - email + recovery mnemonic + new password
4. **Email Login** - магическая ссылка на email
5. **Google OAuth** - вход через Google

### Хранение токена:
- localStorage: `access_token`
- Формат: JWT Bearer Token
- Автоматическое добавление в заголовки всех API запросов

## 📊 Статистика пользователя

### Расчет метрик:
- **Total PnL**: Сумма (final_balance - initial_balance) всех сессий
- **Win Rate**: (Winning trades / Total closed trades) * 100
- **Best Bot**: Бот с максимальным cumulative PnL

### Обновление:
- Статистика пересчитывается при каждом запросе
- Можно кешировать на стороне клиента

## 🎨 UI/UX

### UserMenu:
- Синяя рамка вокруг аватара (цвет `--primary`)
- Dropdown с тенью и скругленными углами
- Закрывается при клике вне меню
- Hover эффекты на пунктах меню

### ProfilePage:
- Карточки статистики с иконками и цветами
- Зеленый/красный для profit/loss
- Градиентная карточка для лучшего бота
- Адаптивная сетка (responsive grid)

## 🚀 Следующие шаги

### Возможные улучшения:
1. Редактирование профиля (имя, аватар)
2. Смена пароля
3. Двухфакторная аутентификация (2FA)
4. История входов
5. API ключи для торговли
6. Уведомления в профиле
7. Экспорт статистики
8. Графики performance за период

---

**Статус**: ✅ Готово к использованию
**Тестирование**: Требуется тестирование с реальными пользователями
**Версия**: 1.0
