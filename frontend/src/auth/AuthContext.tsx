import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import { post } from "../api/client.ts";
import type { User } from "../types.ts";

interface AuthState {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, name: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthResponse {
    token: string;
    user: User;
}

/**
 * Decode the payload of a JWT to check expiration.
 * Returns true if the token is expired or unparseable.
 */
function isTokenExpired(token: string): boolean {
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (!payload.exp) return false;
        return Date.now() >= payload.exp * 1000;
    } catch {
        return true;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // On mount, restore session from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem("auth_token");
        const storedUser = localStorage.getItem("auth_user");

        if (storedToken && !isTokenExpired(storedToken) && storedUser) {
            setToken(storedToken);
            try {
                setUser(JSON.parse(storedUser) as User);
            } catch {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
            }
        } else {
            localStorage.removeItem("auth_token");
            localStorage.removeItem("auth_user");
        }

        setLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const res = await post<AuthResponse>("/api/auth/login", { email, password });
        localStorage.setItem("auth_token", res.token);
        localStorage.setItem("auth_user", JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
    }, []);

    const signup = useCallback(async (email: string, password: string, name: string) => {
        const res = await post<AuthResponse>("/api/auth/signup", { email, password, name });
        localStorage.setItem("auth_token", res.token);
        localStorage.setItem("auth_user", JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return ctx;
}
