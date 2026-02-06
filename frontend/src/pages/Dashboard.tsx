import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	CheckCircle,
	Clock,
	FileText,
	HardDrive,
	History,
	Pause,
	Play,
	RefreshCcw,
	ShieldCheck,
	SkipForward,
	Square,
	XCircle,
	Zap,
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "../api/client";
import { formatSize } from "../lib/format";

const CHART_COLORS = [
	"#3b82f6",
	"#8b5cf6",
	"#10b981",
	"#f59e0b",
	"#ef4444",
	"#6366f1",
];

const HistoryChart = React.memo(({ data, t }: { data: any[]; t: any }) => (
	<ResponsiveContainer width="100%" height="100%">
		<AreaChart data={data}>
			<defs>
				<linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
					<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
					<stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
				</linearGradient>
			</defs>
			<CartesianGrid
				strokeDasharray="3 3"
				vertical={false}
				stroke="currentColor"
				className="text-slate-100 dark:text-slate-800"
			/>
			<XAxis
				dataKey="date"
				axisLine={false}
				tickLine={false}
				tick={{ fill: "#94a3b8", fontSize: 10 }}
				tickFormatter={(str) => {
					const date = new Date(str);
					return date.toLocaleDateString(undefined, {
						day: "numeric",
						month: "short",
					});
				}}
				minTickGap={30}
			/>
			<YAxis
				axisLine={false}
				tickLine={false}
				tick={{ fill: "#94a3b8", fontSize: 10 }}
				label={{
					value: t("dashboard.stats.totalFiles"),
					angle: -90,
					position: "insideLeft",
					style: { fill: "#94a3b8", fontSize: 10, fontWeight: "bold" },
				}}
			/>
			<Tooltip
				contentStyle={{
					borderRadius: "12px",
					border: "none",
					boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
					fontSize: "12px",
					fontWeight: "600",
				}}
			/>
			<Area
				type="monotone"
				dataKey="count"
				stroke="#3b82f6"
				strokeWidth={3}
				fillOpacity={1}
				fill="url(#colorCount)"
				isAnimationActive={true}
				animationDuration={1000}
			/>
		</AreaChart>
	</ResponsiveContainer>
));

const MimeChart = React.memo(({ data, t }: { data: any[]; t: any }) => (
	<ResponsiveContainer width="100%" height="100%">
		<PieChart>
			<Pie
				data={data}
				cx="50%"
				cy="50%"
				innerRadius={60}
				outerRadius={80}
				paddingAngle={5}
				dataKey="value"
				isAnimationActive={true}
				animationDuration={800}
			>
				{data.map((_entry: any, index: number) => (
					<Cell
						key={`cell-${index}`}
						fill={CHART_COLORS[index % CHART_COLORS.length]}
					/>
				))}
			</Pie>
			<Tooltip
				formatter={
					((value: any, name: any) => [
						value,
						t(`dashboard.mime.${String(name)}`, { defaultValue: String(name) }),
					]) as any
				}
				contentStyle={{
					borderRadius: "12px",
					border: "none",
					boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
					fontSize: "12px",
					fontWeight: "600",
				}}
			/>
			<Legend
				iconType="circle"
				wrapperStyle={{
					fontSize: "10px",
					fontWeight: "bold",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
				}}
			/>
		</PieChart>
	</ResponsiveContainer>
));

