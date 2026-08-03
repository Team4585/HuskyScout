export const handler = async (event, context) => {
  try {
    const config = {
      apiKey: process.env.PROCESS_API_KEYS,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.VITE_FIREBASE_APP_ID,
      hasTbaKey: !!process.env.PROCESS_TBA_AUTH_KEY
    };
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};