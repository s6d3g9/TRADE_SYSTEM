import { Navigate, createBrowserRouter } from 'react-router-dom'

import AppShell from './layout/AppShell'

import OverviewPage from '../pages/Dashboard/OverviewPage'
import LivePage from '../pages/Dashboard/LivePage'
import AlertsPage from '../pages/Dashboard/AlertsPage'

import BotsListPage from '../pages/Bots/BotsListPage'
import BotCreateWizardPage from '../pages/Bots/BotCreateWizardPage'
import BotDetailsPage from '../pages/Bots/BotDetailsPage'

import StrategiesListPage from '../pages/StrategyLab/StrategiesListPage'
import StrategyDetailsPage from '../pages/StrategyLab/StrategyDetailsPage'
import BacktestRunnerPage from '../pages/StrategyLab/BacktestRunnerPage'
import OptimizePage from '../pages/StrategyLab/OptimizePage'
import FreqAIPage from '../pages/StrategyLab/FreqAIPage'
import CombinatorPage from '../pages/StrategyLab/CombinatorPage'

import AgentsOverviewPage from '../pages/Agents/AgentsOverviewPage'
import SupervisorPage from '../pages/Agents/SupervisorPage'
import ReporterPage from '../pages/Agents/ReporterPage'
import AlignmentPage from '../pages/Agents/AlignmentPage'

import MarketsPairsPage from '../pages/Data/MarketsPairsPage'
import TradesSearchPage from '../pages/Data/TradesSearchPage'
import ArtifactsPage from '../pages/Data/ArtifactsPage'

import TerminalPage from '../pages/Charts/TerminalPage'

import LogsViewerPage from '../pages/Logs/LogsViewerPage'
import AuditTrailPage from '../pages/Logs/AuditTrailPage'

import AccountPage from '../pages/Settings/AccountPage'
import ExchangesPage from '../pages/Settings/ExchangesPage'
import SystemPage from '../pages/Settings/SystemPage'
import TemplatesPage from '../pages/Settings/TemplatesPage'
import NotificationsPage from '../pages/Settings/NotificationsPage'
import NeuroModulesPage from '../pages/Settings/NeuroModulesPage'
import ExecutionEnginesPage from '../pages/Settings/ExecutionEnginesPage'
import FreqtradeFreqAIPage from '../pages/Settings/FreqtradeFreqAIPage'

import UsersPage from '../pages/Admin/UsersPage'
import MaintenancePage from '../pages/Admin/MaintenancePage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/dashboard/overview" replace /> },

      { path: '/dashboard/overview', element: <OverviewPage /> },
      { path: '/dashboard/live', element: <LivePage /> },
      { path: '/dashboard/alerts', element: <AlertsPage /> },

      { path: '/bots', element: <BotsListPage /> },
      { path: '/bots/create', element: <BotCreateWizardPage /> },
      { path: '/bots/:botId', element: <BotDetailsPage /> },

      { path: '/strategylab/strategies', element: <StrategiesListPage /> },
      { path: '/strategylab/strategies/:strategyName', element: <StrategyDetailsPage /> },
      { path: '/strategylab/backtest', element: <BacktestRunnerPage /> },
      { path: '/strategylab/optimize', element: <OptimizePage /> },
      { path: '/strategylab/freqai', element: <FreqAIPage /> },
      { path: '/strategylab/combinator', element: <CombinatorPage /> },

      { path: '/agents/overview', element: <AgentsOverviewPage /> },
      { path: '/agents/supervisor', element: <SupervisorPage /> },
      { path: '/agents/reporter', element: <ReporterPage /> },
      { path: '/agents/alignment', element: <AlignmentPage /> },

      { path: '/data/markets-pairs', element: <MarketsPairsPage /> },
      { path: '/data/trades', element: <TradesSearchPage /> },
      { path: '/data/artifacts', element: <ArtifactsPage /> },

      { path: '/charts/terminal', element: <TerminalPage /> },

      { path: '/logs/viewer', element: <LogsViewerPage /> },
      { path: '/logs/audit', element: <AuditTrailPage /> },

      { path: '/settings/account', element: <AccountPage /> },
      { path: '/settings/exchanges', element: <ExchangesPage /> },
      { path: '/settings/system', element: <SystemPage /> },
      { path: '/settings/templates', element: <TemplatesPage /> },
      { path: '/settings/notifications', element: <NotificationsPage /> },
      { path: '/settings/integrations/neuro-modules', element: <NeuroModulesPage /> },
      { path: '/settings/integrations/execution-engines', element: <ExecutionEnginesPage /> },
      { path: '/settings/integrations/freqtrade-freqai', element: <FreqtradeFreqAIPage /> },

      // TODO: Guard by role
      { path: '/admin/users', element: <UsersPage /> },
      { path: '/admin/maintenance', element: <MaintenancePage /> },
    ],
  },
])
