# YNAPB — YNAB Planner & Budgeter

**Дата:** 2026-04-25
**Статус:** Design approved, ready for implementation plan
**Автор:** Sergey Indenbom (dzorogh@gmail.com)

## 1. Проблема

YNAB при работе с несколькими разовыми целями (Target Balance by Date), у которых разные дедлайны, считает каждую цель изолированно. Это приводит к завышенной суммарной нагрузке в первые месяцы и заниженной — после закрытия близких целей.

Пример: ремонт (1 млн ₽ за 5 мес) + машина (5 млн ₽ за 20 мес).

- YNAB показывает: 1–5 мес — 450к/мес, 6–20 мес — 250к/мес.
- Желаемое: 1–5 мес — 200к на ремонт, 6–20 мес — 333к на машину.

При предсказуемом доходе (например, 350к/мес на цели) пользователь хочет видеть оптимальное распределение и долгосрочный план на 10+ лет с десятками целей, без ручного управления каждый месяц.

## 2. Цели продукта

- Дать пользователю инструмент для долгосрочного планирования (до 10+ лет) разовых целей с дедлайнами.
- Использовать данные YNAB как источник правды (категории, балансы, история доходов).
- Записывать рассчитанный план обратно в YNAB как `budgeted` сумма по категориям.
- Показывать недостижимые цели и конфликты, давая пользователю явные подсказки для разрешения.

## 3. Границы MVP (v1)

### Входит

1. Аутентификация через Supabase Auth (magic link) — отдельная страница `/login`.
2. Подключение к YNAB через Personal Access Token, выбор бюджета — на странице `/settings`.
3. Импорт из YNAB: категории, текущие балансы, история транзакций (для расчёта baseline дохода).
4. CRUD разовых целей: имя, сумма, дедлайн, привязка к YNAB-категории, статус, заметки.
5. CRUD обязательных регулярных трат (фиксированная сумма в месяц).
6. Конфигурация месячного бюджета: baseline из истории YNAB (за N месяцев) + опциональный override (одно число).
7. Greedy-алгоритм распределения с учётом стартовых балансов целей.
8. Визуализация плана: drag-and-drop таймлайн, помесячная таблица, график накопления.
9. Каскадный preview в реальном времени при перетаскивании целей.
10. Подсветка недостижимых целей (`earliestAchievable` дата) и конфликтов одинаковых дедлайнов.
11. Запись `budgeted` суммы текущего месяца в YNAB по кнопке с диалогом подтверждения diff'а.
12. Empty states вместо отдельного onboarding: пока YNAB не подключён, основные экраны показывают баннер с CTA к `/settings`.

### Не входит

- Помесячный график изменения дохода (повышения, отпуска, бонусы) — только baseline + override одним числом.
- Сценарии «пессимистичный/оптимистичный».
- Резервный фонд / повторяющиеся цели (живут в YNAB как обычные цели).
- Автоматическая запись в YNAB по расписанию (только ручной триггер).
- Multi-user в одном инстансе (Supabase Auth заложен, но интерфейс — на одного пользователя).
- Мобильный UI (адаптивная вёрстка — bonus, не приоритет).
- Учёт инфляции и процентов на накопления.
- Создание/изменение YNAB-целей (target) через API. Работаем только с `budgeted`.

## 4. Архитектура

### Стек (версии актуальны на 2026-04-25)

