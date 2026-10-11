export const config = {
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  },
  workerUrl: ((import.meta.env.VITE_WORKER_URL as string | undefined) ?? "").replace(/\/+$/, ""),
};

export const isConfigured = Boolean(config.firebase.apiKey && config.firebase.projectId && config.workerUrl);
