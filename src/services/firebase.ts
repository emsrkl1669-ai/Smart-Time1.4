import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, collection, onSnapshot, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with configured database ID
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

/**
 * Validate Connection to Firestore (Per skill requirement: call getDocFromServer)
 */
export async function testFirestoreConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, '_health', 'status'));
    return { success: true };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline or connection issue. Please check network/config.');
    }
    return {
      success: false,
      error: error?.message || 'Connection test failed',
    };
  }
}

export { firebaseConfig };
