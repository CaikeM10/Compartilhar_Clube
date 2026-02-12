/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    allowedDevOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.3.90:3000",
    ],
  },
};

module.exports = nextConfig;
