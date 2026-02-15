import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Download,
	Languages,
	LayoutDashboard,
	LogOut,
	Menu,
	Monitor,
	Moon,
	RefreshCcw,
	Settings,
	Sun,
	User,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	Link,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from "react-router-dom";
import React, { useState, useEffect } from "react";
import { api } from "./api/client";
import { useTheme } from "./hooks/useTheme";
import Dashboard from "./pages/Dashboard";
import Downloads from "./pages/Downloads";
import Login from "./pages/Login";
import MailboxEditor from "./pages/MailboxEditor";
import Mailboxes from "./pages/Mailboxes";
import Profile from "./pages/Profile";

export default function App() {
	const navigate = useNavigate();
	const location = useLocation();
	const queryClient = useQueryClient();
	const { t, i18n } = useTranslation();
	const { theme, setTheme } = useTheme();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	const {
		data: user,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["me"],
		queryFn: api.auth.me,
		retry: false,
	});

	const logoutMutation = useMutation({
		mutationFn: api.auth.logout,
		onSuccess: () => {
			queryClient.setQueryData(["me"], null);
			navigate("/login");
		},
	});

	if (isLoading)
		return (
			<div className="flex items-center justify-center h-screen bg-slate-50">
				<RefreshCcw className="animate-spin text-primary-500" size={32} />
			</div>
		);

	if (isError || !user) {
		return (
			<Routes>
				<Route path="*" element={<Login />} />
			</Routes>
		);
	}

	const navItems = [
		{ to: "/", icon: LayoutDashboard, label: t("common.dashboard") },
		{ to: "/mailboxes", icon: Settings, label: t("common.mailboxes") },
		{ to: "/downloads", icon: Download, label: t("common.downloads") },
		{ to: "/profile", icon: User, label: t("common.profile") },
	];

	const toggleLanguage = () => {
		i18n.changeLanguage(i18n.language === "de" ? "en" : "de");
	};

	const toggleTheme = () => {
		if (theme === "light") setTheme("dark");
		else if (theme === "dark") setTheme("system");
		else setTheme("light");
	};

	const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

	const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
		<>
			<Link
				to="/"
				className="p-8 flex items-center gap-4"
				onClick={onItemClick}
			>
				<img
					src="/mailboxed.webp"
					alt="Mailboxed Logo"
					className="w-12 h-12 object-contain rotate-10"
				/>
				<span className="font-bold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">
					Mailboxed
				</span>
			</Link>

			<nav className="flex-1 px-4 py-6 space-y-1.5">
				{navItems.map((item) => {
					const isActive =
						location.pathname === item.to ||
						(item.to !== "/" && location.pathname.startsWith(item.to));
					return (
						<Link
							key={item.to}
							to={item.to}
							onClick={onItemClick}
							className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${
								isActive
									? "bg-primary-50 text-primary-700 font-bold dark:bg-primary-950/30 dark:text-primary-400"
									: "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100"
							}`}
						>
							{isActive && (
								<span className="absolute left-0 top-0 bottom-0 w-1 bg-primary-600 rounded-r-full dark:bg-primary-500" />
							)}
							<item.icon
								size={20}
								className={`transition-colors duration-300 ${isActive ? "text-primary-600 dark:text-primary-400" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"}`}
							/>
							{item.label}
						</Link>
					);
				})}
			</nav>

			<div className="p-6 border-t border-slate-100 space-y-2 dark:border-slate-800">
				<button
					onClick={() => {
						toggleTheme();
						onItemClick?.();
					}}
					className="flex items-center gap-3.5 px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-primary-600 rounded-xl w-full transition-all duration-300 group dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-primary-400"
				>
					<ThemeIcon
						size={20}
						className="text-slate-400 group-hover:text-primary-500 transition-colors dark:text-slate-500 dark:group-hover:text-primary-400"
					/>
					<span className="font-semibold capitalize">
						{theme === "system" ? t("common.system") : theme}
					</span>
				</button>
				<button
					onClick={() => {
						toggleLanguage();
						onItemClick?.();
					}}
					className="flex items-center gap-3.5 px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-primary-600 rounded-xl w-full transition-all duration-300 group dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-primary-400"
				>
					<Languages
						size={20}
						className="text-slate-400 group-hover:text-primary-500 transition-colors dark:text-slate-500 dark:group-hover:text-primary-400"
					/>
					<span className="font-semibold">
						{i18n.language.startsWith("de") ? "English" : "Deutsch"}
					</span>
				</button>
				<button
					onClick={() => {
						logoutMutation.mutate();
						onItemClick?.();
					}}
					disabled={logoutMutation.isPending}
					className="flex items-center gap-3.5 px-4 py-3 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl w-full transition-all duration-300 group dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
				>
					<LogOut
						size={20}
						className="text-slate-400 group-hover:text-red-500 transition-colors dark:text-slate-500 dark:group-hover:text-red-400"
					/>
					<span className="font-semibold">{t("common.logout")}</span>
				</button>
			</div>
		</>
	);

	return (
		<div className="flex h-screen bg-slate-50 text-slate-900 font-sans dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
			{/* Mobile Header */}
			<header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-20 dark:bg-slate-900 dark:border-slate-800">
				<Link to="/" className="flex items-center gap-2">
					<img src="/mailboxed.webp" alt="Logo" className="w-8 h-8 object-contain" />
					<span className="font-bold text-lg dark:text-white">Mailboxed</span>
				</Link>
				<button
					onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
					className="p-2 text-slate-500 dark:text-slate-400"
				>
					{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
				</button>
			</header>

			{/* Desktop Sidebar */}
			<aside className="hidden lg:flex w-72 bg-white border-r border-slate-200 flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 dark:bg-slate-900 dark:border-slate-800">
				<SidebarContent />
			</aside>

			{/* Mobile Sidebar Overlay */}
			{isMobileMenuOpen && (
				<div
					className="lg:hidden fixed inset-0 bg-slate-900/50 z-30 backdrop-blur-sm"
					onClick={() => setIsMobileMenuOpen(false)}
				/>
			)}

			{/* Mobile Sidebar Drawer */}
			<aside
				className={`lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-40 transform transition-transform duration-300 ease-in-out dark:bg-slate-900 ${
					isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<SidebarContent onItemClick={() => setIsMobileMenuOpen(false)} />
			</aside>

			{/* Main Content */}
			<main className="flex-1 overflow-auto bg-slate-50/50 relative dark:bg-slate-950/50 pt-16 lg:pt-0">
				<div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary-50/50 to-transparent pointer-events-none dark:from-primary-900/10" />
				<div className="relative">
					<Routes>
						<Route path="/" element={<Dashboard />} />
						<Route path="/mailboxes" element={<Mailboxes />} />
						<Route path="/mailboxes/new" element={<MailboxEditor />} />
						<Route path="/mailboxes/:id" element={<MailboxEditor />} />
						<Route path="/downloads" element={<Downloads />} />
						<Route
							path="/profile"
							element={<Profile userEmail={user.email} />}
						/>
					</Routes>
				</div>
			</main>
		</div>
	);
}
