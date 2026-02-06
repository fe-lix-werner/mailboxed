import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
	const [theme, setTheme] = useState<Theme>(() => {
		const saved = localStorage.getItem("theme") as Theme;
		return saved || "system";
	});

	useEffect(() => {
		const root = window.document.documentElement;

		const applyTheme = (t: Theme) => {
			let effectiveTheme = t;
			if (t === "system") {
				effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)")
					.matches
					? "dark"
					: "light";
			}

			root.classList.remove("light", "dark");
			root.classList.add(effectiveTheme);

			if (t === "system") {
				localStorage.removeItem("theme");
			} else {
				localStorage.setItem("theme", t);
			}
		};

		applyTheme(theme);

		if (theme === "system") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			const handleChange = () => applyTheme("system");
			mediaQuery.addEventListener("change", handleChange);
			return () => mediaQuery.removeEventListener("change", handleChange);
		}
	}, [theme]);

	return { theme, setTheme };
}
