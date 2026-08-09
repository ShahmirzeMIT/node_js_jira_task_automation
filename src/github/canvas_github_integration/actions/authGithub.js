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
  console.error("❌ Missing GitHub environment variables:", {
    GITHUB_CLIENT_ID: GITHUB_CLIENT_ID ? "✅ Set" : "❌ Missing",
    GITHUB_CLIENT_SECRET: GITHUB_CLIENT_SECRET ? "✅ Set" : "❌ Missing",
    GITHUB_CALLBACK_URL: GITHUB_CALLBACK_URL ? "✅ Set" : "❌ Missing"
  });
  process.exit(1);
}

console.log("✅ GitHub environment variables loaded successfully");

export const initiateGitHubOAuth = async (req, res) => {
  const { userId } = req.body;

  console.log("🚀 initiateGitHubOAuth called with:", { userId });

  if (!userId) {
    console.error("❌ Missing userId in request");
    return res.status(400).json({ 
      error: "Missing userId in request body",
      status: 400,
      timestamp: GetCurrentDateTime()
    });
  }

  try {
    const state = randomUUID();
    console.log("🔑 Generated state:", state);

    const session = {
      createdAt: GetCurrentDateTime(),
      status: 'pending',
      userId
    };

    await db.collection('oauth_sessions').doc(state).set(session);
    console.log("✅ Session saved to Firestore:", { state, userId });

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=repo,user&state=${state}`;
    console.log("🔗 Generated auth URL:", authUrl);

    res.status(200).json({ 
      authUrl, 
      state,
      status: 200,
      message: "OAuth initiated successfully"
    });
  } catch (err) {
    console.error("❌ OAuth Initiation Error:", {
      message: err.message,
      stack: err.stack,
      timestamp: GetCurrentDateTime()
    });
    res.status(500).json({ 
      error: "Failed to initiate GitHub OAuth",
      details: err.message,
      status: 500,
      timestamp: GetCurrentDateTime()
    });
  }
};

export const handleGitHubCallback = async (req, res) => {
  const { code, state } = req.body;

  console.log("🚀 handleGitHubCallback called with:", { 
    code: code ? `${code.substring(0, 8)}...` : null, 
    state: state || null,
    body: req.body,
    timestamp: GetCurrentDateTime()
  });

  if (!code || !state) {
    console.error("❌ Missing code or state:", { code: !!code, state: !!state });
    return res.status(400).json({ 
      message: 'Missing code or state',
      status: 400,
      timestamp: GetCurrentDateTime()
    });
  }

  try {
    console.log("🔍 Checking session in Firestore...");
    const sessionRef = db.collection('oauth_sessions').doc(state);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      console.error("❌ Session not found in Firestore for state:", state);
      return res.status(400).json({ 
        message: 'Invalid or expired session state',
        status: 400,
        state: state,
        timestamp: GetCurrentDateTime()
      });
    }

    const sessionData = sessionDoc.data();
    console.log("📄 Session data:", {
      ...sessionData,
      timestamp: GetCurrentDateTime()
    });

    if (sessionData.status !== 'pending') {
      console.error("❌ Session already used:", sessionData.status);
      return res.status(400).json({ 
        message: 'Session already used or invalid',
        status: 400,
        sessionStatus: sessionData.status,
        timestamp: GetCurrentDateTime()
      });
    }

    const { userId } = sessionData;
    console.log("👤 User ID from session:", userId);

    // GitHub token exchange
    console.log("🔄 Exchanging code for access token...");
    console.log("📤 GitHub Token Request:", {
      client_id: GITHUB_CLIENT_ID ? "✅ Set" : "❌ Missing",
      redirect_uri: GITHUB_CALLBACK_URL,
      code: code.substring(0, 8) + '...',
      timestamp: GetCurrentDateTime()
    });

    try {
      const tokenRes = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: GITHUB_CALLBACK_URL
        },
        { 
          headers: { 
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      console.log("✅ GitHub Token Response Status:", tokenRes.status);
      console.log("📥 GitHub Token Response Data:", tokenRes.data);

      const { access_token, error, error_description } = tokenRes.data;

      if (error) {
        console.error("❌ GitHub returned error:", { error, error_description });
        return res.status(401).json({
          message: 'GitHub authentication failed',
          error: error,
          error_description: error_description,
          status: 401,
          timestamp: GetCurrentDateTime(),
          details: {
            client_id: GITHUB_CLIENT_ID ? "✅ Set" : "❌ Missing",
            redirect_uri: GITHUB_CALLBACK_URL
          }
        });
      }

      if (!access_token) {
        console.error("❌ No access token in response");
        return res.status(401).json({ 
          message: 'Failed to get GitHub access token',
          status: 401,
          response: tokenRes.data,
          timestamp: GetCurrentDateTime()
        });
      }

      console.log("✅ Access token received successfully");

      // Get GitHub user info
      console.log("🔄 Fetching GitHub user info...");
      try {
        const userRes = await axios.get('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: 'application/vnd.github+json'
          },
          timeout: 10000
        });

        console.log("✅ GitHub User Response Status:", userRes.status);
        console.log("📥 GitHub User Data:", {
          id: userRes.data.id,
          login: userRes.data.login,
          avatar_url: userRes.data.avatar_url ? "✅" : "❌",
          html_url: userRes.data.html_url ? "✅" : "❌"
        });

        const { id: githubId, login, avatar_url, html_url } = userRes.data;
        console.log("👤 GitHub User ID:", githubId);

        // Save user token
        console.log("💾 Saving user token to Firestore...");
        try {
          await db.collection('user_tokens').doc(githubId.toString()).set({
            githubId,
            login,
            accessToken: access_token,
            avatarUrl: avatar_url,
            profileUrl: html_url,
            lastUpdated: GetCurrentDateTime()
          });
          console.log("✅ User token saved successfully");
        } catch (tokenSaveError) {
          console.error("❌ Error saving user token:", tokenSaveError);
          return res.status(500).json({
            message: 'Failed to save user token',
            error: tokenSaveError.message,
            status: 500,
            timestamp: GetCurrentDateTime()
          });
        }

        // Update user_githubs
        console.log("💾 Updating user_githubs...");
        try {
          const userGithubsRef = db.collection('user_githubs').doc(userId);
          const userGithubsDoc = await userGithubsRef.get();

          if (userGithubsDoc.exists) {
            await userGithubsRef.update({
              github_ids: admin.firestore.FieldValue.arrayUnion(githubId.toString())
            });
            console.log("✅ user_githubs updated successfully");
          } else {
            await userGithubsRef.set({
              github_ids: [githubId.toString()]
            });
            console.log("✅ user_githubs created successfully");
          }
        } catch (userGithubsError) {
          console.error("❌ Error updating user_githubs:", userGithubsError);
          // Continue even if this fails
        }

        // Update session
        console.log("💾 Updating session status...");
        try {
          await sessionRef.update({
            status: 'accepted',
            acceptedAt: GetCurrentDateTime(),
            githubId,
            login
          });
          console.log("✅ Session updated successfully");
        } catch (sessionUpdateError) {
          console.error("❌ Error updating session:", sessionUpdateError);
        }

        // Update project if projectId exists
        if (sessionData.projectId) {
          console.log("💾 Updating project with githubId...");
          try {
            const projectRef = db.collection('circle-projects').doc(sessionData.projectId);
            await projectRef.set(
              {
                auth: admin.firestore.FieldValue.arrayUnion(githubId.toString())
              },
              { merge: true }
            );
            console.log("✅ Project updated successfully");
          } catch (projectError) {
            console.error("❌ Error updating project:", projectError);
          }
        }

        // Success response
        console.log("✅ GitHub authentication completed successfully!");
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
          githubId: githubId.toString(),
          timestamp: GetCurrentDateTime()
        });

      } catch (userApiError) {
        console.error("❌ Error fetching GitHub user:", {
          message: userApiError.message,
          response: userApiError.response?.data,
          status: userApiError.response?.status,
          stack: userApiError.stack
        });
        return res.status(500).json({
          message: 'Failed to fetch GitHub user info',
          error: userApiError.message,
          status: 500,
          details: userApiError.response?.data,
          timestamp: GetCurrentDateTime()
        });
      }

    } catch (tokenError) {
      console.error("❌ Error exchanging code for token:", {
        message: tokenError.message,
        response: tokenError.response?.data,
        status: tokenError.response?.status,
        stack: tokenError.stack,
        config: {
          url: tokenError.config?.url,
          method: tokenError.config?.method,
          headers: tokenError.config?.headers,
          data: tokenError.config?.data ? JSON.parse(tokenError.config.data) : null
        }
      });

      return res.status(500).json({
        message: 'Failed to exchange code for access token',
        error: tokenError.message,
        status: 500,
        details: tokenError.response?.data || null,
        githubResponse: tokenError.response?.data || null,
        timestamp: GetCurrentDateTime()
      });
    }

  } catch (err) {
    console.error('❌ GitHub OAuth callback error:', {
      message: err.message,
      stack: err.stack,
      code: code ? code.substring(0, 8) + '...' : null,
      state: state,
      timestamp: GetCurrentDateTime()
    });

    // Send detailed error response
    return res.status(500).json({
      message: "Authentication failed",
      status: 500,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: GetCurrentDateTime(),
      details: {
        codeReceived: !!code,
        stateReceived: !!state,
        environment: process.env.NODE_ENV
      }
    });
  }
};

export const getUserToken = async (req, res) => {
  const { githubId } = req.body;

  console.log("🔍 getUserToken called with:", { githubId });

  if (!githubId) {
    console.error("❌ Missing githubId");
    return res.status(400).json({ 
      error: "Missing githubId",
      status: 400,
      timestamp: GetCurrentDateTime()
    });
  }

  try {
    const doc = await db.collection('user_tokens').doc(githubId.toString()).get();

    if (!doc.exists) {
      console.error("❌ Token not found for githubId:", githubId);
      return res.status(404).json({ 
        error: "Token not found",
        status: 404,
        githubId,
        timestamp: GetCurrentDateTime()
      });
    }

    console.log("✅ Token found successfully");
    res.status(200).json({ 
      success: true, 
      data: doc.data(),
      status: 200,
      timestamp: GetCurrentDateTime()
    });
  } catch (err) {
    console.error("❌ Error fetching token:", err);
    res.status(500).json({ 
      error: "Failed to fetch token",
      details: err.message,
      status: 500,
      timestamp: GetCurrentDateTime()
    });
  }
};