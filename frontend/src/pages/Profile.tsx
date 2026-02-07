import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Mail, Shield, User } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export default function Profile({ userEmail }: { userEmail: string }) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [email, setEmail] = useState(userEmail);
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [message, setMessage] = useState<{
		text: string;
		type: "success" | "error";
	} | null>(null);

	const updateMutation = useMutation({
		mutationFn: api.auth.updateProfile,
		onSuccess: (data) => {
			setMessage({ text: t("profile.updateSuccess"), type: "success" });
			queryClient.setQueryData(["me"], { email: data.email });
			setPassword("");
			setConfirmPassword("");
		},
		onError: (error: Error) => {
			setMessage({
				text: `${t("profile.updateError")}: ${error.message}`,
				type: "error",
			});
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setMessage(null);

		if (password && password !== confirmPassword) {
			setMessage({ text: t("profile.passwordMismatch"), type: "error" });
			return;
		}

		const updates: any = {};
		if (email !== userEmail) updates.email = email;
		if (password) updates.password = password;

		if (Object.keys(updates).length === 0) return;

		updateMutation.mutate(updates);
	};

	return (
		<div className="max-w-4xl mx-auto p-8">
			<header className="mb-12">
				<h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
					{t("profile.title")}
				</h1>
				<p className="text-lg text-slate-500 dark:text-slate-400">
					{t("profile.subtitle")}
				</p>
			</header>

			<div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900 dark:border-slate-800">
				<form onSubmit={handleSubmit} className="p-8 space-y-8">
					{message && (
						<div
							className={`p-4 rounded-xl flex items-center gap-3 ${
								message.type === "success"
									? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
									: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
							}`}
						>
							{message.type === "success" && <Check size={20} />}
							{message.text}
						</div>
					)}

					<div className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-2">
								<label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
									<Mail size={16} />
									{t("common.email")}
								</label>
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all dark:bg-slate-800 dark:border-slate-700"
								/>
							</div>
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-2">
								<label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
									<Shield size={16} />
									{t("profile.newPassword")}
								</label>
								<input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder={t("editor.passwordPlaceholder")}
									className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all dark:bg-slate-800 dark:border-slate-700"
								/>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
									<Shield size={16} />
									{t("profile.confirmPassword")}
								</label>
								<input
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder={t("editor.passwordPlaceholder")}
									className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all dark:bg-slate-800 dark:border-slate-700"
								/>
							</div>
						</div>
					</div>

					<div className="pt-4 flex justify-end">
						<button
							type="submit"
							disabled={updateMutation.isPending}
							className="px-8 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						>
							{updateMutation.isPending ? t("common.loading") : t("common.save")}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