const JobControlTile = ({ t }: { t: any }) => {
	const { data: runningJobs, refetch: refetchJobs } = useQuery({
		queryKey: ["jobs", { status: "running" }],
		queryFn: () => api.jobs.list({ status: "running" }),
		refetchInterval: 2000,
	});

	const { data: schedulerStatus, refetch: refetchScheduler } = useQuery({
		queryKey: ["scheduler-status"],
		queryFn: api.jobs.schedulerStatus,
		refetchInterval: 5000,
	});

	const abortMutation = useMutation({
		mutationFn: api.jobs.abortAll,
		onSuccess: () => refetchJobs(),
	});

	const restartMutation = useMutation({
		mutationFn: api.jobs.restartAll,
		onSuccess: () => refetchJobs(),
	});

	const toggleSchedulerMutation = useMutation({
		mutationFn: () =>
			schedulerStatus?.paused
				? api.jobs.resumeScheduler()
				: api.jobs.pauseScheduler(),
		onSuccess: () => refetchScheduler(),
	});

	const activeJobs =
		runningJobs?.filter((j: any) => j.status === "running") || [];

	return (
		<div className="card p-6 flex flex-col h-full">
			<div className="flex justify-between items-start mb-6">
				<div>
					<h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 dark:text-white">
						<Zap size={20} className="text-primary-500 dark:text-primary-400" />
						{t("dashboard.jobsControl.title")}
					</h3>
					<p className="text-xs text-slate-500 font-medium dark:text-slate-400">
						{t("dashboard.jobsControl.subtitle")}
					</p>
				</div>
				{schedulerStatus?.paused && (
					<span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wider dark:bg-amber-950/30 dark:text-amber-400">
						{t("dashboard.jobsControl.schedulerPaused")}
					</span>
				)}
			</div>

			<div className="flex flex-wrap gap-2 mb-8">
				<button
					onClick={() => restartMutation.mutate()}
					disabled={restartMutation.isPending}
					className="flex-1 btn bg-primary-50 text-primary-600 border-primary-100 hover:bg-primary-600 hover:text-white transition-all duration-300 font-bold text-xs py-2.5 gap-2 rounded-xl dark:bg-primary-950/30 dark:text-primary-400 dark:border-primary-900/30 dark:hover:bg-primary-600 dark:hover:text-white"
				>
					<SkipForward size={16} />
					{t("dashboard.jobsControl.restartAll")}
				</button>
				<button
					onClick={() => toggleSchedulerMutation.mutate()}
					className={`flex-1 btn transition-all duration-300 font-bold text-xs py-2.5 gap-2 rounded-xl ${
						schedulerStatus?.paused
							? "bg-green-50 text-green-600 border-green-100 hover:bg-green-600 hover:text-white dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/30 dark:hover:bg-green-600"
							: "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-600 hover:text-white dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30 dark:hover:bg-amber-600"
					}`}
				>
					{schedulerStatus?.paused ? <Play size={16} /> : <Pause size={16} />}
					{schedulerStatus?.paused
						? t("dashboard.jobsControl.resumeScheduler")
						: t("dashboard.jobsControl.pauseScheduler")}
				</button>
				<button
					onClick={() => {
						if (confirm(t("common.confirmDelete"))) {
							abortMutation.mutate();
						}
					}}
					disabled={activeJobs.length === 0 || abortMutation.isPending}
					className="w-full btn bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white transition-all duration-300 font-bold text-xs py-2.5 gap-2 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30 dark:hover:bg-red-600 dark:hover:text-white"
				>
					<Square size={16} fill="currentColor" />
					{t("dashboard.jobsControl.abortAll")} ({activeJobs.length})
				</button>
			</div>

			<div className="flex-1 overflow-auto">
				<h4 className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 mb-3">
					{t("dashboard.jobsControl.runningJobs")}
				</h4>
				{activeJobs.length > 0 ? (
					<div className="space-y-3">
						{activeJobs.map((job: any) => (
							<div
								key={job.id}
								className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 dark:bg-slate-800/50 dark:border-slate-800"
							>
								<div className="flex items-center gap-3">
									<div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
									<div>
										<div className="text-sm font-bold text-slate-800 line-clamp-1 dark:text-slate-200">
											{job.mailboxName}
										</div>
										<div className="text-[10px] text-slate-400 font-bold uppercase dark:text-slate-500">
											{job.trigger} •{" "}
											{formatDistanceToNow(new Date(job.startedAt))} ago
										</div>
									</div>
								</div>
								<RefreshCcw
									size={14}
									className="text-slate-300 animate-spin dark:text-slate-600"
								/>
							</div>
						))}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 dark:bg-slate-800/30 dark:border-slate-700">
						<Clock
							size={24}
							className="text-slate-300 mb-2 dark:text-slate-600"
						/>
						<p className="text-xs text-slate-400 font-medium dark:text-slate-500">
							{t("dashboard.jobsControl.noRunningJobs")}
						</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default function Dashboard() {
	const { t } = useTranslation();
	const { data: mailboxes, isLoading: mailboxesLoading } = useQuery({
		queryKey: ["mailboxes"],
		queryFn: api.mailboxes.list,
		refetchInterval: 1000,
	});

	const { data: stats, isLoading: statsLoading } = useQuery({
		queryKey: ["stats"],
		queryFn: api.stats.get,
		refetchInterval: 10000,
	});

	const { data: recentJobs, isLoading: jobsLoading } = useQuery({
		queryKey: ["jobs", { limit: 5 }],
		queryFn: () => api.jobs.list({ limit: 5 }),
		refetchInterval: 5000,
	});

	const syncMutation = useMutation({
		mutationFn: api.mailboxes.sync,
		onSuccess: () => {
			// Invalidate queries to refresh status
		},
	});

	const [now, setNow] = React.useState(Date.now());
	React.useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	if (mailboxesLoading || jobsLoading || statsLoading)
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="flex flex-col items-center gap-4">
					<RefreshCcw className="animate-spin text-primary-500" size={32} />
					<p className="text-slate-500 font-medium">{t("common.loading")}</p>
				</div>
			</div>
		);

	const formatInterval = (sec: number) => {
		if (sec < 60) return `${sec}s`;
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return s ? `${m}m ${s}s` : `${m}m`;
	};

	const formatRemaining = (nextRun?: string | Date | null) => {
		if (!nextRun) return "-";
		const ts =
			typeof nextRun === "string"
				? new Date(nextRun).getTime()
				: nextRun.getTime();
		const diff = Math.max(0, ts - now);
		const totalSec = Math.round(diff / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
	};

	return (
		<div className="p-10 max-w-7xl mx-auto space-y-12">
			<header>
				<h1 className="text-4xl font-extrabold text-slate-900 tracking-tight dark:text-white">
					{t("dashboard.title")}
				</h1>
				<p className="text-slate-500 mt-2 text-lg dark:text-slate-400">
					{t("dashboard.subtitle")}
				</p>
			</header>

			{/* Stats Overview */}
			<section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				<div className="card p-6 flex items-center gap-5">
					<div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm dark:bg-blue-950/30 dark:text-blue-400">
						<FileText size={24} />
					</div>
					<div>
						<span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5 dark:text-slate-500">
							{t("dashboard.stats.totalFiles")}
						</span>
						<span className="text-2xl font-black text-slate-900 dark:text-white">
							{stats?.totalFiles || 0}
						</span>
					</div>
				</div>
				<div className="card p-6 flex items-center gap-5">
					<div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm dark:bg-purple-950/30 dark:text-purple-400">
						<HardDrive size={24} />
					</div>
					<div>
						<span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5 dark:text-slate-500">
							{t("dashboard.stats.totalSize")}
						</span>
						<span className="text-2xl font-black text-slate-900 dark:text-white">
							{formatSize(stats?.totalSize || 0)}
						</span>
					</div>
				</div>
				<div className="card p-6 flex items-center gap-5">
					<div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shadow-sm dark:bg-green-950/30 dark:text-green-400">
						<ShieldCheck size={24} />
					</div>
					<div>
						<span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5 dark:text-slate-500">
							{t("dashboard.stats.successRate")}
						</span>
						<span className="text-2xl font-black text-slate-900 dark:text-white">
							{stats?.successRate || 0}%
						</span>
					</div>
				</div>
				<div className="card p-6 flex items-center gap-5">
					<div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-sm dark:bg-amber-950/30 dark:text-amber-400">
						<Zap size={24} />
					</div>
					<div>
						<span className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-0.5 dark:text-slate-500">
							{t("dashboard.stats.activeMailboxes")}
						</span>
						<span className="text-2xl font-black text-slate-900 dark:text-white">
							{stats?.activeMailboxes || 0} / {stats?.mailboxCount || 0}
						</span>
					</div>
				</div>
			</section>

			{/* Charts Section */}
			<section className="space-y-8">
				<div className="card p-8">
					<div className="flex items-center justify-between mb-8">
						<div>
							<h2 className="text-xl font-bold text-slate-900 dark:text-white">
								{t("dashboard.stats.history")}
							</h2>
							<p className="text-sm text-slate-500 dark:text-slate-400">
								{t("dashboard.historySubtitle")}
							</p>
						</div>
						<div className="p-2 bg-blue-50 text-blue-600 rounded-lg dark:bg-blue-900/30 dark:text-blue-400">
							<History size={20} />
						</div>
					</div>
					<div className="h-[300px] w-full">
						<HistoryChart data={stats?.history || []} t={t} />
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					<div className="card p-8">
						<div className="flex items-center justify-between mb-8">
							<div>
								<h2 className="text-xl font-bold text-slate-900 dark:text-white">
									{t("dashboard.stats.mimeBreakdown")}
								</h2>
								<p className="text-sm text-slate-500 dark:text-slate-400">
									{t("dashboard.mimeSubtitle")}
								</p>
							</div>
							<div className="p-2 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-950/30 dark:text-purple-400">
								<FileText size={20} />
							</div>
						</div>
						<div className="h-[300px] w-full">
							<MimeChart data={stats?.mimeBreakdown || []} t={t} />
						</div>
					</div>

					<JobControlTile t={t} />
				</div>
			</section>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				{mailboxes?.map((mailbox: any) => (
					<div key={mailbox.id} className="card group relative">
						<Link
							to={`/mailboxes/${mailbox.id}`}
							className="absolute inset-0 z-0"
							aria-label={t("common.edit")}
						/>
						<div className="p-8 relative z-10 pointer-events-none">
							<div className="flex justify-between items-start mb-6">
								<div>
									<h3 className="font-bold text-xl text-slate-900 group-hover:text-primary-600 transition-colors dark:text-white dark:group-hover:text-primary-400">
										{mailbox.name}
									</h3>
									<p className="text-sm text-slate-500 mt-0.5 dark:text-slate-400">
										{mailbox.username}
									</p>
								</div>
								<span
									className={`badge ${mailbox.enabled ? "bg-green-50 text-green-700 border border-green-100 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/30" : "bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"}`}
								>
									{mailbox.enabled ? t("common.enabled") : t("common.disabled")}
								</span>
							</div>

							<div className="grid grid-cols-2 gap-4 mb-8">
								<div className="p-3 bg-slate-50 rounded-xl dark:bg-slate-800/50">
									<span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 dark:text-slate-500">
										{t("dashboard.pollInterval")}
									</span>
									<span className="text-slate-900 font-semibold dark:text-slate-200">
										{formatInterval(mailbox.pollIntervalSec)}
									</span>
								</div>
								<div className="p-3 bg-slate-50 rounded-xl dark:bg-slate-800/50">
									<span className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 dark:text-slate-500">
										{t("dashboard.nextSync")}
									</span>
									<span className="text-slate-900 font-semibold dark:text-slate-200">
										{formatRemaining(mailbox.nextRun)}
									</span>
								</div>
							</div>

							<button
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									syncMutation.mutate(mailbox.id);
								}}
								disabled={syncMutation.isPending}
								className="w-full btn-primary py-3 gap-3 cursor-pointer pointer-events-auto"
							>
								{syncMutation.isPending ? (
									<RefreshCcw size={18} className="animate-spin" />
								) : (
									<Play size={18} fill="currentColor" />
								)}
								{t("common.syncNow")}
							</button>
						</div>
					</div>
				))}

				<Link
					to="/mailboxes/new"
					className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/30 transition-all duration-300 group text-center dark:border-slate-800 dark:hover:border-primary-600 dark:hover:bg-primary-950/20"
				>
					<div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary-100 transition-all dark:bg-slate-800 dark:group-hover:bg-primary-900/50">
						<span className="text-2xl">+</span>
					</div>
					<span className="font-bold">{t("dashboard.addMailbox")}</span>
				</Link>
			</div>

			{/* Recent Downloads */}
			<section className="space-y-6">
				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-bold text-slate-900 dark:text-white">
						{t("dashboard.recentDownloads")}
					</h2>
					<Link
						to="/downloads"
						className="text-primary-600 hover:text-primary-700 font-medium text-sm dark:text-primary-400 dark:hover:text-primary-300"
					>
						{t("common.viewAll") || "View all"}
					</Link>
				</div>
				<div className="card">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("downloads.file")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("downloads.mailbox")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("downloads.size")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("downloads.savedAt")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right dark:text-slate-500">
										{t("downloads.actions")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-50 dark:divide-slate-800">
								{stats?.lastDownloads?.map((d: any) => {
									const m = (mailboxes || []).find(
										(mb: any) => mb.id === d.mailboxId,
									);
									const mailboxLabel = m?.name || d.mailboxId;
									return (
										<tr
											key={d.id}
											className="hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/30"
										>
											<td className="px-8 py-5 text-sm text-slate-900 font-medium">
												<div className="flex flex-col">
													<span className="font-semibold text-slate-900 dark:text-slate-200">
														{d.filename}
													</span>
													{d.subject && (
														<span className="text-xs text-slate-500 truncate max-w-[380px] dark:text-slate-400">
															{d.subject}
														</span>
													)}
													{d.from && (
														<span className="text-[11px] text-slate-400 dark:text-slate-500">
															{d.from}
														</span>
													)}
												</div>
											</td>
											<td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-400">
												{mailboxLabel}
											</td>
											<td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-400">
												{formatSize(d.size || 0)}
											</td>
											<td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-500">
												{new Date(d.downloadedAt).toLocaleString()}
											</td>
											<td className="px-8 py-5 text-sm text-right">
												<div className="flex items-center justify-end gap-2">
													<a
														href={api.downloads.getContentUrl(d.id)}
														target="_blank"
														rel="noreferrer"
														className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
													>
														{t("common.preview")}
													</a>
													<a
														href={api.downloads.getContentUrl(d.id)}
														download={d.filename}
														className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 dark:bg-primary-950/30 dark:text-primary-400 dark:border-primary-900/30 dark:hover:bg-primary-900/50"
													>
														{t("common.download")}
													</a>
												</div>
											</td>
										</tr>
									);
								})}
								{(stats?.lastDownloads?.length || 0) === 0 && (
									<tr>
										<td
											colSpan={5}
											className="px-8 py-16 text-center text-slate-400 italic font-medium dark:text-slate-600"
										>
											<div className="flex flex-col items-center gap-2">
												<History
													size={40}
													className="text-slate-100 dark:text-slate-800"
												/>
												{t("dashboard.noRecentDownloads")}
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			<section className="space-y-6">
				<h2 className="text-2xl font-bold text-slate-900 dark:text-white">
					{t("dashboard.recentJobs")}
				</h2>
				<div className="card">
					<div className="overflow-x-auto">
						<table className="w-full text-left">
							<thead>
								<tr className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-800/50 dark:border-slate-800">
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("jobs.mailbox")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("jobs.trigger")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("jobs.started")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("jobs.duration")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest dark:text-slate-500">
										{t("jobs.status")}
									</th>
									<th className="px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right dark:text-slate-500">
										{t("jobs.stats")}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-50 dark:divide-slate-800">
								{recentJobs?.map((job: any) => (
									<tr
										key={job.id}
										className="hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/30"
									>
										<td className="px-8 py-5 text-sm text-slate-900 font-bold dark:text-slate-200">
											{job.mailboxName || job.mailboxId}
										</td>
										<td className="px-8 py-5">
											<span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider dark:bg-slate-800 dark:text-slate-400">
												{job.trigger}
											</span>
										</td>
										<td className="px-8 py-5 text-sm text-slate-500 font-medium dark:text-slate-400">
											{formatDistanceToNow(new Date(job.startedAt), {
												addSuffix: true,
											})}
										</td>
										<td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-400">
											{job.finishedAt ? (
												<span className="flex items-center gap-1.5 font-mono">
													<Clock
														size={14}
														className="text-slate-300 dark:text-slate-600"
													/>
													{Math.round(
														(new Date(job.finishedAt).getTime() -
															new Date(job.startedAt).getTime()) /
															1000,
													)}
													s
												</span>
											) : (
												"-"
											)}
										</td>
										<td className="px-8 py-5">
											{job.status === "success" && (
												<div className="flex items-center gap-2 text-green-600 font-bold text-xs dark:text-green-400">
													<CheckCircle size={16} /> {t("jobs.success")}
												</div>
											)}
											{job.status === "failed" && (
												<div
													className="flex items-center gap-2 text-red-600 font-bold text-xs dark:text-red-400"
													title={job.errorText}
												>
													<XCircle size={16} /> {t("jobs.failed")}
												</div>
											)}
											{job.status === "running" && (
												<div className="flex items-center gap-2 text-primary-600 font-bold text-xs dark:text-primary-400">
													<RefreshCcw size={16} className="animate-spin" />{" "}
													{t("jobs.running")}
												</div>
											)}
											{job.status === "pending" && (
												<div className="flex items-center gap-2 text-slate-400 font-bold text-xs dark:text-slate-500">
													<Clock size={16} /> {t("jobs.pending")}
												</div>
											)}
										</td>
										<td className="px-8 py-5 text-sm text-slate-900 text-right font-medium dark:text-slate-200">
											<div className="flex flex-col items-end gap-0.5">
												<span className="text-green-600 dark:text-green-400">
													{job.attachmentCount || 0} {t("jobs.saved")}
												</span>
												{job.statsJson &&
													JSON.parse(job.statsJson).errors > 0 && (
														<span className="text-red-400 text-[10px] dark:text-red-500">
															{JSON.parse(job.statsJson).errors}{" "}
															{t("jobs.errors")}
														</span>
													)}
											</div>
										</td>
									</tr>
								))}
								{recentJobs?.length === 0 && (
									<tr>
										<td
											colSpan={6}
											className="px-8 py-16 text-center text-slate-400 italic font-medium dark:text-slate-600"
										>
											<div className="flex flex-col items-center gap-2">
												<History
													size={40}
													className="text-slate-100 dark:text-slate-800"
												/>
												{t("dashboard.noJobs")}
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>
		</div>
	);
}
