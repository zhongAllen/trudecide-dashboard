import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Knowledge from "@/pages/Knowledge";
import DataAdmin from "@/pages/DataAdmin";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";



function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/knowledge" component={Knowledge} />
      <Route path="/knowledge/:id" component={Knowledge} />
      <Route path="/admin/data" component={DataAdmin} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
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
        <ThemeProvider
          defaultTheme="light"
        >
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

export default App;
