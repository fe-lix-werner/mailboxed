import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

const API_BASE = "/api";

async function handleResponse(response: Response) {
	if (!response.ok) {
		if (response.status === 401) {
			// Handle unauthorized
			// window.location.href = '/login';
		}
		const error = await response.text();
		throw new Error(error || response.statusText);
	}
	return response.json();
}

export const api = {
	auth: {
		login: (credentials: any) =>
			fetch(`${API_BASE}/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
			}).then(handleResponse),
		me: () => fetch(`${API_BASE}/auth/me`).then(handleResponse),
		logout: () =>
			fetch(`${API_BASE}/auth/logout`, { method: "POST" }).then(handleResponse),
	},
	mailboxes: {
		list: () => fetch(`${API_BASE}/mailboxes`).then(handleResponse),
		get: (id: number) =>
			fetch(`${API_BASE}/mailboxes/${id}`).then(handleResponse),
		create: (data: any) =>
			fetch(`${API_BASE}/mailboxes`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			}).then(handleResponse),
		update: (id: number, data: any) =>
			fetch(`${API_BASE}/mailboxes/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			}).then(handleResponse),
		delete: (id: number) =>
			fetch(`${API_BASE}/mailboxes/${id}`, { method: "DELETE" }).then(
				handleResponse,
			),
		test: (data: any) =>
			fetch(`${API_BASE}/mailboxes/test-connection`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			}).then(handleResponse),
		sync: (id: number) =>
			fetch(`${API_BASE}/mailboxes/${id}/sync`, { method: "POST" }).then(
				handleResponse,
			),
		reset: (id: number) =>
			fetch(`${API_BASE}/mailboxes/${id}/reset`, { method: "POST" }).then(
				handleResponse,
			),
	},
	downloads: {
		list: (params?: any) => {
			const searchParams = new URLSearchParams(params);
			return fetch(`${API_BASE}/downloads?${searchParams}`).then(
				handleResponse,
			);
		},
		getContentUrl: (id: number) => `${API_BASE}/downloads/${id}/content`,
	},
	jobs: {
		list: (params?: any) => {
			const searchParams = new URLSearchParams(params);
			return fetch(`${API_BASE}/jobs?${searchParams}`).then(handleResponse);
		},
		abortAll: () =>
			fetch(`${API_BASE}/jobs/abort-all`, { method: "POST" }).then(
				handleResponse,
			),
		restartAll: () =>
			fetch(`${API_BASE}/jobs/restart-all`, { method: "POST" }).then(
				handleResponse,
			),
		schedulerStatus: () =>
			fetch(`${API_BASE}/jobs/scheduler/status`).then(handleResponse),
		pauseScheduler: () =>
			fetch(`${API_BASE}/jobs/scheduler/pause`, { method: "POST" }).then(
				handleResponse,
			),
		resumeScheduler: () =>
			fetch(`${API_BASE}/jobs/scheduler/resume`, { method: "POST" }).then(
				handleResponse,
			),
	},
	stats: {
		get: () => fetch(`${API_BASE}/stats`).then(handleResponse),
	},
};