- **Frontend:** Next.js 16.2 (App Router, Turbopack stable), React 19.2, TypeScript 6.0, Tailwind CSS v4.2, shadcn/ui (CLI `shadcn` 4.5, с поддержкой Tailwind v4 и React 19), `lucide-react` 1.11 для иконок.
- **Backend:** Next.js Route Handlers (`app/api/*`) и Server Actions. Отдельного бэка нет.
- **БД:** Supabase **cloud** (hosted, free tier для dev) Postgres + Row-Level Security. Локально приложение ходит в облачный инстанс — без `supabase start` / Docker.
- **Auth:** Supabase Auth (email magic link), `@supabase/ssr` 0.10 для интеграции с Next.js App Router.
- **Supabase JS:** `@supabase/supabase-js` 2.104.
- **Графики:** Recharts 3.8.
- **Drag-and-drop:** `@dnd-kit/core` 6.3.
- **State:** Zustand 5.0 (клиентское состояние плана для отзывчивого preview), TanStack Query 5.100 (серверные данные).
- **YNAB SDK:** официальный `ynab` npm-пакет 4.1.
- **Виртуализация таблиц:** `@tanstack/react-virtual` 3.13 (горизонт 10 лет = 120 строк месячной таблицы).
- **Линтинг/формат:** ESLint 9 (flat config), Prettier 3, актуально на момент Next 16.

Конкретные минорные версии могут двигаться, но major-версии зафиксированы и проверены: Next 16, React 19.2, Tailwind v4, Recharts 3, Zustand 5, TanStack Query 5.

### Слои

```
┌─ UI (React Server + Client Components) ──────────────────┐
│  Pages: /login, /settings, /goals, /plan                 │
│  Components: GoalList, Timeline (dnd), PlanTable, Charts │
└──────────────────────────────────────────────────────────┘
              │ TanStack Query / Server Actions
┌─ API Layer (Next.js Route Handlers) ─────────────────────┐
│  /api/ynab/sync      — pull categories, txns, balances   │
│  /api/ynab/push      — write budgeted to YNAB            │
│  /api/goals          — CRUD                              │
│  /api/plan/calculate — run optimizer (server-side)       │
└──────────────────────────────────────────────────────────┘
              │
┌─ Domain (pure TS, no I/O) ───────────────────────────────┐
│  /lib/planner    — greedy algorithm, conflict detection  │
│  /lib/income     — baseline from YNAB history            │
│  /lib/ynab-map   — map YNAB categories <-> internal goals│
└──────────────────────────────────────────────────────────┘
              │
┌─ Persistence ────────────────────────────────────────────┐
│  Supabase client (server + browser)                      │
│  Tables: goals, regular_expenses, settings, ynab_cache   │
└──────────────────────────────────────────────────────────┘
```

### Ключевое решение: алгоритм в чистом домене

`/lib/planner` — чистые функции на TypeScript, без обращений к БД или сети. Принимает `PlanInput`, возвращает `PlanResult`. Это позволяет:

- Гонять алгоритм и в браузере (для отзывчивого drag-preview), и на сервере (для канонического расчёта при сохранении).
- Покрыть юнит-тестами без моков.
- При необходимости вынести в Web Worker / Wasm без переписывания.

### Drag-preview flow

1. Пользователь начинает тащить край цели на таймлайне → клиент берёт снимок состояния.
2. На каждом mouseMove (throttle ~16ms) пересчёт через `planner` в браузере. Сложность O(N×M): для 50 целей × 120 месяцев < 5ms.
3. Preview обновляется живьём: другие цели сдвигаются, конфликты появляются/исчезают, месячная таблица обновляется.
4. На mouseUp — финальное состояние сохраняется через server action.
5. Esc во время drag — откат к снимку.

## 5. Модель данных

### Таблицы Supabase

