import { Modal } from "./Modal";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "danger" | "primary";
}

export function ConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	message,
	confirmText,
	cancelText,
	variant = "primary",
}: ConfirmationModalProps) {
	const { t } = useTranslation();

	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	const footer = (
		<>
			<button
				onClick={onClose}
				className="px-4 py-2 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
			>
				{cancelText || t("common.cancel")}
			</button>
			<button
				onClick={handleConfirm}
				className={`px-4 py-2 rounded-xl font-bold text-sm text-white transition-colors ${
					variant === "danger"
						? "bg-red-600 hover:bg-red-700"
						: "bg-primary-600 hover:bg-primary-700"
				}`}
			>
				{confirmText || t("common.confirm")}
			</button>
		</>
	);

	return (
		<Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
			<div className="flex items-start gap-4">
				{variant === "danger" && (
					<div className="p-2 bg-red-100 text-red-600 rounded-lg dark:bg-red-900/30 dark:text-red-400 shrink-0">
						<AlertTriangle size={24} />
					</div>
				)}
				<p className="text-slate-600 dark:text-slate-400 leading-relaxed">
					{message}
				</p>
			</div>
		</Modal>
	);
}
