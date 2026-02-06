import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, LogIn, Mail, RefreshCcw } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Login() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { register, handleSubmit } = useForm();

	const mutation = useMutation({
		mutationFn: api.auth.login,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["me"] });
			navigate("/");
		},
	});

	const onSubmit = (data: any) => {
		mutation.mutate(data);
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 dark:bg-slate-950 transition-colors duration-200">
			<div className="max-w-md w-full">
				<div className="text-center mb-10">
					<img
						src="/mailboxed.webp"
						alt="Mailboxed Logo"
						className="w-24 h-24 mx-auto mb-6 object-contain"
					/>
					<h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2 dark:text-white">
						Mailboxed
					</h1>
					<p className="text-slate-500 font-medium dark:text-slate-400">
						{t("common.login")}
					</p>
				</div>

				<div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:shadow-none">
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
						<div>
							<label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1 dark:text-slate-400">
								{t("common.email")}
							</label>
							<div className="relative">
								<div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
									<Mail size={18} />
								</div>
								<input
									{...register("email", { required: true })}
									type="email"
									className="input pl-12 h-12"
									placeholder="name@example.com"
								/>
							</div>
						</div>

						<div>
							<label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1 dark:text-slate-400">
								{t("common.password")}
							</label>
							<div className="relative">
								<div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
									<Lock size={18} />
								</div>
								<input
									{...register("password", { required: true })}
									type="password"
									className="input pl-12 h-12"
									placeholder="••••••••"
								/>
							</div>
						</div>

						{mutation.isError && (
							<div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 border border-red-100 dark:bg-red-950/30 dark:border-red-900/30 dark:text-red-400">
								<span className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400" />
								{t("common.loginError")}
							</div>
						)}

						<button
							type="submit"
							disabled={mutation.isPending}
							className="w-full btn-primary h-12 gap-3 text-lg font-bold"
						>
							{mutation.isPending ? (
								<RefreshCcw size={20} className="animate-spin" />
							) : (
								<LogIn size={20} />
							)}
							{t("common.signIn")}
						</button>
					</form>
				</div>

				<p className="text-center mt-8 text-slate-400 text-sm font-medium">
					&copy; {new Date().getFullYear()} Mailboxed
				</p>
			</div>
		</div>
	);
}