```sql
profiles (
  id              uuid PK (= auth.users.id)
  ynab_token      text encrypted   -- YNAB Personal Access Token
  ynab_budget_id  text             -- выбранный бюджет в YNAB
  created_at      timestamptz
)

income_settings (
  user_id         uuid PK FK profiles
  baseline_months int default 6    -- сколько месяцев истории брать
  manual_override numeric null     -- если задан — использовать вместо baseline
  updated_at      timestamptz
)

goals (
  id               uuid PK
  user_id          uuid FK
  name             text
  target_amount    numeric          -- сколько накопить всего
  deadline         date             -- нормализуется к 1-му числу месяца
  ynab_category_id text null        -- привязка к YNAB-категории
  status           enum: active|frozen|completed
  notes            text null
  created_at       timestamptz
  updated_at       timestamptz
)

regular_expenses (
  id               uuid PK
  user_id          uuid FK
  name             text
  monthly_amount   numeric
  ynab_category_id text null        -- опционально
  active           boolean default true
)

ynab_cache (
  user_id          uuid PK
  synced_at        timestamptz
  categories       jsonb            -- [{id, name, balance, group}, ...]
  income_history   jsonb            -- [{month: '2026-01', net_income: 350000}, ...]
)

plan_snapshots (
  id           uuid PK
  user_id      uuid FK
  created_at   timestamptz
  inputs_hash  text                 -- хеш входных данных
  result       jsonb                -- сериализованный план
)
```

### RLS

- На всех таблицах с `user_id`: `user_id = auth.uid()`.
- На `profiles`: `id = auth.uid()`.

### Шифрование YNAB-токена

`profiles.ynab_token` шифруется через Supabase Vault или симметрично через ключ из env переменной приложения (решение на этапе плана). Чистый текст не хранится.

### Доменные типы (TS)

```ts
type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;        // из YNAB на момент расчёта, не хранится в БД
  deadline: Date;                // нормализован к 1-му числу месяца
  status: 'active' | 'frozen' | 'completed';
  ynabCategoryId: string | null;
  createdAt: Date;               // используется как стабильный тай-брейк
};

type MonthlyBudget = {
  totalIncome: number;           // baseline или override
  obligations: number;           // сумма regular_expenses
  available: number;             // totalIncome - obligations
};

type PlanInput = {
  goals: Goal[];
  budget: MonthlyBudget;
  startMonth: Date;
  horizonMonths: number;         // например 120 (10 лет)
};

type MonthAllocation = {
  month: Date;
  perGoal: Map<string, number>;  // goalId -> сумма пополнения
  unallocated: number;           // если бюджет > потребности
};

type PlanResult = {
  allocations: MonthAllocation[];
  conflicts: Array<{
    goalId: string;
    type: 'unreachable' | 'tied_deadline';
    detail: string;
    earliestAchievable?: Date;
  }>;
  completionMap: Map<string, Date>;
};
```

### Замечания по модели

- `currentBalance` целей берётся из YNAB на момент расчёта, не хранится отдельно. Источник правды — YNAB.
- `ynab_cache` обновляется только явной кнопкой Sync. UI показывает `synced_at`.
- Поля `manual_order` нет: единственный способ выразить приоритет — изменить дедлайн.

## 6. Алгоритм планировщика

**Вход:** `PlanInput`. **Выход:** `PlanResult`.

### Шаг 1: Подготовка

1. Отфильтровать цели со `status = 'active'`.
2. Вычислить `remaining = targetAmount - currentBalance`. Если `remaining <= 0` — пометить `completed`, исключить из распределения.
3. Отсортировать активные цели по `(deadline ASC, createdAt ASC)`. `createdAt` используется только как стабильный детерминированный тай-брейк.

### Шаг 2: Greedy distribution по месяцам

Для каждого месяца `m` от `startMonth` до `startMonth + horizonMonths`:

```
budget = available_per_month
queue = active goals ordered by (deadline, createdAt), where deadline >= m

for goal in queue:
  if budget == 0: break
  months_left = months between m and goal.deadline (inclusive)
  needed_per_month = goal.remaining / months_left
  contribution = min(needed_per_month, budget, goal.remaining)
  allocate(m, goal, contribution)
  goal.remaining -= contribution
  budget -= contribution

unallocated[m] = budget
```

«Нужно в месяц» считается на каждой итерации заново, что автоматически даёт правильное поведение при недопополнении в предыдущих месяцах.

### Шаг 3: Детекция «недостижимых» целей

После полного прохода — для каждой цели с `remaining > 0` после её `deadline`:

