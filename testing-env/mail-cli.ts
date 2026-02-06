import { parseArgs } from "util";
import { execSync } from "child_process";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    to: { type: "string", short: "t" },
    subject: { type: "string", short: "s" },
    body: { type: "string", short: "b" },
    attach: { type: "string", short: "a", multiple: true },
    init: { type: "boolean" },
    up: { type: "boolean" },
    down: { type: "boolean" },
  },
  allowPositionals: true,
});

const usage = `
Usage: bun mail-cli.ts [options]

Options:
  --init          Initialize the mail server (create user test@example.com)
  --up            Start the mail server
  --down          Stop the mail server
  -t, --to        Recipient email address
  -s, --subject   Email subject
  -b, --body      Email body
  -a, --attach    Path to attachment (can be used multiple times)
  -h, --help      Show this help
`;

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const ENV_DIR = import.meta.dir;

if (values.up) {
  console.log("Starting mail server...");
  execSync("docker-compose up -d", { cwd: ENV_DIR, stdio: "inherit" });
  process.exit(0);
}

if (values.down) {
  console.log("Stopping mail server...");
  execSync("docker-compose down", { cwd: ENV_DIR, stdio: "inherit" });
  process.exit(0);
}

if (values.init) {
  console.log("Initializing user test@example.com with password 'password'...");
  try {
    execSync("docker exec -it mailserver setup email add test@example.com password", { stdio: "inherit" });
  } catch (e) {
    console.log("Note: If 'setup' command failed, it might be because the container is still starting or user already exists.");
  }
  process.exit(0);
}

async function sendMail() {
  const to = values.to || "test@example.com";
  const subject = values.subject || "Test Email";
  const body = values.body || "This is a test email sent from the mailboxed testing-env CLI.";
  const attachments = (values.attach || []).map((p: string) => ({
    filename: path.basename(p),
    path: path.resolve(p),
  }));

  const transporter = nodemailer.createTransport({
    host: "localhost",
    port: 10587,
    secure: false,
    auth: {
      user: "test@example.com",
      pass: "password",
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  console.log(`Sending email to ${to}...`);
  try {
    const info = await transporter.sendMail({
      from: '"Test User" <test@example.com>',
      to,
      subject,
      text: body,
      attachments,
    });
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

if (values.to || values.subject || values.body || values.attach) {
  sendMail();
} else if (!values.up && !values.down && !values.init) {
  console.log(usage);
}
