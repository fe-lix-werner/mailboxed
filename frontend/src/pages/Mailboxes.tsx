import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Plus, RefreshCcw, Settings, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Mailboxes() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { data: mailboxes, isLoading } = useQuery({
		queryKey: ["mailboxes"],
		queryFn: api.mailboxes.list,
	});

	const deleteMutation = useMutation({
		mutationFn: api.mailboxes.delete,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mailboxes"] }),
	});

	const toggleMutation = useMutation({
		mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
			api.mailboxes.update(id, { enabled }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mailboxes"] }),
	});

	if (isLoading)
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="flex flex-col items-center gap-4">
					<RefreshCcw className="animate-spin text-primary-500" size={32} />
					<p className="text-slate-500 font-medium">{t("common.loading")}</p>
				</div>
			</div>
		);

	return (
		<div className="p-10 max-w-7xl mx-auto space-y-10">
			<header className="flex justify-between items-end">
				<div>
					<h1 className="text-4xl font-extrabold text-slate-900 tracking-tight dark:text-white">
						{t("mailboxes.title")}
					</h1>
					<p className="text-slate-500 mt-2 text-lg dark:text-slate-400">
						{t("mailboxes.subtitle")}
					</p>
				</div>
				<Link to="/mailboxes/new" className="btn-primary gap-2 h-12 px-6">
					<Plus size={20} />
					{t("mailboxes.addMailbox")}
				</Link>
			</header>

			<div className="grid grid-cols-1 gap-6">
				{mailboxes?.map((mailbox: any) => (
					<div
						key={mailbox.id}
						onClick={() => navigate(`/mailboxes/${mailbox.id}`)}
						className="cursor-pointer card group p-8 flex flex-col md:flex-row md:items-center justify-between gap-8"
					>
						<div className="flex items-center gap-6">
							<div
								className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
									mailbox.enabled
										? "bg-primary-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white group-hover:rotate-3 group-hover:shadow-lg group-hover:shadow-primary-200 dark:bg-primary-950/30 dark:text-primary-400 dark:group-hover:bg-primary-500 dark:group-hover:shadow-primary-900/40"
										: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
								}`}
							>
								<Settings size={32} />
							</div>
							<div>
								<h3 className="font-bold text-2xl text-slate-900 dark:text-white">
									{mailbox.name}
								</h3>
								<div className="flex items-center gap-4 mt-1">
									<span className="text-sm font-medium text-slate-500 flex items-center gap-1.5 dark:text-slate-400">
										<span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
										{mailbox.username}
									</span>
									<span className="text-sm font-medium text-slate-400 flex items-center gap-1.5 dark:text-slate-500">
										<span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
										{mailbox.host}:{mailbox.port}
									</span>
								</div>
							</div>
						</div>

						<div className="flex items-center gap-4">
							<div className="flex flex-col items-end mr-6">
								<span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 dark:text-slate-500">
									{t("common.status")}
								</span>
								<span
									className={`text-sm font-bold ${mailbox.enabled ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-600"}`}
								>
									{mailbox.enabled
										? t("mailboxes.active")
										: t("mailboxes.paused")}
								</span>
							</div>

							<div className="flex items-center gap-2">
								<button
									onClick={(e) => {
										e.stopPropagation();
										toggleMutation.mutate({
											id: mailbox.id,
											enabled: !mailbox.enabled,
										});
									}}
									className={`btn w-11 h-11 p-0 border rounded-xl transition-all duration-300 ${
										mailbox.enabled
											? "bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white dark:bg-amber-950/30 dark:border-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-600"
											: "bg-green-50 border-green-100 text-green-600 hover:bg-green-600 hover:text-white dark:bg-green-950/30 dark:border-green-900/30 dark:text-green-400 dark:hover:bg-green-600"
									}`}
									title={
										mailbox.enabled ? t("common.pause") : t("common.resume")
									}
								>
									{mailbox.enabled ? (
										<Pause size={20} fill="currentColor" />
									) : (
										<Play size={20} fill="currentColor" />
									)}
								</button>

								<Link
									to={`/mailboxes/${mailbox.id}`}
									onClick={(e) => e.stopPropagation()}
									className="btn-secondary w-11 h-11 p-0 rounded-xl hover:border-primary-200 hover:text-primary-600 transition-all duration-300 dark:hover:border-primary-500 dark:hover:text-primary-400"
									title={t("common.edit")}
								>
									<Settings size={20} />
								</Link>

								<button
									onClick={(e) => {
										e.stopPropagation();
										if (confirm(t("common.confirmDelete"))) {
											deleteMutation.mutate(mailbox.id);
										}
									}}
									className="btn-danger w-11 h-11 p-0 rounded-xl hover:bg-red-600 hover:text-white transition-all duration-300 dark:hover:bg-red-600"
									title={t("common.delete")}
								>
									<Trash2 size={20} />
								</button>
							</div>
						</div>
					</div>
				))}

				{mailboxes?.length === 0 && (
					<div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center dark:bg-slate-900 dark:border-slate-800">
						<div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 dark:bg-slate-800">
							<Settings
								size={40}
								className="text-slate-200 dark:text-slate-700"
							/>
						</div>
						<h3 className="text-2xl font-bold text-slate-900 dark:text-white">
							{t("mailboxes.noMailboxes")}
						</h3>
						<p className="text-slate-500 mb-8 max-w-sm dark:text-slate-400">
							{t("mailboxes.connectFirst")}
						</p>
						<Link
							to="/mailboxes/new"
							className="btn-primary px-8 py-3 rounded-xl gap-2 shadow-lg shadow-primary-100 dark:shadow-none"
						>
							<Plus size={20} />
							{t("mailboxes.connectMailbox")}
						</Link>
					</div>
				)}
			</div>
		</div>
	);
}
