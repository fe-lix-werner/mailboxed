import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const usePretty = process.env.LOG_PRETTY === "true" || !isProduction;

export const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	transport: usePretty
		? {
				target: "pino-pretty",
				options: {
					colorize: true,
				},
			}
		: undefined,
});
