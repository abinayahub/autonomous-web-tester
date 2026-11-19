import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireAuth } from './components/AppLayout';
import { ToastProvider } from './components/feedback';
import { LiveRunProvider } from './lib/live';
import { AppStoreProvider, useStore } from './lib/store';
import { ServerDataProvider } from './lib/serverData';
import type { ReactNode } from 'react';

/** Loads persisted results once signed in. */
function ServerData({ children }: { children: ReactNode }) {
  const store = useStore();
  return <ServerDataProvider enabled={!!store.session}>{children}</ServerDataProvider>;
}
import { MarketingLayout } from './marketing/MarketingLayout';
import { ContactPage, DemoEntry, FeaturesPage, Landing, PricingPage, PublicNotFound } from './marketing/pages';
import { AddWebsite } from './pages/AddWebsite';
import { Dashboard } from './pages/Dashboard';
import { IssueDetail, Issues } from './pages/Issues';
import { LiveTesting } from './pages/LiveTesting';
import { ForgotPassword, Login, Signup } from './pages/Login';
import { ProjectDetail, Projects } from './pages/Projects';
import { Reports } from './pages/Reports';
import { Screenshots } from './pages/Screenshots';
import { Settings } from './pages/Settings';
import { TestConfiguration } from './pages/TestConfiguration';

export function App() {
  return (
    <AppStoreProvider>
      <ServerData>
      <LiveRunProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public marketing site */}
              <Route element={<MarketingLayout />}>
                <Route index element={<Landing />} />
                <Route path="features" element={<FeaturesPage />} />
                <Route path="pricing" element={<PricingPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="*" element={<PublicNotFound />} />
              </Route>
              <Route path="/demo" element={<DemoEntry />} />
              {/* Auth */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              {/* Application */}
              <Route element={<RequireAuth />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/new" element={<AddWebsite />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="projects/:id/edit" element={<AddWebsite />} />
                <Route path="projects/:id/configure" element={<TestConfiguration />} />
                <Route path="configure" element={<TestConfiguration />} />
                <Route path="live" element={<LiveTesting />} />
                <Route path="issues" element={<Issues />} />
                <Route path="issues/:id" element={<IssueDetail />} />
                <Route path="screenshots" element={<Screenshots />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </LiveRunProvider>
      </ServerData>
    </AppStoreProvider>
  );
}
