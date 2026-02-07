import pino from "pino";
import pinoPretty from "pino-pretty";

const isProduction = process.env.NODE_ENV === "production";
const usePretty = process.env.LOG_PRETTY === "true" || !isProduction;

export const logger = usePretty
	? pino(
			{
				level: process.env.LOG_LEVEL || "info",
			},
			pinoPretty({
				colorize: true,
			}),
		)
	: pino({
			level: process.env.LOG_LEVEL || "info",
		});
