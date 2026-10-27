import process from "node:process";

// ruleid: tls-verification-disabled
const insecure = { rejectUnauthorized: false };
// ruleid: tls-verification-disabled
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// ok: tls-verification-disabled
const verified = { rejectUnauthorized: true };
// ok: tls-verification-disabled
const defaultVerified = { hostname: "example.com" };
