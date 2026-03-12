import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './hooks/useAuth';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import DarkModeToggle from './components/DarkModeToggle';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import DeRegisterPage from './pages/DeRegisterPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import ContactPage from './pages/ContactPage';
import LeaderboardPage from './pages/LeaderboardPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import UserDashboardPage from './pages/UserDashboardPage';
import DashboardSelectionPage from './pages/DashboardSelectionPage';
import FAQPage from './pages/FAQPage';

function App() {
  return (
    <AuthProvider>
      <Router basename="/8bp-rewards">
        <div className="min-h-screen bg-gradient-subtle dark:bg-background-dark-primary overflow-x-hidden w-full">
          <DarkModeToggle />
          <Layout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/deregister" element={<DeRegisterPage />} />
                <Route path="/dashboard-selection" element={<DashboardSelectionPage />} />
                <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/user-dashboard" element={<UserDashboardPage />} />
                <Route path="/faq" element={<FAQPage />} />
              </Routes>
            </ErrorBoundary>
          </Layout>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#fff',
                color: '#334155',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
              },
              className: 'dark:bg-background-dark-secondary dark:text-text-dark-primary dark:border-background-dark-quaternary',
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;


