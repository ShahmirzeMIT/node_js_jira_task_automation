import axios from 'axios';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { db } from '../../../../config/firebase.js';
import { GetCurrentDateTime } from '../../../../utility/CommonUtils.js';

dotenv.config();

const {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL
} = process.env;

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_CALLBACK_URL) {
  process.exit(1);
}
export const initiateGitHubOAuth = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId in request body" });
  }

  try {
    const state = randomUUID();

    const session = {
      createdAt: GetCurrentDateTime(),
      status: 'pending',
      userId
    };

    // `projectId` is optional for the standalone /github/auth/login endpoint.
    // Firestore rejects undefined field values, so only persist it when supplied.


    await db.collection('oauth_sessions').doc(state).set(session);

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=repo,user&state=${state}`;

    res.status(200).json({ authUrl, state });
  } catch (err) {
    console.error("❌ OAuth Initiation Error:", err);
    res.status(500).json({ error: "Failed to initiate GitHub OAuth" });
  }
};
export const handleGitHubCallback = async (req, res) => {
  const { code, state } = req.body;

  if (!code || !state) {
    return res.status(400).json({ message: 'Missing code or state',
      status:400
     });
  }

  try {
    const sessionRef = db.collection('oauth_sessions').doc(state);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(400).json({ message: 'Invalid or expired session state',
        status:400
      });
    }

    const sessionData = sessionDoc.data();
    if (sessionData.status !== 'pending') {
      return res.status(400).json({ message: 'Session already used or invalid',
        status:400
       });
    }

    const {  userId } = sessionData;
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL
      },
      { headers: { Accept: 'application/json' } }
    );

    const { access_token } = tokenRes.data;
    if (!access_token) {
      return res.status(401).json({ message: 'Failed to get GitHub access token' ,
        status:401
      });
    }
    const userRes = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/vnd.github+json'
      }
    });

    const { id: githubId, login, avatar_url, html_url } = userRes.data;
    await db.collection('user_tokens').doc(githubId.toString()).set({
      githubId,
      login,
      accessToken: access_token,
      avatarUrl: avatar_url,
      profileUrl: html_url,
      lastUpdated: GetCurrentDateTime()
    });
    const userGithubsRef = db.collection('user_githubs').doc(userId);
    const userGithubsDoc = await userGithubsRef.get();

    if (userGithubsDoc.exists) {
      await userGithubsRef.update({
        github_ids: admin.firestore.FieldValue.arrayUnion(githubId.toString())
      });
    } else {
      await userGithubsRef.set({
        github_ids: [githubId.toString()]
      });
    }
    await sessionRef.update({
      status: 'accepted',
      acceptedAt: GetCurrentDateTime(),
      githubId,
      login
    });
    if (projectId) {
      const projectRef = db.collection('circle-projects').doc(projectId);
      await projectRef.set(
        {
          auth: admin.firestore.FieldValue.arrayUnion(githubId.toString())
        },
        { merge: true }
      );
    }
    return res.status(200).json({
      message: 'GitHub authentication successful',
      status: 200,
      user: {
        id: githubId,
        login,
        avatar_url,
        html_url
      },
      accessToken: access_token, 
      githubId: githubId.toString()
    });
  } catch (err) {
    console.error('❌ GitHub OAuth callback error:', err);
    res.status(500).json({ message: "Authentication failed" ,
    status:500
    });
  }
};
export const getUserToken = async (req, res) => {
  const { githubId } = req.body;

  if (!githubId) {
    return res.status(400).json({ error: "Missing githubId" });
  }

  try {
    const doc = await db.collection('user_tokens').doc(githubId.toString()).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Token not found" });
    }

    res.status(200).json({ success: true, data: doc.data() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch token" });
  }
};
