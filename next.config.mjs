/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The login email attaches public/guides/getting-started.pdf by reading it
  // off the function's own filesystem (lib/mail-guide.ts). File tracing can't
  // see that read statically, so name it — without this the file is absent
  // from the serverless bundle and the first live trial went out guideless.
  outputFileTracingIncludes: {
    "/api/admin/logins": ["./public/guides/**"],
  },
};
export default nextConfig;