1. Пометить как `unreachable`.
2. Рассчитать `earliestAchievable`: продолжить алгоритм после её дедлайна, считая что цель остаётся в очереди с просроченным дедлайном (приоритет максимальный). Месяц, в котором её `remaining` падает до 0 = `earliestAchievable`.

### Шаг 4: Детекция конфликтов одинаковых дедлайнов

Если ≥2 цели имеют один `(year, month)` дедлайн **и** в этом месяце бюджета не хватает на полное покрытие обеих → пометить `tied_deadline` конфликт. Тай-брейк по `createdAt` применяется автоматически для детерминизма расчёта, но UI обязан подсветить конфликт с CTA «Сдвиньте один из дедлайнов».

### Шаг 5: Замороженные цели

Цели со `status = 'frozen'`:

- Не участвуют в распределении.
- Сохраняют `currentBalance` (не пополняются).
- Показываются в UI отдельной секцией с кнопкой «Разморозить».

### Шаг 6: Авто-заморозка просроченных

Если на момент расчёта дедлайн цели прошёл, а `remaining > 0`, и пользователь не вмешался — инструмент автоматически переводит цель в `status = 'frozen'` и показывает уведомление. Пользователь решает: разморозить с новым дедлайном, удалить, или оставить.

### Сложность

O(N × M), где N — число активных целей, M — горизонт в месяцах. Для 50 × 120 = 6000 итераций, < 5ms на современном JS. Алгоритм пригоден для пересчёта на каждый frame drag-операции.

### Ограничения

- Greedy, не глобальная оптимизация. Гарантировано «жадное по дедлайну» распределение, не «оптимальное».
- Не учитывает проценты, инфляцию, валютные риски.
- Не переставляет приоритеты сам — только пользователь сдвигом дедлайнов.

### Тесты алгоритма

Юнит-тесты на чистых функциях:

- Базовый кейс из спеки (ремонт + машина) — горбатое распределение.
- Недостижимая цель → правильный `earliestAchievable`.
- Тай-брейк по `createdAt` детерминирован.
- Старт с ненулевыми балансами.
- Бюджет больше суммы потребностей → корректный `unallocated`.
- Замороженная цель не участвует в распределении.
- Авто-заморозка при просроченном дедлайне.

## 7. UI/UX

### Структура страниц

| Путь | Назначение |
|------|------------|
| `/login` | Вход через Supabase Auth (magic link). Незалогиненных редиректим сюда. |
| `/settings` | YNAB token, выбор бюджета, `baseline_months`, override дохода, выход. |
| `/goals` | CRUD целей и обязательных трат. |
| `/plan` | Главный экран планировщика. |

Если YNAB не подключён, `/goals` и `/plan` показывают баннер «Настройте подключение к YNAB» с кнопкой → `/settings`. Отдельной страницы onboarding нет.

### Экран `/plan`

```
┌──────────────────────────────────────────────────────────┐
│ Header: Месячный бюджет: 350 000 ₽ (baseline 6мес)      │
│         [override: ___] [Sync YNAB] [synced 2h ago]     │
├──────────────────────────────────────────────────────────┤
│ ┌─ Timeline (drag-and-drop) ──────────────────────────┐ │
│ │ 2026 ──────────── 2027 ──────────── 2028 ────────── │ │
│ │  ▓▓▓▓ Ремонт                                         │ │
│ │       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ Машина                       │ │
│ │                  ⚠ Дача (недостижима до 2032)        │ │
│ └──────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ ┌─ Месячная таблица ──────────┐ ┌─ График накопления─┐ │
│ │ Месяц  Ремонт Машина  Своб. │ │  ▁▂▃▄▅▆▇█           │ │
│ │ Apr26  200к   150к    0     │ │                     │ │
│ │ May26  200к   150к    0     │ │                     │ │
│ └─────────────────────────────┘ └─────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ Конфликты:                                               │
│  ⚠ Цель «Дача» недостижима к 2027-06. Ранее: 2032-04.   │
│  ⚠ «Ремонт» и «Отпуск» имеют одинаковый дедлайн 2026-08│
│     и не помещаются в бюджет. Сдвиньте один из них.    │
├──────────────────────────────────────────────────────────┤
│ [Записать в YNAB на этот месяц]                         │
└──────────────────────────────────────────────────────────┘
```

