import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Knowledge from "@/pages/Knowledge";
import DataAdmin from "@/pages/DataAdmin";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import TopDown from "./pages/TopDown";
import Dashboard from "./pages/Dashboard";
import Holdings from "./pages/Holdings";
import StockDetail from "./pages/StockDetail";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

// 受保护的路由包装器
function ProtectedPage({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

// 登录页路由 - 已登录则跳转
function LoginRoute() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation('/');
    return null;
  }

  return <Login />;
}

function Router() {
  return (
    <Switch>
      {/* 登录页 - 公开访问 */}
      <Route path="/login" component={LoginRoute} />

      {/* 受保护的路由 */}
      <Route path="/">
        <ProtectedPage>
          <Dashboard />
        </ProtectedPage>
      </Route>
      <Route path="/dashboard">
        <ProtectedPage>
          <Dashboard />
        </ProtectedPage>
      </Route>
      <Route path="/dashboard/holdings">
        <ProtectedPage>
          <Holdings />
        </ProtectedPage>
      </Route>
      <Route path="/macro">
        <ProtectedPage>
          <Home />
        </ProtectedPage>
      </Route>
      <Route path="/knowledge">
        <ProtectedPage>
          <Knowledge />
        </ProtectedPage>
      </Route>
      <Route path="/knowledge/:id">
        <ProtectedPage>
          <Knowledge />
        </ProtectedPage>
      </Route>
      <Route path="/admin/data">
        <ProtectedPage>
          <DataAdmin />
        </ProtectedPage>
      </Route>
      <Route path="/topdown">
        <ProtectedPage>
          <TopDown />
        </ProtectedPage>
      </Route>
      <Route path="/stock/:ts_code">
        <ProtectedPage>
          <StockDetail />
        </ProtectedPage>
      </Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Design Philosophy: Modern Professional Dashboard
// - Clean, professional aesthetic with blue accent colors
// - Light theme for better readability of financial data
// - Emphasis on information hierarchy and visual clarity
// - Interactive components for exploring complex indicator systems

function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <AuthProvider>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

export default App;
