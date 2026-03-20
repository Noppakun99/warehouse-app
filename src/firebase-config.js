import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project-id",
  appId: "1:..."
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);