### Drag-and-drop

- Захват за правый край прямоугольника цели — изменение `deadline`.
- Захват за тело — недопустим (нет «сдвинуть всю цель»; начало накопления всегда «сейчас»).
- На каждый mouseMove — пересчёт через `planner` в браузере, обновление preview.
- На mouseUp — сохранение через server action.
- Esc — откат к снимку состояния до начала drag.

### Запись в YNAB

Кнопка `[Записать в YNAB на этот месяц]` открывает модалку diff'а:

```
┌─ Изменения для апреля 2026 ───────────────────────────┐
│ Категория          Сейчас в YNAB    Будет             │
│ ─────────────────────────────────────────────         │
│ Ремонт дома        100 000          200 000  (+100k)  │
│ Покупка машины       0              150 000  (+150k)  │
│ Отпуск             50 000           50 000   (no change)│
│                                                        │
│ ⚠ Это перезапишет budgeted в YNAB на этот месяц.      │
│   Регулярные цели и категории без привязки не трогаем. │
│                                                        │
│ [Отмена]  [Записать]                                  │
└────────────────────────────────────────────────────────┘
```

После применения — вызов YNAB API (`patchMonthCategory`) для каждой изменённой категории, показ подтверждения.

### Что НЕ трогаем в YNAB (явные правила)

- Не создаём, не меняем, не удаляем YNAB-цели (target). Только `budgeted` сумма.
- Не трогаем категории, не привязанные к нашим целям.
- Не трогаем категории целей со статусом не `active`.
- Не трогаем прошлые месяцы. Только текущий или явно выбранный пользователем.

## 8. Тестирование и качество кода

Все проверки гоняются локально через `npm run check` и в CI на каждый PR. PR блокируется при падении любой из проверок.

### 8.1 Юнит-тесты (Vitest 4.1)

- Покрывают `/lib/planner` (минимум 7 сценариев из §6) и `/lib/income`.
- Чистые функции, никакого DOM, БД или сети.
- Запуск: `npm run test:unit`. CI требует прохождения 100%.

### 8.2 Архитектурные тесты (dependency-cruiser 17)

Конфиг `.dependency-cruiser.cjs` фиксирует слоистую архитектуру из §4 как машинно-проверяемые правила:

| Правило | Что запрещает |
|---------|---------------|
| `domain-pure` | `/lib/planner` и `/lib/income` не импортируют из `next`, `react`, `@supabase/*`, `ynab`, `/app/*`, `/components/*`. |
| `no-ui-in-api` | `/app/api/*` не импортирует `/components/*` и `react`. |
| `no-api-in-ui` | `/components/*` не импортирует из `/app/api/*` (общение только через TanStack Query / server actions). |
| `no-cross-page` | `/app/<page-a>/*` не импортирует из `/app/<page-b>/*`. Общий код выносится в `/lib` или `/components`. |
| `no-circular` | Циклические зависимости запрещены полностью. |
| `no-orphans` | Файлы без импортёров (кроме `page.tsx`, `layout.tsx`, `route.ts`, тест-файлов) — ошибка. |

Запуск: `npm run test:arch` (`depcruise --config .dependency-cruiser.cjs src/`).

### 8.3 Когнитивная сложность и code smell (ESLint + sonarjs)

`eslint-plugin-sonarjs` 4 включается с правилами:

- `sonarjs/cognitive-complexity`: лимит **15** на функцию (по умолчанию 15, оставляем).
- `sonarjs/no-duplicate-string`: лимит 3 повтора.
- `sonarjs/no-identical-functions`.
- `sonarjs/no-collapsible-if`, `sonarjs/no-redundant-jump`.

