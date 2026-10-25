import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const multiplayer = service("multiplayer", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "server/multiplayer/Dockerfile" },
    healthcheck: "/health",
    healthcheckTimeout: 60,
    replicas: { "europe-west4-drams3a": 1 },
    deploy: {
      drainingSeconds: 5,
      limitOverride: { containers: { cpu: 1, memoryBytes: 500000000 } },
      overlapSeconds: 0,
      // Railway stores its ON_FAILURE default and disabled sleep as null.
      restartPolicyMaxRetries: 3,
      sleepApplication: null,
    },
    env: { ALLOWED_ORIGINS: "http://localhost:3000", NODE_ENV: "production", PORT: "8080", TRUST_RAILWAY_PROXY: "true" },
  });

  return project("speedroller-multiplayer", {
    resources: [multiplayer],
  });
});
