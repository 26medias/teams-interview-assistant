import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { LoginPage } from "./auth/LoginPage.tsx";
import { SignupPage } from "./auth/SignupPage.tsx";
import { Layout } from "./components/Layout.tsx";
import { DashboardPage } from "./dashboard/DashboardPage.tsx";
import { CreateInterviewPage } from "./interview/CreateInterviewPage.tsx";
import { InterviewDetailPage } from "./interview/InterviewDetailPage.tsx";

export function App() {
    return (
        <HashRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignupPage />} />
                    <Route element={<Layout />}>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/interviews/new" element={<CreateInterviewPage />} />
                        <Route path="/interviews/:id" element={<InterviewDetailPage />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </HashRouter>
    );
}
