const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getToken(): string | null {
    return localStorage.getItem("auth_token");
}

function authHeaders(): Record<string, string> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
        ...authHeaders(),
        "Content-Type": "application/json",
    };

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    // Handle 204 No Content
    if (res.status === 204) {
        return undefined as T;
    }

    return res.json() as Promise<T>;
}

export function get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
}

export function put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PUT", path, body);
}

export function patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PATCH", path, body);
}

export function del<T>(path: string): Promise<T> {
    return request<T>("DELETE", path);
}

export async function upload<T>(path: string, formData: FormData): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API upload ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
}

/**
 * Connect to a Server-Sent Events endpoint.
 * Returns a function to close the connection.
 */
export function sse(path: string, onMessage: (data: string) => void): () => void {
    const token = getToken();
    const url = new URL(`${BASE_URL}${path}`);
    if (token) {
        url.searchParams.set("token", token);
    }

    const source = new EventSource(url.toString());

    source.onmessage = (event) => {
        onMessage(event.data);
    };

    source.onerror = () => {
        // EventSource will auto-reconnect on transient errors.
        // If the connection is closed permanently, close cleanly.
        if (source.readyState === EventSource.CLOSED) {
            source.close();
        }
    };

    return () => {
        source.close();
    };
}
