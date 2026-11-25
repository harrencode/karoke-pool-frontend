import { networkInterfaces } from "node:os";

// Allow this computer's LAN addresses without trusting arbitrary web origins.
const localAddresses = process.env.NODE_ENV === "development" ? Object.values(networkInterfaces()).flatMap(entries =>
  (entries || []).filter(entry => entry.family === "IPv4").map(entry => entry.address)
) : [];

export default {
  // Vercel uses its native Next.js build; Docker keeps its standalone server.
  ...(process.env.VERCEL === "1" ? {} : { output: "standalone" }),
  poweredByHeader: false,
  allowedDevOrigins: [...new Set(localAddresses)],
};
