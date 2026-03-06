import { Navigate, Outlet, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";

export function Layout() {
    const { user, loading, logout } = useAuth();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="border-b border-gray-200 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                    <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-indigo-600">
                        Interview Assistant
                    </Link>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{user.name}</span>
                        <button
                            onClick={logout}
                            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <Outlet />
            </main>
        </div>
    );
}
