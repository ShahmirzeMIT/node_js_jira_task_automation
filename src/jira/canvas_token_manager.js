// jira/canvas_token_manager.js
import axios from 'axios';
import { db } from '../../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

// How much earlier than the real expiry we treat the token as "expired",
// so we refresh proactively instead of hitting a 401 mid-request.
const EXPIRY_BUFFER_MS = 60 * 1000; // 60 seconds

// Atlassian uses rotating refresh tokens: if two requests try to refresh
// the same account's token at the same time, the second call's refresh
// token is already invalidated by the first one and fails with
// invalid_grant. We dedupe concurrent refreshes per accountId with an
// in-flight promise map so only one actual HTTP call happens at a time.
const inFlightRefreshes = new Map();

/**
 * Calls Atlassian's token endpoint with grant_type=refresh_token and
 * persists the new access_token + refresh_token + expiry to Firestore.
 *
 * @param {string} accountId - Jira accountId, used as the Firestore doc id.
 * @returns {Promise<{accessToken: string, expiresAt: string}>}
 */
async function refreshAccessToken(accountId) {
  if (inFlightRefreshes.has(accountId)) {
    return inFlightRefreshes.get(accountId);
  }

  const refreshPromise = (async () => {
    const jiraUserRef = db.collection('jira_users').doc(accountId);
    const doc = await jiraUserRef.get();

    if (!doc.exists) {
      throw new Error(`No stored Jira connection for accountId ${accountId}`);
    }

    const data = doc.data();

    if (!data.refreshToken) {
      throw new Error(`No refresh token stored for accountId ${accountId}`);
    }

    if (data.isActive === false) {
      throw new Error(`Jira connection for accountId ${accountId} is disconnected`);
    }

    console.log(`🔄 Refreshing Jira access token for ${accountId}...`);

    let response;
    try {
      response = await axios.post(
        'https://auth.atlassian.com/oauth/token',
        {
          grant_type: 'refresh_token',
          client_id: process.env.JIRA_CLIENT_ID,
          client_secret: process.env.JIRA_CLIENT_SECRET,
          refresh_token: data.refreshToken,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
    } catch (error) {
      const atlassianError = error.response?.data?.error;

      // invalid_grant means the refresh token is dead (expired, already
      // rotated, revoked, or the user's Atlassian password changed).
      // There is no recovery from this except sending the user through
      // the full /auth/jira authorization flow again.
      if (atlassianError === 'invalid_grant') {
        await jiraUserRef.set(
          {
            isActive: false,
            needsReauth: true,
            lastRefreshError: 'invalid_grant',
            lastUpdated: new Date().toISOString(),
            _updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      throw error;
    }

    const {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: expiresIn,
      scope,
    } = response.data;

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await jiraUserRef.set(
      {
        accessToken,
        // CRITICAL: always store the new refresh token — the old one is
        // now invalid on Atlassian's side.
        refreshToken: newRefreshToken,
        expiresIn,
        expiresAt,
        scope,
        needsReauth: false,
        lastRefreshError: null,
        lastUpdated: now,
        lastSyncAt: now,
        _updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Jira access token refreshed for ${accountId}, expires ${expiresAt}`);

    return { accessToken, expiresAt };
  })();

  inFlightRefreshes.set(accountId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    inFlightRefreshes.delete(accountId);
  }
}

/**
 * Returns a valid access token for this accountId, refreshing it first
 * if it's expired or about to expire. Use this instead of reading
 * accessToken directly off the Firestore doc.
 *
 * @param {string} accountId
 * @returns {Promise<string>} a valid access token
 */
export async function getValidAccessToken(accountId) {
  const jiraUserRef = db.collection('jira_users').doc(accountId);
  const doc = await jiraUserRef.get();

  if (!doc.exists) {
    throw new Error(`No stored Jira connection for accountId ${accountId}`);
  }

  const data = doc.data();

  if (data.isActive === false) {
    throw new Error(`Jira connection for accountId ${accountId} is disconnected`);
  }

  const expiresAtMs = data.expiresAt ? new Date(data.expiresAt).getTime() : 0;
  const isExpiredOrExpiringSoon = Date.now() >= expiresAtMs - EXPIRY_BUFFER_MS;

  if (!isExpiredOrExpiringSoon && data.accessToken) {
    return data.accessToken;
  }

  const { accessToken } = await refreshAccessToken(accountId);
  return accessToken;
}

export { refreshAccessToken };