import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	children: ReactNode;
	footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
			<div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in duration-200">
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
					<h3 className="text-lg font-bold text-slate-900 dark:text-white">
						{title}
					</h3>
					<button
						onClick={onClose}
						className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
					>
						<X size={20} />
					</button>
				</div>
				<div className="p-6 text-slate-600 dark:text-slate-400">
					{children}
				</div>
				{footer && (
					<div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