Плюс встроенное ESLint правило `complexity` с лимитом **10** (цикломатическая сложность) и `max-lines-per-function` лимит **80** строк.

Алгоритм планировщика — единственное допустимое исключение (через `// eslint-disable-next-line` с обязательным комментарием-обоснованием), если упрётся в лимиты.

Запуск: `npm run lint` (часть общего `eslint .`).

### 8.4 E2E тесты (Playwright 1.59)

Запускаются против локального dev-сервера Next.js, подключённого к **тестовому проекту Supabase** (отдельный от dev). YNAB API мокается через MSW или Playwright route interception — реальный YNAB не трогаем в тестах.

Сценарии MVP:

1. **Auth flow**: переход на `/plan` без сессии → редирект на `/login` → ввод email → имитация magic link callback → попадание на `/plan` с пустым состоянием.
2. **Empty state**: на `/plan` без YNAB-токена показывается баннер с CTA → клик ведёт на `/settings`.
3. **YNAB connect**: на `/settings` ввод токена → выбор бюджета из списка → Sync → возврат на `/plan` с импортированными категориями.
4. **Goal CRUD**: на `/goals` создание цели (имя, сумма, дедлайн, привязка к категории) → появление в списке → редактирование → удаление.
5. **Distribution display**: после создания 2 целей с разными дедлайнами на `/plan` отображается корректная горбатая таблица распределения.
6. **Drag deadline**: захват правого края цели на таймлайне → перетаскивание на 3 месяца вправо → preview месячной таблицы обновился → отпускание сохраняет.
7. **Unreachable goal highlight**: цель с заведомо недостижимой суммой подсвечивается, в панели конфликтов виден `earliestAchievable`.
8. **Tied deadlines conflict**: две цели на один месяц без бюджета → конфликт `tied_deadline` подсвечен с CTA.
9. **Write to YNAB**: клик «Записать в YNAB» → модалка diff'а → подтверждение → запрос на мок YNAB API ушёл с правильным payload.

Запуск: `npm run test:e2e`. В CI поднимается dev-сервер, запускается headless.

### 8.5 Сводный скрипт

```json
"scripts": {
  "test:unit": "vitest run",
  "test:arch": "depcruise --config .dependency-cruiser.cjs src/",
  "test:e2e":  "playwright test",
  "lint":      "eslint .",
  "typecheck": "tsc --noEmit",
  "check":     "npm run lint && npm run typecheck && npm run test:arch && npm run test:unit && npm run test:e2e"
}
```

CI выполняет `npm run check` на каждом PR. Локальный pre-commit hook (через `lefthook` или `husky`) запускает `lint` + `typecheck` + `test:arch` + `test:unit` (без e2e — слишком медленно).

## 9. Открытые вопросы для этапа плана

- Способ шифрования YNAB-токена: Supabase Vault vs симметричное шифрование на уровне приложения.
- Стратегия обновления `ynab_cache` (только ручной Sync vs опциональный auto-refresh при открытии `/plan` если устарело > N часов).
- Конкретный UX выбора месяца для записи в YNAB (текущий по умолчанию, picker для других).
- Хранение `plan_snapshots` — нужно ли в MVP или отложить.
- Локализация: интерфейс на русском (исходные требования на русском), но исходники и комментарии на английском.

## 10. Что считаем «готовым MVP»

- Пользователь может зайти, привязать YNAB, импортировать категории.
- Создать 5+ целей с разными дедлайнами, видеть корректное распределение по месяцам.
- Тащить цель по таймлайну, видеть живой preview.
- Видеть подсветку недостижимой цели и `earliestAchievable`.
- Записать рассчитанные суммы в YNAB и убедиться, что `budgeted` поле обновилось.
- Все проверки `npm run check` зелёные: lint (включая cognitive-complexity), typecheck, архитектурные тесты, юнит-тесты планировщика, e2e сценарии MVP.
