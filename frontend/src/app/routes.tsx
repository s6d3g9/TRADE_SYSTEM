import { Navigate, createBrowserRouter } from 'react-router-dom'

import AppShell from './layout/AppShell'

import LoginPage from '../pages/Auth/LoginPage'
import AuthCallbackPage from '../pages/Auth/AuthCallbackPage'

import ProfilePage from '../pages/Profile/ProfilePage'

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
import CombinatorPage from '../pages/StrategyLab/CombinatorPageV2'
import BacktestDetailPage from '../pages/StrategyLab/BacktestDetailPage'
import BenchmarkPage from '../pages/StrategyLab/BenchmarkPage'
import NodeGraphsPage from '../pages/StrategyLab/NodeGraphsPage'
import UniversalEditorPage from '../pages/StrategyLab/UniversalEditorPage'

import AgentsOverviewPage from '../pages/Agents/AgentsOverviewPage'
import SupervisorPage from '../pages/Agents/SupervisorPage'
import ReporterPage from '../pages/Agents/ReporterPage'
import AlignmentPage from '../pages/Agents/AlignmentPage'

import MarketsPairsPage from '../pages/Data/MarketsPairsPage'
import TradesSearchPage from '../pages/Data/TradesSearchPage'
import ArtifactsPage from '../pages/Data/ArtifactsPage'

import TerminalPage from '../pages/Charts/TerminalPageV2'
import Terminal2Page from '../pages/Charts/Terminal2Page'
import BotBacktestWorkspacePage from '../pages/Charts/BotBacktestWorkspacePage'

import StoreGalleryPage from '../pages/Store/StoreGalleryPage'
import StoreItemPage from '../pages/Store/StoreItemPage'

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
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/charts/bots-backtests" replace /> },

      { path: '/profile', element: <ProfilePage /> },

      { path: '/dashboard/overview', element: <OverviewPage /> },
      { path: '/dashboard/live', element: <LivePage /> },
      { path: '/dashboard/alerts', element: <AlertsPage /> },

      { path: '/bots', element: <BotsListPage /> },
      { path: '/bots/create', element: <BotCreateWizardPage /> },
      { path: '/bots/:botId', element: <BotDetailsPage /> },

      { path: '/strategylab/strategies', element: <StrategiesListPage /> },
      { path: '/strategylab/strategies/:strategyName', element: <StrategyDetailsPage /> },
      { path: '/strategylab/backtest', element: <BacktestRunnerPage /> },
      { path: '/strategylab/benchmark', element: <BenchmarkPage /> },
      { path: '/strategylab/graphs', element: <NodeGraphsPage /> },
      { path: '/strategylab/optimize', element: <OptimizePage /> },
      { path: '/strategylab/freqai', element: <FreqAIPage /> },
      { path: '/strategylab/combinator', element: <CombinatorPage /> },
      { path: '/strategylab/editor', element: <UniversalEditorPage /> },
      { path: '/strategylab/editor/:scope/:id', element: <UniversalEditorPage /> },
      { path: '/strategylab/editor/:scope/:id/:encodedPath', element: <UniversalEditorPage /> },
      { path: '/strategylab/backtests/:backtestId', element: <BacktestDetailPage /> },

      { path: '/agents/overview', element: <AgentsOverviewPage /> },
      { path: '/agents/supervisor', element: <SupervisorPage /> },
      { path: '/agents/reporter', element: <ReporterPage /> },
      { path: '/agents/alignment', element: <AlignmentPage /> },

      { path: '/data/markets-pairs', element: <MarketsPairsPage /> },
      { path: '/data/trades', element: <TradesSearchPage /> },
      { path: '/data/artifacts', element: <ArtifactsPage /> },

      { path: '/charts/terminal', element: <TerminalPage /> },
      { path: '/charts/terminal2', element: <Terminal2Page /> },
      { path: '/charts/bots-backtests', element: <BotBacktestWorkspacePage /> },

      { path: '/store', element: <StoreGalleryPage /> },
      { path: '/store/items/:itemId', element: <StoreItemPage /> },

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
