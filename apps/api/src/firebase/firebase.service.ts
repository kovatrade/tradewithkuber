import { Injectable } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { unauthenticated } from '../common/errors';

@Injectable()
export class FirebaseService {
  private get app() {
    const config = env();
    const existing = getApps().find(a => a.name === 'tradedesk');
    if (existing) return existing;
    const credential = config.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
    return initializeApp({ credential, projectId: config.FIREBASE_PROJECT_ID }, 'tradedesk');
  }

  /** Only a fresh SMS sign-in proves ownership; a refreshed/linked ID token does not. */
  async verifyPhone(proof: string, phone: string) {
    if (!proof.startsWith('firebase:') || proof.length > 8192) throw unauthenticated();
    try {
      const token = await getAuth(this.app).verifyIdToken(proof.slice(9), true);
      const age = Date.now() / 1000 - token.auth_time;
      if (token.firebase.sign_in_provider !== 'phone' || token.phone_number !== phone || age < -30 || age > 300) throw unauthenticated();
      // Independent of token refresh: one SMS sign-in can authorize only one operation.
      return createHash('sha256').update(`${token.uid}:${token.auth_time}`).digest('hex');
    } catch { throw unauthenticated(); }
  }

  get messaging() { return getMessaging(this.app); }
}
